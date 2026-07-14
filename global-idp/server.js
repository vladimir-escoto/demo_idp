'use strict';
/*
 * Tripleenable ID — IdP OIDC passwordless (aprobación por QR / push).
 *
 * Es un OpenID Provider de verdad (node-oidc-provider) al que los brokers
 * (Zitadel, Keycloak, Authentik) federan. En vez de usuario/contraseña, el login
 * se APRUEBA desde un "autenticador" (simula el móvil): el navegador muestra un QR
 * y queda esperando; el autenticador ve la petición (push) y la aprueba.
 *
 * Rutas propias:
 *   GET  /interaction/:uid           -> pantalla de login (QR + espera)
 *   GET  /interaction/:uid/status    -> {status} para el polling del navegador
 *   GET  /interaction/:uid/finish    -> completa el login (si fue aprobado)
 *   GET  /authenticator              -> el "móvil": elegir identidad + ver/aprobar peticiones
 *   POST /authenticator/enroll       -> fija la identidad del dispositivo (cookie)
 *   GET  /authenticator/pending      -> peticiones pendientes (push)
 *   POST /authenticator/approve      -> aprobar {uid}
 *   POST /authenticator/deny         -> rechazar {uid}
 * Todo lo demás lo maneja el OIDC provider (/.well-known, /auth, /token, /me, /jwks...).
 */
const http = require('http');
const crypto = require('crypto');
const { parse } = require('url');
const { Provider } = require('oidc-provider');
const QRCode = require('qrcode');

const ISSUER = (process.env.OIDC_ISSUER || 'https://id.idp.tripleenable.com').replace(/\/$/, '');
const PORT = parseInt(process.env.PORT || '3000', 10);
const COOKIE_KEY = process.env.COOKIE_KEY || crypto.randomBytes(24).toString('hex');

// ── Usuarios globales (viven aquí; los brokers los provisionan por federación) ──
const USERS = {
  ana:   { name: 'Ana Global',   email: 'ana@global.tripleenable.com',   preferred_username: 'ana' },
  bruno: { name: 'Bruno Dev',    email: 'bruno@global.tripleenable.com', preferred_username: 'bruno' },
  carla: { name: 'Carla Prieto', email: 'carla@global.tripleenable.com', preferred_username: 'carla' },
};

// ── Clientes = los brokers que federan a este IdP ──
const clients = [
  {
    client_id: 'zitadel',
    client_secret: process.env.CLIENT_SECRET_ZITADEL || 'zitadel-tripleenable-idp-secret',
    grant_types: ['authorization_code'], response_types: ['code'],
    redirect_uris: (process.env.REDIRECT_ZITADEL ||
      'https://zitadel.idp.tripleenable.com/ui/login/login/externalidp/callback').split(','),
  },
  {
    client_id: 'keycloak',
    client_secret: process.env.CLIENT_SECRET_KEYCLOAK || 'keycloak-tripleenable-idp-secret',
    grant_types: ['authorization_code'], response_types: ['code'],
    redirect_uris: (process.env.REDIRECT_KEYCLOAK ||
      'https://keycloak.idp.tripleenable.com/realms/tenant-a/broker/tripleenable/endpoint,https://keycloak.idp.tripleenable.com/realms/tenant-b/broker/tripleenable/endpoint').split(','),
  },
  {
    client_id: 'authentik',
    client_secret: process.env.CLIENT_SECRET_AUTHENTIK || 'authentik-tripleenable-idp-secret',
    grant_types: ['authorization_code'], response_types: ['code'],
    redirect_uris: (process.env.REDIRECT_AUTHENTIK ||
      'https://authentik.idp.tripleenable.com/source/oauth/callback/tripleenable/').split(','),
  },
];

// clave de firma (efímera; los brokers re-leen el JWKS tras reinicios)
const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = privateKey.export({ format: 'jwk' });
jwk.use = 'sig'; jwk.alg = 'RS256'; jwk.kid = crypto.randomBytes(8).toString('hex');

const configuration = {
  clients,
  jwks: { keys: [jwk] },
  cookies: { keys: [COOKIE_KEY] },
  pkce: { required: () => false },
  features: {
    devInteractions: { enabled: false },
    rpInitiatedLogout: { enabled: true },
    revocation: { enabled: true },
    userinfo: { enabled: true },
  },
  claims: {
    openid: ['sub'],
    profile: ['name', 'preferred_username'],
    email: ['email', 'email_verified'],
  },
  interactions: { url(ctx, interaction) { return `/interaction/${interaction.uid}`; } },
  async findAccount(ctx, id) {
    const u = USERS[id];
    if (!u) return undefined;
    return { accountId: id, async claims() { return { sub: id, email_verified: true, ...u }; } };
  },
  ttl: { AccessToken: 3600, AuthorizationCode: 600, IdToken: 3600, Session: 86400, Interaction: 3600, Grant: 86400 },
};

const provider = new Provider(ISSUER, configuration);
provider.proxy = true; // detrás de Traefik (TLS externo)
const oidc = provider.callback();

// ── Estado en memoria de las aprobaciones ──
const requests = new Map(); // uid -> { client, status:'pending'|'approved'|'denied', accountId, ts }

function html(title, body) {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>
  :root{--bg:#0b1020;--card:#141c30;--line:#243049;--tx:#e7ecf5;--mut:#93a1bd;--acc:#5b9dff;--ok:#34d399;--no:#f87171}
  *{box-sizing:border-box}body{margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
   background:radial-gradient(1000px 500px at 80% -10%,#16233f,transparent 60%),#0b1020;color:var(--tx);min-height:100vh;
   display:grid;place-items:center;padding:24px}
  .card{background:linear-gradient(180deg,#16203a,#131b2e);border:1px solid var(--line);border-radius:20px;padding:28px;max-width:440px;width:100%;box-shadow:0 24px 70px -30px #000}
  .logo{display:flex;align-items:center;gap:10px;margin-bottom:18px}
  .logo .mk{width:34px;height:34px;border-radius:9px;background:linear-gradient(135deg,#5b9dff,#34d399);display:grid;place-items:center;font-weight:800;color:#0b1020}
  .logo b{font-size:15px}.logo small{display:block;color:var(--mut);font-weight:500;font-size:11px}
  h1{font-size:21px;margin:2px 0 6px}p{color:var(--mut);line-height:1.55;margin:0 0 16px;font-size:14px}
  .qr{background:#fff;border-radius:16px;padding:14px;display:grid;place-items:center;margin:8px 0 14px}
  .qr img{width:210px;height:210px;display:block}
  .status{display:flex;align-items:center;gap:10px;color:var(--mut);font-size:14px;margin:6px 0 14px}
  .dot{width:9px;height:9px;border-radius:50%;background:var(--acc);animation:pulse 1.2s infinite}
  @keyframes pulse{0%,100%{opacity:.3}50%{opacity:1}}
  .btn{display:block;width:100%;text-align:center;background:var(--acc);color:#0b1020;font-weight:700;border:0;border-radius:12px;padding:13px;font-size:15px;text-decoration:none;cursor:pointer;margin-top:8px}
  .btn.ghost{background:transparent;color:var(--tx);border:1px solid var(--line)}
  .btn.ok{background:var(--ok)}.btn.no{background:transparent;color:var(--no);border:1px solid var(--no)}
  .req{background:#0e1626;border:1px solid var(--line);border-radius:14px;padding:16px;margin:12px 0}
  .req .who{font-weight:700}.req .mut{color:var(--mut);font-size:13px;margin-top:2px}
  .u{display:flex;gap:10px;flex-wrap:wrap;margin-top:8px}
  .u button{flex:1;background:#0e1626;border:1px solid var(--line);color:var(--tx);border-radius:12px;padding:12px;cursor:pointer;font-size:14px}
  .row{display:flex;gap:10px;margin-top:10px}.row .btn{margin-top:0}
</style></head><body><div class="card">
  <div class="logo"><div class="mk">T</div><div><b>Tripleenable ID</b><small>login soberano · sin contraseñas</small></div></div>
  ${body}
</div></body></html>`;
}

function readBody(req) {
  return new Promise((resolve) => { let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => resolve(b)); });
}
function cookies(req) {
  const o = {}; (req.headers.cookie || '').split(';').forEach((c) => { const i = c.indexOf('='); if (i > 0) o[c.slice(0, i).trim()] = decodeURIComponent(c.slice(i + 1).trim()); }); return o;
}
function json(res, code, obj) { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); }
function page(res, code, body) { res.writeHead(code, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(body); }

async function handle(req, res) {
  const { pathname } = parse(req.url, true);
  const m = pathname.match(/^\/interaction\/([\w-]+)(\/status|\/finish)?$/);

  // ── LOGIN (pantalla con QR) ──
  if (m && !m[2]) {
    const uid = m[1];
    let details;
    try { details = await provider.interactionDetails(req, res); } catch (e) { return page(res, 400, html('Error', '<h1>Sesión expirada</h1><p>Vuelve a intentar el login.</p>')); }
    const clientId = details.params.client_id;
    if (!requests.has(uid)) requests.set(uid, { client: clientId, status: 'pending', ts: Date.now() });
    const approveUrl = `${ISSUER}/authenticator?req=${uid}`;
    const qr = await QRCode.toDataURL(approveUrl, { margin: 1, width: 210 });
    return page(res, 200, html('Aprobar login', `
      <h1>Aprueba el inicio de sesión</h1>
      <p><b>${clientId}</b> quiere iniciar tu sesión. Escanea el código con tu autenticador
      Tripleenable, o ábrelo aquí, y <b>apruébalo</b>. No hay contraseña.</p>
      <div class="qr"><img alt="QR" src="${qr}"></div>
      <div class="status"><span class="dot"></span><span id="s">Esperando aprobación…</span></div>
      <a class="btn ghost" href="${approveUrl}" target="_blank" rel="noopener">Abrir autenticador (simular móvil) →</a>
      <script>
        const uid=${JSON.stringify(uid)};
        setInterval(async()=>{const r=await fetch('/interaction/'+uid+'/status');const j=await r.json();
          if(j.status==='approved'){document.getElementById('s').textContent='Aprobado ✓ entrando…';location.href='/interaction/'+uid+'/finish';}
          else if(j.status==='denied'){document.getElementById('s').textContent='Rechazado.';}},1500);
      </script>`));
  }

  // ── STATUS (polling) ──
  if (m && m[2] === '/status') {
    const r = requests.get(m[1]);
    return json(res, 200, { status: r ? r.status : 'pending' });
  }

  // ── FINISH (completa OIDC si fue aprobado) ──
  if (m && m[2] === '/finish') {
    const uid = m[1];
    const r = requests.get(uid);
    if (!r || r.status !== 'approved' || !r.accountId) return page(res, 403, html('No aprobado', '<h1>Aún no aprobado</h1><p>Aprueba desde el autenticador.</p>'));
    requests.delete(uid);
    return provider.interactionFinished(req, res, { login: { accountId: r.accountId } }, { mergeWithLastSubmission: false });
  }

  // ── AUTENTICADOR ("el móvil") ──
  if (pathname === '/authenticator') {
    const ck = cookies(req);
    const dev = ck.te_device && USERS[ck.te_device] ? ck.te_device : null;
    if (!dev) {
      const opts = Object.keys(USERS).map((id) => `<button onclick="enroll('${id}')">${USERS[id].name}<br><small style="color:var(--mut)">${USERS[id].email}</small></button>`).join('');
      return page(res, 200, html('Autenticador', `
        <h1>¿Quién eres?</h1><p>Elige la identidad enrolada en este "dispositivo".</p>
        <div class="u">${opts}</div>
        <script>async function enroll(id){await fetch('/authenticator/enroll',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id})});location.reload();}</script>`));
    }
    return page(res, 200, html('Autenticador', `
      <h1>Autenticador</h1><p>Sesión del dispositivo: <b>${USERS[dev].name}</b>. Aquí llegan las
      solicitudes de login (push). Apruébalas o recházalas.</p>
      <div id="list"><div class="status"><span class="dot"></span><span>Escuchando solicitudes…</span></div></div>
      <script>
        async function refresh(){const r=await fetch('/authenticator/pending');const js=await r.json();
          const el=document.getElementById('list');
          if(!js.length){el.innerHTML='<div class="status"><span class="dot"></span><span>Sin solicitudes pendientes.</span></div>';return;}
          el.innerHTML=js.map(x=>'<div class="req"><div class="who">'+x.client+' quiere iniciar tu sesión</div><div class="mut">como '+${JSON.stringify(USERS[dev].name)}+'</div><div class="row"><button class="btn ok" onclick="act(\\''+x.uid+'\\',\\'approve\\')">Aprobar</button><button class="btn no" onclick="act(\\''+x.uid+'\\',\\'deny\\')">Rechazar</button></div></div>').join('');}
        async function act(uid,a){await fetch('/authenticator/'+a,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({uid})});refresh();}
        refresh();setInterval(refresh,1500);
      </script>`));
  }
  if (pathname === '/authenticator/enroll' && req.method === 'POST') {
    const { id } = JSON.parse(await readBody(req) || '{}');
    if (!USERS[id]) return json(res, 400, { error: 'unknown user' });
    res.writeHead(200, { 'Set-Cookie': `te_device=${id}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=604800`, 'Content-Type': 'application/json' });
    return res.end('{"ok":true}');
  }
  if (pathname === '/authenticator/pending') {
    const out = [];
    for (const [uid, r] of requests) if (r.status === 'pending') out.push({ uid, client: r.client });
    return json(res, 200, out);
  }
  if ((pathname === '/authenticator/approve' || pathname === '/authenticator/deny') && req.method === 'POST') {
    const ck = cookies(req);
    const dev = ck.te_device;
    if (!dev || !USERS[dev]) return json(res, 401, { error: 'not enrolled' });
    const { uid } = JSON.parse(await readBody(req) || '{}');
    const r = requests.get(uid);
    if (!r) return json(res, 404, { error: 'no request' });
    if (pathname.endsWith('approve')) { r.status = 'approved'; r.accountId = dev; }
    else r.status = 'denied';
    return json(res, 200, { ok: true });
  }

  if (pathname === '/healthz') return page(res, 200, 'ok');

  // ── resto: OIDC provider ──
  return oidc(req, res);
}

http.createServer((req, res) => { handle(req, res).catch((e) => { console.error(e); try { page(res, 500, html('Error', '<h1>Error interno</h1>')); } catch (_) {} }); })
  .listen(PORT, () => console.log('Tripleenable ID (global-idp) en :' + PORT + ' issuer=' + ISSUER));
