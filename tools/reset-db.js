'use strict';
/**
 * أداة صيانة: تُحذف الملفات المؤقتة وتُبنى قاعدة اختبار منفصلة للتحقق.
 * هذا السكربت لا يُشغّل الخادم. الاستخدام:  node tools/reset-db.js
 */
const fs = require('fs');
const path = require('path');
const dbm = require('../server/db.js');

const dataDir = dbm.DATA_DIR;
const force = process.argv.includes('--force');
if (!force) {
  console.log('هذه الأداة تحذف قاعدة البيانات. أضف --force للتأكيد.');
  process.exit(0);
}
fs.mkdirSync(dataDir, { recursive: true });
for (const f of fs.readdirSync(dataDir)) {
  if (f.startsWith('mirbah.db')) fs.unlinkSync(path.join(dataDir, f));
}
const { db, seed } = dbm.init();
console.log('أُعيد بذر قاعدة البيانات:', seed);
console.log('الأنشطة:', db.prepare('SELECT COUNT(*) n FROM catalog_activities').get().n);
