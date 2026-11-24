'use strict';
/**
 * اختبارات الاقتراحات والمكتبات (نظام كامل عبر HTTP على قاعدة مؤقتة)
 * التشغيل: node tests/suggestions.test.js
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

const PORT = 8891;
const BASE = 'http://127.0.0.1:' + PORT;
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'mb-sug-'));
const H = { 'Content-Type': 'application/json', 'X-Requested-With': 'mirbah' };
let pass = 0, fail = 0;
const out = [];
function ok(name, cond, extra) { if (cond) pass++; else fail++; out.push({ ok: !!cond, name, extra }); }

async function api(method, p, body, cookie) {
  const res = await fetch(BASE + p, { method, headers: Object.assign({}, H, cookie ? { Cookie: cookie } : {}), body: body ? JSON.stringify(body) : undefined });
  let data = null; try { data = await res.json(); } catch (e) {}
  return { status: res.status, data, cookie: (res.headers.get('set-cookie') || '').split(';')[0] };
}
const waitUp = async () => { for (let i = 0; i < 80; i++) { try { const r = await fetch(BASE + '/api/health'); const j = await r.json(); if (j.ok && j.activities) return true; } catch (e) {} await new Promise((r) => setTimeout(r, 250)); } return false; };

(async () => {
  const child = spawn(process.execPath, [path.join(__dirname, '..', 'tools', 'start-platform.js')], {
    env: Object.assign({}, process.env, { PORT: String(PORT), MIRBAH_DB: path.join(TMP, 't.db'), MIRBAH_OWNER_EMAIL: 'owner@sug.local', MIRBAH_OWNER_PASSWORD: 'Owner-Password-2026' }), stdio: 'ignore'
  });
  if (!(await waitUp())) { console.log('✗ لم يقلع الخادم'); child.kill(); process.exit(1); }
  try {
    /* ---------- 1) لكل منتج قائمة مختلفة ومناسبة ---------- */
    const cases = [
      { key: 'cookies', must: ['دقيق', 'سكر', 'زبدة', 'بيض', 'شوكولاتة'], mustNot: ['خيوط كروشيه', 'زيت عطري'] },
      { key: 'areika', must: ['دقيق بر', 'تمر', 'سمن', 'عسل'], mustNot: ['بن إسبريسو'] },
      { key: 'bread', must: ['دقيق', 'خميرة', 'ملح'], mustNot: ['شمع صويا'] },
      { key: 'juice', must: ['برتقال طازج'], mustNot: ['دقيق'] },
      { key: 'latte', must: ['بن إسبريسو', 'حليب طازج'], mustNot: ['لحم مفروم'] },
      { key: 'perfume', must: ['زيت عطري', 'كحول عطري', 'زجاجات العطر'], mustNot: ['دقيق', 'خيوط كروشيه'] },
      { key: 'candles', must: ['شمع صويا', 'فتائل', 'أوعية'], mustNot: ['بيض'] },
      { key: 'crochet_bag', must: ['خيوط قطن', 'بطانة قماش'], mustNot: ['دقيق', 'سكر'] },
      { key: 'crochet_amigurumi', must: ['خيوط كروشيه', 'حشوة قطنية'], mustNot: ['دقيق'] }
    ];
    for (const c of cases) {
      const r = await api('GET', '/api/public/suggestions?key=' + c.key);
      const names = (r.data.items || []).map((x) => x.name);
      ok('اقتراحات «' + c.key + '» مناسبة', c.must.every((m) => names.indexOf(m) > -1) && c.mustNot.every((m) => names.indexOf(m) === -1), { got: names.slice(0, 10) });
    }

    /* ---------- 2) لا تكرار في أي عمود ---------- */
    const allKeys = ['cookies', 'areika', 'perfume', 'candles', 'crochet_bag', 'coffee_specialty', 'bread', 'burger', 'sewing', 'juice'];
    let dupFound = null;
    for (const k of allKeys) {
      const r = await api('GET', '/api/public/suggestions?key=' + k);
      const names = (r.data.items || []).map((x) => x.name);
      if (new Set(names).size !== names.length) dupFound = k;
    }
    ok('لا تكرار في اقتراحات المنتجات المختبرة', dupFound === null, dupFound);

    /* ---------- 3) التصنيفات الأربعة موجودة ---------- */
    const cook = (await api('GET', '/api/public/suggestions?key=cookies')).data.items;
    const kinds = new Set(cook.map((x) => x.kind));
    ok('وجود أساسي/إضافة/تغليف', kinds.has('core') && kinds.has('extra') && kinds.has('packaging'));

    /* ---------- 4) الوحدات مناسبة للمادة ---------- */
    const mlItem = cook.find((x) => x.name === 'فانيليا');
    ok('السائل بالملليلتر', mlItem && mlItem.unit === 'ml');
    const pcItem = cook.find((x) => x.name === 'بيض');
    ok('البيض بالحبة', pcItem && pcItem.unit === 'pc');

    /* ---------- 5) مكتبة المكونات العامة ---------- */
    const lib = await api('GET', '/api/public/library?q=' + encodeURIComponent('دقيق'));
    ok('بحث المكتبة العامة يعمل', lib.status === 200 && lib.data.items.length > 0);
    const lt = (await api('POST', '/api/auth/login', { email: 'owner@sug.local', password: 'Owner-Password-2026' }));
    const oc = lt.cookie;
    const addLib = await api('POST', '/api/owner/library', { name: 'تمر سكري', enName: 'Sukkari dates', cls: 'ingredient', category: 'مواد خام', defaultUnit: 'g' }, oc);
    ok('إضافة مكوّن للمكتبة العامة', addLib.status === 200);
    const dupLib = await api('POST', '/api/owner/library', { name: 'تمر سكري' }, oc);
    ok('رفض تكرار اسم في المكتبة', dupLib.status === 409);
    const merge = await api('POST', '/api/owner/library/merge', { from: 'sugar', to: 'سكر' }, oc);
    // المفاتيح اللاتينية هي keys؛ نستخدم ما يوجد فعلًا
    ok('دمج مكوّنين يرسل نتيجة واضحة', merge.status === 200 || merge.status === 404, merge.data && merge.data.message);
    const exp = await api('GET', '/api/owner/library/export', null, oc);
    ok('تصدير المكتبة', exp.status === 200 && exp.data.items.length > 100);

    /* ---------- 6) تعديل اقتراح من المالك يظهر للتاجر ---------- */
    const addSug = await api('POST', '/api/owner/catalog/suggestions', { ingKey: 'cookies', name: 'سكر جوز الهند', kind: 'extra', unit: 'g' }, oc);
    ok('إضافة اقتراح من المالك', addSug.status === 200);
    const afterSug = (await api('GET', '/api/public/suggestions?key=cookies')).data.items.map((x) => x.name);
    ok('الاقتراح الجديد يظهر فورًا', afterSug.indexOf('سكر جوز الهند') > -1);
    const dupSug = await api('POST', '/api/owner/catalog/suggestions', { ingKey: 'cookies', name: 'سكر جوز الهند', kind: 'core' }, oc);
    ok('رفض اقتراح مكرر لنفس المنتج', dupSug.status === 409);

    /* ---------- 7) تاجر: اقتراح جديد للمراجعة لا يظهر للجميع ---------- */
    const email = 'sug' + Date.now() + '@test.local';
    await api('POST', '/api/auth/register', { name: 'تاجر اقتراح', email, password: 'Merchant-123456' });
    const ml = await api('POST', '/api/auth/login', { email, password: 'Merchant-123456' });
    const mc = ml.cookie;
    const pend = await api('POST', '/api/merchant/suggestions', { name: 'ماء ورد طائفي', unit: 'ml', note: 'للحلويات' }, mc);
    ok('تاجر يرسل اقتراحًا للمراجعة', pend.status === 200);
    const publicAfter = (await api('GET', '/api/public/suggestions?key=cookies')).data.items.map((x) => x.name);
    ok('اقتراح التاجر لا يظهر قبل المراجعة', publicAfter.indexOf('ماء ورد طائفي') === -1);
    const rev = await api('GET', '/api/owner/suggestions-review', null, oc);
    const mine = (rev.data.pending || []).filter((x) => x.email === email);
    ok('المالك يرى الاقتراح المعلّق', mine.length === 1);
    const approve = await api('PATCH', '/api/owner/suggestions-review/' + mine[0].id, { status: 'approved', ingKey: 'cookies' }, oc);
    ok('الموافقة الإدارية تعتمده', approve.status === 200);
    const publicFinal = (await api('GET', '/api/public/suggestions?key=cookies')).data.items.map((x) => x.name);
    ok('يظهر للجميع بعد الموافقة', publicFinal.indexOf('ماء ورد طائفي') > -1);
    const badReport = await api('POST', '/api/merchant/report', { name: 'فانيليا', reason: 'مكرر' }, mc);
    ok('بلاغ عن اقتراح يصل', badReport.status === 200);

    /* ---------- 8) مكتبة التاجر الشخصية ---------- */
    const item = await api('POST', '/api/merchant/items', { name: 'سكر', unit: 'g', lastPrice: 6, lastPack: 1000, supplier: 'التميمي' }, mc);
    ok('إضافة مادة للتاجر', item.status === 200);
    const up = await api('PATCH', '/api/merchant/items/' + item.data.item.id, { newPrice: 7.5, note: 'شراء ثانٍ' }, mc);
    ok('تحديث سعر الشراء', up.status === 200);
    const hist = await api('GET', '/api/merchant/items/' + item.data.item.id + '/history', null, mc);
    ok('سجل الأسعار يحتفظ بالقديم والجديد', hist.data.rows.length === 2 && hist.data.rows[0].price === 7.5);

    /* ---------- 9) عزل مكتبة التاجر بين تاجرين ---------- */
    const e2 = 'sug2' + Date.now() + '@test.local';
    await api('POST', '/api/auth/register', { name: 'تاجر آخر', email: e2, password: 'Merchant-123456' });
    const m2 = (await api('POST', '/api/auth/login', { email: e2, password: 'Merchant-123456' })).cookie;
    const other = await api('GET', '/api/merchant/items', null, m2);
    ok('تاجر آخر لا يرى مكتبة غيره', (other.data.items || []).length === 0);
    const steal = await api('PATCH', '/api/merchant/items/' + item.data.item.id, { newPrice: 1 }, m2);
    ok('تاجر آخر لا يعدّل مواد غيره', steal.status === 404);

    /* ---------- 10) إضافة نشاط جديد من المالك تظهر للتاجر ---------- */
    const newAct = await api('POST', '/api/owner/catalog/activities', { key: 'pet_treats', name: 'وجبات الحيوانات', icon: '🐾' }, oc);
    ok('إضافة نشاط جديد', newAct.status === 200);
    const catNew = await api('POST', '/api/owner/catalog/categories', { activityKey: 'pet_treats', id: 'biscuits', name: 'البسكويت' }, oc);
    ok('إضافة تصنيف للنشاط', catNew.status === 200);
    const cat = await api('GET', '/api/public/catalog');
    const found = cat.data.activities.find((a) => a.id === 'pet_treats');
    ok('النشاط الجديد يظهر للجميع', !!found && found.subcategories.some((s) => s.name === 'البسكويت'));

    /* ---------- 11) استيراد/تصدير ---------- */
    const imp = await api('POST', '/api/owner/library/import', { items: [{ name: 'شوفان مجروش', cls: 'ingredient', default_unit: 'g' }], suggestions: [] }, oc);
    ok('استيراد عناصر للمكتبة', imp.status === 200 && imp.data.backup && imp.data.backup.name);
  } catch (e) {
    ok('لا استثناءات: ' + (e && e.message), false);
  } finally {
    child.kill();
  }
  out.forEach((r) => console.log((r.ok ? '✓' : '✗') + ' ' + r.name + (r.ok || r.extra === undefined ? '' : '  → ' + JSON.stringify(r.extra))));
  console.log('\nالنتيجة: ' + pass + ' ناجح · ' + fail + ' فاشل');
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {}
  process.exit(fail ? 1 : 0);
})();
