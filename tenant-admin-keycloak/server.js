'use strict';
/*
 * Tenant Admin — Keycloak. Panel del dueño/dev del tenant.
 * Usa la Admin REST API de Keycloak con un Bearer token.
 * Connect: base URL + realm de auth + (token pegado  ó  client_id/secret via
 * client_credentials). No se hardcodea credencial admin.
 * Flujos: Realms (tenants) · Usuarios · Clients/Apps · Roles.
 */
const http = require('http');
const https = require('https');
const crypto = require('crypto');
const { parse } = require('url');

const PORT = parseInt(process.env.PORT || '3000', 10);
const DEF_BASE = (process.env.KC_BASE || 'https://kc.idp.tripleenable.com').replace(/\/$/, '');
const ACCENT = process.env.APP_ACCENT || '#a855f7';

const sessions = new Map(); // sid -> { base, token, realm }

function sid(req) { const c = (req.headers.cookie || '').match(/tak=([\w-]+)/); return c ? c[1] : null; }
function getSession(req) { const s = sid(req); return s && sessions.get(s); }
function readBody(req) { return new Promise((r) => { let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => r(b)); }); }
function form(str) { const o = {}; new URLSearchParams(str).forEach((v, k) => (o[k] = v)); return o; }
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

// request genérico
function req_(base, method, path, headers, data) {
  return new Promise((resolve) => {
    const u = new URL(base + path);
    const h = Object.assign({}, headers);
    if (data) h['Content-Length'] = Buffer.byteLength(data);
    const r = https.request({ hostname: u.hostname, port: 443, path: u.pathname + u.search, method, headers: h }, (res) => {
      let b = ''; res.on('data', (c) => (b += c));
      res.on('end', () => { let j; try { j = b ? JSON.parse(b) : {}; } catch (_) { j = { raw: b }; } resolve({ status: res.statusCode, body: j, headers: res.headers }); });
    });
    r.on('error', (e) => resolve({ status: 0, body: { error: e.message } }));
    if (data) r.write(data);
    r.end();
  });
}
const api = (sess, method, path, body) => req_(sess.base, method, path, { 'Authorization': 'Bearer ' + sess.token, 'Content-Type': 'application/json', 'Accept': 'application/json' }, body ? JSON.stringify(body) : null);

// token via client_credentials
async function tokenFromClient(base, realm, clientId, clientSecret) {
  const data = new URLSearchParams({ grant_type: 'client_credentials', client_id: clientId, client_secret: clientSecret }).toString();
  const r = await req_(base, 'POST', `/realms/${realm}/protocol/openid-connect/token`, { 'Content-Type': 'application/x-www-form-urlencoded' }, data);
  return r.body && r.body.access_token ? r.body.access_token : null;
}

function shell(title, body, sess) {
  const nav = sess ? `<div class="nav">
      <a href="/realms">Realms</a><a href="/users">Usuarios</a><a href="/clients">Clients/Apps</a><a href="/roles">Roles</a>
      <span class="sp"></span><span class="ctx">realm: ${esc(sess.realm)}</span><a href="/logout" class="out">Desconectar</a></div>` : '';
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} · Tenant Admin (Keycloak)</title><style>
   :root{--bg:#0b1020;--card:#141c30;--line:#243049;--tx:#e7ecf5;--mut:#93a1bd;--acc:${ACCENT};--ok:#34d399;--bad:#f87171}
   *{box-sizing:border-box}body{margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:radial-gradient(1100px 500px at 85% -10%,#241640,transparent 60%),var(--bg);color:var(--tx);min-height:100vh}
   .top{display:flex;align-items:center;gap:12px;padding:16px 24px;border-bottom:1px solid var(--line)}
   .mk{width:34px;height:34px;border-radius:9px;background:linear-gradient(135deg,var(--acc),#34d399);display:grid;place-items:center;font-weight:900;color:#0b1020}
   .top b{font-size:15px}.top small{display:block;color:var(--mut);font-size:11px}.badge{margin-left:auto;background:var(--acc);color:#0b1020;font-weight:800;font-size:11px;padding:4px 12px;border-radius:999px;text-transform:uppercase;letter-spacing:.5px}
   .nav{display:flex;align-items:center;gap:6px;padding:10px 24px;border-bottom:1px solid var(--line);font-size:14px}
   .nav a{color:var(--mut);text-decoration:none;padding:7px 13px;border-radius:9px}.nav a:hover{background:#1b2540;color:var(--tx)}.nav .sp{flex:1}.nav .ctx{color:var(--mut);font-size:12px;margin-right:8px}.nav .out{color:var(--bad)}
   .wrap{max-width:960px;margin:0 auto;padding:26px 24px}
   h1{font-size:22px;margin:0 0 4px}.sub{color:var(--mut);margin:0 0 20px;font-size:14px}
   .card{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:20px;margin-bottom:16px}
   label{display:block;color:var(--mut);font-size:12px;margin:10px 0 5px}
   input,select{width:100%;background:#0e1626;border:1px solid var(--line);color:var(--tx);border-radius:10px;padding:11px;font-size:14px}
   .btn{display:inline-block;background:var(--acc);color:#0b1020;font-weight:800;border:0;border-radius:10px;padding:11px 16px;font-size:14px;cursor:pointer;text-decoration:none;margin-top:10px}
   .btn.sec{background:#1b2540;color:var(--tx);border:1px solid var(--line)}
   table{width:100%;border-collapse:collapse;font-size:13.5px}th,td{text-align:left;padding:10px 8px;border-bottom:1px solid var(--line)}th{color:var(--mut);font-weight:600;font-size:11px;text-transform:uppercase;letter-spacing:.5px}
   .pill{display:inline-block;background:#1b2540;border:1px solid var(--line);border-radius:999px;padding:2px 9px;font-size:11px;color:var(--mut)}
   .row{display:flex;gap:12px;flex-wrap:wrap}.row>div{flex:1;min-width:180px}
   .msg{padding:11px 14px;border-radius:10px;margin-bottom:14px;font-size:13.5px}.msg.ok{background:rgba(52,211,153,.12);border:1px solid rgba(52,211,153,.4);color:var(--ok)}.msg.bad{background:rgba(248,113,113,.12);border:1px solid rgba(248,113,113,.4);color:var(--bad)}
   code{font-family:monospace;font-size:12px;color:var(--mut);word-break:break-all}.empty{color:var(--mut);padding:16px 0}
  </style></head><body>
   <div class="top"><div class="mk">T</div><div><b>Tenant Admin</b><small>administración de tenant</small></div><span class="badge">Keycloak</span></div>
   ${nav}<div class="wrap">${body}</div></body></html>`;
}
function msg(q) { if (q.ok) return `<div class="msg ok">${esc(q.ok)}</div>`; if (q.err) return `<div class="msg bad">${esc(q.err)}</div>`; return ''; }

function connectPage(q) {
  return shell('Connect', `
    <h1>Conectar a Keycloak</h1>
    <p class="sub">Pega un <b>token</b> admin, o usa <b>client credentials</b> (una service account con roles realm-management). No se guarda en disco.</p>
    ${msg(q)}
    <div class="card"><form method="post" action="/connect">
      <label>Base URL</label><input name="base" value="${esc(q.base || DEF_BASE)}">
      <label>Realm de gestión (donde autentica el token / SA)</label><input name="realm" value="${esc(q.realm || 'master')}">
      <label>Bearer token (opción A)</label><input name="token" type="password" placeholder="pega el access_token…">
      <div class="row"><div><label>Client ID (opción B)</label><input name="client_id" placeholder="admin-cli / service-account"></div><div><label>Client secret</label><input name="client_secret" type="password"></div></div>
      <button class="btn">Conectar</button>
    </form></div>
  `);
}

async function handle(req, res) {
  const { pathname, query } = parse(req.url, true);
  const send = (code, html) => { res.writeHead(code, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(html); };
  const redirect = (to) => { res.writeHead(302, { Location: to }); res.end(); };
  if (pathname === '/healthz') return send(200, 'ok');

  if (pathname === '/connect' && req.method === 'POST') {
    const f = form(await readBody(req));
    const base = (f.base || DEF_BASE).replace(/\/$/, ''); const realm = (f.realm || 'master').trim();
    let token = (f.token || '').trim();
    if (!token && f.client_id && f.client_secret) token = await tokenFromClient(base, realm, f.client_id.trim(), f.client_secret.trim());
    if (!token) return redirect('/?err=' + encodeURIComponent('token inválido o client_credentials fallidas') + '&base=' + encodeURIComponent(base) + '&realm=' + encodeURIComponent(realm));
    const s = crypto.randomBytes(16).toString('hex');
    sessions.set(s, { base, token, realm });
    res.writeHead(302, { Location: '/realms', 'Set-Cookie': `tak=${s}; Path=/; HttpOnly; SameSite=Lax` });
    return res.end();
  }
  if (pathname === '/logout') { const s = sid(req); if (s) sessions.delete(s); return redirect('/'); }

  const sess = getSession(req);
  if (pathname === '/' || !sess) return send(200, connectPage(query));

  // realm objetivo (para gestionar); por defecto el de auth
  const target = query.realm || sess.realm;

  if (pathname === '/realms') {
    if (query.use) { sess.realm = query.use; return redirect('/users'); }
    const r = await api(sess, 'GET', '/admin/realms', null);
    const list = Array.isArray(r.body) ? r.body : [];
    const rows = list.length ? list.map((rl) => `<tr><td><b>${esc(rl.realm)}</b></td><td><span class="pill">${rl.enabled ? 'enabled' : 'disabled'}</span></td><td>${esc(rl.displayName || '')}</td><td><a class="btn sec" href="/realms?use=${esc(rl.realm)}">Usar</a></td></tr>`).join('')
      : `<tr><td colspan="4" class="empty">Sin realms visibles (status ${r.status}). ¿El token tiene rol view-realm?</td></tr>`;
    return send(200, shell('Realms', `${msg(query)}<h1>Realms (tenants)</h1><p class="sub">Cada realm = un tenant aislado en Keycloak.</p>
      <div class="card"><table><tr><th>Realm</th><th>Estado</th><th>Display</th><th></th></tr>${rows}</table></div>
      <div class="card"><form method="post" action="/realms/create"><h1 style="font-size:16px">Crear realm</h1><label>Nombre (id)</label><input name="realm" required placeholder="tenant-x"><button class="btn">Crear tenant</button></form></div>`, sess));
  }
  if (pathname === '/realms/create' && req.method === 'POST') {
    const f = form(await readBody(req));
    const r = await api(sess, 'POST', '/admin/realms', { realm: f.realm, enabled: true, displayName: f.realm });
    return redirect(r.status < 300 ? '/realms?ok=' + encodeURIComponent('Realm creado: ' + f.realm) : '/realms?err=' + encodeURIComponent('Error ' + r.status + ': ' + JSON.stringify(r.body)));
  }

  if (pathname === '/users') {
    const r = await api(sess, 'GET', `/admin/realms/${target}/users?max=100`, null);
    const list = Array.isArray(r.body) ? r.body : [];
    const rows = list.length ? list.map((u) => `<tr><td><b>${esc((u.firstName || '') + ' ' + (u.lastName || ''))}</b></td><td>${esc(u.username)}</td><td>${esc(u.email || '')}</td><td><span class="pill">${u.enabled ? 'enabled' : 'disabled'}</span></td></tr>`).join('')
      : `<tr><td colspan="4" class="empty">Sin usuarios en '${esc(target)}' (status ${r.status})</td></tr>`;
    return send(200, shell('Usuarios', `${msg(query)}<h1>Usuarios · realm ${esc(target)}</h1><p class="sub">Miembros del tenant. Globales del sistema: <code>user@idp.tripleenable.com</code>.</p>
      <div class="card"><table><tr><th>Nombre</th><th>Usuario</th><th>Email</th><th>Estado</th></tr>${rows}</table></div>
      <div class="card"><form method="post" action="/users/create"><h1 style="font-size:16px">Crear usuario</h1><div class="row"><div><label>Usuario</label><input name="username" required></div><div><label>Email</label><input name="email" type="email"></div></div><div class="row"><div><label>Nombre</label><input name="firstName"></div><div><label>Apellido</label><input name="lastName"></div></div><button class="btn">Crear usuario</button></form></div>`, sess));
  }
  if (pathname === '/users/create' && req.method === 'POST') {
    const f = form(await readBody(req));
    const r = await api(sess, 'POST', `/admin/realms/${sess.realm}/users`, { username: f.username, email: f.email, firstName: f.firstName, lastName: f.lastName, enabled: true, emailVerified: true });
    return redirect(r.status < 300 ? '/users?ok=' + encodeURIComponent('Usuario creado') : '/users?err=' + encodeURIComponent('Error ' + r.status + ': ' + JSON.stringify(r.body)));
  }

  if (pathname === '/clients') {
    const r = await api(sess, 'GET', `/admin/realms/${target}/clients`, null);
    const list = Array.isArray(r.body) ? r.body : [];
    const rows = list.length ? list.map((c) => `<tr><td><b>${esc(c.clientId)}</b></td><td><span class="pill">${c.publicClient ? 'public' : 'confidential'}</span></td><td>${esc(c.protocol || '')}</td><td>${esc((c.redirectUris || []).join(', '))}</td></tr>`).join('')
      : `<tr><td colspan="4" class="empty">Sin clients (status ${r.status})</td></tr>`;
    return send(200, shell('Clients', `${msg(query)}<h1>Clients / Apps · realm ${esc(target)}</h1><p class="sub">Las aplicaciones registradas del tenant.</p>
      <div class="card"><table><tr><th>Client ID</th><th>Tipo</th><th>Protocolo</th><th>Redirect URIs</th></tr>${rows}</table></div>
      <div class="card"><form method="post" action="/clients/create"><h1 style="font-size:16px">Crear app (client OIDC)</h1><div class="row"><div><label>Client ID</label><input name="clientId" required></div><div><label>Redirect URI</label><input name="redirect" placeholder="https://app/callback" required></div></div><button class="btn">Crear app</button></form></div>`, sess));
  }
  if (pathname === '/clients/create' && req.method === 'POST') {
    const f = form(await readBody(req));
    const r = await api(sess, 'POST', `/admin/realms/${sess.realm}/clients`, { clientId: f.clientId, enabled: true, protocol: 'openid-connect', publicClient: false, standardFlowEnabled: true, redirectUris: [f.redirect], webOrigins: ['+'] });
    return redirect(r.status < 300 ? '/clients?ok=' + encodeURIComponent('App creada') : '/clients?err=' + encodeURIComponent('Error ' + r.status + ': ' + JSON.stringify(r.body)));
  }

  if (pathname === '/roles') {
    const r = await api(sess, 'GET', `/admin/realms/${target}/roles`, null);
    const list = Array.isArray(r.body) ? r.body : [];
    const rows = list.length ? list.map((rl) => `<tr><td><b>${esc(rl.name)}</b></td><td>${esc(rl.description || '')}</td></tr>`).join('')
      : `<tr><td colspan="2" class="empty">Sin roles (status ${r.status})</td></tr>`;
    return send(200, shell('Roles', `${msg(query)}<h1>Roles · realm ${esc(target)}</h1><p class="sub">Roles de realm del tenant.</p>
      <div class="card"><table><tr><th>Rol</th><th>Descripción</th></tr>${rows}</table></div>
      <div class="card"><form method="post" action="/roles/create"><h1 style="font-size:16px">Crear rol</h1><div class="row"><div><label>Nombre</label><input name="name" required></div><div><label>Descripción</label><input name="description"></div></div><button class="btn">Crear rol</button></form></div>`, sess));
  }
  if (pathname === '/roles/create' && req.method === 'POST') {
    const f = form(await readBody(req));
    const r = await api(sess, 'POST', `/admin/realms/${sess.realm}/roles`, { name: f.name, description: f.description });
    return redirect(r.status < 300 ? '/roles?ok=' + encodeURIComponent('Rol creado') : '/roles?err=' + encodeURIComponent('Error ' + r.status + ': ' + JSON.stringify(r.body)));
  }

  send(404, shell('404', '<h1>No encontrado</h1>', sess));
}

http.createServer((req, res) => handle(req, res).catch((e) => { console.error(e); res.writeHead(500); res.end('error: ' + e.message); }))
  .listen(PORT, () => console.log('tenant-admin-keycloak en :' + PORT + ' base=' + DEF_BASE));
