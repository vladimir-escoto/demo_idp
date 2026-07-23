'use strict';
/*
 * Tripleenable ID v2 — IdP OIDC passwordless con WALLET (firma Ed25519 real).
 *
 * El wallet (app Flutter) al abrir genera un par de llaves Ed25519 y registra
 * (usuario -> llave pública JWK) en este IdP. Para autenticar:
 *   · QR:   el navegador muestra un QR con {idp, uid, nonce}. El wallet lo escanea,
 *           FIRMA el nonce con su llave privada y hace POST /device/approve.
 *   · PUSH: el navegador pide un usuario; el IdP PUBLICA por MQTT a te/push/<usuario>
 *           {idp, uid, nonce}. El wallet lo recibe, pregunta, firma y aprueba igual.
 * El IdP VERIFICA la firma contra la pública guardada (crypto.verify Ed25519) y
 * completa el login OIDC, redirigiendo al broker (Zitadel/Keycloak/Authentik).
 */
const http = require('http');
const crypto = require('crypto');
const { parse } = require('url');
const { Provider } = require('oidc-provider');
const QRCode = require('qrcode');
const mqtt = require('mqtt');

const ISSUER = (process.env.OIDC_ISSUER || 'https://id.idp.tripleenable.com').replace(/\/$/, '');
const PORT = parseInt(process.env.PORT || '3000', 10);
const COOKIE_KEY = process.env.COOKIE_KEY || crypto.randomBytes(24).toString('hex');
const MQTT_URL = process.env.MQTT_URL || 'wss://broker.emqx.io:8084/mqtt';
const PUSH_PREFIX = (process.env.PUSH_TOPIC_PREFIX || 'tripleenable/idp/push').replace(/\/$/, '');
const PUSH_TOPIC = (u) => PUSH_PREFIX + '/' + u; // prefijo por escenario para no colisionar en el broker público
// Branding por escenario (para distinguir visualmente Zitadel/Keycloak/Authentik)
const BRAND_ACCENT = process.env.BRAND_ACCENT || '#5b9dff';
const BRAND_BROKER = process.env.BRAND_BROKER || '';

// Usuarios "semilla" (siempre presentes). El wallet añade más en runtime.
const USERS = {
  ana:   { name: 'Ana Global', given_name: 'Ana',   family_name: 'Global', email: 'ana@idp.tripleenable.com',   preferred_username: 'ana' },
  bruno: { name: 'Bruno Dev',  given_name: 'Bruno', family_name: 'Dev',    email: 'bruno@idp.tripleenable.com', preferred_username: 'bruno' },
};
const devices = new Map(); // username -> { jwk, name }

const clients = [
  { client_id: 'zitadel', client_secret: process.env.CLIENT_SECRET_ZITADEL || 'zitadel-tripleenable-idp-secret',
    grant_types: ['authorization_code'], response_types: ['code'],
    redirect_uris: (process.env.REDIRECT_ZITADEL || 'https://zitadel.idp.tripleenable.com/ui/login/login/externalidp/callback').split(',') },
  { client_id: 'keycloak', client_secret: process.env.CLIENT_SECRET_KEYCLOAK || 'keycloak-tripleenable-idp-secret',
    grant_types: ['authorization_code'], response_types: ['code'],
    redirect_uris: (process.env.REDIRECT_KEYCLOAK || 'https://keycloak.idp.tripleenable.com/realms/tenant-a/broker/tripleenable/endpoint,https://keycloak.idp.tripleenable.com/realms/tenant-b/broker/tripleenable/endpoint').split(',') },
  { client_id: 'authentik', client_secret: process.env.CLIENT_SECRET_AUTHENTIK || 'authentik-tripleenable-idp-secret',
    grant_types: ['authorization_code'], response_types: ['code'],
    redirect_uris: (process.env.REDIRECT_AUTHENTIK || 'https://authentik.idp.tripleenable.com/source/oauth/callback/tripleenable/').split(',') },
  // Logto ingiere este IdP como conector social OIDC estándar. El redirect es el
  // callback del conector: https://logto.idp.tripleenable.com/callback/<connectorId>
  // (el connectorId lo genera Logto al crear el conector — se fija vía REDIRECT_LOGTO).
  { client_id: 'logto', client_secret: process.env.CLIENT_SECRET_LOGTO || 'logto-tripleenable-idp-secret',
    grant_types: ['authorization_code'], response_types: ['code'],
    redirect_uris: (process.env.REDIRECT_LOGTO || 'https://logto.idp.tripleenable.com/callback/logto').split(',') },
];

const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = privateKey.export({ format: 'jwk' });
jwk.use = 'sig'; jwk.alg = 'RS256'; jwk.kid = crypto.randomBytes(8).toString('hex');

const provider = new Provider(ISSUER, {
  clients, jwks: { keys: [jwk] }, cookies: { keys: [COOKIE_KEY] },
  pkce: { required: () => false },
  // id_token auto-contenido: incluye name/email/preferred_username en el propio id_token,
  // así el broker (Zitadel) puede mapear el usuario sin depender del endpoint userinfo.
  conformIdTokenClaims: false,
  features: { devInteractions: { enabled: false }, rpInitiatedLogout: { enabled: true }, revocation: { enabled: true }, userinfo: { enabled: true } },
  claims: { openid: ['sub'], profile: ['name', 'preferred_username', 'given_name', 'family_name'], email: ['email', 'email_verified'] },
  interactions: { url(ctx, i) { return `/interaction/${i.uid}`; } },
  async findAccount(ctx, id) {
    let u = USERS[id];
    if (!u && devices.has(id)) {
      const nm = devices.get(id).name || id; const parts = nm.trim().split(/\s+/);
      u = { name: nm, given_name: parts[0] || id, family_name: parts.slice(1).join(' ') || 'Wallet',
            email: id + '@idp.tripleenable.com', preferred_username: id };
    }
    if (!u) return undefined;
    return { accountId: id, async claims() { return { sub: id, email_verified: true, ...u }; } };
  },
  // Auto-consentimiento: los brokers (Zitadel/Keycloak/Authentik) son de confianza.
  // Sin esto, node-oidc-provider crea una 2ª interacción de "consent" tras el login,
  // que nuestra UI renderiza como otro QR -> bucle infinito. Otorgamos el grant al vuelo.
  async loadExistingGrant(ctx) {
    const prior = ctx.oidc.result && ctx.oidc.result.consent && ctx.oidc.result.consent.grantId;
    if (prior) return ctx.oidc.provider.Grant.find(prior);
    const accountId = ctx.oidc.session.accountId;
    if (!accountId) return undefined;
    const grant = new ctx.oidc.provider.Grant({ clientId: ctx.oidc.client.clientId, accountId });
    grant.addOIDCScope(ctx.oidc.params.scope || 'openid profile email');
    await grant.save();
    return grant;
  },
  ttl: { AccessToken: 3600, AuthorizationCode: 600, IdToken: 3600, Session: 86400, Interaction: 3600, Grant: 86400 },
});
provider.proxy = true;
const oidc = provider.callback();

// MQTT (para el push)
let mqttClient = null;
function initMqtt() {
  try {
    mqttClient = mqtt.connect(MQTT_URL, { reconnectPeriod: 5000, connectTimeout: 8000 });
    mqttClient.on('connect', () => console.log('mqtt conectado', MQTT_URL));
    mqttClient.on('error', (e) => console.error('mqtt error', e.message));
  } catch (e) { console.error('mqtt init', e.message); }
}
initMqtt();

const requests = new Map(); // uid -> { client, status, accountId, nonce, ts }

function verifyEd25519(deviceJwk, msg, sigB64) {
  try {
    const pub = crypto.createPublicKey({ key: deviceJwk, format: 'jwk' });
    return crypto.verify(null, Buffer.from(msg, 'utf8'), pub, Buffer.from(sigB64, 'base64'));
  } catch (e) { return false; }
}

function readBody(req) { return new Promise((r) => { let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => r(b)); }); }
function json(res, code, obj, extra) { res.writeHead(code, Object.assign({ 'Content-Type': 'application/json' }, cors(), extra || {})); res.end(JSON.stringify(obj)); }
function page(res, code, body) { res.writeHead(code, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(body); }
function cors() { return { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }; }

function shell(title, body) {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>
   :root{--bg:#0b1020;--line:#243049;--tx:#e7ecf5;--mut:#93a1bd;--acc:${BRAND_ACCENT};--ok:#34d399}
   *{box-sizing:border-box}body{margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:radial-gradient(1000px 500px at 80% -10%,#16233f,transparent 60%),#0b1020;color:var(--tx);min-height:100vh;display:grid;place-items:center;padding:24px}
   .card{position:relative;background:linear-gradient(180deg,#16203a,#131b2e);border:1px solid var(--line);border-radius:20px;padding:28px;max-width:440px;width:100%;box-shadow:0 24px 70px -30px #000}
   .brk{position:absolute;top:-11px;left:50%;transform:translateX(-50%);background:var(--acc);color:#0b1020;font-weight:800;font-size:11px;letter-spacing:.5px;text-transform:uppercase;padding:4px 12px;border-radius:999px;box-shadow:0 6px 16px -6px var(--acc)}
   .logo{display:flex;align-items:center;gap:10px;margin-bottom:16px}.logo .mk{width:34px;height:34px;border-radius:9px;background:linear-gradient(135deg,var(--acc),#34d399);display:grid;place-items:center;font-weight:900;color:#0b1020}.logo b{font-size:15px}.logo small{display:block;color:var(--mut);font-size:11px}
   h1{font-size:20px;margin:2px 0 6px}p{color:var(--mut);line-height:1.5;margin:0 0 14px;font-size:13.5px}
   .qr{background:#fff;border-radius:16px;padding:14px;display:grid;place-items:center;margin:6px 0 12px}.qr img{width:206px;height:206px;display:block}
   .status{display:flex;align-items:center;gap:9px;color:var(--mut);font-size:14px;margin:8px 0}.dot{width:9px;height:9px;border-radius:50%;background:var(--acc);animation:p 1.2s infinite}@keyframes p{0%,100%{opacity:.3}50%{opacity:1}}
   .div{display:flex;align-items:center;gap:10px;color:var(--mut);font-size:12px;margin:14px 0}.div::before,.div::after{content:'';flex:1;height:1px;background:var(--line)}
   input{width:100%;background:#0e1626;border:1px solid var(--line);color:var(--tx);border-radius:11px;padding:12px;font-size:14px}
   .btn{display:block;width:100%;text-align:center;background:var(--acc);color:#0b1020;font-weight:800;border:0;border-radius:11px;padding:12px;font-size:14px;cursor:pointer;margin-top:9px;text-decoration:none}
  </style></head><body><div class="card">${BRAND_BROKER ? `<span class="brk">via ${BRAND_BROKER}</span>` : ''}<div class="logo"><div class="mk">T</div><div><b>Tripleenable ID</b><small>login soberano · firma en el dispositivo</small></div></div>${body}</div></body></html>`;
}

async function handle(req, res) {
  const { pathname } = parse(req.url, true);

  // Zitadel/otros brokers envían prompt=select_account, que node-oidc-provider no soporta
  // y responde invalid_request. Saneamos: conservamos solo prompts soportados.
  if (req.url.includes('prompt=')) {
    const u = new URL(req.url, ISSUER);
    if (u.searchParams.has('prompt')) {
      const ok = u.searchParams.get('prompt').split(' ').filter((p) => ['login', 'consent', 'none'].includes(p));
      if (ok.length) u.searchParams.set('prompt', ok.join(' ')); else u.searchParams.delete('prompt');
      req.url = u.pathname + u.search;
    }
  }

  if (req.method === 'OPTIONS' && pathname.startsWith('/device/')) { res.writeHead(204, cors()); return res.end(); }

  const m = pathname.match(/^\/interaction\/([\w-]+)(\/status|\/finish|\/push)?$/);

  if (m && !m[2]) { // login page (QR + push)
    let details; try { details = await provider.interactionDetails(req, res); } catch (e) { return page(res, 400, shell('Error', '<h1>Sesión expirada</h1><p>Reintenta el login.</p>')); }
    const uid = m[1]; const clientId = details.params.client_id;
    let r = requests.get(uid);
    if (!r) { r = { client: clientId, status: 'pending', nonce: crypto.randomBytes(20).toString('hex'), ts: Date.now() }; requests.set(uid, r); }
    const payload = JSON.stringify({ idp: ISSUER, uid, nonce: r.nonce, client: clientId });
    const qr = await QRCode.toDataURL(payload, { margin: 1, width: 206 });
    return page(res, 200, shell('Aprobar login', `
      <h1>Aprueba con tu wallet</h1>
      <p><b>${clientId}</b> quiere iniciar tu sesión. Escanea el QR con tu <b>wallet Tripleenable</b>
      y firma. Sin contraseñas — tu llave privada nunca sale del dispositivo.</p>
      <div class="qr"><img alt="QR" src="${qr}"></div>
      <div class="status"><span class="dot"></span><span id="s">Esperando firma del wallet…</span></div>
      <div class="div">o simular push</div>
      <input id="u" placeholder="usuario (p.ej. ana)"><button class="btn" onclick="push()">Enviar push al wallet</button>
      <script>
        const uid=${JSON.stringify(uid)};
        async function push(){const u=document.getElementById('u').value.trim();if(!u)return;await fetch('/interaction/'+uid+'/push',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:u})});document.getElementById('s').textContent='Push enviado a '+u+'… aprueba en el wallet.';}
        setInterval(async()=>{const j=await (await fetch('/interaction/'+uid+'/status')).json();
          if(j.status==='approved'){document.getElementById('s').textContent='Firma válida ✓ entrando…';location.href='/interaction/'+uid+'/finish';}
          else if(j.status==='deny'){document.getElementById('s').textContent='Acceso rechazado en el wallet.';}},1500);
      </script>`));
  }
  if (m && m[2] === '/status') { const r = requests.get(m[1]); return json(res, 200, { status: r ? r.status : 'pending' }); }
  if (m && m[2] === '/finish') {
    const r = requests.get(m[1]);
    if (!r || r.status !== 'approved' || !r.accountId) return page(res, 403, shell('No aprobado', '<h1>Aún no aprobado</h1>'));
    requests.delete(m[1]);
    return provider.interactionFinished(req, res, { login: { accountId: r.accountId } }, { mergeWithLastSubmission: false });
  }
  if (m && m[2] === '/push' && req.method === 'POST') {
    const uid = m[1]; const r = requests.get(uid);
    if (!r) return json(res, 404, { error: 'no request' });
    const { username } = JSON.parse(await readBody(req) || '{}');
    if (mqttClient && mqttClient.connected) mqttClient.publish(PUSH_TOPIC(username), JSON.stringify({ idp: ISSUER, uid, nonce: r.nonce, client: r.client }));
    return json(res, 200, { ok: true, pushed: !!(mqttClient && mqttClient.connected) });
  }

  // ── Wallet API ──
  if (pathname === '/device/register' && req.method === 'POST') {
    const { username, jwk: pub, name } = JSON.parse(await readBody(req) || '{}');
    if (!username || !pub || pub.kty !== 'OKP') return json(res, 400, { error: 'username + jwk OKP requeridos' });
    devices.set(username, { jwk: pub, name: name || username });
    console.log('device registrado:', username);
    return json(res, 200, { ok: true, username });
  }
  if (pathname === '/device/approve' && req.method === 'POST') {
    const { username, uid, signature, decision } = JSON.parse(await readBody(req) || '{}');
    const r = requests.get(uid);
    if (!r) return json(res, 404, { error: 'no request' });
    if (decision === 'deny') { r.status = 'deny'; return json(res, 200, { ok: true, decision: 'deny' }); }
    const d = devices.get(username);
    if (!d) return json(res, 401, { error: 'usuario no registrado' });
    if (!verifyEd25519(d.jwk, r.nonce, signature)) return json(res, 401, { error: 'firma inválida' });
    r.status = 'approved'; r.accountId = username;
    console.log('login aprobado por firma:', username, uid);
    return json(res, 200, { ok: true, decision: 'approve' });
  }
  if (pathname === '/device/challenge') { // opcional: consultar el nonce de un uid (por si el wallet lo pide)
    const q = parse(req.url, true).query; const r = requests.get(q.uid);
    return json(res, 200, r ? { uid: q.uid, nonce: r.nonce, client: r.client } : { error: 'no request' });
  }

  if (pathname === '/healthz') return page(res, 200, 'ok');
  return oidc(req, res);
}

http.createServer((req, res) => { handle(req, res).catch((e) => { console.error(e); try { page(res, 500, shell('Error', '<h1>Error interno</h1>')); } catch (_) {} }); })
  .listen(PORT, () => console.log('Tripleenable ID v2 (global-idp) en :' + PORT + ' issuer=' + ISSUER + ' mqtt=' + MQTT_URL));
