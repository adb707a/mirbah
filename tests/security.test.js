'use strict';
/**
 * Security regression tests for the Mirbah platform.
 *   node tests/security.test.js
 *
 * Covers: loopback binding assumptions, CORS allowlist, spoofed
 * X-Forwarded-For, path traversal, Secure cookies, and CSRF/Origin rules.
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');
const { spawn } = require('child_process');
const { DatabaseSync } = require('node:sqlite');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'mirbah-security-'));
const START = path.join(__dirname, '..', 'tools', 'start-platform.js');
const OWNER_EMAIL = 'owner@security.test';
const OWNER_PASSWORD = 'Owner-Security-Test-2026';
let pass = 0, fail = 0;
const results = [];
function ok(name, cond, extra) {
  if (cond) pass++; else fail++;
  results.push({ ok: !!cond, name, extra });
}

function startServer(port, extraEnv) {
  return spawn(process.execPath, [START], {
    env: Object.assign({}, process.env, {
      PORT: String(port),
      MIRBAH_DB: path.join(TMP, 'db-' + port + '.db'),
      MIRBAH_OWNER_EMAIL: OWNER_EMAIL,
      MIRBAH_OWNER_PASSWORD: OWNER_PASSWORD,
      NODE_ENV: 'test'
    }, extraEnv || {}),
    stdio: 'ignore'
  });
}

async function waitUp(port) {
  const t0 = Date.now();
  for (let i = 0; i < 80; i++) {
    try {
      const r = await fetch('http://127.0.0.1:' + port + '/api/health');
      if (r.ok) return true;
    } catch (e) {}
    await new Promise((r) => setTimeout(r, 200));
  }
  return false;
}

async function api(port, method, p, body, headers) {
  const r = await fetch('http://127.0.0.1:' + port + p, {
    method,
    headers: Object.assign({ 'Content-Type': 'application/json', 'X-Requested-With': 'mirbah' }, headers || {}),
    body: body ? JSON.stringify(body) : undefined
  });
  let data = null;
  try { data = await r.json(); } catch (e) {}
  return { status: r.status, data, headers: r.headers };
}

function rawGet(port, requestPath) {
  return new Promise((resolve) => {
    const req = http.request({
      host: '127.0.0.1', port, path: requestPath, method: 'GET',
      headers: { Host: '127.0.0.1:' + port }
    }, (res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => resolve({ status: res.statusCode, body }));
    });
    req.on('error', () => resolve({ status: 0, body: '' }));
    req.end();
  });
}

(async () => {
  const dev = startServer(8897);
  const prod = startServer(8898, {
    NODE_ENV: 'production',
    MIRBAH_CORS_ORIGINS: 'http://allowed.example'
  });
  try {
    const up = (await waitUp(8897)) && (await waitUp(8898));
    ok('both servers start', up);
    if (!up) return;

    /* ---------- 1) CORS is not wildcard, and only on public reads ---------- */
    const pub = await api(8897, 'GET', '/api/public/peek', null, { Origin: 'http://evil.example' });
    ok('no CORS wildcard by default', pub.status === 200 && !pub.headers.get('access-control-allow-origin'));

    const allowed = await api(8898, 'GET', '/api/public/peek', null, { Origin: 'http://allowed.example' });
    ok('allowlisted public read gets CORS', allowed.headers.get('access-control-allow-origin') === 'http://allowed.example');
    ok('CORS response varies by Origin', (allowed.headers.get('vary') || '').toLowerCase().includes('origin'));

    const evil = await api(8898, 'GET', '/api/public/peek', null, { Origin: 'http://evil.example' });
    ok('unlisted origin gets no CORS', !evil.headers.get('access-control-allow-origin'));

    const authCors = await api(8898, 'GET', '/api/auth/me', null, {
      Origin: 'http://allowed.example', Cookie: 'mirbah_sid=fake'
    });
    ok('auth responses never get CORS headers', !authCors.headers.get('access-control-allow-origin'));

    const preflight = await fetch('http://127.0.0.1:8898/api/public/catalog', {
      method: 'OPTIONS',
      headers: { Origin: 'http://allowed.example', 'Access-Control-Request-Method': 'GET' }
    });
    ok('allowlisted preflight succeeds', preflight.status === 204 &&
      preflight.headers.get('access-control-allow-origin') === 'http://allowed.example');

    /* ---------- 2) X-Forwarded-For is ignored without an explicit proxy ---------- */
    const spoof = '203.0.113.77';
    const bad = await api(8897, 'POST', '/api/auth/login',
      { email: 'nobody@security.test', password: 'wrong-password' },
      { 'X-Forwarded-For': spoof });
    ok('bad login is rejected', bad.status === 401);
    const db = new DatabaseSync(path.join(TMP, 'db-8897.db'), { readOnly: true });
    const attempt = db.prepare('SELECT ip FROM login_attempts WHERE email = ? ORDER BY id DESC LIMIT 1')
      .get('nobody@security.test');
    db.close();
    ok('spoofed X-Forwarded-For is ignored', attempt && attempt.ip === '127.0.0.1' && attempt.ip !== spoof, attempt);

    /* ---------- 3) Path traversal is blocked ---------- */
    const traversal = await rawGet(8897, '/public/../server/server.js');
    ok('path traversal is blocked', traversal.status === 403 && !/createServer/.test(traversal.body), traversal.status);
    const normal = await rawGet(8897, '/public/js/app.js');
    ok('legitimate static file still served', normal.status === 200 && normal.body.length > 1000);

    /* ---------- 4) Secure cookies on production, not on local HTTP ---------- */
    const loginDev = await api(8897, 'POST', '/api/auth/login',
      { email: OWNER_EMAIL, password: OWNER_PASSWORD });
    const devCookie = loginDev.headers.get('set-cookie') || '';
    ok('dev login works over HTTP', loginDev.status === 200 && devCookie.length > 0);
    ok('dev cookie is HttpOnly + SameSite=Strict', /HttpOnly/.test(devCookie) && /SameSite=Strict/.test(devCookie));
    ok('dev cookie is not Secure on plain HTTP', !/Secure/.test(devCookie));

    const loginProd = await api(8898, 'POST', '/api/auth/login',
      { email: OWNER_EMAIL, password: OWNER_PASSWORD });
    const prodCookie = loginProd.headers.get('set-cookie') || '';
    ok('production cookie is Secure', loginProd.status === 200 && /Secure/.test(prodCookie));

    /* ---------- 5) Cross-origin mutation is still rejected ---------- */
    const cross = await api(8898, 'POST', '/api/auth/login',
      { email: OWNER_EMAIL, password: OWNER_PASSWORD },
      { Origin: 'http://allowed.example' });
    ok('cross-origin login is rejected', cross.status === 403 && cross.data && cross.data.code === 'cross_origin');
  } finally {
    try { dev.kill(); } catch (e) {}
    try { prod.kill(); } catch (e) {}
  }

  results.forEach((r) => console.log((r.ok ? '✓' : '✗') + ' ' + r.name + (r.ok || r.extra === undefined ? '' : '  => ' + JSON.stringify(r.extra))));
  console.log('\nالنتيجة الأمنية: ' + pass + ' ناجح · ' + fail + ' فاشل');
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {}
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
