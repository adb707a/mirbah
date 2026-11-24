'use strict';
/**
 * Resets the owner password locally and revokes every existing owner session.
 *
 *   npm run owner:reset
 *   MIRBAH_NEW_OWNER_PASSWORD="..." npm run owner:reset
 *
 * With no env password a strong random one is generated and written to
 * server/data/owner-credentials.txt (ignored by Git). The password itself is
 * never printed to the console.
 */
require('./load-env.js');
const dbm = require('../server/db.js');
const A = require('../server/auth.js');
const C = require('./owner-credentials.js');

const db = dbm.open();
const owner = db.prepare("SELECT id,email FROM users WHERE role='owner' ORDER BY created_at LIMIT 1").get();
if (!owner) {
  console.error('لا يوجد حساب مالك في قاعدة البيانات. شغّل المنصة أولًا لإنشائه.');
  process.exit(1);
}

const supplied = process.env.MIRBAH_NEW_OWNER_PASSWORD;
const password = supplied || C.generatePassword(28);
if (password.length < 12) {
  console.error('كلمة المرور يجب أن تكون 12 حرفًا على الأقل.');
  process.exit(1);
}

let credentialsFile = null;
if (!supplied) {
  try {
    credentialsFile = C.writeCredentials(owner.email, password);
  } catch (e) {
    console.error('تعذر حفظ كلمة المرور المؤقتة:', e && e.message);
    process.exit(1);
  }
}

const { hash, salt } = A.hashPassword(password);
db.prepare('UPDATE users SET password_hash = ?, password_salt = ? WHERE id = ?').run(hash, salt, owner.id);
const revoked = db.prepare('DELETE FROM sessions WHERE user_id = ?').run(owner.id).changes;
A.audit(db, { id: owner.id, role: 'owner' }, 'owner.password.reset', 'user', owner.id,
  { sessionsRevoked: revoked, source: supplied ? 'env' : 'generated' }, '127.0.0.1');
try { db.close(); } catch (e) {}

console.log('تم تحديث كلمة مرور المالك (' + owner.email + ') وإبطال ' + revoked + ' جلسة.');
if (credentialsFile) {
  console.log('كلمة المرور الجديدة محفوظة في: ' + credentialsFile);
  console.log('احفظها في مدير كلمات المرور ثم احذف الملف.');
} else {
  console.log('تم استخدام MIRBAH_NEW_OWNER_PASSWORD من متغيرات البيئة.');
}
