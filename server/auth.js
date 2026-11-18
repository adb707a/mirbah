'use strict';
/* =============================================================
   أمان المصادقة:
   - scrypt لكلمات المرور (لا تبعيات خارجية).
   - جلسات في قاعدة البيانات + كوكي httpOnly.
   - أدوار owner/merchant يُتحقق منها في كل طلب.
   - حماية محاولات الدخول (قفل مؤقت بعد 5 محاولات في 10 دقائق).
   - TOTP (RFC 6238) اختياري للمالك بلا مكتبات.
   ============================================================= */
const crypto = require('crypto');

const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7; // أسبوع
const COOKIE_NAME = process.env.MIRBAH_SESSION_COOKIE || 'mirbah_sid';

function hashPassword(password, saltHex) {
  const salt = saltHex ? Buffer.from(saltHex, 'hex') : crypto.randomBytes(16);
  const hash = crypto.scryptSync(String(password), salt, 64, { N: 16384, r: 8, p: 1 });
  return { hash: hash.toString('hex'), salt: salt.toString('hex') };
}
function verifyPassword(password, hashHex, saltHex) {
  const { hash } = hashPassword(password, saltHex);
  const a = Buffer.from(hash, 'hex');
  const b = Buffer.from(hashHex, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/* ---------- TOTP ---------- */
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function base32Encode(buf) {
  let bits = 0, value = 0, out = '';
  for (const byte of buf) {
    value = (value << 8) | byte; bits += 8;
    while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}
function base32Decode(str) {
  let bits = 0, value = 0; const out = [];
  for (const ch of String(str).toUpperCase().replace(/=+$/, '')) {
    const idx = B32.indexOf(ch); if (idx < 0) continue;
    value = (value << 5) | idx; bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
}
function totp(secret, atMs) {
  const counter = Math.floor((atMs || Date.now()) / 30000);
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const hmac = crypto.createHmac('sha1', base32Decode(secret)).update(buf).digest();
  const off = hmac[hmac.length - 1] & 0xf;
  const code = ((hmac.readUInt32BE(off) & 0x7fffffff) % 1000000);
  return String(code).padStart(6, '0');
}
function verifyTotp(secret, code) {
  if (!secret || !code) return false;
  const t = Date.now();
  for (let i = -1; i <= 1; i++) {
    if (totp(secret, t + i * 30000) === String(code).trim()) return true;
  }
  return false;
}
const newTotpSecret = () => base32Encode(crypto.randomBytes(20));

/* ---------- كوكيز ---------- */
function parseCookies(header) {
  const out = {};
  String(header || '').split(';').forEach((p) => {
    const i = p.indexOf('=');
    if (i < 0) return;
    out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  });
  return out;
}
function sessionCookie(sid, maxAgeSec) {
  return `${COOKIE_NAME}=${sid}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAgeSec}` +
    (process.env.MIRBAH_SECURE_COOKIE === '1' ? '; Secure' : '');
}
const clearCookie = () => `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`;

/* ---------- جلسات ---------- */
function createSession(db, userId, ip, ua, strength) {
  const sid = crypto.randomBytes(32).toString('hex');
  const t = new Date();
  const exp = new Date(t.getTime() + SESSION_TTL_MS);
  db.prepare('INSERT INTO sessions(id,user_id,created_at,expires_at,last_seen_at,ip,ua,mfa) VALUES(?,?,?,?,?,?,?,?)')
    .run(sid, userId, t.toISOString(), exp.toISOString(), t.toISOString(), ip || '', String(ua || '').slice(0, 240), strength ? 1 : 0);
  return sid;
}
function readSession(db, sid) {
  if (!sid) return null;
  const row = db.prepare(`SELECT s.id AS sid, s.expires_at, u.id, u.email, u.name, u.role, u.status, u.totp_enabled
    FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = ?`).get(sid);
  if (!row) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) {
    db.prepare('DELETE FROM sessions WHERE id = ?').run(sid);
    return null;
  }
  if (row.status !== 'active') return null;
  db.prepare('UPDATE sessions SET last_seen_at = ? WHERE id = ?').run(new Date().toISOString(), sid);
  return { sid: row.sid, id: row.id, email: row.email, name: row.name, role: row.role, totpEnabled: !!row.totp_enabled };
}
function destroySession(db, sid) { if (sid) db.prepare('DELETE FROM sessions WHERE id = ?').run(sid); }

/* ---------- حماية المحاولات ---------- */
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 10 * 60 * 1000;
function recentFailures(db, email, ip) {
  const since = new Date(Date.now() - WINDOW_MS).toISOString();
  const row = db.prepare('SELECT COUNT(*) AS n FROM login_attempts WHERE at > ? AND ok = 0 AND email = ?')
    .get(since, String(email || '').toLowerCase());
  return row ? row.n : 0;
}
// حد مستقل لعنوان IP: يسدّ هجومًا آليًا على حسابات متعددة دون إقفال الحساب نفسه
function ipLocked(db, ip) {
  if (!ip) return false;
  const since = new Date(Date.now() - WINDOW_MS).toISOString();
  const row = db.prepare('SELECT COUNT(*) AS n FROM login_attempts WHERE at > ? AND ok = 0 AND ip = ?').get(since, String(ip));
  return !!(row && row.n >= 30);
}
function logAttempt(db, email, ip, ok, reason) {
  db.prepare('INSERT INTO login_attempts(at,email,ip,ok,reason) VALUES(?,?,?,?,?)')
    .run(new Date().toISOString(), String(email || '').toLowerCase(), String(ip || ''), ok ? 1 : 0, reason || '');
}

/* ---------- مستخدمون ---------- */
function createUser(db, { email, name, password, role }) {
  if (!email || !password || String(password).length < 8) throw new Error('بيانات الحساب غير مكتملة (كلمة المرور 8 أحرف على الأقل)');
  if (role !== 'owner' && role !== 'merchant') throw new Error('دور غير صالح');
  const id = crypto.randomUUID();
  const { hash, salt } = hashPassword(password);
  db.prepare('INSERT INTO users(id,email,name,role,status,password_hash,password_salt,created_at) VALUES(?,?,?,?,?,?,?,?)')
    .run(id, String(email).toLowerCase().trim(), String(name || '').trim() || 'بدون اسم', role, 'active', hash, salt, new Date().toISOString());
  return id;
}
function findByEmail(db, email) {
  return db.prepare('SELECT * FROM users WHERE email = ?').get(String(email || '').toLowerCase().trim()) || null;
}

function audit(db, actor, action, entity, entityId, meta, ip) {
  db.prepare('INSERT INTO audit_log(at,actor_id,actor_role,action,entity,entity_id,meta_json,ip) VALUES(?,?,?,?,?,?,?,?)')
    .run(new Date().toISOString(), actor ? actor.id : null, actor ? actor.role : 'system',
      action, entity || '', entityId ? String(entityId) : '', meta ? JSON.stringify(meta) : null, ip || '');
}

module.exports = {
  hashPassword, verifyPassword, totp, verifyTotp, newTotpSecret,
  parseCookies, sessionCookie, clearCookie, COOKIE_NAME, SESSION_TTL_MS,
  createSession, readSession, destroySession,
  recentFailures, ipLocked, logAttempt, MAX_ATTEMPTS, WINDOW_MS,
  createUser, findByEmail, audit
};
