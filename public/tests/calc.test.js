/* =============================================================
   دفتر V3 — اختبارات حسابية إلزامية (Node)
   التشغيل:  node prototypes-v3/03-daftar/tests/calc.test.js
   كل اختبار يقارن الحساب بالنتيجة المتوقعة بالنص، ويفشل عند أي انحراف.
   ============================================================= */
'use strict';

const path = require('path');
const Smart = require(path.join(__dirname, '..', 'js', 'smart-units.js'));
const Calc = require(path.join(__dirname, '..', 'js', 'calc.js'));

let pass = 0;
let fail = 0;
const rows = [];

function check(name, actual, expected, unit) {
  const ok = Math.abs(Number(actual) - Number(expected)) < 0.005;
  if (ok) pass++; else fail++;
  rows.push({ ok, name, actual, expected, unit: unit || '' });
}

function checkEqual(name, actual, expected) {
  const ok = actual === expected;
  if (ok) pass++; else fail++;
  rows.push({ ok, name, actual, expected });
}

/* ---------- 1) السكر: 1000 جم بـ 6 ر.س، استُخدم 500 جم ---------- */
const sugar = { name: 'سكر', pack: 1000, packUnit: 'g', price: 6, qty: 500, qtyUnit: 'g' };
const sugarCost = Calc.ingredientCost(sugar);
const sugarDetail = Smart.purchaseBreakdown(sugar);
check('السكر — تكلفة المستخدم', sugarCost.costUsed, 3);
check('السكر — قيمة المتبقي', sugarCost.leftoverValue, 3);
check('السكر — المتبقي بالجرام', sugarDetail.leftoverQty, 500, 'جم');
check('السكر — سعر الكيلو', sugarDetail.unitPrice, 6, 'ر.س/كجم');

/* ---------- 2) اختلاف حجم العبوة: 2 كجم بـ 12، استُخدم 500 جم ---------- */
const sugar2 = { name: 'سكر', pack: 2, packUnit: 'kg', price: 12, qty: 500, qtyUnit: 'g' };
const sugar2Cost = Calc.ingredientCost(sugar2);
check('2 كجم — تكلفة المستخدم', sugar2Cost.costUsed, 3);
check('2 كجم — قيمة المتبقي', sugar2Cost.leftoverValue, 9);
check('2 كجم — سعر الكيلو', Smart.purchaseBreakdown(sugar2).unitPrice, 6, 'ر.س/كجم');

/* ---------- 3) السوائل: 1000 مل بـ 20، استُخدم 250 مل ---------- */
const oil = { name: 'زيت', pack: 1000, packUnit: 'ml', price: 20, qty: 250, qtyUnit: 'ml' };
check('السائل — تكلفة المستخدم', Calc.ingredientCost(oil).costUsed, 5);
check('السائل — المتبقي', Smart.purchaseBreakdown(oil).leftoverQty, 750, 'مل');

/* ---------- 4) العدد: 100 حبة بـ 25، استُخدم 12 حبة ---------- */
const tablets = { name: 'حبات', pack: 100, packUnit: 'pc', price: 25, qty: 12, qtyUnit: 'pc' };
check('العدد — تكلفة المستخدم', Calc.ingredientCost(tablets).costUsed, 3);

/* ---------- 5) الطول: 10 أمتار بـ 30، استُخدم 2 متر ---------- */
const rope = { name: 'خيط', pack: 10, packUnit: 'm', price: 30, qty: 2, qtyUnit: 'm' };
check('الطول — تكلفة المستخدم', Calc.ingredientCost(rope).costUsed, 6);
check('الطول — سعر المتر', Smart.purchaseBreakdown(rope).unitPrice, 3, 'ر.س/م');

/* ---------- 6) وحدات غير متوافقة: جرام مع ملليلتر ---------- */
const bad = { name: 'مادة', pack: 1000, packUnit: 'g', price: 10, qty: 250, qtyUnit: 'ml' };
const badCost = Calc.ingredientCost(bad);
checkEqual('غير متوافق — لا تكلفة مضللة', badCost.costUsed, 0);
checkEqual('غير متوافق — مُعلَّم incompatible', badCost.incompatible, true);
checkEqual('غير متوافق — لا تحويل', Smart.convert(250, 'ml', 'g').ok, false);

/* ---------- 7) التحويلات الأساسية ---------- */
check('كجم ← جم', Smart.convert(1, 'kg', 'g').qty, 1000, 'جم');
check('لتر ← مل', Smart.convert(1, 'l', 'ml').qty, 1000, 'مل');
check('متر ← سم', Smart.convert(1, 'm', 'cm').qty, 100, 'سم');
check('سم ← مم', Smart.convert(2.5, 'cm', 'mm').qty, 25, 'مم');
check('جم ← مليجرام', Smart.convert(1, 'g', 'mg').qty, 1000, 'مجم');

/* ---------- 8) مقارنة السعر الموحّد ---------- */
const a = Smart.unitPrice(5, 500, 'g');   // 5 ر.س / 0.5 كجم = 10 ر.س/كجم
const b = Smart.unitPrice(8, 1, 'kg');    // 8 ر.س/كجم
check('عبوة 500 جم بـ 5 → للكيلو', a.value, 10, 'ر.س/كجم');
check('عبوة 1 كجم بـ 8 → للكيلو', b.value, 8, 'ر.س/كجم');
checkEqual('الأوفر هو الأغلى سعرًا إجماليًا', b.value < a.value, true);

/* ---------- 9) التسميات الديناميكية ---------- */
checkEqual('تسمية حقل الجرام', Smart.label('g').bought, 'الوزن المشترى');
checkEqual('تسمية حقل اللتر', Smart.label('l').bought, 'الحجم المشترى');
checkEqual('تسمية حقل الحبة', Smart.label('pc').bought, 'عدد الحبات المشتراة');
checkEqual('تسمية حقل المتر', Smart.label('m').used, 'الطول المستخدم');
checkEqual('لا تسمية ثابتة «حجم العبوة»', Smart.label('pc').bought.indexOf('حجم العبوة'), -1);

/* ---------- 10) حفظ معادلة المنتج كاملة (توزيع ومصروفات) ---------- */
const state = {
  units: 20, batchesPerMonth: 1, timeMinutes: 0, hourlyRate: 0, sellPrice: 10,
  ingredients: [{ name: 'سكر', pack: 1000, packUnit: 'g', price: 6, qty: 500, qtyUnit: 'g' }],
  packaging: [], operational: [], paymentGateways: []
};
const r = Calc.compute(state);
check('دفعة 20 وحدة — تكلفة المكونات', r.ingredientsTotal, 3);
check('تكلفة الوحدة (3/20)', r.unitCost, 0.15);
check('ربح الوحدة (10-0.15)', r.profitPerUnit, 9.85);

/* ---------- التقرير ---------- */
const pad = (s, n) => String(s).padEnd(n);
rows.forEach((x) => {
  console.log((x.ok ? '✓' : '✗') + ' ' + pad(x.name, 44) + ' = ' + x.actual + (x.unit ? ' ' + x.unit : '') + (x.ok ? '' : '   [متوقع: ' + x.expected + ']'));
});
console.log('\nالنتيجة: ' + pass + ' ناجح · ' + fail + ' فاشل');
process.exit(fail ? 1 : 0);
