'use strict';
// Generic OIDC demo web client (zero-dependency Node).
// Server-side Authorization Code flow against any OIDC provider (Zitadel, Keycloak...).
// Renders a landing page + a user card + Login/Logout. Fully configured via env.

const http = require('http');
const https = require('https');
const crypto = require('crypto');

const ISSUER = (process.env.OIDC_ISSUER || '').replace(/\/$/, '');
const CLIENT_ID = process.env.OIDC_CLIENT_ID;
const CLIENT_SECRET = process.env.OIDC_CLIENT_SECRET;
const BASE_URL = (process.env.APP_BASE_URL || '').replace(/\/$/, '');
const PORT = parseInt(process.env.PORT || '3000', 10);
const SCOPE = process.env.OIDC_SCOPE || 'openid profile email';

// Branding (so the same image serves several demos)
const BRAND = process.env.APP_BRAND || 'Care Store';
const TAGLINE = process.env.APP_TAGLINE || 'concesionario · demo tenant en Tripleenable';
const TENANT = process.env.APP_TENANT || 'Care Store';
const IDP_LABEL = process.env.APP_IDP || 'IdP global de Tripleenable (Dex)';
const PLATFORM = process.env.APP_PLATFORM || 'Tripleenable';

const sessions = new Map(); // sid -> { claims, idToken }
const pending = new Map();   // state -> { nonce, ts }
let OIDC = null;

function discover() {
  return new Promise((resolve, reject) => {
    https.get(ISSUER + '/.well-known/openid-configuration', (r) => {
      let b = '';
      r.on('data', (c) => (b += c));
      r.on('end', () => { try { resolve(JSON.parse(b)); } catch (e) { reject(e); } });
    }).on('error', reject);
  });
}

function postForm(url, form, headers) {
  return new Promise((resolve, reject) => {
    const data = new URLSearchParams(form).toString();
    const u = new URL(url);
    const req = https.request({
      method: 'POST', hostname: u.hostname, port: u.port || 443, path: u.pathname + u.search,
      headers: Object.assign({ 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(data) }, headers || {}),
    }, (r) => {
      let b = '';
      r.on('data', (c) => (b += c));
      r.on('end', () => resolve({ status: r.statusCode, body: b }));
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function decodeJwt(jwt) {
  try {
    const p = jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(Buffer.from(p, 'base64').toString('utf8'));
  } catch (e) { return {}; }
}

function cookies(req) {
  const out = {};
  (req.headers.cookie || '').split(';').forEach((c) => {
    const i = c.indexOf('=');
    if (i > 0) out[c.slice(0, i).trim()] = decodeURIComponent(c.slice(i + 1).trim());
  });
  return out;
}

function escapeHtml(s) { return String(s).replace(/[&<>]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[m])); }

function html(body, sub) {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(BRAND)}</title>
<style>
  :root{--bg:#0b1020;--card:#141c30;--line:#243049;--tx:#e7ecf5;--mut:#93a1bd;--acc:#5b9dff;--acc2:#34d399}
  *{box-sizing:border-box}
  body{margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;background:
    radial-gradient(1200px 600px at 80% -10%, #16233f 0%, transparent 60%),
    radial-gradient(900px 500px at -10% 110%, #10203a 0%, transparent 55%), var(--bg);color:var(--tx);min-height:100vh}
  .wrap{max-width:920px;margin:0 auto;padding:28px 20px 60px}
  header{display:flex;align-items:center;gap:12px;padding:8px 0 26px}
  .logo{width:40px;height:40px;border-radius:11px;background:linear-gradient(135deg,#5b9dff,#34d399);display:grid;place-items:center;font-weight:800;color:#0b1020;font-size:20px}
  .brand{font-weight:700;font-size:19px;letter-spacing:.2px}
  .brand small{display:block;color:var(--mut);font-weight:500;font-size:12px;letter-spacing:.3px}
  .card{background:linear-gradient(180deg,#16203a,#131b2e);border:1px solid var(--line);border-radius:18px;padding:26px;box-shadow:0 20px 60px -30px rgba(0,0,0,.7)}
  .hero h1{font-size:30px;margin:6px 0 8px;line-height:1.15}
  .hero p{color:var(--mut);margin:0 0 22px;max-width:52ch;line-height:1.6}
  .btn{display:inline-flex;align-items:center;gap:10px;background:var(--acc);color:#0b1020;font-weight:700;border:0;border-radius:12px;padding:14px 20px;font-size:15px;text-decoration:none;cursor:pointer;transition:.15s transform}
  .btn:hover{transform:translateY(-1px)}
  .btn.ghost{background:transparent;color:var(--tx);border:1px solid var(--line);font-weight:600}
  .row{display:flex;gap:22px;flex-wrap:wrap;align-items:center}
  .ava{width:64px;height:64px;border-radius:16px;background:linear-gradient(135deg,#5b9dff,#8b5cf6);display:grid;place-items:center;font-size:26px;font-weight:800;color:#0b1020}
  .who{font-size:22px;font-weight:700}
  .who small{display:block;color:var(--mut);font-weight:500;font-size:14px;margin-top:2px}
  .grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:22px 0 8px}
  @media(max-width:560px){.grid{grid-template-columns:1fr}}
  .kv{background:#0e1626;border:1px solid var(--line);border-radius:12px;padding:12px 14px}
  .kv .k{color:var(--mut);font-size:11px;text-transform:uppercase;letter-spacing:.6px}
  .kv .v{font-size:15px;margin-top:3px;word-break:break-all}
  .pill{display:inline-flex;align-items:center;gap:7px;background:rgba(52,211,153,.12);color:#6ee7b7;border:1px solid rgba(52,211,153,.3);border-radius:999px;padding:6px 12px;font-size:13px;font-weight:600}
  .foot{margin-top:26px;display:flex;gap:12px;flex-wrap:wrap;align-items:center;justify-content:space-between}
  details{margin-top:18px;background:#0e1626;border:1px solid var(--line);border-radius:12px;padding:12px 14px}
  summary{cursor:pointer;color:var(--mut);font-size:13px}
  pre{overflow:auto;font-size:12px;color:#a7f3d0;margin:10px 0 0}
  .note{color:var(--mut);font-size:12.5px;margin-top:14px;line-height:1.5}
</style></head><body><div class="wrap">
<header><div class="logo">${escapeHtml((BRAND[0] || 'C').toUpperCase())}</div><div class="brand">${escapeHtml(BRAND)}<small>${escapeHtml(sub || TAGLINE)}</small></div></header>
${body}
</div></body></html>`;
}

function landing() {
  return html(`<div class="card hero">
    <span class="pill">🔒 Acceso protegido por ${escapeHtml(PLATFORM)}</span>
    <h1>Bienvenido a ${escapeHtml(BRAND)}</h1>
    <p>Para entrar a tu panel necesitas identificarte con tu cuenta global de
    <b>${escapeHtml(PLATFORM)}</b>. ${escapeHtml(BRAND)} no guarda tu contraseña — la autenticación
    la hace el Identity Provider de ${escapeHtml(PLATFORM)}.</p>
    <a class="btn" href="/login">Entrar con ${escapeHtml(PLATFORM)} →</a>
    <p class="note">Este comercio es un <b>tenant</b> (organización) dentro de la plataforma ${escapeHtml(PLATFORM)}.
    El único método de login habilitado es el IdP global; no hay usuarios/contraseñas locales.</p>
  </div>`, TAGLINE);
}

function dashboard(sess) {
  const c = sess.claims || {};
  const name = c.name || c.preferred_username || c.email || 'Usuario';
  const initial = (name[0] || 'U').toUpperCase();
  const kv = (k, v) => `<div class="kv"><div class="k">${escapeHtml(k)}</div><div class="v">${escapeHtml(v || '—')}</div></div>`;
  return html(`<div class="card">
    <div class="row">
      <div class="ava">${escapeHtml(initial)}</div>
      <div class="who">${escapeHtml(name)}<small>${escapeHtml(c.email || '')}</small></div>
      <div style="margin-left:auto"><span class="pill">✓ Sesión iniciada</span></div>
    </div>
    <div class="grid">
      ${kv('Usuario (preferred_username)', c.preferred_username)}
      ${kv('Email', c.email)}
      ${kv('Subject (id del usuario)', c.sub)}
      ${kv('Emisor (broker)', c.iss)}
    </div>
    <div class="grid">
      ${kv('Inquilino / Tenant', TENANT)}
      ${kv('Autenticado vía', IDP_LABEL)}
    </div>
    <details><summary>Ver todos los claims del ID token</summary>
      <pre>${escapeHtml(JSON.stringify(c, null, 2))}</pre>
    </details>
    <div class="foot">
      <p class="note">Eres un <b>usuario global</b> de ${escapeHtml(PLATFORM)} con sesión en el tenant <b>${escapeHtml(TENANT)}</b>.
      La misma identidad podría entrar en otros tenants; cada uno te ve de forma aislada.</p>
      <a class="btn ghost" href="/logout">Cerrar sesión</a>
    </div>
  </div>`, 'panel del cliente · ' + (c.preferred_username || ''));
}

function send(res, status, body, headers) {
  res.writeHead(status, Object.assign({ 'Content-Type': 'text/html; charset=utf-8' }, headers || {}));
  res.end(body);
}

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, BASE_URL || ('http://localhost:' + PORT));
  const ck = cookies(req);

  if (u.pathname === '/healthz') return send(res, 200, 'ok', { 'Content-Type': 'text/plain' });

  if (u.pathname === '/login') {
    const state = crypto.randomBytes(16).toString('hex');
    const nonce = crypto.randomBytes(16).toString('hex');
    pending.set(state, { nonce, ts: Date.now() });
    const p = new URLSearchParams({
      client_id: CLIENT_ID, redirect_uri: BASE_URL + '/callback', response_type: 'code',
      scope: SCOPE, state, nonce,
    });
    return send(res, 302, '', { Location: OIDC.authorization_endpoint + '?' + p.toString() });
  }

  if (u.pathname === '/callback') {
    const code = u.searchParams.get('code');
    const state = u.searchParams.get('state');
    if (!code || !state || !pending.has(state)) return send(res, 400, html('<div class="card"><h1>Error de estado</h1><p>Intenta de nuevo desde <a href="/">el inicio</a>.</p></div>'));
    pending.delete(state);
    try {
      const basic = Buffer.from(CLIENT_ID + ':' + CLIENT_SECRET).toString('base64');
      const tok = await postForm(OIDC.token_endpoint, {
        grant_type: 'authorization_code', code, redirect_uri: BASE_URL + '/callback',
      }, { Authorization: 'Basic ' + basic });
      if (tok.status !== 200) return send(res, 502, html('<div class="card"><h1>Fallo al canjear el código</h1><pre>' + escapeHtml(tok.body) + '</pre></div>'));
      const t = JSON.parse(tok.body);
      const claims = decodeJwt(t.id_token);
      const sid = crypto.randomBytes(18).toString('hex');
      sessions.set(sid, { claims, idToken: t.id_token });
      return send(res, 302, '', { Location: '/', 'Set-Cookie': `sid=${sid}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=28800` });
    } catch (e) {
      return send(res, 500, html('<div class="card"><h1>Error</h1><pre>' + escapeHtml(String(e)) + '</pre></div>'));
    }
  }

  if (u.pathname === '/logout') {
    const sess = sessions.get(ck.sid);
    if (ck.sid) sessions.delete(ck.sid);
    const clear = 'sid=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0';
    if (OIDC.end_session_endpoint && sess && sess.idToken) {
      const p = new URLSearchParams({ post_logout_redirect_uri: BASE_URL + '/', id_token_hint: sess.idToken });
      return send(res, 302, '', { Location: OIDC.end_session_endpoint + '?' + p.toString(), 'Set-Cookie': clear });
    }
    return send(res, 302, '', { Location: '/', 'Set-Cookie': clear });
  }

  const sess = ck.sid && sessions.get(ck.sid);
  if (sess) return send(res, 200, dashboard(sess));
  return send(res, 200, landing());
});

discover().then((d) => {
  OIDC = d;
  server.listen(PORT, () => console.log(BRAND + ' demo on :' + PORT + ' issuer=' + ISSUER));
}).catch((e) => { console.error('discovery failed for issuer=' + ISSUER, e && e.message); process.exit(1); });
