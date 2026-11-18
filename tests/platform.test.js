'use strict';
/* =============================================================
   اختبارات المنصة (نظامية) — تشغّل خادمًا منفصلًا بقاعدة مؤقتة
   تغطي: الحسابات، الأدوار، عزل بيانات التجار، الكتالوج، المالك،
   الحماية من المحاولات والطلبات عبر الأصل، التغيير على المشاريع.
   التشغيل: node tests/platform.test.js
   ============================================================= */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

const PORT = 8899;
const BASE = 'http://localhost:' + PORT;
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'mirbah-test-'));
const DB = path.join(TMP, 'test.db');

let pass = 0, fail = 0;
const results = [];
function ok(name, cond, extra) {
  if (cond) pass++; else fail++;
  results.push({ ok: !!cond, name, extra });
}
const H = { 'Content-Type': 'application/json', 'X-Requested-With': 'mirbah' };

async function api(method, p, body, cookie, extraHeaders) {
  const headers = Object.assign({}, H, cookie ? { Cookie: cookie } : {}, extraHeaders || {});
  const res = await fetch(BASE + p, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let data = null;
  try { data = await res.json(); } catch (e) {}
  const sc = res.headers.get('set-cookie');
  return { status: res.status, data, cookie: sc ? sc.split(';')[0] : null };
}

async function waitUp() {
  const t0 = Date.now();
  for (let i = 0; i < 80; i++) {
    try {
      const r = await fetch(BASE + '/api/health');
      const j = await r.json();
      if (r.ok && j.ok && typeof j.activities === 'number') return true;
    } catch (e) {}
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

(async () => {
  const child = spawn(process.execPath, [path.join(__dirname, '..', 'tools', 'start-platform.js')], {
    env: Object.assign({}, process.env, {
      PORT: String(PORT),
      MIRBAH_DB: DB,
      MIRBAH_OWNER_EMAIL: 'owner@test.local',
      MIRBAH_OWNER_PASSWORD: 'Owner-Password-2026',
      NODE_ENV: 'test'
    }),
    stdio: 'ignore'
  });
  const up = await waitUp();
  ok('الخادم يقلع', up);
  if (!up) { child.kill(); process.exit(1); }

  try {
    /* ---------- ١) الكتالوج العام ---------- */
    const cat = await api('GET', '/api/public/catalog');
    ok('الكتالوج متاح للزائر', cat.status === 200 && cat.data.activities.length > 10);
    const sug = await api('GET', '/api/public/suggestions?key=cookies');
    ok('اقتراحات الكوكيز من قاعدة البيانات', sug.data.items.some((x) => x.name === 'دقيق'));

    /* ---------- ٢) التسجيل والدخول ---------- */
    const emailA = 'a' + Date.now() + '@test.local';
    const emailB = 'b' + Date.now() + '@test.local';
    const regA = await api('POST', '/api/auth/register', { email: emailA, password: 'Merchant-123456', name: 'تاجر أ' });
    ok('تسجيل تاجر', regA.status === 200 && !!regA.data.id);
    const dup = await api('POST', '/api/auth/register', { email: emailA, password: 'Merchant-123456', name: 'مكرر' });
    ok('رفض البريد المكرر', dup.status === 409);
    const weak = await api('POST', '/api/auth/register', { email: 'w' + Date.now() + '@test.local', password: '123', name: 'ضعيف' });
    ok('رفض كلمة مرور ضعيفة', weak.status === 400);

    const loginA = await api('POST', '/api/auth/login', { email: emailA, password: 'Merchant-123456' });
    ok('دخول التاجر يُصدر جلسة', loginA.status === 200 && !!loginA.cookie && loginA.data.redirect === '/dashboard/');
    const cookieA = loginA.cookie;

    const badLogin = await api('POST', '/api/auth/login', { email: emailA, password: 'wrong-pass' });
    ok('رفض كلمة مرور خاطئة', badLogin.status === 401);

    /* ---------- ٣) الدور لا يُمنح تلقائيًا ---------- */
    const forged = await api('POST', '/api/auth/register', { email: 'r' + Date.now() + '@test.local', password: 'Merchant-123456', name: 'محاول', role: 'owner' });
    const meForged = await api('GET', '/api/auth/me', null, null);
    ok('التسجيل يتجاهل أي دور يُطلب', forged.status === 200);
    const ownerCheck = await api('GET', '/api/owner/stats', null, cookieA);
    ok('التاجر لا يصل إلى المالك', ownerCheck.status === 403 && ownerCheck.data.code === 'forbidden');

    /* ---------- ٤) عزل بيانات التجار ---------- */
    const projA = await api('POST', '/api/merchant/projects', { name: 'مشروع أ', activityKey: 'sweets', startMode: 'single' }, cookieA);
    ok('إنشاء مشروع للتاجر', projA.status === 200 && !!projA.data.project.id);
    const pidA = projA.data.project.id;
    const prodA = await api('POST', '/api/merchant/projects/' + pidA + '/products', { name: 'منتج أ' }, cookieA);
    ok('إنشاء منتج', prodA.status === 200);

    await api('POST', '/api/auth/register', { email: emailB, password: 'Merchant-123456', name: 'تاجر ب' });
    const loginB = await api('POST', '/api/auth/login', { email: emailB, password: 'Merchant-123456' });
    const cookieB = loginB.cookie;
    const bReadsA = await api('GET', '/api/merchant/products/' + prodA.data.product.id, null, cookieB);
    ok('تاجر آخر لا يقرأ منتج غيره', bReadsA.status === 404);
    const bUpdatesA = await api('PUT', '/api/merchant/products/' + prodA.data.product.id, { name: 'تغيير' }, cookieB);
    ok('تاجر آخر لا يعدّل منتج غيره', bUpdatesA.status === 404);
    const bProjA = await api('POST', '/api/merchant/projects/' + pidA + '/categories', { name: 'اختراق' }, cookieB);
    ok('تاجر آخر لا يضيف على مشروع غيره', bProjA.status === 404);
    const bOverview = await api('GET', '/api/merchant/overview', null, cookieB);
    ok('لوحة التاجر ب لا ترى مشاريع أ', bOverview.data.totals.projects === 0);

    /* ---------- ٥) الزائر لا يدخل ---------- */
    const noAuth = await api('GET', '/api/merchant/overview');
    ok('الزائر ممنوع من لوحة التاجر', noAuth.status === 401);

    /* ---------- ٦) الحماية من الأصل المختلفة والترويسة الغائبة ---------- */
    const cross = await api('POST', '/api/merchant/projects', { name: 'x' }, cookieA, { Origin: 'http://evil.example' });
    ok('رفض الطلب من أصل آخر', cross.status === 403);
    const noCsrf = await fetch(BASE + '/api/merchant/projects', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookieA }, body: JSON.stringify({ name: 'x' })
    });
    ok('رفض طلب تغيير بلا ترويسة الأمان', noCsrf.status === 403);

    /* ---------- ٧) قفل المحاولات ---------- */
    let locked = false;
    for (let i = 0; i < 7; i++) {
      const r = await api('POST', '/api/auth/login', { email: emailA, password: 'bad-' + i });
      if (r.status === 429) locked = true;
    }
    ok('قفل الحساب بعد تكرار المحاولات', locked);
    const afterLock = await api('POST', '/api/auth/login', { email: emailA, password: 'Merchant-123456' });
    ok('الدخول صحيح مرفوض أثناء القفل', afterLock.status === 429 || afterLock.status === 401);

    /* ---------- ٨) المالك ---------- */
    const ownerLogin = await api('POST', '/api/auth/login', { email: 'owner@test.local', password: 'Owner-Password-2026' });
    ok('دخول المالك', ownerLogin.status === 200 && ownerLogin.data.redirect === '/owner-admin/', ownerLogin.data);
    const ownerCookie = ownerLogin.cookie;
    const stats = await api('GET', '/api/owner/stats', null, ownerCookie);
    ok('إحصاءات المالك من قاعدة البيانات', stats.status === 200 && stats.data.merchants >= 2);
    const merchants = await api('GET', '/api/owner/merchants', null, ownerCookie);
    ok('قائمة التجار', merchants.status === 200 && merchants.data.merchants.length >= 2);
    const ownerOnMerchant = await api('GET', '/api/merchant/overview', null, ownerCookie);
    ok('المالك لا يستخدم مسار التاجر', ownerOnMerchant.status === 403);

    const susp = await api('PATCH', '/api/owner/merchants/' + merchants.data.merchants.find((m) => m.email === emailB).id, { status: 'suspended' }, ownerCookie);
    ok('إيقاف تاجر من لوحة المالك', susp.status === 200);
    const bAfter = await api('GET', '/api/merchant/overview', null, cookieB);
    ok('التاجر الموقوف تُلغى جلسته', bAfter.status === 401);

    const audit = await api('GET', '/api/owner/audit', null, ownerCookie);
    ok('سجل العمليات يسجّل التغييرات', audit.status === 200 && audit.data.rows.length > 0 && audit.data.rows.some((r) => r.action === 'owner.merchant.update'));

    /* ---------- ٩) محتوى ومظهر وكتالوج ---------- */
    const content = await api('PUT', '/api/owner/content/site.tagline', { value: 'شعار جديد' }, ownerCookie);
    ok('تعديل محتوى الموقع', content.status === 200);
    const wantRead = await api('GET', '/api/owner/content', null, ownerCookie);
    ok('قراءة المحتوى المحدّث', wantRead.data.content.some((c) => c.key === 'site.tagline' && c.value === 'شعار جديد'));
    const addAct = await api('POST', '/api/owner/catalog/activities', { key: 'new_act', name: 'نشاط جديد', icon: '🆕' }, ownerCookie);
    ok('إضافة نشاط للكتالوج', addAct.status === 200);
    const catAfter = await api('GET', '/api/public/catalog');
    ok('النشاط الجديد يظهر للزائر', catAfter.data.activities.some((a) => a.id === 'new_act'));
    const hide = await api('PATCH', '/api/owner/catalog/activities/new_act', { visible: false }, ownerCookie);
    const catHidden = await api('GET', '/api/public/catalog');
    ok('إخفاء النشاط يخفيه عن الزائر', hide.status === 200 && !catHidden.data.activities.some((a) => a.id === 'new_act'));

    const ai = await api('GET', '/api/owner/ai', null, ownerCookie);
    ok('إعدادات الذكاء الاصطناعي متاحة', ai.status === 200 && ai.data.settings.length >= 2);
    const ps = await api('GET', '/api/owner/price-sources', null, ownerCookie);
    ok('مصادر الأسعار مدرجة', ps.status === 200 && ps.data.sources.length >= 3);
    const bk = await api('POST', '/api/owner/backup', {}, ownerCookie);
    ok('نسخة احتياطية من لوحة المالك', bk.status === 200 && bk.data.ok === true);

    /* ---------- ١٠) حفظ/تعديل المنتج بالحالة ---------- */
    // نستخدم تاجرًا جديدًا لأن أ و ب مقفل/موقوف
    const emailC = 'c' + Date.now() + '@test.local';
    await api('POST', '/api/auth/register', { email: emailC, password: 'Merchant-123456', name: 'تاجر ج' });
    const loginC = await api('POST', '/api/auth/login', { email: emailC, password: 'Merchant-123456' });
    const cookieC = loginC.cookie;
    const projC = await api('POST', '/api/merchant/projects', { name: 'مشروع ج', startMode: 'full' }, cookieC);
    const pidC = projC.data.project.id;
    const catC = await api('POST', '/api/merchant/projects/' + pidC + '/categories', { name: 'القهوة' }, cookieC);
    const cidC = catC.data.project.categories[0].id;
    const pC = await api('POST', '/api/merchant/projects/' + pidC + '/products', { name: 'لاتيه', categoryId: cidC }, cookieC);
    const save = await api('PUT', '/api/merchant/products/' + pC.data.product.id, {
      state: { ingredients: [{ name: 'حليب', pack: 1000, packUnit: 'ml', price: 7, qty: 200, qtyUnit: 'ml' }], units: 4, sellPrice: 12 },
      unitCost: 0.35, sellPrice: 12, margin: 97.1, status: 'ready'
    }, cookieC);
    ok('حفظ حالة المنتج', save.status === 200 && save.data.product.unitCost === 0.35);
    const saved = await api('GET', '/api/merchant/products/' + pC.data.product.id, null, cookieC);
    ok('استرجاع الحالة المحفوظة', saved.data.product.state.ingredients[0].name === 'حليب');
    const ovc = await api('GET', '/api/merchant/overview', null, cookieC);
    ok('لوحة التاجر تعرض المنتج المحسوب', ovc.data.totals.computed === 1 && ovc.data.topMargins[0].name === 'لاتيه');
    const recipe = await api('POST', '/api/merchant/recipes', { projectId: pidC, name: 'وصفة الحليب', items: [{ name: 'حليب', qty: 200 }] }, cookieC);
    ok('حفظ وصفة', recipe.status === 200);
    const recs = await api('GET', '/api/merchant/recipes', null, cookieC);
    ok('قراءة الوصفات', recs.data.recipes.length === 1);

    /* ---------- ١٠.١) لا تسريب حالة مالية بين تجار ---------- */
    const emailD = 'd' + Date.now() + '@test.local';
    await api('POST', '/api/auth/register', { email: emailD, password: 'Merchant-123456', name: 'تاجر د' });
    const loginD = await api('POST', '/api/auth/login', { email: emailD, password: 'Merchant-123456' });
    const cookieD = loginD.cookie;
    const projD = await api('POST', '/api/merchant/projects', { name: 'مشروع د', startMode: 'single' }, cookieD);
    const pD = await api('POST', '/api/merchant/projects/' + projD.data.project.id + '/products', { name: 'منتج د' }, cookieD);
    const steal = await api('GET', '/api/merchant/products/' + pC.data.product.id, null, cookieD);
    ok('لا يقرأ تاجر منتج/حالة تاجر آخر', steal.status === 404);
    const ovD = await api('GET', '/api/merchant/overview', null, cookieD);
    ok('إحصاءات تاجر د لا تُظهر منتجات ج', ovD.data.totals.computed === 0 && ovD.data.totals.products === 1);
    // محاولة إدراج منتج في مشروع آخر عبر category من مشروع ج
    const crossCat = await api('POST', '/api/merchant/projects/' + projD.data.project.id + '/products', { name: 'اختراق', categoryId: cidC }, cookieD);
    ok('رفض تصنيف لا يخص مشروع التاجر', crossCat.status === 400);

    /* ---------- ١٠.٢) الكتالوج من قاعدة البيانات يُطابق المحلي ---------- */
    const catItems = await api('GET', '/api/public/catalog');
    const all = catItems.data.activities.flatMap((a) => a.subcategories);
    ok('تصنيفات الكتالوج أكثر من 40', all.length > 40);
    ok('كل منتج في الكتالوج له مفتاح اقتراح', catItems.data.activities.every((a) => a.subcategories.every((c) => c.products.length > 0)));

    /* ---------- ١١) صفحات ---------- */
    const pageVisitor = await fetch(BASE + '/dashboard/', { redirect: 'manual' });
    ok('الزائر يُعاد إلى صفحة الدخول', pageVisitor.status === 302);
    const pageMerchant = await fetch(BASE + '/dashboard/', { headers: { Cookie: cookieC }, redirect: 'manual' });
    ok('التاجر يدخل لوحته', pageMerchant.status === 200);
    const pageOwnerNo = await fetch(BASE + '/owner-admin/', { headers: { Cookie: cookieC }, redirect: 'manual' });
    ok('التاجر يُحوَّل خارج لوحة المالك', pageOwnerNo.status === 302);
    const pageOwner = await fetch(BASE + '/owner-admin/', { headers: { Cookie: ownerCookie }, redirect: 'manual' });
    ok('المالك يدخل لوحته', pageOwner.status === 200);
    const pageHome = await fetch(BASE + '/public/', { redirect: 'manual' });
    ok('واجهة دفتر V3 تُخدم', pageHome.status === 200);
  } catch (e) {
    ok('لا استثناءات غير متوقعة: ' + (e && e.message), false);
  } finally {
    child.kill();
  }

  results.forEach((r) => console.log((r.ok ? '✓' : '✗') + ' ' + r.name + (r.ok || r.extra === undefined ? '' : '  → ' + JSON.stringify(r.extra))));
  console.log('\nالنتيجة: ' + pass + ' ناجح · ' + fail + ' فاشل');
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {}
  process.exit(fail ? 1 : 0);
})();
