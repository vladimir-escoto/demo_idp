'use strict';
/*
 * Tenant Admin — Zitadel. Panel del dueño/dev del tenant.
 * Usa la Management/Admin API de Zitadel (REST v1/v2) con un Bearer token.
 * El token se provee en la pantalla "Connect" (o por env ZITADEL_TOKEN) — no
 * se hardcodea ninguna credencial. Permite experimentar los flujos de
 * administracion: Organizaciones (tenants) · Usuarios · Proyectos · Apps.
 */
const http = require('http');
const https = require('https');
const crypto = require('crypto');
const { parse } = require('url');

const PORT = parseInt(process.env.PORT || '3000', 10);
const DEF_BASE = (process.env.ZITADEL_BASE || 'https://zitadel.idp.tripleenable.com').replace(/\/$/, '');
const DEF_TOKEN = process.env.ZITADEL_TOKEN || '';
const ACCENT = process.env.APP_ACCENT || '#5b9dff';

// sesiones en memoria: sid -> { base, token, org }
const sessions = new Map();

function sid(req) {
  const c = (req.headers.cookie || '').match(/taz=([\w-]+)/);
  return c ? c[1] : null;
}
function getSession(req) { const s = sid(req); return s && sessions.get(s); }

// ---- llamada REST a Zitadel ----
function api(sess, method, path, body) {
  return new Promise((resolve) => {
    const u = new URL(sess.base + path);
    const data = body ? JSON.stringify(body) : null;
    const headers = { 'Authorization': 'Bearer ' + sess.token, 'Content-Type': 'application/json', 'Accept': 'application/json' };
    if (sess.org) headers['x-zitadel-orgid'] = sess.org;
    if (data) headers['Content-Length'] = Buffer.byteLength(data);
    const r = https.request({ hostname: u.hostname, port: 443, path: u.pathname + u.search, method, headers }, (res) => {
      let b = ''; res.on('data', (c) => (b += c));
      res.on('end', () => { let j; try { j = JSON.parse(b); } catch (_) { j = { raw: b }; } resolve({ status: res.statusCode, body: j }); });
    });
    r.on('error', (e) => resolve({ status: 0, body: { error: e.message } }));
    if (data) r.write(data);
    r.end();
  });
}

function readBody(req) { return new Promise((r) => { let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => r(b)); }); }
function form(str) { const o = {}; new URLSearchParams(str).forEach((v, k) => (o[k] = v)); return o; }
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

function shell(title, body, sess) {
  const nav = sess ? `<div class="nav">
      <a href="/orgs">Organizaciones</a><a href="/users">Usuarios</a><a href="/projects">Proyectos</a><a href="/apps">Apps</a>
      <span class="sp"></span>
      <span class="ctx">${sess.org ? 'org: ' + esc(sess.org) : 'sin org'}</span>
      <a href="/logout" class="out">Desconectar</a></div>` : '';
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} · Tenant Admin (Zitadel)</title><style>
   :root{--bg:#0b1020;--card:#141c30;--line:#243049;--tx:#e7ecf5;--mut:#93a1bd;--acc:${ACCENT};--ok:#34d399;--bad:#f87171}
   *{box-sizing:border-box}body{margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:radial-gradient(1100px 500px at 85% -10%,#16233f,transparent 60%),var(--bg);color:var(--tx);min-height:100vh}
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
   code{font-family:monospace;font-size:12px;color:var(--mut);word-break:break-all}
   .empty{color:var(--mut);padding:16px 0}
  </style></head><body>
   <div class="top"><div class="mk">T</div><div><b>Tenant Admin</b><small>administración de tenant</small></div><span class="badge">Zitadel</span></div>
   ${nav}<div class="wrap">${body}</div></body></html>`;
}

function msg(q) {
  if (q.ok) return `<div class="msg ok">${esc(q.ok)}</div>`;
  if (q.err) return `<div class="msg bad">${esc(q.err)}</div>`;
  return '';
}

// ---- pantalla connect ----
function connectPage(q) {
  return shell('Connect', `
    <h1>Conectar a Zitadel</h1>
    <p class="sub">Pega un <b>token</b> (PAT de una service account o access token con roles de manager). No se guarda en disco.</p>
    ${msg(q)}
    <div class="card"><form method="post" action="/connect">
      <label>Base URL</label><input name="base" value="${esc(q.base || DEF_BASE)}">
      <label>Bearer token</label><input name="token" type="password" placeholder="pega el token…" value="${DEF_TOKEN ? '' : ''}">
      <label>Org ID (opcional, para scoping)</label><input name="org" placeholder="p.ej. 3816...">
      <button class="btn">Conectar</button>
    </form></div>
    <p class="sub">Tip: en la consola de Zitadel crea una <b>Service User</b>, dale un rol de manager y genera un <b>PAT</b>. Pega ese PAT aquí.</p>
  `);
}

async function handle(req, res) {
  const { pathname, query } = parse(req.url, true);
  const send = (code, html) => { res.writeHead(code, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(html); };
  const redirect = (to) => { res.writeHead(302, { Location: to }); res.end(); };

  if (pathname === '/healthz') return send(200, 'ok');

  // conectar
  if (pathname === '/connect' && req.method === 'POST') {
    const f = form(await readBody(req));
    if (!f.token) return redirect('/?err=' + encodeURIComponent('token requerido'));
    const s = crypto.randomBytes(16).toString('hex');
    sessions.set(s, { base: (f.base || DEF_BASE).replace(/\/$/, ''), token: f.token.trim(), org: (f.org || '').trim() });
    res.writeHead(302, { Location: '/orgs', 'Set-Cookie': `taz=${s}; Path=/; HttpOnly; SameSite=Lax` });
    return res.end();
  }
  if (pathname === '/logout') { const s = sid(req); if (s) sessions.delete(s); return redirect('/'); }

  const sess = getSession(req);
  // auto-connect por env
  if (!sess && DEF_TOKEN && pathname !== '/') {
    const s = crypto.randomBytes(16).toString('hex');
    sessions.set(s, { base: DEF_BASE, token: DEF_TOKEN, org: process.env.ZITADEL_ORG || '' });
    res.writeHead(302, { Location: req.url, 'Set-Cookie': `taz=${s}; Path=/; HttpOnly; SameSite=Lax` });
    return res.end();
  }
  if (pathname === '/' || !sess) return send(200, connectPage(query));

  // ---- Organizaciones ----
  if (pathname === '/orgs') {
    if (query.set) { sess.org = query.set; return redirect('/users'); }
    const r = await api(sess, 'POST', '/admin/v1/orgs/_search', { query: { limit: 100 } });
    const list = (r.body && (r.body.result || r.body.orgs)) || [];
    const rows = list.length ? list.map((o) => `<tr><td><b>${esc(o.name)}</b></td><td><code>${esc(o.id)}</code></td><td><span class="pill">${esc(o.state || '')}</span></td><td><a class="btn sec" href="/orgs?set=${esc(o.id)}">Usar</a></td></tr>`).join('')
      : `<tr><td colspan="4" class="empty">Sin resultados (¿el token tiene permisos de instancia? status ${r.status})</td></tr>`;
    return send(200, shell('Organizaciones', `${msg(query)}<h1>Organizaciones (tenants)</h1><p class="sub">Cada organización = un tenant. Selecciona una para gestionar sus usuarios/proyectos/apps.</p>
      <div class="card"><table><tr><th>Nombre</th><th>ID</th><th>Estado</th><th></th></tr>${rows}</table></div>
      <div class="card"><form method="post" action="/orgs/create"><h1 style="font-size:16px">Crear organización</h1><label>Nombre</label><input name="name" placeholder="Nueva tienda / tenant" required><button class="btn">Crear tenant</button></form></div>`, sess));
  }
  if (pathname === '/orgs/create' && req.method === 'POST') {
    const f = form(await readBody(req));
    const r = await api(sess, 'POST', '/v2/organizations', { name: f.name });
    return redirect(r.status < 300 ? '/orgs?ok=' + encodeURIComponent('Org creada: ' + f.name) : '/orgs?err=' + encodeURIComponent('Error ' + r.status + ': ' + JSON.stringify(r.body)));
  }

  // ---- Usuarios (org-scoped) ----
  if (pathname === '/users') {
    if (!sess.org) return send(200, shell('Usuarios', `<h1>Usuarios</h1><div class="msg bad">Selecciona una organización primero en <a href="/orgs">Organizaciones</a>.</div>`, sess));
    const r = await api(sess, 'POST', '/management/v1/users/_search', { query: { limit: 100 } });
    const list = (r.body && r.body.result) || [];
    const rows = list.length ? list.map((u) => { const h = u.human || {}; const p = h.profile || {}; return `<tr><td><b>${esc(p.displayName || u.userName)}</b></td><td>${esc(u.userName)}</td><td>${esc((h.email && h.email.email) || '')}</td><td><span class="pill">${esc(u.state || '')}</span></td></tr>`; }).join('')
      : `<tr><td colspan="4" class="empty">Sin usuarios (status ${r.status})</td></tr>`;
    return send(200, shell('Usuarios', `${msg(query)}<h1>Usuarios</h1><p class="sub">Miembros del tenant. Los globales del sistema son <code>user@idp.tripleenable.com</code>.</p>
      <div class="card"><table><tr><th>Nombre</th><th>Login</th><th>Email</th><th>Estado</th></tr>${rows}</table></div>
      <div class="card"><form method="post" action="/users/create"><h1 style="font-size:16px">Crear usuario</h1><div class="row"><div><label>Usuario</label><input name="username" required></div><div><label>Email</label><input name="email" type="email" required></div></div><div class="row"><div><label>Nombre</label><input name="given" required></div><div><label>Apellido</label><input name="family" required></div></div><button class="btn">Crear usuario</button></form></div>`, sess));
  }
  if (pathname === '/users/create' && req.method === 'POST') {
    const f = form(await readBody(req));
    const r = await api(sess, 'POST', '/v2/users/human', { username: f.username, organization: { orgId: sess.org }, profile: { givenName: f.given, familyName: f.family }, email: { email: f.email, isVerified: true } });
    return redirect(r.status < 300 ? '/users?ok=' + encodeURIComponent('Usuario creado') : '/users?err=' + encodeURIComponent('Error ' + r.status + ': ' + JSON.stringify(r.body)));
  }

  // ---- Proyectos ----
  if (pathname === '/projects') {
    if (!sess.org) return send(200, shell('Proyectos', `<h1>Proyectos</h1><div class="msg bad">Selecciona una organización primero en <a href="/orgs">Organizaciones</a>.</div>`, sess));
    const r = await api(sess, 'POST', '/management/v1/projects/_search', { query: { limit: 100 } });
    const list = (r.body && r.body.result) || [];
    const rows = list.length ? list.map((p) => `<tr><td><b>${esc(p.name)}</b></td><td><code>${esc(p.id)}</code></td><td><span class="pill">${esc(p.state || '')}</span></td><td><a class="btn sec" href="/apps?project=${esc(p.id)}">Ver apps</a></td></tr>`).join('')
      : `<tr><td colspan="4" class="empty">Sin proyectos (status ${r.status})</td></tr>`;
    return send(200, shell('Proyectos', `${msg(query)}<h1>Proyectos</h1><p class="sub">Un proyecto agrupa aplicaciones y roles dentro del tenant.</p>
      <div class="card"><table><tr><th>Nombre</th><th>ID</th><th>Estado</th><th></th></tr>${rows}</table></div>
      <div class="card"><form method="post" action="/projects/create"><h1 style="font-size:16px">Crear proyecto</h1><label>Nombre</label><input name="name" required><button class="btn">Crear proyecto</button></form></div>`, sess));
  }
  if (pathname === '/projects/create' && req.method === 'POST') {
    const f = form(await readBody(req));
    const r = await api(sess, 'POST', '/management/v1/projects', { name: f.name });
    return redirect(r.status < 300 ? '/projects?ok=' + encodeURIComponent('Proyecto creado') : '/projects?err=' + encodeURIComponent('Error ' + r.status + ': ' + JSON.stringify(r.body)));
  }

  // ---- Apps ----
  if (pathname === '/apps') {
    if (!sess.org) return send(200, shell('Apps', `<h1>Aplicaciones</h1><div class="msg bad">Selecciona una organización primero en <a href="/orgs">Organizaciones</a>.</div>`, sess));
    const pr = await api(sess, 'POST', '/management/v1/projects/_search', { query: { limit: 100 } });
    const projects = (pr.body && pr.body.result) || [];
    const pid = query.project || (projects[0] && projects[0].id);
    let rows = `<tr><td colspan="4" class="empty">Crea un proyecto primero.</td></tr>`;
    if (pid) {
      const r = await api(sess, 'POST', `/management/v1/projects/${pid}/apps/_search`, { query: { limit: 100 } });
      const list = (r.body && r.body.result) || [];
      rows = list.length ? list.map((a) => `<tr><td><b>${esc(a.name)}</b></td><td><span class="pill">${esc(a.oidcConfig ? 'OIDC' : a.apiConfig ? 'API' : 'app')}</span></td><td><code>${esc((a.oidcConfig && a.oidcConfig.clientId) || a.id)}</code></td></tr>`).join('')
        : `<tr><td colspan="3" class="empty">Sin apps en este proyecto (status ${r.status})</td></tr>`;
    }
    const opts = projects.map((p) => `<option value="${esc(p.id)}" ${p.id === pid ? 'selected' : ''}>${esc(p.name)}</option>`).join('');
    return send(200, shell('Apps', `${msg(query)}<h1>Aplicaciones</h1><p class="sub">Apps OIDC del proyecto seleccionado del tenant.</p>
      <div class="card"><form method="get" action="/apps"><label>Proyecto</label><select name="project" onchange="this.form.submit()">${opts}</select></form>
      <table style="margin-top:14px"><tr><th>Nombre</th><th>Tipo</th><th>Client ID</th></tr>${rows}</table></div>
      ${pid ? `<div class="card"><form method="post" action="/apps/create"><input type="hidden" name="project" value="${esc(pid)}"><h1 style="font-size:16px">Crear app OIDC</h1><div class="row"><div><label>Nombre</label><input name="name" required></div><div><label>Redirect URI</label><input name="redirect" placeholder="https://app/callback" required></div></div><button class="btn">Crear app</button></form></div>` : ''}`, sess));
  }
  if (pathname === '/apps/create' && req.method === 'POST') {
    const f = form(await readBody(req));
    const r = await api(sess, 'POST', `/management/v1/projects/${f.project}/apps/oidc`, {
      name: f.name, redirectUris: [f.redirect], responseTypes: ['OIDC_RESPONSE_TYPE_CODE'], grantTypes: ['OIDC_GRANT_TYPE_AUTHORIZATION_CODE'],
      appType: 'OIDC_APP_TYPE_WEB', authMethodType: 'OIDC_AUTH_METHOD_TYPE_BASIC',
    });
    return redirect(r.status < 300 ? '/apps?project=' + f.project + '&ok=' + encodeURIComponent('App creada') : '/apps?project=' + f.project + '&err=' + encodeURIComponent('Error ' + r.status + ': ' + JSON.stringify(r.body)));
  }

  send(404, shell('404', '<h1>No encontrado</h1>', sess));
}

http.createServer((req, res) => handle(req, res).catch((e) => { console.error(e); res.writeHead(500); res.end('error: ' + e.message); }))
  .listen(PORT, () => console.log('tenant-admin-zitadel en :' + PORT + ' base=' + DEF_BASE));
