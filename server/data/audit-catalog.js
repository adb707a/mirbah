'use strict';
/* فحص اتساق: كل اسم اقتراح يجب أن يوجد في مكتبة المكونات + إحصاء التغطية */
const { RECIPES, BY_DOMAIN, BY_SUBCATEGORY } = require('../seed-suggestions.js');
const { LIB } = require('./ingredient-library.js');
const missing = new Set();
const kinds = { core: 0, extra: 0, optional: 0, packaging: 0 };
Object.keys(RECIPES).forEach((k) => RECIPES[k].forEach((x) => {
  if (!LIB[x.name.toLowerCase()]) missing.add(x.name);
  kinds[x.kind] = (kinds[x.kind] || 0) + 1;
}));
Object.keys(BY_DOMAIN).forEach((k) => BY_DOMAIN[k].forEach((x) => {
  if (!LIB[x.name.toLowerCase()]) missing.add(x.name);
  kinds[x.kind] = (kinds[x.kind] || 0) + 1;
}));
console.log('كتالوج المكونات:', Object.keys(LIB).length, 'مكوّنًا');
console.log('منتجات لها قائمة اقتراح:', Object.keys(RECIPES).length);
console.log('أنشطة لها قائمة احتياطية:', Object.keys(BY_DOMAIN).length);
console.log('تصنيفات مربوطة:', Object.keys(BY_SUBCATEGORY).length);
const total = Object.values(kinds).reduce((a, b) => a + b, 0);
console.log('إجمالي الاقتراحات المزروعة:', total, '→', JSON.stringify(kinds));
if (missing.size) { console.log('✗ أسماء غير موجودة في المكتبة:', Array.from(missing).join('، ')); process.exit(1); }
console.log('✓ كل الاقتراحات موجودة في المكتبة');
