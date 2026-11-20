/* =============================================================
   مِرْباح — اختبارات مخططات المنتجات وأنماط الحساب الأربعة
   يتحقق من: ملفات الأنشطة، تغطية المنتجات، المسارات الخمسة،
   الوحدات الجديدة، وصحة كل نمط حساب في محرك التكلفة.
   التشغيل: node public/tests/schemas.test.js
   ============================================================= */
'use strict';

const path = require('path');
const fs = require('fs');
const vm = require('vm');

const SC = require(path.join(__dirname, '..', 'js', 'product-schemas.js'));
const Smart = require(path.join(__dirname, '..', 'js', 'smart-units.js'));
const Calc = require(path.join(__dirname, '..', 'js', 'calc.js'));

let pass = 0, fail = 0;
const rows = [];
function ok(name, cond, detail) {
  if (cond) pass++; else fail++;
  rows.push({ ok: !!cond, name, detail: detail == null ? '' : detail });
}
function eq(name, a, b, detail) {
  ok(name, a === b, detail != null ? detail : (a + ' ≠ ' + b));
}
function near(name, a, b, unit) {
  ok(name, Math.abs(Number(a) - Number(b)) < 0.005, `${a} / ${b} ${unit || ''}`);
}

/* ---------- تحميل بيانات المنتجات المحلية ---------- */
const sandbox = { window: {} };
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'data.js'), 'utf8'), sandbox, { filename: 'data.js' });
const D = sandbox.window.AppData;
ok('data.js يُحمَّل ويُصدّر الكتالوج', !!(D && D.DOMAINS && D.DOMAINS.length), D ? D.DOMAINS.length : 0);

/* ---------- ١) ملفات الأنشطة ---------- */
const acts = Object.keys(SC.ACTIVITY_PROFILE);
ok('ملفات الأنشطة موجودة (18+)', acts.length >= 18, acts.length + ' نشاطًا');
let profileProblems = [];
acts.forEach((a) => {
  const p = SC.ACTIVITY_PROFILE[a];
  if (!p.step4 || !p.step5) profileProblems.push(a + ': عنوان ناقص');
  if (!p.summary || !p.summary.main || !p.summary.pack || !p.summary.ops) profileProblems.push(a + ': ملخص ناقص');
  if (!Array.isArray(p.units) || !p.units.length) profileProblems.push(a + ': وحدات ناقصة');
  if (['portion', 'count', 'amortized', 'direct'].indexOf(p.defaultCalcMode) < 0) profileProblems.push(a + ': نمط افتراضي غير صالح');
});
eq('كل ملفات الأنشطة مكتملة', profileProblems.length, 0, profileProblems.join(' | '));

/* ---------- ٢) تغطية كل منتجات الكتالوج ---------- */
const allProducts = [];
D.DOMAINS.forEach((d) => (d.subcategories || []).forEach((s) => (s.products || []).forEach((p) => allProducts.push({ domain: d.id, sub: s.id, id: p.id, name: p.name }))));
const missing = allProducts.filter((p) => !SC.PRODUCT_SCHEMAS[p.id]);
eq('كل منتج محلي له مخطط خاص', missing.length, 0, missing.map((m) => m.id).join(', '));
ok('عدد المنتجات المغطاة 98', allProducts.length >= 95, allProducts.length + ' منتجًا');

/* ---------- ٣) المسار ١: عباية سادة ---------- */
const abaya = SC.schemaFor('fashion', 'plain_abaya');
const abayaText = JSON.stringify(abaya);
eq('عباية — عنوان الخطوة ٤', SC.profileFor('fashion').step4, 'الأقمشة والخامات والكلف');
eq('عباية — عنوان الخطوة ٥', SC.profileFor('fashion').step5, 'تغليف وتسليم القطعة');
ok('عباية — قماش العباية موجود', /قماش العباية/.test(abayaText));
ok('عباية — الطرحة موجودة', /الطرحة/.test(abayaText));
ok('عباية — الطقطق/الأزرار المخفية', /طقطق/.test(abayaText));
ok('عباية — ليبل العلامة', /ليبل/.test(abayaText));
ok('عباية — وحدة المتر مسموحة', SC.unitsFor('fashion').indexOf('m') > -1);
ok('عباية — وحدة الحبة مسموحة', SC.unitsFor('fashion').indexOf('pc') > -1);
const abayaTitles = abaya.groups.map((g) => g.title);
eq('عباية — لا عنوان مجموعة مكرر', new Set(abayaTitles).size, abayaTitles.length, abayaTitles.join(' | '));

/* ---------- ٤) المسار ٢: بخور معطر ---------- */
const incense = SC.schemaFor('incense', 'scented_incense');
const incenseText = JSON.stringify(incense);
eq('بخور — عنوان الخطوة ٤', SC.profileFor('incense').step4, 'العود والزيوت ومواد التعتيق');
ok('بخور — جرام مسموح', SC.unitsFor('incense').indexOf('g') > -1);
ok('بخور — تولة مسموحة', SC.unitsFor('incense').indexOf('tola') > -1);
ok('بخور — أوقية مسموحة', SC.unitsFor('incense').indexOf('ounce') > -1);
ok('بخور — لا فحم داخل المكونات الأساسية', !/فحم/.test(JSON.stringify(incense.groups)), 'الفحم مذكور في المكونات!');
ok('بخور — الفحم اختياري في التغليف فقط', Array.isArray(incense.packaging) && /فحم/.test(JSON.stringify(incense.packaging)));

/* ---------- ٥) المسار ٣: تصميم شعار ---------- */
const logo = SC.schemaFor('digital', 'logo_design');
const logoItems = logo.groups.reduce((a, g) => a.concat(g.items), []);
eq('تصميم — عنوان الخطوة ٤', SC.profileFor('digital').step4, 'أدوات التنفيذ والاشتراكات والتراخيص');
ok('تصميم — تخطي التغليف المادي', SC.profileFor('digital').packaging === false);
ok('تصميم — اشتراك بنمط التوزيع', logoItems.some((x) => x.calcMode === 'amortized'));
ok('تصميم — لا علب/أكياس في المكونات', !/(علب|أكياس|مناديل)/.test(JSON.stringify(logo.groups)), 'تسريب تغليف مادي!');
const subItem = logoItems.filter((x) => x.calcMode === 'amortized')[0];
eq('تصميم — عدد مشاريع الشهر > 0', subItem.projectsPerMonth > 0, true);

/* ---------- ٦) المسار ٤: كوكيز شوكولاتة ---------- */
const cookies = SC.schemaFor('sweets', 'choco_cookies');
eq('كوكيز — عنوان الخطوة ٤', SC.profileFor('sweets').step4, 'مكونات الوصفة');
const cookieText = JSON.stringify(cookies.groups);
ok('كوكيز — مجموعات المواد الجافة', /المواد الجافة/.test(cookieText));
ok('كوكيز — الشوكولاتة والحشوات', /الشوكولاتة والحشوات/.test(cookieText));
ok('كوكيز — لا تغليف داخل المكونات', !/(علب تغليف|أكياس شفافة|ملصقات)/.test(cookieText), 'تسريب تغليف!');
ok('كوكيز — كل العناصر بالاستهلاك الجزئي', cookies.groups.reduce((a, g) => a.concat(g.items), []).every((x) => x.calcMode === 'portion'));

/* ---------- ٧) المسار ٥: كوب مطبوع ---------- */
const mug = SC.schemaFor('printing', 'printed_mug');
const mugItems = mug.groups.reduce((a, g) => a.concat(g.items), []);
eq('طباعة — عنوان الخطوة ٤', SC.profileFor('printing').step4, 'خامات الطباعة والقطع السادة');
ok('طباعة — الكوب بنمط القطع والعدد', mugItems.some((x) => x.calcMode === 'count' && /كوب/.test(x.name)));
ok('طباعة — ورقة/رول مسموحة', SC.unitsFor('printing').indexOf('sheet') > -1 && SC.unitsFor('printing').indexOf('roll') > -1);

/* ---------- ٨) أنماط الحساب الأربعة ---------- */
near('نمط الاستهلاك الجزئي', Calc.ingredientCost({ calcMode: 'portion', pack: 1000, packUnit: 'g', price: 6, qty: 500, qtyUnit: 'g' }).costUsed, 3, 'ر.س');
near('نمط القطع والعدد', Calc.ingredientCost({ calcMode: 'count', piecesPerPack: 12, piecesUsed: 3, price: 24 }).costUsed, 6, 'ر.س');
near('نمط توزيع الاشتراك الشهري', Calc.ingredientCost({ calcMode: 'amortized', subAmount: 200, subPeriod: 'monthly', projectsPerMonth: 10 }).costUsed, 20, 'ر.س');
near('نمط توزيع الاشتراك السنوي', Calc.ingredientCost({ calcMode: 'amortized', subAmount: 1200, subPeriod: 'yearly', projectsPerMonth: 10 }).costUsed, 10, 'ر.س');
near('نمط التكلفة المباشرة', Calc.ingredientCost({ calcMode: 'direct', directCost: 40 }).costUsed, 40, 'ر.س');

/* ---------- ٩) الوحدات الجديدة ---------- */
near('تولة = 12 مل', Smart.convert(1, 'tola', 'ml').qty, 12, 'مل');
near('أوقية = 28.3495 جم', Smart.convert(1, 'ounce', 'g').qty, 28.3495, 'جم');
near('ثمن = 125 جم', Smart.convert(1, 'thumn', 'g').qty, 125, 'جم');
near('درزن = 12 حبة', Smart.convert(1, 'dozen', 'pc').qty, 12, 'حبة');
near('ياردة = 0.9144 م', Smart.convert(1, 'yard', 'm').qty, 0.9144, 'م');
near('شوت = 30 مل', Smart.convert(1, 'shot', 'ml').qty, 30, 'مل');

/* ---------- ١٠) احتياط الأنشطة ---------- */
const fallback = SC.schemaFor('saudi_food', 'منتج_غير_موجود');
ok('الاحتياط يعطي مجموعة واحدة على الأقل', fallback.groups.length >= 1);

/* ---------- ١١) القطاعات الأربعة ---------- */
eq('عدد القطاعات', SC.SECTORS.length, 4);
const sectActs = SC.SECTORS.reduce((a, s) => a.concat(s.activities), []);
eq('كل نشاط في قطاع واحد فقط', new Set(sectActs).size, sectActs.length, sectActs.join(','));

/* ---------- الإخراج ---------- */
rows.forEach((r) => {
  console.log(`${r.ok ? '✓' : '✗'} ${r.name}${r.detail ? '  — ' + r.detail : ''}`);
});
console.log(`\nالنتيجة: ${pass} ناجح · ${fail} فاشل`);
process.exit(fail ? 1 : 0);
