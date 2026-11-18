/* =============================================================
   دفتر V3 — طبقة الوحدات الذكية (Smart Units)
   - تتعامل مع لوحة المفاتيح اللاتينية فقط: تُستدعى من calc.js.
   - آمنة: تعيد { ok:false, ... } عند أي تحويل غير موثوق، ولا تخترع قيمة.
   - دفتر V3 فقط — المشروع الأصلي لا يستخدمها.
   ============================================================= */
(function (global) {
  'use strict';

  /* المجموعات: كل وحدة تحمل factor = كم من الوحدة الأساسية للمجموعة فيها */
  const UNITS = {
    // الوزن — الأساس جرام
    mg:  { label: 'مليجرام',   plural: 'مليجرام',  group: 'mass',   factor: 0.001 },
    g:   { label: 'جرام',      plural: 'جرام',     group: 'mass',   factor: 1 },
    kg:  { label: 'كيلوجرام',  plural: 'كيلوجرام',  group: 'mass',   factor: 1000 },
    ton: { label: 'طن',        plural: 'أطنان',    group: 'mass',   factor: 1000000 },
    // الحجم — الأساس ملليلتر
    ml:  { label: 'ملليلتر',   plural: 'ملليلتر',  group: 'volume', factor: 1 },
    l:   { label: 'لتر',       plural: 'لترات',    group: 'volume', factor: 1000 },
    // العدد — الأساس حبة
    pc:    { label: 'حبة',    plural: 'حبات',    group: 'count', factor: 1 },
    piece: { label: 'قطعة',   plural: 'قطع',     group: 'count', factor: 1 },
    sheet: { label: 'ورقة',   plural: 'أوراق',   group: 'count', factor: 1 },
    pair:  { label: 'زوج',    plural: 'أزواج',   group: 'count', factor: 1 },
    box:   { label: 'علبة',   plural: 'علب',     group: 'count', factor: 1 },
    bottle:{ label: 'زجاجة',  plural: 'زجاجات',  group: 'count', factor: 1 },
    bag:   { label: 'كيس',    plural: 'أكياس',   group: 'count', factor: 1 },
    carton:{ label: 'صندوق',  plural: 'صناديق',  group: 'count', factor: 1 },
    set:   { label: 'مجموعة', plural: 'مجموعات', group: 'count', factor: 1 },
    spool: { label: 'بكرة',   plural: 'بكرات',   group: 'count', factor: 1 },
    // الطول — الأساس متر
    mm: { label: 'مليمتر',  plural: 'مليمتر',  group: 'length', factor: 0.001 },
    cm: { label: 'سنتيمتر', plural: 'سنتيمتر', group: 'length', factor: 0.01 },
    m:  { label: 'متر',     plural: 'أمتار',   group: 'length', factor: 1 },
    // منزلي / مخصص — لا يُحوَّل تلقائيًا (لايوجد معامل موثوق)
    tsp:  { label: 'ملعقة صغيرة', plural: 'ملاعق صغيرة', group: 'kitchen', factor: null, custom: true },
    tbsp: { label: 'ملعقة كبيرة', plural: 'ملاعق كبيرة', group: 'kitchen', factor: null, custom: true },
    cup:  { label: 'كوب',        plural: 'أكواب',       group: 'kitchen', factor: null, custom: true },
    serving: { label: 'حصة',     plural: 'حصص',         group: 'kitchen', factor: null, custom: true },
    custom:  { label: 'وحدة خاصة', plural: 'وحدات خاصة', group: 'custom', factor: null, custom: true }
  };

  const GROUPS = {
    mass:   { label: 'الوزن',  baseUnit: 'g',  perLabel: 'كيلوجرام', perUnit: 'kg' },
    volume: { label: 'الحجم',  baseUnit: 'ml', perLabel: 'لتر',      perUnit: 'l' },
    count:  { label: 'العدد',  baseUnit: 'pc', perLabel: 'وحدة',     perUnit: 'pc' },
    length: { label: 'الطول',  baseUnit: 'm',  perLabel: 'متر',      perUnit: 'm' },
    kitchen:{ label: 'منزلي',  baseUnit: null, perLabel: null,       perUnit: null },
    custom: { label: 'خاص',    baseUnit: null, perLabel: null,       perUnit: null }
  };

  /* التسميات الديناميكية: اسم حقل الكمية المشتراة والمستخدمة حسب الوحدة */
  const FIELD_LABELS = {
    mg:    { bought: 'الوزن المشترى',  used: 'الوزن المستخدم',   short: 'مجم' },
    g:     { bought: 'الوزن المشترى',  used: 'الوزن المستخدم',   short: 'جم' },
    kg:    { bought: 'الوزن المشترى',  used: 'الوزن المستخدم',   short: 'كجم' },
    ton:   { bought: 'الوزن المشترى',  used: 'الوزن المستخدم',   short: 'طن' },
    ml:    { bought: 'الحجم المشترى',  used: 'الحجم المستخدم',   short: 'مل' },
    l:     { bought: 'الحجم المشترى',  used: 'الحجم المستخدم',   short: 'لتر' },
    pc:    { bought: 'عدد الحبات المشتراة', used: 'عدد الحبات المستخدمة', short: 'حبة' },
    piece: { bought: 'عدد القطع المشتراة',  used: 'عدد القطع المستخدمة',  short: 'قطعة' },
    sheet: { bought: 'عدد الأوراق المشتراة',used: 'عدد الأوراق المستخدمة',short: 'ورقة' },
    pair:  { bought: 'عدد الأزواج المشتراة',used: 'عدد الأزواج المستخدمة',short: 'زوج' },
    box:   { bought: 'عدد العلب المشتراة',  used: 'عدد العلب المستخدمة',  short: 'علبة' },
    bottle:{ bought: 'عدد الزجاجات المشتراة', used: 'عدد الزجاجات المستخدمة', short: 'زجاجة' },
    bag:   { bought: 'وزن الكيس أو عدد الأكياس', used: 'المستخدم من الكيس', short: 'كيس' },
    carton:{ bought: 'عدد الصناديق المشتراة', used: 'عدد الصناديق المستخدمة', short: 'صندوق' },
    set:   { bought: 'عدد المجموعات المشتراة', used: 'عدد المجموعات المستخدمة', short: 'مجموعة' },
    spool: { bought: 'عدد البكرات المشتراة',  used: 'عدد البكرات المستخدمة',  short: 'بكرة' },
    mm:    { bought: 'الطول المشترى',  used: 'الطول المستخدم',  short: 'مم' },
    cm:    { bought: 'الطول المشترى',  used: 'الطول المستخدم',  short: 'سم' },
    m:     { bought: 'الطول المشترى',  used: 'الطول المستخدم',  short: 'م' },
    tsp:   { bought: 'عدد الملاعق الصغيرة المشتراة', used: 'عدد الملاعق الصغيرة المستخدمة', short: 'ملعقة ص' },
    tbsp:  { bought: 'عدد الملاعق الكبيرة المشتراة', used: 'عدد الملاعق الكبيرة المستخدمة', short: 'ملعقة ك' },
    cup:   { bought: 'عدد الأكواب المشتراة', used: 'عدد الأكواب المستخدمة', short: 'كوب' },
    serving:{ bought: 'عدد الحصص المشتراة', used: 'عدد الحصص المستخدمة', short: 'حصة' },
    custom:{ bought: 'الكمية المشتراة', used: 'الكمية المستخدمة', short: 'وحدة' }
  };

  const num = (v) => {
    if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
    const n = parseFloat(String(v).replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d))
      .replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(/[^\d.\-]/g, ''));
    return Number.isFinite(n) ? n : 0;
  };
  const round = (v, d) => {
    const p = Math.pow(10, d == null ? 4 : d);
    return Math.round((num(v) + Number.EPSILON) * p) / p;
  };

  function info(unitId) {
    return UNITS[unitId] || { label: unitId || 'وحدة', plural: unitId || 'وحدة', group: 'custom', factor: null, custom: true };
  }
  function label(unitId) { return FIELD_LABELS[unitId] || FIELD_LABELS.custom; }
  function groupOf(unitId) { return info(unitId).group; }
  function groupLabel(unitId) { return (GROUPS[groupOf(unitId)] || GROUPS.custom).label; }

  function compatible(a, b) {
    const ga = groupOf(a);
    const gb = groupOf(b);
    if (ga !== gb) return false;
    if (ga === 'kitchen' || ga === 'custom') return a === b;
    return info(a).factor != null && info(b).factor != null;
  }

  /* تحويل كمية داخل نفس المجموعة — لا تحويل بين الوزن والحجم */
  function convert(qty, from, to) {
    const q = Math.max(0, num(qty));
    if (from === to) return { ok: true, qty: q, reason: null };
    if (!compatible(from, to)) {
      return { ok: false, qty: null, reason: 'incompatible', groupFrom: groupLabel(from), groupTo: groupLabel(to) };
    }
    const f = info(from).factor;
    const t = info(to).factor;
    if (!f || !t) return { ok: false, qty: null, reason: 'no-factor' };
    return { ok: true, qty: round(q * (f / t), 6), reason: null };
  }

  /* سعر الوحدة الموحّد للمقارنة: لكل كجم / لتر / متر / وحدة عدد */
  function compareUnit(unitId) {
    const g = groupOf(unitId);
    const grp = GROUPS[g] || GROUPS.custom;
    if (!grp.perUnit || grp.perUnit === unitId) return { unit: unitId, label: grp.perLabel || info(unitId).label };
    return { unit: grp.perUnit, label: grp.perLabel };
  }

  /* سعر الوحدة الموحّد من (سعر، كمية، وحدة) — يرفض الحساب عند غياب المعامل */
  function unitPrice(price, qty, unitId) {
    const p = Math.max(0, num(price));
    const q = Math.max(0, num(qty));
    if (q <= 0) return { ok: false, value: null, reason: 'zero-qty', unit: null, label: null };
    const g = groupOf(unitId);
    const grp = GROUPS[g] || GROUPS.custom;
    const inf = info(unitId);
    if (!inf.factor || !grp.baseUnit) return { ok: false, value: null, reason: 'no-factor', unit: null, label: null };
    const baseQty = q * inf.factor;
    if (baseQty <= 0) return { ok: false, value: null, reason: 'zero-qty', unit: null, label: null };
    const perBase = p / baseQty;
    // العرض دائماً لكل كجم/لتر/م — أو للوحدة إن كانت المجموعة عدد
    if (g === 'count') return { ok: true, value: round(perBase, 2), unit: 'pc', label: 'حبة' };
    if (g === 'length') return { ok: true, value: round(perBase, 2), unit: 'm', label: 'متر' };
    if (g === 'mass') return { ok: true, value: round(perBase * 1000, 2), unit: 'kg', label: 'كيلوجرام' };
    if (g === 'volume') return { ok: true, value: round(perBase * 1000, 2), unit: 'l', label: 'لتر' };
    return { ok: false, value: null, reason: 'no-factor', unit: null, label: null };
  }

  /* مقارنة سعرين بوحدتين مختلفتين فقط إن وُجدت كثافة موثوقة */
  function crossGroupCost(packQty, packUnit, otherQty, otherUnit) {
    // دالة مقصودة للواجهة فقط لإظهار رسالة "لا يمكن" في مسار المقارنة الأول.
    if (groupOf(packUnit) === groupOf(otherUnit)) return null;
    return {
      ok: false,
      reason: 'density-required',
      message: `لا يمكن مقارنة ${groupLabel(packUnit)} بـ${groupLabel(otherUnit)} دون كثافة موثوقة للمادة. اختر وحدة من نفس النوع.`
    };
  }

  /* حساب الشراء/الاستهلاك بالتفصيل — المعادلة الرسمية */
  // تكلفة المستخدم = سعر الشراء × (الكمية المستخدمة ÷ الكمية المشتراة)
  function purchaseBreakdown(ing) {
    const pack = Math.max(0, num(ing.pack));
    const qty = Math.max(0, num(ing.qty));
    const price = Math.max(0, num(ing.price));
    const packUnit = ing.packUnit || ing.unit;
    const useUnit = ing.qtyUnit || ing.unit;
    const out = {
      ok: false, reason: null, pack, qty, price,
      packUnit, useUnit,
      packInUseUnit: null, usedCost: 0, unitPrice: 0,
      leftoverQty: pack, leftoverValue: price,
      packLabel: label(packUnit), useLabel: label(useUnit),
      compare: compareUnit(packUnit)
    };
    if (pack <= 0) { out.reason = 'no-pack'; return out; }
    if (!compatible(packUnit, useUnit)) {
      out.reason = 'incompatible';
      return out;
    }
    // الكمية المشتراة بالوحدة نفسها للاستخدام (للعرض والمقارنة)
    const packInUse = convert(pack, packUnit, useUnit);
    if (!packInUse.ok) { out.reason = packInUse.reason; return out; }
    const ratio = packInUse.qty > 0 ? qty / packInUse.qty : 0;
    const cost = round(price * ratio, 2);
    out.ok = true;
    out.packInUseUnit = packInUse.qty;
    out.usedCost = cost;
    out.unitPrice = unitPrice(price, pack, packUnit).value || 0;
    out.leftoverQty = round(Math.max(0, packInUse.qty - qty), 4);
    out.leftoverValue = round(Math.max(0, price - cost), 2);
    out.usedSharePct = packInUse.qty > 0 ? round((qty / packInUse.qty) * 100, 1) : 0;
    if (qty > packInUse.qty) out.reason = 'overuse';
    return out;
  }

  const Smart = { UNITS, GROUPS, FIELD_LABELS, info, label, groupOf, groupLabel, compatible, convert, compareUnit, unitPrice, crossGroupCost, purchaseBreakdown, num, round };
  if (typeof module !== 'undefined' && module.exports) module.exports = Smart;
  else global.SmartUnits = Smart;
})(typeof window !== 'undefined' ? window : globalThis);
