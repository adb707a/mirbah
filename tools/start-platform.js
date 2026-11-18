'use strict';
/* أداة تشغيل المنصة:
   1) تُهيّئ قاعدة البيانات (بذر الكتالوج) — مرة واحدة.
   2) تجعلها متاحة في global.__MIRBAH_DB__.
   3) تُحمّل الخادم (server/server.js) الذي يستخدم تلك القاعدة.
   هذا الفصل يجعل مسار الطلبات مسطّحًا ومقروءًا وقابلًا للاختبار.
*/
const path = require('path');
const dbm = require('../server/db.js');
const A = require('../server/auth.js');

(async () => {
  try {
    const url = require('url').pathToFileURL(path.join(__dirname, '..', 'server', 'data', 'catalog-esm.mjs')).href;
    const mod = await import(url);
    global.__MIRBAH_DOMAINS__ = mod.DOMAINS || (mod.default && mod.default.DOMAINS) || [];
  } catch (e) {
    console.error('[catalog] تعذر تحميل catalog-esm.mjs:', e && e.message);
    global.__MIRBAH_DOMAINS__ = [];
  }

  const { db, seed } = dbm.init();
  global.__MIRBAH_DB__ = db;
  global.__MIRBAH_SEED__ = seed;

  // حساب المالك الأول (مرة واحدة)
  const owners = db.prepare("SELECT COUNT(*) n FROM users WHERE role='owner'").get().n;
  if (!owners) {
    const email = process.env.MIRBAH_OWNER_EMAIL;
    const password = process.env.MIRBAH_OWNER_PASSWORD;
    if (email && password && password.length >= 12) {
      const id = A.createUser(db, { email, name: process.env.MIRBAH_OWNER_NAME || 'مالك مِرْباح', password, role: 'owner' });
      A.audit(db, { id, role: 'owner' }, 'owner.bootstrap', 'user', id, { source: 'env' }, '');
      global.__MIRBAH_OWNER_CREATED__ = true;
    }
  }

  require('../server/server.js');

  const port = process.env.PORT || 8788;
  setTimeout(() => {
    console.log('\n  مِرْباح (المنصة):  http://localhost:' + port);
    console.log('  الكتالوج: ' + db.prepare('SELECT COUNT(*) n FROM catalog_activities').get().n + ' نشاط · ' +
      db.prepare('SELECT COUNT(*) n FROM catalog_products').get().n + ' منتج · ' +
      db.prepare('SELECT COUNT(*) n FROM catalog_suggestions').get().n + ' اقتراح');
    if (global.__MIRBAH_OWNER_CREATED__) console.log('  أُنشئ حساب المالك من متغيرات البيئة.');
    else if (!db.prepare("SELECT COUNT(*) n FROM users WHERE role='owner'").get().n) {
      console.log('  ⚠ لا يوجد مالك: عيّن MIRBAH_OWNER_EMAIL و MIRBAH_OWNER_PASSWORD (12+ حرفًا).');
    }
  }, 80);
})().catch((e) => { console.error('[startup]', e); process.exit(1); });
