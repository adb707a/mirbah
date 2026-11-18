'use strict';
/**
 * مِرْباح — الخادم الرئيسي (يقوم بتوجيه الطلبات فحسب)
 * كل التهيئة تتم في tools/start-platform.js قبل تحميل هذا الملف.
 *
 *   /public/*       واجهة دفتر V3
 *   /login /register /owner-login   صفحات الدخول
 *   /dashboard/*    لوحة التاجر
 *   /owner-admin/*  لوحة المالك (منفصلة أمنيًا وبصريًا)
 *   /api/*          واجهة المنصة (تحقّق دور في كل طلب)
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT, 'public');
const AUTH_DIR = path.join(PUBLIC_DIR, 'auth');
const PORT = Number(process.env.PORT || 8788);
const DEV = process.env.NODE_ENV !== 'production';

const { createApi } = require('./api.js');
const { guard } = require('./guard.js');
const A = require('./auth.js');

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8'
};

const API = createApi(() => global.__MIRBAH_DB__, {
  aiConfigured: () => true,
  makeBackup: () => require('./db.js').backup('manual'),
  logError: (e, p) => console.error('[api]', p, e && e.message)
});

function reply(res, status, type, body) {
  res.writeHead(status, { 'Content-Type': type, 'Content-Length': Buffer.byteLength(body), 'Cache-Control': 'no-store' });
  res.end(body);
}
const NOT_FOUND = '<!DOCTYPE html><meta charset="utf-8"><title>404</title><h1>404 — الصفحة غير موجودة</h1>';

function file(res, fp) {
  let st = null;
  try { st = fs.statSync(fp); } catch (e) { st = null; }
  if (!st || !st.isFile()) return reply(res, 404, 'text/html; charset=utf-8', NOT_FOUND);
  res.writeHead(200, {
    'Content-Type': MIME[path.extname(fp).toLowerCase()] || 'application/octet-stream',
    'Content-Length': st.size,
    'Cache-Control': DEV ? 'no-cache' : 'public, max-age=300'
  });
  fs.createReadStream(fp).pipe(res);
}
function redirect(res, to) { res.writeHead(302, { Location: to }); res.end(); }

function sessionUser(req) {
  const c = A.parseCookies(req.headers.cookie);
  return A.readSession(global.__MIRBAH_DB__, c[A.COOKIE_NAME]);
}

/* ---------- خريطة المسارات: تعبير نمطي → معالج ---------- */
function notApi(pathname) { return !pathname.startsWith('/api/'); }

const PROPS = [
  { re: /^\/$/, get: true, go: (req, res) => redirect(res, '/public/') },
  { re: /^\/login\/?$/, get: true, go: (req, res) => file(res, path.join(AUTH_DIR, 'login.html')) },
  { re: /^\/register\/?$/, get: true, go: (req, res) => file(res, path.join(AUTH_DIR, 'register.html')) },
  { re: /^\/owner-login\/?$/, get: true, go: (req, res) => file(res, path.join(AUTH_DIR, 'owner-login.html')) }
];

const AREAS = [
  { re: /^\/public(?:\/(.*))?$/, base: PUBLIC_DIR, role: null },
  { re: /^\/dashboard(?:\/(.*))?$/, base: path.join(ROOT, 'dashboard'), role: 'merchant' },
  { re: /^\/owner-admin(?:\/(.*))?$/, base: path.join(ROOT, 'owner-admin'), role: 'owner' }
];

function serveArea(req, res, m, area) {
  if (area.role) {
    const u = sessionUser(req);
    if (!u) return redirect(res, area.role === 'owner' ? '/owner-login/' : '/login/?next=/dashboard/');
    if (u.role !== area.role) return redirect(res, u.role === 'owner' ? '/owner-admin/' : '/dashboard/');
  }
  const rel = (m && m[1]) ? m[1] : 'index.html';
  const fp = path.normalize(path.join(area.base, rel));
  if (!fp.startsWith(area.base)) return reply(res, 403, 'text/plain; charset=utf-8', 'Forbidden');
  let target = fp;
  try { if (fs.statSync(target).isDirectory()) target = path.join(target, 'index.html'); } catch (e) {}
  return file(res, target);
}

const server = http.createServer((req, res) => {
  try {
    if (req.method === 'OPTIONS') return reply(res, 204, 'text/plain; charset=utf-8', '');

    const pathname = (req.url || '/').split('?')[0];

    if (pathname === '/api/health') {
      const db = global.__MIRBAH_DB__;
      const n = (s) => { try { return db.prepare(s).get().n; } catch (e) { return 0; } };
      return reply(res, 200, 'application/json; charset=utf-8', JSON.stringify({
        ok: true, platform: 'mirbah-open', seeded: global.__MIRBAH_SEED__,
        activities: n('SELECT COUNT(*) n FROM catalog_activities'),
        categories: n('SELECT COUNT(*) n FROM catalog_categories'),
        products: n('SELECT COUNT(*) n FROM catalog_products'),
        suggestions: n('SELECT COUNT(*) n FROM catalog_suggestions'),
        merchants: n("SELECT COUNT(*) n FROM users WHERE role='merchant'"),
        owners: n("SELECT COUNT(*) n FROM users WHERE role='owner'")
      }));
    }

    if (pathname.startsWith('/api/')) {
      if (!global.__MIRBAH_DB__) return reply(res, 503, 'application/json; charset=utf-8', JSON.stringify({ ok: false, code: 'starting', message: 'الخادم قيد التهيئة.' }));
      const g = guard(req);
      if (g) return reply(res, g.status, 'application/json; charset=utf-8', JSON.stringify({ ok: false, code: g.code, message: g.message }));
      return API.handle(req, res);
    }

    if (API.health) {
      const h = API.health(pathname);
      if (h) return reply(res, h.ok ? 200 : 404, 'application/json; charset=utf-8', JSON.stringify(h));
    }
    for (const p of PROPS) {
      const m = p.re.exec(pathname);
      if (!m) continue;
      if (req.method !== 'GET' && req.method !== 'HEAD') break;
      return p.go(req, res);
    }
    for (const a of AREAS) {
      const m = a.re.exec(pathname);
      if (m) return serveArea(req, res, m, a);
    }
    return reply(res, 404, 'text/html; charset=utf-8', NOT_FOUND);
  } catch (e) {
    console.error('[server]', e);
    try { reply(res, 500, 'text/plain; charset=utf-8', 'خطأ داخلي'); } catch (x) {}
  }
});

server.listen(PORT, () => {
  console.log('  الخادم يخدم على المنفذ ' + PORT);
});

module.exports = server;
