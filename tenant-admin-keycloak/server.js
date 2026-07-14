'use strict';
/*
 * Tenant Admin — Keycloak. Panel del dueño/dev del tenant.
 * El admin INICIA SESIÓN con OAuth/OIDC contra Keycloak. El panel usa el
 * ACCESS TOKEN del usuario (con sus roles realm-management) para descubrir
 * los realms que puede gestionar y operar la Admin REST API. Sin secrets a mano.
 */
const http = require('http');
const https = require('https');
const crypto = require('crypto');

const PORT = parseInt(process.env.PORT || '3000', 10);
const BASE = (process.env.KC_BASE || 'https://kc.idp.tripleenable.com').replace(/\/$/, '');
const AUTH_REALM = process.env.KC_AUTH_REALM || 'master';
const ISSUER = (process.env.KC_ISSUER || (BASE + '/realms/' + AUTH_REALM)).replace(/\/$/, '');
const CLIENT_ID = process.env.OIDC_CLIENT_ID || 'tenant-admin';
const CLIENT_SECRET = process.env.OIDC_CLIENT_SECRET || '';
const BASE_URL = (process.env.APP_BASE_URL || '').replace(/\/$/, '');
const SCOPE = process.env.OIDC_SCOPE || 'openid profile email';
const ACCENT = process.env.APP_ACCENT || '#a855f7';

const sessions = new Map();
const pending = new Map();
let OIDC = null;

function discover() {
  if (OIDC) return Promise.resolve(OIDC);
  return new Promise((resolve, reject) => { https.get(ISSUER + '/.well-known/openid-configuration', (r) => { let b = ''; r.on('data', (c) => (b += c)); r.on('end', () => { try { OIDC = JSON.parse(b); resolve(OIDC); } catch (e) { reject(e); } }); }).on('error', reject); });
}
function postForm(url, form, headers) {
  return new Promise((resolve, reject) => { const data = new URLSearchParams(form).toString(); const u = new URL(url);
    const req = https.request({ method: 'POST', hostname: u.hostname, port: u.port || 443, path: u.pathname + u.search, headers: Object.assign({ 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(data) }, headers || {}) }, (r) => { let b = ''; r.on('data', (c) => (b += c)); r.on('end', () => resolve({ status: r.statusCode, body: b })); }); req.on('error', reject); req.write(data); req.end(); });
}
function api(sess, method, path, body) {
  return new Promise((resolve) => { const u = new URL(BASE + path); const data = body ? JSON.stringify(body) : null;
    const headers = { 'Authorization': 'Bearer ' + sess.token, 'Content-Type': 'application/json', 'Accept': 'application/json' }; if (data) headers['Content-Length'] = Buffer.byteLength(data);
    const r = https.request({ hostname: u.hostname, port: 443, path: u.pathname + u.search, method, headers }, (res) => { let b = ''; res.on('data', (c) => (b += c)); res.on('end', () => { let j; try { j = b ? JSON.parse(b) : {}; } catch (_) { j = { raw: b }; } resolve({ status: res.statusCode, body: j }); }); }); r.on('error', (e) => resolve({ status: 0, body: { error: e.message } })); if (data) r.write(data); r.end(); });
}
function decodeJwt(j) { try { return JSON.parse(Buffer.from(j.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')); } catch (e) { return {}; } }
function cookies(req) { const o = {}; (req.headers.cookie || '').split(';').forEach((c) => { const i = c.indexOf('='); if (i > 0) o[c.slice(0, i).trim()] = decodeURIComponent(c.slice(i + 1).trim()); }); return o; }
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
function readBody(req) { return new Promise((r) => { let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => r(b)); }); }
function form(s) { const o = {}; new URLSearchParams(s).forEach((v, k) => (o[k] = v)); return o; }

function shell(title, body, sess) {
  const who = sess && sess.claims ? (sess.claims.name || sess.claims.preferred_username || 'admin') : '';
  const nav = sess ? `<div class="nav"><a href="/realms">Realms</a><a href="/users">Usuarios</a><a href="/clients">Clients/Apps</a><a href="/roles">Roles</a><span class="sp"></span><span class="ctx">realm: ${esc(sess.realm)}</span><a href="/logout" class="out">Salir</a></div>` : '';
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} · Tenant Admin (Keycloak)</title><style>
   :root{--bg:#0b1020;--card:#141c30;--line:#243049;--tx:#e7ecf5;--mut:#93a1bd;--acc:${ACCENT};--ok:#34d399;--bad:#f87171}
   *{box-sizing:border-box}body{margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:radial-gradient(1100px 500px at 85% -10%,#241640,transparent 60%),var(--bg);color:var(--tx);min-height:100vh}
   .top{display:flex;align-items:center;gap:12px;padding:16px 24px;border-bottom:1px solid var(--line)}
   .mk{width:34px;height:34px;border-radius:9px;background:linear-gradient(135deg,var(--acc),#34d399);display:grid;place-items:center;font-weight:900;color:#0b1020}
   .top b{font-size:15px}.top small{display:block;color:var(--mut);font-size:11px}.who{margin-left:auto;color:var(--mut);font-size:13px}.badge{background:var(--acc);color:#0b1020;font-weight:800;font-size:11px;padding:4px 12px;border-radius:999px;text-transform:uppercase;letter-spacing:.5px;margin-left:12px}
   .nav{display:flex;align-items:center;gap:6px;padding:10px 24px;border-bottom:1px solid var(--line);font-size:14px}.nav a{color:var(--mut);text-decoration:none;padding:7px 13px;border-radius:9px}.nav a:hover{background:#1b2540;color:var(--tx)}.nav .sp{flex:1}.nav .ctx{color:var(--mut);font-size:12px;margin-right:8px}.nav .out{color:var(--bad)}
   .wrap{max-width:960px;margin:0 auto;padding:26px 24px}h1{font-size:22px;margin:0 0 4px}.sub{color:var(--mut);margin:0 0 20px;font-size:14px}
   .card{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:20px;margin-bottom:16px}
   label{display:block;color:var(--mut);font-size:12px;margin:10px 0 5px}input,select{width:100%;background:#0e1626;border:1px solid var(--line);color:var(--tx);border-radius:10px;padding:11px;font-size:14px}
   .btn{display:inline-flex;align-items:center;gap:9px;background:var(--acc);color:#0b1020;font-weight:800;border:0;border-radius:10px;padding:12px 18px;font-size:14px;cursor:pointer;text-decoration:none;margin-top:10px}.btn.sec{background:#1b2540;color:var(--tx);border:1px solid var(--line)}
   table{width:100%;border-collapse:collapse;font-size:13.5px}th,td{text-align:left;padding:10px 8px;border-bottom:1px solid var(--line)}th{color:var(--mut);font-weight:600;font-size:11px;text-transform:uppercase;letter-spacing:.5px}
   .pill{display:inline-block;background:#1b2540;border:1px solid var(--line);border-radius:999px;padding:2px 9px;font-size:11px;color:var(--mut)}
   .row{display:flex;gap:12px;flex-wrap:wrap}.row>div{flex:1;min-width:180px}
   .msg{padding:11px 14px;border-radius:10px;margin-bottom:14px;font-size:13.5px}.msg.ok{background:rgba(52,211,153,.12);border:1px solid rgba(52,211,153,.4);color:var(--ok)}.msg.bad{background:rgba(248,113,113,.12);border:1px solid rgba(248,113,113,.4);color:var(--bad)}
   code{font-family:monospace;font-size:12px;color:var(--mut);word-break:break-all}.empty{color:var(--mut);padding:16px 0}
  </style></head><body><div class="top"><div class="mk">T</div><div><b>Tenant Admin</b><small>administración de tenant</small></div>${who ? `<span class="who">${esc(who)}</span>` : ''}<span class="badge">Keycloak</span></div>${nav}<div class="wrap">${body}</div></body></html>`;
}
function msg(q) { if (q.get('ok')) return `<div class="msg ok">${esc(q.get('ok'))}</div>`; if (q.get('err')) return `<div class="msg bad">${esc(q.get('err'))}</div>`; return ''; }
function landing() {
  return shell('Entrar', `<div style="max-width:460px;margin:8vh auto 0"><div class="card" style="text-align:center;padding:34px">
    <div class="mk" style="width:52px;height:52px;border-radius:14px;margin:0 auto 16px;font-size:26px">T</div>
    <h1 style="font-size:24px">Panel de administración</h1>
    <p class="sub">Inicia sesión con tu cuenta de <b>Keycloak</b>. Verás los realms (tenants) que puedes gestionar según tus roles — usuarios, clients/apps y roles.</p>
    <a class="btn" style="width:100%;justify-content:center" href="/login">Entrar con Keycloak →</a>
    <p class="sub" style="margin-top:16px;font-size:12px">Tus roles <code>realm-management</code> definen lo que puedes gestionar. Sin pegar secrets.</p>
  </div></div>`, null);
}

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, BASE_URL || 'http://localhost:' + PORT);
  const q = u.searchParams; const ck = cookies(req);
  const sess = ck.tak && sessions.get(ck.tak);
  const send = (code, html, h) => { res.writeHead(code, Object.assign({ 'Content-Type': 'text/html; charset=utf-8' }, h || {})); res.end(html); };

  if (u.pathname === '/healthz') return send(200, 'ok');

  if (u.pathname === '/login') {
    try { await discover(); } catch (e) { return send(502, shell('Error', `<div class="card"><h1>OIDC no disponible</h1><p class="sub">${esc(e.message)} (issuer ${esc(ISSUER)})</p></div>`, null)); }
    if (!CLIENT_SECRET) return send(500, shell('Config', `<div class="card"><h1>Falta OIDC_CLIENT_SECRET</h1><p class="sub">Registra el client <code>${esc(CLIENT_ID)}</code> en Keycloak (realm ${esc(AUTH_REALM)}, redirect <code>${esc(BASE_URL)}/callback</code>) y pon OIDC_CLIENT_SECRET / APP_BASE_URL.</p></div>`, null));
    const state = crypto.randomBytes(16).toString('hex'); pending.set(state, Date.now());
    const p = new URLSearchParams({ client_id: CLIENT_ID, redirect_uri: BASE_URL + '/callback', response_type: 'code', scope: SCOPE, state });
    return send(302, '', { Location: OIDC.authorization_endpoint + '?' + p.toString() });
  }
  if (u.pathname === '/callback') {
    await discover();
    const code = q.get('code'); const state = q.get('state');
    if (!code || !pending.has(state)) return send(400, shell('Sesión', `<div class="card"><h1>Sesión expirada</h1><a class="btn sec" href="/">Volver</a></div>`, null));
    pending.delete(state);
    const basic = Buffer.from(CLIENT_ID + ':' + CLIENT_SECRET).toString('base64');
    const tok = await postForm(OIDC.token_endpoint, { grant_type: 'authorization_code', code, redirect_uri: BASE_URL + '/callback' }, { Authorization: 'Basic ' + basic });
    let j; try { j = JSON.parse(tok.body); } catch (_) { j = {}; }
    if (tok.status !== 200 || !j.access_token) return send(502, shell('Login', `<div class="card"><h1>Fallo al canjear el código</h1><pre style="overflow:auto;font-size:12px">${esc(tok.body)}</pre></div>`, null));
    const sid = crypto.randomBytes(18).toString('hex');
    sessions.set(sid, { token: j.access_token, claims: decodeJwt(j.id_token || j.access_token), realm: AUTH_REALM });
    return send(302, '', { Location: '/realms', 'Set-Cookie': `tak=${sid}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=28800` });
  }
  if (u.pathname === '/logout') { if (ck.tak) sessions.delete(ck.tak); return send(302, '', { Location: '/', 'Set-Cookie': 'tak=; Path=/; Max-Age=0' }); }

  if (!sess) return send(200, landing());
  const target = q.get('realm') || sess.realm;

  if (u.pathname === '/realms') {
    if (q.get('use')) { sess.realm = q.get('use'); return send(302, '', { Location: '/users' }); }
    const r = await api(sess, 'GET', '/admin/realms', null);
    const list = Array.isArray(r.body) ? r.body : [];
    const rows = list.length ? list.map((rl) => `<tr><td><b>${esc(rl.realm)}</b></td><td><span class="pill">${rl.enabled ? 'enabled' : 'disabled'}</span></td><td>${esc(rl.displayName || '')}</td><td><a class="btn sec" href="/realms?use=${esc(rl.realm)}">Gestionar</a></td></tr>`).join('')
      : `<tr><td colspan="4" class="empty">Tu token no lista realms (status ${r.status}). ¿Tienes rol de admin? Puedes gestionar tu realm de auth: <a href="/realms?use=${esc(sess.realm)}">${esc(sess.realm)}</a></td></tr>`;
    return send(200, shell('Realms', `${msg(q)}<h1>Realms que gestionas</h1><p class="sub">Cada realm = un tenant aislado. Según tus roles, gestionas uno o varios.</p>
      <div class="card"><table><tr><th>Realm</th><th>Estado</th><th>Display</th><th></th></tr>${rows}</table></div>
      <div class="card"><form method="post" action="/realms/create"><h1 style="font-size:16px">Crear realm (tenant)</h1><label>Nombre (id)</label><input name="realm" required placeholder="tenant-x"><button class="btn">Crear tenant</button></form></div>`, sess));
  }
  if (u.pathname === '/realms/create' && req.method === 'POST') {
    const f = form(await readBody(req)); const r = await api(sess, 'POST', '/admin/realms', { realm: f.realm, enabled: true, displayName: f.realm });
    return send(302, '', { Location: r.status < 300 ? '/realms?ok=' + encodeURIComponent('Realm creado: ' + f.realm) : '/realms?err=' + encodeURIComponent('Error ' + r.status + ': ' + JSON.stringify(r.body)) });
  }

  if (u.pathname === '/users') {
    const r = await api(sess, 'GET', `/admin/realms/${target}/users?max=100`, null); const list = Array.isArray(r.body) ? r.body : [];
    const rows = list.length ? list.map((x) => `<tr><td><b>${esc((x.firstName || '') + ' ' + (x.lastName || ''))}</b></td><td>${esc(x.username)}</td><td>${esc(x.email || '')}</td><td><span class="pill">${x.enabled ? 'enabled' : 'disabled'}</span></td></tr>`).join('') : `<tr><td colspan="4" class="empty">Sin usuarios en '${esc(target)}' (status ${r.status})</td></tr>`;
    return send(200, shell('Usuarios', `${msg(q)}<h1>Usuarios · realm ${esc(target)}</h1><p class="sub">Miembros del tenant. Globales del sistema: <code>user@idp.tripleenable.com</code>.</p>
      <div class="card"><table><tr><th>Nombre</th><th>Usuario</th><th>Email</th><th>Estado</th></tr>${rows}</table></div>
      <div class="card"><form method="post" action="/users/create"><h1 style="font-size:16px">Crear usuario</h1><div class="row"><div><label>Usuario</label><input name="username" required></div><div><label>Email</label><input name="email" type="email"></div></div><div class="row"><div><label>Nombre</label><input name="firstName"></div><div><label>Apellido</label><input name="lastName"></div></div><button class="btn">Crear usuario</button></form></div>`, sess));
  }
  if (u.pathname === '/users/create' && req.method === 'POST') {
    const f = form(await readBody(req)); const r = await api(sess, 'POST', `/admin/realms/${sess.realm}/users`, { username: f.username, email: f.email, firstName: f.firstName, lastName: f.lastName, enabled: true, emailVerified: true });
    return send(302, '', { Location: r.status < 300 ? '/users?ok=' + encodeURIComponent('Usuario creado') : '/users?err=' + encodeURIComponent('Error ' + r.status + ': ' + JSON.stringify(r.body)) });
  }

  if (u.pathname === '/clients') {
    const r = await api(sess, 'GET', `/admin/realms/${target}/clients`, null); const list = Array.isArray(r.body) ? r.body : [];
    const rows = list.length ? list.map((c) => `<tr><td><b>${esc(c.clientId)}</b></td><td><span class="pill">${c.publicClient ? 'public' : 'confidential'}</span></td><td>${esc((c.redirectUris || []).join(', '))}</td></tr>`).join('') : `<tr><td colspan="3" class="empty">Sin clients (status ${r.status})</td></tr>`;
    return send(200, shell('Clients', `${msg(q)}<h1>Clients / Apps · realm ${esc(target)}</h1><p class="sub">Aplicaciones registradas del tenant.</p>
      <div class="card"><table><tr><th>Client ID</th><th>Tipo</th><th>Redirect URIs</th></tr>${rows}</table></div>
      <div class="card"><form method="post" action="/clients/create"><h1 style="font-size:16px">Crear app (client OIDC)</h1><div class="row"><div><label>Client ID</label><input name="clientId" required></div><div><label>Redirect URI</label><input name="redirect" placeholder="https://app/callback" required></div></div><button class="btn">Crear app</button></form></div>`, sess));
  }
  if (u.pathname === '/clients/create' && req.method === 'POST') {
    const f = form(await readBody(req)); const r = await api(sess, 'POST', `/admin/realms/${sess.realm}/clients`, { clientId: f.clientId, enabled: true, protocol: 'openid-connect', publicClient: false, standardFlowEnabled: true, redirectUris: [f.redirect], webOrigins: ['+'] });
    return send(302, '', { Location: r.status < 300 ? '/clients?ok=' + encodeURIComponent('App creada') : '/clients?err=' + encodeURIComponent('Error ' + r.status + ': ' + JSON.stringify(r.body)) });
  }

  if (u.pathname === '/roles') {
    const r = await api(sess, 'GET', `/admin/realms/${target}/roles`, null); const list = Array.isArray(r.body) ? r.body : [];
    const rows = list.length ? list.map((rl) => `<tr><td><b>${esc(rl.name)}</b></td><td>${esc(rl.description || '')}</td></tr>`).join('') : `<tr><td colspan="2" class="empty">Sin roles (status ${r.status})</td></tr>`;
    return send(200, shell('Roles', `${msg(q)}<h1>Roles · realm ${esc(target)}</h1><p class="sub">Roles de realm del tenant.</p>
      <div class="card"><table><tr><th>Rol</th><th>Descripción</th></tr>${rows}</table></div>
      <div class="card"><form method="post" action="/roles/create"><h1 style="font-size:16px">Crear rol</h1><div class="row"><div><label>Nombre</label><input name="name" required></div><div><label>Descripción</label><input name="description"></div></div><button class="btn">Crear rol</button></form></div>`, sess));
  }
  if (u.pathname === '/roles/create' && req.method === 'POST') {
    const f = form(await readBody(req)); const r = await api(sess, 'POST', `/admin/realms/${sess.realm}/roles`, { name: f.name, description: f.description });
    return send(302, '', { Location: r.status < 300 ? '/roles?ok=' + encodeURIComponent('Rol creado') : '/roles?err=' + encodeURIComponent('Error ' + r.status + ': ' + JSON.stringify(r.body)) });
  }

  send(404, shell('404', '<h1>No encontrado</h1>', sess));
});

server.listen(PORT, () => console.log('tenant-admin-keycloak (OIDC) en :' + PORT + ' issuer=' + ISSUER));
