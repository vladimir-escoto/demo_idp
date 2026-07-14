'use strict';
/*
 * Tenant Admin — Zitadel. Panel del dueño/dev del tenant.
 * El admin INICIA SESIÓN con OAuth/OIDC (Authorization Code) contra Zitadel
 * — que fuerza el login passwordless (wallet). El panel usa el ACCESS TOKEN
 * del propio usuario para descubrir a qué organización(es) pertenece/gestiona
 * y operar la Management API. No se pega ningún secret.
 */
const http = require('http');
const https = require('https');
const crypto = require('crypto');

const PORT = parseInt(process.env.PORT || '3000', 10);
const ISSUER = (process.env.ZITADEL_ISSUER || 'https://zitadel.idp.tripleenable.com').replace(/\/$/, '');
const API = (process.env.ZITADEL_API || ISSUER).replace(/\/$/, '');
const CLIENT_ID = process.env.OIDC_CLIENT_ID || '';
const CLIENT_SECRET = process.env.OIDC_CLIENT_SECRET || '';
const BASE_URL = (process.env.APP_BASE_URL || '').replace(/\/$/, '');
// audience scope: sin esto el access_token no sirve para la Management API
const SCOPE = process.env.OIDC_SCOPE || 'openid profile email urn:zitadel:iam:org:project:id:zitadel:aud';
const ACCENT = process.env.APP_ACCENT || '#5b9dff';

const sessions = new Map();
const pending = new Map();
let OIDC = null;

function discover() {
  if (OIDC) return Promise.resolve(OIDC);
  return new Promise((resolve, reject) => {
    https.get(ISSUER + '/.well-known/openid-configuration', (r) => { let b = ''; r.on('data', (c) => (b += c)); r.on('end', () => { try { OIDC = JSON.parse(b); resolve(OIDC); } catch (e) { reject(e); } }); }).on('error', reject);
  });
}
function postForm(url, form, headers) {
  return new Promise((resolve, reject) => {
    const data = new URLSearchParams(form).toString(); const u = new URL(url);
    const req = https.request({ method: 'POST', hostname: u.hostname, port: u.port || 443, path: u.pathname + u.search, headers: Object.assign({ 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(data) }, headers || {}) },
      (r) => { let b = ''; r.on('data', (c) => (b += c)); r.on('end', () => resolve({ status: r.statusCode, body: b })); });
    req.on('error', reject); req.write(data); req.end();
  });
}
// llamada JSON a la API de Zitadel con el token del usuario
function api(sess, method, path, body) {
  return new Promise((resolve) => {
    const u = new URL(API + path); const data = body ? JSON.stringify(body) : null;
    const headers = { 'Authorization': 'Bearer ' + sess.token, 'Content-Type': 'application/json', 'Accept': 'application/json' };
    if (sess.org) headers['x-zitadel-orgid'] = sess.org;
    if (data) headers['Content-Length'] = Buffer.byteLength(data);
    const r = https.request({ hostname: u.hostname, port: 443, path: u.pathname + u.search, method, headers }, (res) => { let b = ''; res.on('data', (c) => (b += c)); res.on('end', () => { let j; try { j = JSON.parse(b); } catch (_) { j = { raw: b }; } resolve({ status: res.statusCode, body: j }); }); });
    r.on('error', (e) => resolve({ status: 0, body: { error: e.message } })); if (data) r.write(data); r.end();
  });
}
function decodeJwt(j) { try { return JSON.parse(Buffer.from(j.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')); } catch (e) { return {}; } }
function cookies(req) { const o = {}; (req.headers.cookie || '').split(';').forEach((c) => { const i = c.indexOf('='); if (i > 0) o[c.slice(0, i).trim()] = decodeURIComponent(c.slice(i + 1).trim()); }); return o; }
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
function readBody(req) { return new Promise((r) => { let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => r(b)); }); }
function form(s) { const o = {}; new URLSearchParams(s).forEach((v, k) => (o[k] = v)); return o; }

function head(sess) {
  const who = sess && sess.claims ? (sess.claims.name || sess.claims.preferred_username || 'admin') : '';
  const nav = sess ? `<div class="nav"><a href="/orgs">Organizaciones</a><a href="/users">Usuarios</a><a href="/projects">Proyectos</a><a href="/apps">Apps</a><span class="sp"></span><span class="ctx">${sess.org ? 'org: ' + esc(sess.orgName || sess.org) : 'elige org'}</span><a href="/logout" class="out">Salir</a></div>` : '';
  return { who, nav };
}
function shell(title, body, sess) {
  const { who, nav } = head(sess);
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} · Tenant Admin (Zitadel)</title><style>
   :root{--bg:#0b1020;--card:#141c30;--line:#243049;--tx:#e7ecf5;--mut:#93a1bd;--acc:${ACCENT};--ok:#34d399;--bad:#f87171}
   *{box-sizing:border-box}body{margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:radial-gradient(1100px 500px at 85% -10%,#16233f,transparent 60%),var(--bg);color:var(--tx);min-height:100vh}
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
  </style></head><body><div class="top"><div class="mk">T</div><div><b>Tenant Admin</b><small>administración de tenant</small></div>${who ? `<span class="who">${esc(who)}</span>` : ''}<span class="badge">Zitadel</span></div>${nav}<div class="wrap">${body}</div></body></html>`;
}
function msg(q) { if (q.get('ok')) return `<div class="msg ok">${esc(q.get('ok'))}</div>`; if (q.get('err')) return `<div class="msg bad">${esc(q.get('err'))}</div>`; return ''; }

function landing() {
  return shell('Entrar', `<div style="max-width:460px;margin:8vh auto 0"><div class="card" style="text-align:center;padding:34px">
    <div class="mk" style="width:52px;height:52px;border-radius:14px;margin:0 auto 16px;font-size:26px">T</div>
    <h1 style="font-size:24px">Panel de administración</h1>
    <p class="sub">Inicia sesión con tu identidad <b>Tripleenable</b>. Verás las organizaciones a las que perteneces y podrás gestionarlas — usuarios, proyectos y apps.</p>
    <a class="btn" style="width:100%;justify-content:center" href="/login">Entrar con Tripleenable →</a>
    <p class="sub" style="margin-top:16px;font-size:12px">Sin contraseñas ni secretos: apruebas el acceso desde tu wallet. Tus permisos definen lo que puedes gestionar.</p>
  </div></div>`, null);
}

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, BASE_URL || 'http://localhost:' + PORT);
  const q = u.searchParams;
  const ck = cookies(req);
  const sess = ck.taz && sessions.get(ck.taz);
  const send = (code, html, h) => { res.writeHead(code, Object.assign({ 'Content-Type': 'text/html; charset=utf-8' }, h || {})); res.end(html); };

  if (u.pathname === '/healthz') return send(200, 'ok');

  if (u.pathname === '/login') {
    try { await discover(); } catch (e) { return send(502, shell('Error', `<div class="card"><h1>OIDC no disponible</h1><p class="sub">${esc(e.message)} (issuer ${esc(ISSUER)})</p></div>`, null)); }
    if (!CLIENT_ID) return send(500, shell('Config', `<div class="card"><h1>Falta OIDC_CLIENT_ID</h1><p class="sub">Registra este panel como app OIDC en Zitadel (redirect <code>${esc(BASE_URL)}/callback</code>) y pon OIDC_CLIENT_ID / OIDC_CLIENT_SECRET / APP_BASE_URL.</p></div>`, null));
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
    sessions.set(sid, { token: j.access_token, idToken: j.id_token, claims: decodeJwt(j.id_token), org: '', orgName: '' });
    return send(302, '', { Location: '/orgs', 'Set-Cookie': `taz=${sid}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=28800` });
  }
  if (u.pathname === '/logout') { if (ck.taz) sessions.delete(ck.taz); return send(302, '', { Location: '/', 'Set-Cookie': 'taz=; Path=/; Max-Age=0' }); }

  if (!sess) return send(200, landing());

  // ---- Organizaciones a las que pertenece / gestiona ----
  if (u.pathname === '/orgs') {
    if (q.get('set')) { sess.org = q.get('set'); sess.orgName = q.get('name') || q.get('set'); return send(302, '', { Location: '/users' }); }
    // memberships del usuario (a qué orgs pertenece como manager)
    const mem = await api(sess, 'POST', '/auth/v1/memberships/me/_search', { query: { limit: 100 } });
    const seen = {}; let orgs = [];
    ((mem.body && mem.body.result) || []).forEach((m) => { if (m.orgId && !seen[m.orgId]) { seen[m.orgId] = 1; orgs.push({ id: m.orgId, name: m.displayName || m.orgId, roles: (m.roles || []).join(', ') }); } });
    // fallback: admin de instancia -> lista todas
    if (!orgs.length) { const all = await api(sess, 'POST', '/admin/v1/orgs/_search', { query: { limit: 100 } }); ((all.body && all.body.result) || []).forEach((o) => orgs.push({ id: o.id, name: o.name, roles: 'INSTANCE' })); }
    const rows = orgs.length ? orgs.map((o) => `<tr><td><b>${esc(o.name)}</b></td><td><code>${esc(o.id)}</code></td><td><span class="pill">${esc(o.roles)}</span></td><td><a class="btn sec" href="/orgs?set=${esc(o.id)}&name=${encodeURIComponent(o.name)}">Gestionar</a></td></tr>`).join('')
      : `<tr><td colspan="4" class="empty">No eres manager de ninguna organización. Pide a un owner que te asigne un rol de manager.</td></tr>`;
    return send(200, shell('Organizaciones', `${msg(q)}<h1>Tus organizaciones</h1><p class="sub">Estas son las empresas/tenants a las que perteneces como administrador. Elige una para gestionarla.</p>
      <div class="card"><table><tr><th>Organización</th><th>ID</th><th>Tu rol</th><th></th></tr>${rows}</table></div>`, sess));
  }

  const need = (name) => shell(name, `<h1>${name}</h1><div class="msg bad">Elige una organización primero en <a href="/orgs">Organizaciones</a>.</div>`, sess);

  if (u.pathname === '/users') {
    if (!sess.org) return send(200, need('Usuarios'));
    const r = await api(sess, 'POST', '/management/v1/users/_search', { query: { limit: 100 } });
    const list = (r.body && r.body.result) || [];
    const rows = list.length ? list.map((x) => { const h = x.human || {}; const p = h.profile || {}; return `<tr><td><b>${esc(p.displayName || x.userName)}</b></td><td>${esc(x.userName)}</td><td>${esc((h.email && h.email.email) || '')}</td><td><span class="pill">${esc(x.state || '')}</span></td></tr>`; }).join('') : `<tr><td colspan="4" class="empty">Sin usuarios (status ${r.status})</td></tr>`;
    return send(200, shell('Usuarios', `${msg(q)}<h1>Usuarios · ${esc(sess.orgName)}</h1><p class="sub">Miembros del tenant. Los globales del sistema son <code>user@idp.tripleenable.com</code>.</p>
      <div class="card"><table><tr><th>Nombre</th><th>Login</th><th>Email</th><th>Estado</th></tr>${rows}</table></div>
      <div class="card"><form method="post" action="/users/create"><h1 style="font-size:16px">Crear usuario</h1><div class="row"><div><label>Usuario</label><input name="username" required></div><div><label>Email</label><input name="email" type="email" required></div></div><div class="row"><div><label>Nombre</label><input name="given" required></div><div><label>Apellido</label><input name="family" required></div></div><button class="btn">Crear usuario</button></form></div>`, sess));
  }
  if (u.pathname === '/users/create' && req.method === 'POST') {
    const f = form(await readBody(req));
    const r = await api(sess, 'POST', '/v2/users/human', { username: f.username, organization: { orgId: sess.org }, profile: { givenName: f.given, familyName: f.family }, email: { email: f.email, isVerified: true } });
    return send(302, '', { Location: r.status < 300 ? '/users?ok=' + encodeURIComponent('Usuario creado') : '/users?err=' + encodeURIComponent('Error ' + r.status + ': ' + JSON.stringify(r.body)) });
  }

  if (u.pathname === '/projects') {
    if (!sess.org) return send(200, need('Proyectos'));
    const r = await api(sess, 'POST', '/management/v1/projects/_search', { query: { limit: 100 } });
    const list = (r.body && r.body.result) || [];
    const rows = list.length ? list.map((p) => `<tr><td><b>${esc(p.name)}</b></td><td><code>${esc(p.id)}</code></td><td><a class="btn sec" href="/apps?project=${esc(p.id)}">Apps</a></td></tr>`).join('') : `<tr><td colspan="3" class="empty">Sin proyectos (status ${r.status})</td></tr>`;
    return send(200, shell('Proyectos', `${msg(q)}<h1>Proyectos · ${esc(sess.orgName)}</h1><p class="sub">Un proyecto agrupa apps y roles dentro del tenant.</p>
      <div class="card"><table><tr><th>Nombre</th><th>ID</th><th></th></tr>${rows}</table></div>
      <div class="card"><form method="post" action="/projects/create"><h1 style="font-size:16px">Crear proyecto</h1><label>Nombre</label><input name="name" required><button class="btn">Crear proyecto</button></form></div>`, sess));
  }
  if (u.pathname === '/projects/create' && req.method === 'POST') {
    const f = form(await readBody(req));
    const r = await api(sess, 'POST', '/management/v1/projects', { name: f.name });
    return send(302, '', { Location: r.status < 300 ? '/projects?ok=' + encodeURIComponent('Proyecto creado') : '/projects?err=' + encodeURIComponent('Error ' + r.status + ': ' + JSON.stringify(r.body)) });
  }

  if (u.pathname === '/apps') {
    if (!sess.org) return send(200, need('Apps'));
    const pr = await api(sess, 'POST', '/management/v1/projects/_search', { query: { limit: 100 } });
    const projects = (pr.body && pr.body.result) || [];
    const pid = q.get('project') || (projects[0] && projects[0].id);
    let rows = `<tr><td colspan="3" class="empty">Crea un proyecto primero.</td></tr>`;
    if (pid) { const r = await api(sess, 'POST', `/management/v1/projects/${pid}/apps/_search`, { query: { limit: 100 } }); const list = (r.body && r.body.result) || []; rows = list.length ? list.map((a) => `<tr><td><b>${esc(a.name)}</b></td><td><span class="pill">${esc(a.oidcConfig ? 'OIDC' : a.apiConfig ? 'API' : 'app')}</span></td><td><code>${esc((a.oidcConfig && a.oidcConfig.clientId) || a.id)}</code></td></tr>`).join('') : `<tr><td colspan="3" class="empty">Sin apps (status ${r.status})</td></tr>`; }
    const opts = projects.map((p) => `<option value="${esc(p.id)}" ${p.id === pid ? 'selected' : ''}>${esc(p.name)}</option>`).join('');
    return send(200, shell('Apps', `${msg(q)}<h1>Aplicaciones · ${esc(sess.orgName)}</h1><p class="sub">Apps OIDC del proyecto del tenant.</p>
      <div class="card"><form method="get" action="/apps"><label>Proyecto</label><select name="project" onchange="this.form.submit()">${opts}</select></form><table style="margin-top:14px"><tr><th>Nombre</th><th>Tipo</th><th>Client ID</th></tr>${rows}</table></div>
      ${pid ? `<div class="card"><form method="post" action="/apps/create"><input type="hidden" name="project" value="${esc(pid)}"><h1 style="font-size:16px">Crear app OIDC</h1><div class="row"><div><label>Nombre</label><input name="name" required></div><div><label>Redirect URI</label><input name="redirect" placeholder="https://app/callback" required></div></div><button class="btn">Crear app</button></form></div>` : ''}`, sess));
  }
  if (u.pathname === '/apps/create' && req.method === 'POST') {
    const f = form(await readBody(req));
    const r = await api(sess, 'POST', `/management/v1/projects/${f.project}/apps/oidc`, { name: f.name, redirectUris: [f.redirect], responseTypes: ['OIDC_RESPONSE_TYPE_CODE'], grantTypes: ['OIDC_GRANT_TYPE_AUTHORIZATION_CODE'], appType: 'OIDC_APP_TYPE_WEB', authMethodType: 'OIDC_AUTH_METHOD_TYPE_BASIC' });
    return send(302, '', { Location: r.status < 300 ? '/apps?project=' + f.project + '&ok=' + encodeURIComponent('App creada') : '/apps?project=' + f.project + '&err=' + encodeURIComponent('Error ' + r.status + ': ' + JSON.stringify(r.body)) });
  }

  send(404, shell('404', '<h1>No encontrado</h1>', sess));
});

server.listen(PORT, () => console.log('tenant-admin-zitadel (OIDC) en :' + PORT + ' issuer=' + ISSUER));
