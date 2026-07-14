'use strict';
/*
 * web-client — Storefront de tenant (Relying Party OIDC). Zero-dependency Node.
 * Un comercio de ejemplo (p.ej. "Care Store") cuyo ÚNICO login es el IdP global de
 * Tripleenable (vía su broker: Zitadel / Keycloak / Authentik). Flujo Authorization
 * Code server-side (sin CORS). Parametrizado por env para reutilizarlo en cada tenant.
 */
const http = require('http');
const https = require('https');
const crypto = require('crypto');

const ISSUER = (process.env.OIDC_ISSUER || '').replace(/\/$/, '');
const CLIENT_ID = process.env.OIDC_CLIENT_ID;
const CLIENT_SECRET = process.env.OIDC_CLIENT_SECRET;
const BASE_URL = (process.env.APP_BASE_URL || '').replace(/\/$/, '');
const PORT = parseInt(process.env.PORT || '3000', 10);
const SCOPE = process.env.OIDC_SCOPE || 'openid profile email';

const BRAND = process.env.APP_BRAND || 'Care Store';
const TAGLINE = process.env.APP_TAGLINE || 'Refacciones y servicio automotriz';
const TENANT = process.env.APP_TENANT || 'Care Store';
const BROKER = process.env.APP_BROKER || 'Zitadel';
const IDP_LABEL = process.env.APP_IDP || 'Tripleenable ID (QR / push)';
const PLATFORM = process.env.APP_PLATFORM || 'Tripleenable';
const ACCENT = process.env.APP_ACCENT || '#5b9dff';

const CATALOG = [
  { n: 'Cambio de aceite premium', p: '$49', e: '🛢️' },
  { n: 'Juego de frenos cerámicos', p: '$189', e: '🛑' },
  { n: 'Alineación y balanceo', p: '$39', e: '🎯' },
  { n: 'Batería 60Ah (3 años)', p: '$129', e: '🔋' },
  { n: 'Kit de limpiaparabrisas', p: '$24', e: '🌧️' },
  { n: 'Diagnóstico por computadora', p: '$0*', e: '💻' },
];

const sessions = new Map();
const pending = new Map();
let OIDC = null;

function discover() {
  return new Promise((resolve, reject) => {
    https.get(ISSUER + '/.well-known/openid-configuration', (r) => {
      let b = ''; r.on('data', (c) => (b += c)); r.on('end', () => { try { resolve(JSON.parse(b)); } catch (e) { reject(e); } });
    }).on('error', reject);
  });
}
function postForm(url, form, headers) {
  return new Promise((resolve, reject) => {
    const data = new URLSearchParams(form).toString(); const u = new URL(url);
    const req = https.request({ method: 'POST', hostname: u.hostname, port: u.port || 443, path: u.pathname + u.search,
      headers: Object.assign({ 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(data) }, headers || {}) },
      (r) => { let b = ''; r.on('data', (c) => (b += c)); r.on('end', () => resolve({ status: r.statusCode, body: b })); });
    req.on('error', reject); req.write(data); req.end();
  });
}
function decodeJwt(j) { try { return JSON.parse(Buffer.from(j.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')); } catch (e) { return {}; } }
function cookies(req) { const o = {}; (req.headers.cookie || '').split(';').forEach((c) => { const i = c.indexOf('='); if (i > 0) o[c.slice(0, i).trim()] = decodeURIComponent(c.slice(i + 1).trim()); }); return o; }
function esc(s) { return String(s).replace(/[&<>]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[m])); }

function shell(inner, user) {
  const initial = user ? (user.name || user.preferred_username || 'U')[0].toUpperCase() : '';
  const right = user
    ? `<div class="usr"><a class="pill" href="/account"><span class="av">${esc(initial)}</span>${esc(user.preferred_username || user.name || 'cuenta')}</a><a class="lnk" href="/logout">Salir</a></div>`
    : `<a class="btn sm" href="/login">Entrar con ${esc(PLATFORM)}</a>`;
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(BRAND)}</title><style>
 :root{--bg:#0b1020;--card:#141c30;--line:#243049;--tx:#e7ecf5;--mut:#93a1bd;--acc:${ACCENT};--ok:#34d399}
 *{box-sizing:border-box}body{margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:
  radial-gradient(1100px 560px at 82% -12%,#16233f,transparent 60%),#0b1020;color:var(--tx);min-height:100vh}
 .top{display:flex;align-items:center;gap:14px;max-width:1040px;margin:0 auto;padding:16px 20px;border-bottom:1px solid var(--line)}
 .brand{display:flex;align-items:center;gap:11px;font-weight:800;font-size:17px}
 .brand .mk{width:34px;height:34px;border-radius:9px;background:linear-gradient(135deg,var(--acc),#34d399);display:grid;place-items:center;color:#0b1020;font-weight:900}
 .brand small{display:block;color:var(--mut);font-weight:500;font-size:11px}
 .sp{flex:1}.usr{display:flex;align-items:center;gap:14px}
 .pill{display:inline-flex;align-items:center;gap:8px;background:#0e1626;border:1px solid var(--line);border-radius:999px;padding:6px 12px 6px 6px;text-decoration:none;color:var(--tx);font-size:14px;font-weight:600}
 .av{width:26px;height:26px;border-radius:50%;background:linear-gradient(135deg,var(--acc),#8b5cf6);display:grid;place-items:center;color:#0b1020;font-weight:800;font-size:13px}
 .lnk{color:var(--mut);text-decoration:none;font-size:14px}.lnk:hover{color:var(--tx)}
 .btn{display:inline-flex;align-items:center;gap:9px;background:var(--acc);color:#0b1020;font-weight:800;border:0;border-radius:12px;padding:13px 20px;font-size:15px;text-decoration:none;cursor:pointer}
 .btn.sm{padding:9px 15px;font-size:14px;border-radius:10px}.btn.ghost{background:transparent;color:var(--tx);border:1px solid var(--line)}
 .wrap{max-width:1040px;margin:0 auto;padding:26px 20px 70px}
 .hero{display:grid;grid-template-columns:1.2fr .8fr;gap:22px;align-items:center;margin-bottom:26px}
 @media(max-width:760px){.hero{grid-template-columns:1fr}}
 .hero h1{font-size:34px;margin:8px 0 10px;line-height:1.1}.hero p{color:var(--mut);line-height:1.6;margin:0 0 18px;max-width:44ch}
 .badge{display:inline-flex;align-items:center;gap:7px;background:rgba(52,211,153,.12);color:#6ee7b7;border:1px solid rgba(52,211,153,.3);border-radius:999px;padding:6px 12px;font-size:12.5px;font-weight:700}
 .heroCard{background:linear-gradient(180deg,#16203a,#131b2e);border:1px solid var(--line);border-radius:20px;padding:22px}
 .heroCard h3{margin:0 0 4px}.heroCard p{font-size:13px}
 .grid{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}@media(max-width:760px){.grid{grid-template-columns:1fr 1fr}}@media(max-width:480px){.grid{grid-template-columns:1fr}}
 .prod{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:16px}
 .prod .e{font-size:26px}.prod .n{font-weight:700;margin:8px 0 2px}.prod .p{color:var(--acc);font-weight:800}
 .prod button{margin-top:10px;width:100%;background:#0e1626;border:1px solid var(--line);color:var(--tx);border-radius:10px;padding:9px;cursor:pointer}
 h2{font-size:14px;letter-spacing:.4px;text-transform:uppercase;color:var(--mut);margin:26px 0 12px}
 .card{background:linear-gradient(180deg,#16203a,#131b2e);border:1px solid var(--line);border-radius:18px;padding:24px}
 .row{display:flex;gap:20px;align-items:center;flex-wrap:wrap}
 .ava{width:58px;height:58px;border-radius:15px;background:linear-gradient(135deg,var(--acc),#8b5cf6);display:grid;place-items:center;color:#0b1020;font-weight:900;font-size:23px}
 .who{font-size:20px;font-weight:800}.who small{display:block;color:var(--mut);font-weight:500;font-size:13px;margin-top:2px}
 .kvs{display:grid;grid-template-columns:1fr 1fr;gap:11px;margin:18px 0 6px}@media(max-width:520px){.kvs{grid-template-columns:1fr}}
 .kv{background:#0e1626;border:1px solid var(--line);border-radius:11px;padding:11px 13px}.kv .k{color:var(--mut);font-size:10.5px;text-transform:uppercase;letter-spacing:.5px}.kv .v{margin-top:3px;word-break:break-all;font-size:14px}
 details{margin-top:16px;background:#0e1626;border:1px solid var(--line);border-radius:11px;padding:11px 13px}summary{cursor:pointer;color:var(--mut);font-size:13px}pre{overflow:auto;font-size:12px;color:#a7f3d0}
 .note{color:var(--mut);font-size:12.5px;line-height:1.55}
</style></head><body>
 <div class="top"><div class="brand"><div class="mk">${esc(BRAND[0].toUpperCase())}</div><div>${esc(BRAND)}<small>${esc(TAGLINE)}</small></div></div><div class="sp"></div>${right}</div>
 <div class="wrap">${inner}</div>
</body></html>`;
}

function storefront(user) {
  const prods = CATALOG.map((p) => `<div class="prod"><div class="e">${p.e}</div><div class="n">${esc(p.n)}</div><div class="p">${esc(p.p)}</div><button onclick="location.href='${user ? '/account' : '/login'}'">${user ? 'Agendar' : 'Entrar para agendar'}</button></div>`).join('');
  return shell(`
    <div class="hero">
      <div>
        <span class="badge">🔒 Login sin contraseña · ${esc(PLATFORM)} ID</span>
        <h1>Tu auto, en las mejores manos.</h1>
        <p>Agenda servicio y compra refacciones. Para tu cuenta usamos <b>${esc(PLATFORM)} ID</b>:
        entras con tu <b>identidad global</b>, aprobando desde tu móvil (QR / push). Sin contraseñas que recordar.</p>
        ${user ? `<a class="btn" href="/account">Ir a mi cuenta →</a>` : `<a class="btn" href="/login">Entrar con ${esc(PLATFORM)} →</a>`}
      </div>
      <div class="heroCard"><h3>${esc(TENANT)} · tenant</h3><p class="note">Este comercio es una organización dentro de la
        plataforma ${esc(PLATFORM)}, gestionada vía <b>${esc(BROKER)}</b>. El único método de acceso es
        <b>${esc(IDP_LABEL)}</b> — el dueño del comercio no puede añadir otros logins.</p></div>
    </div>
    <h2>Servicios y refacciones</h2>
    <div class="grid">${prods}</div>`, user);
}

function account(sess) {
  const c = sess.claims || {};
  const name = c.name || c.preferred_username || c.email || 'Cliente';
  const kv = (k, v) => `<div class="kv"><div class="k">${esc(k)}</div><div class="v">${esc(v || '—')}</div></div>`;
  return shell(`
    <h2>Mi cuenta</h2>
    <div class="card">
      <div class="row"><div class="ava">${esc(name[0].toUpperCase())}</div>
        <div class="who">${esc(name)}<small>${esc(c.email || '')}</small></div>
        <div style="margin-left:auto"><span class="badge">✓ Sesión activa</span></div></div>
      <div class="kvs">
        ${kv('Usuario', c.preferred_username)}
        ${kv('Email', c.email)}
        ${kv('ID (subject)', c.sub)}
        ${kv('Emisor / broker', c.iss)}
        ${kv('Inquilino', TENANT)}
        ${kv('Autenticado vía', IDP_LABEL)}</div>
      <details><summary>Ver claims del ID token</summary><pre>${esc(JSON.stringify(c, null, 2))}</pre></details>
      <p class="note" style="margin-top:16px">Eres un <b>usuario global</b> de ${esc(PLATFORM)} con sesión en el tenant
      <b>${esc(TENANT)}</b> (vía ${esc(BROKER)}). La misma identidad entra en otros comercios; cada uno te ve aislado.</p>
    </div>`, c);
}

function send(res, code, body, headers) { res.writeHead(code, Object.assign({ 'Content-Type': 'text/html; charset=utf-8' }, headers || {})); res.end(body); }

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, BASE_URL || 'http://localhost:' + PORT);
  const ck = cookies(req);
  const sess = ck.sid && sessions.get(ck.sid);

  if (u.pathname === '/healthz') return send(res, 200, 'ok', { 'Content-Type': 'text/plain' });

  if (u.pathname === '/login') {
    const state = crypto.randomBytes(16).toString('hex'); pending.set(state, Date.now());
    const p = new URLSearchParams({ client_id: CLIENT_ID, redirect_uri: BASE_URL + '/callback', response_type: 'code', scope: SCOPE, state });
    return send(res, 302, '', { Location: OIDC.authorization_endpoint + '?' + p.toString() });
  }
  if (u.pathname === '/callback') {
    const code = u.searchParams.get('code'); const state = u.searchParams.get('state');
    if (!code || !pending.has(state)) return send(res, 400, shell('<div class="card"><h2>Sesión expirada</h2><p class="note"><a href="/">Volver</a></p></div>'));
    pending.delete(state);
    const basic = Buffer.from(CLIENT_ID + ':' + CLIENT_SECRET).toString('base64');
    const tok = await postForm(OIDC.token_endpoint, { grant_type: 'authorization_code', code, redirect_uri: BASE_URL + '/callback' }, { Authorization: 'Basic ' + basic });
    if (tok.status !== 200) return send(res, 502, shell('<div class="card"><h2>Fallo al canjear código</h2><pre>' + esc(tok.body) + '</pre></div>'));
    const claims = decodeJwt(JSON.parse(tok.body).id_token);
    const sid = crypto.randomBytes(18).toString('hex'); sessions.set(sid, { claims, idToken: JSON.parse(tok.body).id_token });
    return send(res, 302, '', { Location: '/account', 'Set-Cookie': `sid=${sid}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=28800` });
  }
  if (u.pathname === '/logout') {
    const s = sessions.get(ck.sid); if (ck.sid) sessions.delete(ck.sid);
    const clear = 'sid=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0';
    if (OIDC.end_session_endpoint && s && s.idToken) {
      const p = new URLSearchParams({ post_logout_redirect_uri: BASE_URL + '/', id_token_hint: s.idToken });
      return send(res, 302, '', { Location: OIDC.end_session_endpoint + '?' + p.toString(), 'Set-Cookie': clear });
    }
    return send(res, 302, '', { Location: '/', 'Set-Cookie': clear });
  }
  if (u.pathname === '/account') {
    if (!sess) return send(res, 302, '', { Location: '/login' });
    return send(res, 200, account(sess));
  }
  return send(res, 200, storefront(sess ? sess.claims : null));
});

discover().then((d) => { OIDC = d; server.listen(PORT, () => console.log(BRAND + ' storefront en :' + PORT + ' issuer=' + ISSUER)); })
  .catch((e) => { console.error('discovery failed issuer=' + ISSUER, e && e.message); process.exit(1); });
