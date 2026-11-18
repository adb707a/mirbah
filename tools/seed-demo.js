'use strict';
/**
 * بيانات تجريبية اختيارية (ليست جزءًا من النظام):
 *   node tools/seed-demo.js
 * تنشئ حساب تاجر تجريبي ومشروعًا ومنتجاته عبر واجهة API الحقيقية
 * (نفس المسار الذي يستخدمه المستخدم) — لتجربة اللوحات قبل تسجيل حسابك.
 */
const H = { 'Content-Type': 'application/json', 'X-Requested-With': 'mirbah' };
const BASE = 'http://localhost:' + (process.env.PORT || 8788);
const EMAIL = process.env.DEMO_EMAIL || 'demo@mirbah.local';
const PASS = process.env.DEMO_PASSWORD || 'Demo-Trader-2026';

async function api(method, p, body, cookie) {
  const res = await fetch(BASE + p, {
    method,
    headers: Object.assign({}, H, cookie ? { Cookie: cookie } : {}),
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, data, cookie: (res.headers.get('set-cookie') || '').split(';')[0] };
}

(async () => {
  const health = await fetch(BASE + '/api/health').then((r) => r.json()).catch(() => null);
  if (!health || !health.ok) { console.error('شغّل الخادم أولًا: npm start'); process.exit(1); }

  let reg = await api('POST', '/api/auth/register', { name: 'نورة القحطاني', email: EMAIL, password: PASS });
  if (reg.status === 409) console.log('الحساب التجريبي موجود سابقًا — سيُستخدم.');
  else if (reg.status !== 200) { console.error('تعذر إنشاء الحساب', reg.data); process.exit(1); }

  const login = await api('POST', '/api/auth/login', { email: EMAIL, password: PASS });
  if (login.status !== 200) { console.error('تعذر الدخول', login.data); process.exit(1); }
  const cookie = login.cookie;

  const existing = await api('GET', '/api/merchant/projects', null, cookie);
  if (existing.data.projects.length) {
    console.log('لدى الحساب التجريبي ' + existing.data.projects.length + ' مشروعًا — لن نكرر.');
    console.log('الدخول: ' + EMAIL + ' / ' + PASS);
    return;
  }

  const pj = await api('POST', '/api/merchant/projects', { name: 'كوكيز السعادة', activityKey: 'sweets', startMode: 'category' }, cookie);
  const pid = pj.data.project.id;
  const cats = {};
  for (const name of ['الكوكيز', 'الكيك']) {
    const c = await api('POST', '/api/merchant/projects/' + pid + '/categories', { name }, cookie);
    cats[name] = c.data.project.categories.find((x) => x.name === name).id;
  }
  const make = async (name, cat, state, cost, price, margin, status) => {
    const p = await api('POST', '/api/merchant/projects/' + pid + '/products', { name, categoryId: cats[cat] }, cookie);
    await api('PUT', '/api/merchant/products/' + p.data.product.id, { state, unitCost: cost, sellPrice: price, margin, status }, cookie);
  };
  await make('كوكيز شوكولاتة', 'الكوكيز', {
    ingredients: [
      { name: 'دقيق', pack: 1000, packUnit: 'g', price: 6, qty: 500, qtyUnit: 'g' },
      { name: 'سكر', pack: 2000, packUnit: 'g', price: 12, qty: 200, qtyUnit: 'g' },
      { name: 'زبدة', pack: 500, packUnit: 'g', price: 25, qty: 150, qtyUnit: 'g' },
      { name: 'شوكولاتة', pack: 1000, packUnit: 'g', price: 45, qty: 200, qtyUnit: 'g' }
    ], units: 20, sellPrice: 8.5
  }, 1.86, 8.5, 78.1, 'ready');
  await make('كوكيز لوتس', 'الكوكيز', {
    ingredients: [
      { name: 'دقيق', pack: 1000, packUnit: 'g', price: 6, qty: 500, qtyUnit: 'g' },
      { name: 'زبدة لوتس', pack: 400, packUnit: 'g', price: 38, qty: 120, qtyUnit: 'g' }
    ], units: 18, sellPrice: 9
  }, 2.1, 9, 76.7, 'ready');
  await make('كيك عسل', 'الكيك', {
    ingredients: [
      { name: 'دقيق', pack: 1000, packUnit: 'g', price: 6, qty: 300, qtyUnit: 'g' },
      { name: 'عسل', pack: 500, packUnit: 'ml', price: 55, qty: 100, qtyUnit: 'ml' }
    ], units: 6, sellPrice: 28
  }, 4.3, 28, 84.6, 'ready');
  await make('كوكيز فستق', 'الكوكيز', { ingredients: [], units: 0, sellPrice: 0 }, null, null, null, 'draft');

  console.log('\nتم. الدخول إلى لوحة التاجر:');
  console.log('  الرابط: ' + BASE + '/login/');
  console.log('  البريد: ' + EMAIL);
  console.log('  كلمة المرور: ' + PASS);
})().catch((e) => { console.error(e); process.exit(1); });
