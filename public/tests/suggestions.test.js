/* =============================================================
   دفتر V3 — اختبار اقتراحات المكونات حسب المنتج
   التشغيل: node prototypes-v3/03-daftar/tests/suggestions.test.js
   يتحقق من وجود مكونات أساسية لكل منتج من الأمثلة الإلزامية،
   وعدم خلط أنشطة بمكونات لا تناسبها.
   ============================================================= */
'use strict';

const path = require('path');
const Sugg = require(path.join(__dirname, '..', 'js', 'ingredient-suggestions.js'));

const cases = [
  { key: 'areika',  must: ['دقيق بر', 'تمر', 'سمن', 'عسل', 'قشطة'], label: 'العريكة' },
  { key: 'cookies', must: ['دقيق', 'سكر', 'زبدة', 'بيض', 'فانيليا', 'شوكولاتة'], label: 'الكوكيز' },
  { key: 'perfume', must: ['زيت عطري', 'كحول عطري', 'مثبت', 'زجاجات العطر', 'أغطية الزجاجات', 'بخاخات'], label: 'العطور' },
  { key: 'candles', must: ['شمع صويا', 'فتائل', 'عطر مخصص للشموع', 'أوعية', 'أغطية'], label: 'الشموع' },
  { key: 'crochet', must: ['خيوط كروشيه'], label: 'الكروشيه' },
  { key: 'juice',   must: ['برتقال طازج'], label: 'المشروبات' },
  { key: 'bread',   must: ['دقيق', 'خميرة', 'ملح'], label: 'المخبوزات' }
];

let pass = 0;
let fail = 0;

for (const c of cases) {
  const res = Sugg.lookup({ productId: c.key }, { id: c.key, ingKey: c.key });
  const names = res.items.map((i) => i.name);
  const missing = c.must.filter((m) => names.indexOf(m) === -1);
  const ok = missing.length === 0;
  ok ? pass++ : fail++;
  console.log((ok ? '✓' : '✗') + ' ' + c.label + ' — ' + names.length + ' اقتراحًا' + (ok ? '' : '   [ناقص: ' + missing.join('، ') + ']'));
}

// التصنيفات: أساسي / اختياري / تغليف
const kinds = Sugg.lookup({}, { id: 'cookies', ingKey: 'cookies' }).items;
const hasKinds = ['core', 'optional', 'packaging'].every((k) => kinds.some((x) => x.kind === k));
hasKinds ? pass++ : fail++;
console.log((hasKinds ? '✓' : '✗') + ' الكوكيز — يحتوي أساسيًا + اختياريًا + تغليفًا');

// عدم الخلط: العطور لا تحتوي دقيق
const perfumeNames = Sugg.lookup({}, { id: 'perfume', ingKey: 'perfume' }).items.map((x) => x.name);
const noFlour = perfumeNames.indexOf('دقيق') === -1;
noFlour ? pass++ : fail++;
console.log((noFlour ? '✓' : '✗') + ' العطور لا تقترح «دقيق»');

// البحث النصي
const search = Sugg.search('شوكولاتة').map((x) => x.name);
search.length >= 1 ? pass++ : fail++;
console.log((search.length >= 1 ? '✓' : '✗') + ' البحث عن «شوكولاتة» يرجّع ' + search.length + ' نتيجة');

// احتياطي حسب المجال
const fallback = Sugg.lookup({ domainId: 'perfumes', subcategoryId: 'unknown', productId: 'unknown' }, { id: 'unknown' });
const fbOk = fallback.source === 'domain' && fallback.items.some((x) => x.name === 'زيت عطري');
fbOk ? pass++ : fail++;
console.log((fbOk ? '✓' : '✗') + ' الاحتياط حسب النشاط يعمل (المصدر: ' + fallback.source + ')');

console.log('\nالنتيجة: ' + pass + ' ناجح · ' + fail + ' فاشل');
process.exit(fail ? 1 : 0);
