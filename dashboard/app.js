/* =============================================================
   لوحة التاجر — تطبيق صفحة واحدة (SPA خفيف بلا تبعيات)
   كل بياناتها من /api/merchant/* ومحصورة بمشاريع صاحب الجلسة.
   ============================================================= */
(function () {
  'use strict';
  const E = MB.esc;
  const $ = (s) => document.querySelector(s);
  const view = document.getElementById('view');
  const navEl = document.getElementById('nav');
  const nav = document.getElementById('nav');

  const state = {
    user: null,
    overview: null,
    projects: [],
    route: { page: 'home', params: {} },
    activities: []
  };

  const ROUTES = [
    { id: 'home', label: 'نظرة عامة', href: '#/' },
    { id: 'projects', label: 'المشاريع', href: '#/projects' },
    { id: 'products', label: 'المنتجات', href: '#/products' },
    { id: 'recipes', label: 'الوصفات', href: '#/recipes' },
    { id: 'settings', label: 'الحساب', href: '#/settings' }
  ];

  function renderNav() {
    navEl.innerHTML = ROUTES.map((r) =>
      `<a href="${r.href}" class="${state.route.page === r.id ? 'on' : ''}">${r.label}</a>`).join('');
  }

  /* ---------- التنقل ---------- */
  function parseHash() {
    const h = (location.hash || '#/').replace(/^#\/?/, '');
    const [page, ...rest] = h.split('/');
    return { page: page || 'home', params: rest };
  }

  async function route() {
    state.route = parseHash();
    renderNav();
    view.innerHTML = '<p class="loading">جارٍ التحميل…</p>';
    try {
      if (state.route.page === 'projects') await viewProjects();
      else if (state.route.page === 'project') await viewProject(state.route.params[0]);
      else if (state.route.page === 'product') await viewProduct(state.route.params[0]);
      else if (state.route.page === 'products') await viewAllProducts();
      else if (state.route.page === 'recipes') await viewRecipes();
      else if (state.route.page === 'settings') await viewSettings();
      else await viewHome();
    } catch (e) {
      view.innerHTML = `<div class="empty"><b>تعذّر التحميل</b>${E(e.message)}</div>`;
    }
  }

  /* ---------- نظرة عامة ---------- */
  async function viewHome() {
    const q = new URLSearchParams(location.search);
    const o = await MB.get('/api/merchant/overview');
    state.overview = o;
    const setupNeeded = o.projects.length === 0;
    // إعداد أول مرة: نعرض الخطوات، ونتجاهل أي مسار آخر حتى إنشاء المشروع
    if (setupNeeded && (q.get('setup') === '1' || (location.hash || '').indexOf('setup') > -1) && location.hash !== '#/home') {
      return viewSetup();
    }
    const t = o.totals;
    view.innerHTML = `
      <h1 class="pg">مساء الخير، ${E(o.user.name || '')}</h1>
      <p class="lede">هذه مساحة مشروعك: تصنيفاتك، منتجاتك، وتكلفة كل واحد منها.</p>

      ${setupNeeded ? `<div class="banner">
        <div><h2>لم تنشئ مشروعك بعد</h2><p>ثلاث خطوات: نوع المنشأة، اسم المشروع، ثم طريقة البدء.</p></div>
        <button class="btn" id="startSetup">ابدأ إعداد المشروع</button>
      </div>` : ''}

      <div class="grid g4">
        <div class="card"><p class="kpi-label">المشاريع</p><p class="big">${t.projects}</p><span class="sub">مشروع نشط</span></div>
        <div class="card"><p class="kpi-label">التصنيفات</p><p class="big">${t.categories}</p><span class="sub">تصنيفًا</span></div>
        <div class="card"><p class="kpi-label">المنتجات</p><p class="big">${t.products}</p><span class="sub">${t.computed} منها محسوب</span></div>
        <div class="card"><p class="kpi-label">متوسط الهامش</p><p class="big">${t.avgMargin == null ? '—' : t.avgMargin + '%'}</p><span class="sub">${t.avgUnitCost == null ? 'لا تكاليف بعد' : 'متوسط التكلفة ' + MB.money(t.avgUnitCost)}</span></div>
      </div>

      <div class="grid g2" style="margin-top:12px">
        <div class="sheet">
          <div class="card" style="border:0;border-block-end:1px solid var(--rule);background:transparent"><h3>أعلى المنتجات هامشًا</h3><p class="sub">مرتّبة من الأفضل إلى الأقل</p></div>
          <dl class="rows">
            ${o.topMargins.length ? o.topMargins.map((p) => `<div><dt><a href="#/product/${p.id}" style="text-decoration:none;border-block-end:1px solid var(--clay)">${E(p.name)}</a></dt><dd>${p.margin}%</dd></div>`).join('') : '<div><dt>لا منتجات محسوبة بعد</dt><dd>—</dd></div>'}
          </dl>
        </div>
        <div class="sheet">
          <div class="card" style="border:0;border-block-end:1px solid var(--rule);background:transparent"><h3>تحتاج مراجعة</h3><p class="sub">مسودة أو بلا تكلفة</p></div>
          <dl class="rows">
            ${o.needsReview.length ? o.needsReview.map((p) => `<div><dt><a href="#/product/${p.id}" style="text-decoration:none;border-block-end:1px solid var(--clay)">${E(p.name)}</a></dt><dd>مراجعة</dd></div>`).join('') : '<div><dt>لا شيء متأخر</dt><dd>✓</dd></div>'}
          </dl>
        </div>
      </div>

      <div class="sheet" style="margin-top:12px">
        <div class="card" style="border:0;border-block-end:1px solid var(--rule);background:transparent"><h3>آخر ما عدّلته</h3></div>
        <table class="t"><thead><tr><th>المنتج</th><th>التحديث</th><th>الحالة</th><th></th></tr></thead><tbody>
          ${o.recent.length ? o.recent.map((p) => `<tr>
            <td>${E(p.name)}</td>
            <td class="num">${new Date(p.updatedAt).toLocaleDateString('ar-SA')}</td>
            <td><span class="tag ${p.status === 'ready' ? 'ready' : p.status === 'archived' ? 'arch' : 'draft'}">${p.status === 'ready' ? 'جاهز' : p.status === 'archived' ? 'مؤرشف' : 'مسودة'}</span></td>
            <td><a class="ghost" href="#/product/${p.id}">فتح</a></td>
          </tr>`).join('') : '<tr><td colspan="4" class="hint">لا تعديلات بعد.</td></tr>'}
        </tbody></table>
      </div>

      <div class="grid g2" style="margin-top:12px">
        <button class="choice" id="quickProduct"><b>＋ منتج جديد</b><small>أضف منتجًا داخل تصنيف ثم احسب تكلفته.</small></button>
        <button class="choice" id="quickCategory"><b>＋ تصنيف جديد</b><small>اجمع منتجاتك المتشابهة تحت تصنيف.</small></button>
      </div>
    `;
    const s = $('#startSetup'); if (s) s.addEventListener('click', () => { location.hash = '#/setup'; });
    const qp = $('#quickProduct'); if (qp) qp.addEventListener('click', () => { location.hash = '#/products'; });
    const qc = $('#quickCategory'); if (qc) qc.addEventListener('click', () => {
      const p = state.overview.projects[0];
      if (!p) { location.hash = '#/setup'; return; }
      location.hash = '#/project/' + p.id;
    });
    if (state.route.page === 'home' && location.hash === '#/setup') location.hash = '#/setup';
  }

  /* ---------- إعداد المشروع ---------- */
  async function viewSetup() {
    if (!state.activities.length) {
      const c = await MB.get('/api/public/catalog');
      state.activities = c.activities;
    }
    const q = new URLSearchParams(location.search);
    const step = Number(sessionStorage.getItem('setupStep') || (q.get('setup') === '1' ? 1 : 1));
    const draft = JSON.parse(sessionStorage.getItem('setupDraft') || '{}');
    nav.innerHTML = '';
    const steps = ['نوع المنشأة', 'اسم المشروع', 'طريقة البدء'];
    view.innerHTML = `
      <h1 class="pg">إعداد مشروعك</h1>
      <p class="lede">خطوات قصيرة، ثم تبدأ التسعير داخل دفتر V3 كما تعرفه.</p>
      <div class="setup-steps">${steps.map((s, i) => `<span class="${i + 1 <= step ? 'on' : ''}">${i + 1}. ${s}</span>`).join('')}</div>
      <div class="sheet" style="padding:18px" id="setupBody"></div>
    `;
    const body = $('#setupBody');
    if (step === 1) {
      body.innerHTML = `
        <h3>ما نوع منشأتك؟</h3>
        <p class="hint">نحدّد لك بعدها اقتراحات المكونات المناسبة لكل نشاط.</p>
        <div class="choices" style="margin-top:10px">
          ${state.activities.map((a) => `<button class="choice ${draft.activityKey === a.id ? 'on' : ''}" data-act="${E(a.id)}"><b>${E(a.icon || '')} ${E(a.name)}</b><small>${a.subcategories.length} تصنيفًا</small></button>`).join('')}
        </div>`;
      body.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', () => {
        draft.activityKey = b.getAttribute('data-act');
        sessionStorage.setItem('setupDraft', JSON.stringify(draft));
        sessionStorage.setItem('setupStep', '2');
        viewSetup();
      }));
    } else if (step === 2) {
      body.innerHTML = `
        <h3>ما اسم مشروعك؟</h3>
        <p class="hint">هذا الاسم يظهر في لوحتك وفي مِرباح للتاجر.</p>
        <label class="ld" for="pjName">اسم المشروع</label>
        <input class="input" id="pjName" value="${E(draft.name || '')}" placeholder="مثال: كوكيز السعادة" />
        <div style="display:flex;gap:8px;margin-top:14px">
          <button class="btn" id="next2" ${!draft.activityKey ? 'disabled' : ''}>التالي</button>
          <button class="ghost" id="back1">→ رجوع</button>
        </div>`;
      $('#back1').addEventListener('click', () => { sessionStorage.setItem('setupStep', '1'); viewSetup(); });
      $('#next2').addEventListener('click', () => {
        const v = $('#pjName').value.trim();
        if (v.length < 2) { MB.toast('اكتب اسمًا للمشروع', 'bad'); return; }
        draft.name = v;
        sessionStorage.setItem('setupDraft', JSON.stringify(draft));
        sessionStorage.setItem('setupStep', '3');
        viewSetup();
      });
    } else {
      const modes = [
        { id: 'single', t: 'أريد تجربة منتج واحد', d: 'ابدأ بمنتج واحد بسرعة واحسب تكلفته.' },
        { id: 'category', t: 'أريد البدء بتصنيف واحد', d: 'تصنيف مثل «الكوكيز» ثم أضف تحته عدة منتجات.' },
        { id: 'full', t: 'أريد إنشاء مشروعي بالكامل', d: 'عدة تصنيفات ومنتجات منذ البداية.' }
      ];
      body.innerHTML = `
        <h3>كيف تريد البدء؟</h3>
        <p class="hint">يمكنك لاحقًا إضافة تصنيفات ومنتجات بحرية — هذا اختيار البداية فقط.</p>
        <div class="choices" style="margin-top:10px">
          ${modes.map((m) => `<button class="choice ${draft.mode === m.id ? 'on' : ''}" data-mode="${m.id}"><b>${m.t}</b><small>${m.d}</small></button>`).join('')}
        </div>
        <div style="display:flex;gap:8px;margin-top:14px">
          <button class="btn" id="finish" disabled>أنشئ المشروع</button>
          <button class="ghost" id="back2">→ رجوع</button>
        </div>`;
      body.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => {
        draft.mode = b.getAttribute('data-mode');
        sessionStorage.setItem('setupDraft', JSON.stringify(draft));
        body.querySelectorAll('[data-mode]').forEach((x) => x.classList.toggle('on', x === b));
        $('#finish').disabled = false;
      }));
      $('#back2').addEventListener('click', () => { sessionStorage.setItem('setupStep', '2'); viewSetup(); });
      $('#finish').addEventListener('click', async () => {
        $('#finish').disabled = true;
        try {
          const r = await MB.post('/api/merchant/projects', { name: draft.name, activityKey: draft.activityKey, startMode: draft.mode });
          sessionStorage.removeItem('setupStep'); sessionStorage.removeItem('setupDraft');
          await loadAll();
          location.href = '/public/?project=' + encodeURIComponent(r.project.id) + '&start=1';
        } catch (e) { MB.toast(e.message, 'bad'); $('#finish').disabled = false; }
      });
      if (draft.mode) $('#finish').disabled = false;
    }
  }

  /* ---------- المشاريع ---------- */
  async function viewProjects() {
    const r = await MB.get('/api/merchant/projects');
    state.projects = r.projects;
    const cards = r.projects.map((p) => {
      const prods = p.categories.reduce((a, c) => a + c.products.length, 0) + p.products.length;
      return `<div class="card">
        <h3>${E(p.name)}</h3>
        <p class="sub">${p.categories.length} تصنيفًا · ${prods} منتجًا</p>
        <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap">
          <a class="btn" href="#/project/${p.id}">فتح</a>
          <a class="ghost" href="/public/?project=${encodeURIComponent(p.id)}">حاسبة الدفتر</a>
        </div>
      </div>`;
    }).join('');
    view.innerHTML = `
      <h1 class="pg">المشاريع</h1>
      <p class="lede">كل مشروع مساحة مستقلة في حسابك.</p>
      <div class="grid g3">${cards || ''}
        <button class="choice" id="newProj" style="min-height:120px"><b>＋ مشروع جديد</b><small>يبدأان من شجرة الأنشطة نفسها.</small></button>
      </div>
      ${r.projects.length === 0 ? '' : ''}
    `;
    $('#newProj').addEventListener('click', () => { sessionStorage.setItem('setupStep', '1'); location.href = '/dashboard/?setup=1#/setup'; });
    if (location.hash === '#/setup') return viewSetup();
  }

  async function viewProject(pid) {
    if (!pid) return viewProjects();
    const r = await MB.get('/api/merchant/projects');
    const p = r.projects.find((x) => x.id === pid);
    if (!p) { view.innerHTML = '<div class="empty"><b>مشروع غير موجود</b></div>'; return; }
    const all = p.categories.concat([{ id: '', name: 'بدون تصنيف', products: p.products }]);
    view.innerHTML = `
      <h1 class="pg">${E(p.name)}</h1>
      <p class="lede">${p.categories.length} تصنيفًا · ${all.reduce((a, c) => a + c.products.length, 0)} منتجًا</p>
      <div class="split">
        <div class="side">
          ${all.map((c) => `<div class="cat">
            <header><b>${E(c.name)}</b><span class="n">${c.products.length}</span>
              ${c.id ? `<button class="ghost" data-rename="${c.id}" data-name="${E(c.name)}" title="تعديل">✎</button>` : ''}
            </header>
            ${c.id ? `<ul>${c.products.map((x) => `<li><a href="#/product/${x.id}">${E(x.name)} <em>${x.sell_price != null ? MB.num(x.sell_price).toFixed(0) : ''}</em></a></li>`).join('') || '<li class="hint" style="padding:6px 12px">لا منتجات</li>'}</ul>` : ''}
          </div>`).join('')}
          <button class="choice" id="newCat" style="width:100%"><b>＋ تصنيف جديد</b><small>مثال: الحلويات، القهوة…</small></button>
        </div>
        <div>
          <div class="card">
            <h3>إضافة منتج</h3>
            <p class="sub">اختر التصنيف ثم اكتب اسم المنتج، وننقلك إلى حاسبة الدفتر.</p>
            <div style="display:grid;grid-template-columns:1fr 1fr auto;gap:8px;margin-top:8px" class="addp">
              <div><label class="ld">التصنيف</label><select class="input" id="pCat">${p.categories.map((c) => `<option value="${c.id}">${E(c.name)}</option>`).join('')}</select></div>
              <div><label class="ld">اسم المنتج</label><input class="input" id="pName" placeholder="مثال: كوكيز لوتس" /></div>
              <div style="display:flex;align-items:flex-end"><button class="btn" id="addProduct">إضافة</button></div>
            </div>
          </div>
          <div class="sheet" style="margin-top:12px">
            <table class="t"><thead><tr><th>المنتج</th><th>التصنيف</th><th>التكلفة</th><th>السعر</th><th>الهامش</th><th></th></tr></thead><tbody>
              ${p.categories.flatMap((c) => c.products.map((x) => ({ ...x, catName: c.name })))
                .concat(p.products.map((x) => ({ ...x, catName: '—' })))
                .map((x) => `<tr>
                  <td>${E(x.name)}</td><td class="hint">${E(x.catName)}</td>
                  <td class="num">${x.unitCost == null ? '—' : MB.money(x.unitCost)}</td>
                  <td class="num">${x.sellPrice == null ? '—' : MB.money(x.sellPrice)}</td>
                  <td class="num">${x.margin == null ? '—' : x.margin + '%'}</td>
                  <td><a class="ghost" href="#/product/${x.id}">حساب</a></td>
                </tr>`).join('') || '<tr><td colspan="6" class="hint">لا منتجات بعد.</td></tr>'}
            </tbody></table>
          </div>
        </div>
      </div>`;
    $('#newCat').addEventListener('click', async () => {
      const name = prompt('اسم التصنيف الجديد:');
      if (!name) return;
      try { await MB.post('/api/merchant/projects/' + pid + '/categories', { name }); route(); } catch (e) { MB.toast(e.message, 'bad'); }
    });
    view.querySelectorAll('[data-rename]').forEach((b) => b.addEventListener('click', async () => {
      const id = b.getAttribute('data-rename');
      const cur = b.getAttribute('data-name');
      const name = prompt('اسم التصنيف:', cur);
      if (!name || name === cur) return;
      try { await MB.patch('/api/merchant/categories/' + id, { name }); route(); } catch (e) { MB.toast(e.message, 'bad'); }
    }));
    $('#addProduct').addEventListener('click', async () => {
      const name = $('#pName').value.trim();
      if (!name) { MB.toast('اكتب اسم المنتج', 'bad'); return; }
      try {
        const rr = await MB.post('/api/merchant/projects/' + pid + '/products', { name, categoryId: $('#pCat').value });
        location.href = '/public/?project=' + encodeURIComponent(pid) + '&product=' + encodeURIComponent(rr.product.id) + '&start=1';
      } catch (e) { MB.toast(e.message, 'bad'); }
    });
  }

  /* ---------- كل المنتجات ---------- */
  async function viewAllProducts() {
    const r = await MB.get('/api/merchant/projects');
    state.projects = r.projects;
    const rows = [];
    r.projects.forEach((p) => {
      p.categories.forEach((c) => c.products.forEach((x) => rows.push({ ...x, project: p.name, cat: c.name })));
      p.products.forEach((x) => rows.push({ ...x, project: p.name, cat: '—' }));
    });
    view.innerHTML = `
      <h1 class="pg">كل المنتجات</h1>
      <p class="lede">${rows.length} منتجًا عبر ${r.projects.length} مشروعًا.</p>
      <div class="sheet">
        <table class="t"><thead><tr><th>المنتج</th><th>المشروع</th><th>التصنيف</th><th>التكلفة</th><th>السعر</th><th>الهامش</th><th>الحالة</th><th></th></tr></thead><tbody>
          ${rows.map((x) => `<tr>
            <td>${E(x.name)}</td><td class="hint">${E(x.project)}</td><td class="hint">${E(x.cat)}</td>
            <td class="num">${x.unitCost == null ? '—' : MB.money(x.unitCost)}</td>
            <td class="num">${x.sellPrice == null ? '—' : MB.money(x.sellPrice)}</td>
            <td class="num">${x.margin == null ? '—' : x.margin + '%'}</td>
            <td><span class="tag ${x.status === 'ready' ? 'ready' : x.status === 'archived' ? 'arch' : 'draft'}">${x.status === 'ready' ? 'جاهز' : x.status === 'archived' ? 'مؤرشف' : 'مسودة'}</span></td>
            <td><a class="ghost" href="#/product/${x.id}">فتح</a></td>
          </tr>`).join('') || '<tr><td colspan="8" class="hint">لا منتجات بعد — أنشئ مشروعًا وأضف منتجًا.</td></tr>'}
        </tbody></table>
      </div>`;
  }

  /* ---------- صفحة المنتج ---------- */
  async function viewProduct(id) {
    const r = await MB.get('/api/merchant/products/' + id);
    const p = r.product;
    const st = p.state || {};
    const ing = Array.isArray(st.ingredients) ? st.ingredients : [];
    view.innerHTML = `
      <h1 class="pg">${E(p.name)}</h1>
      <p class="lede">${E(p.projectName)} · ${ing.length} مكوّنًا مسجلًا</p>
      <div class="grid g4">
        <div class="card"><p class="kpi-label">تكلفة الوحدة</p><p class="big">${p.unitCost == null ? '—' : MB.money(p.unitCost)}</p></div>
        <div class="card"><p class="kpi-label">سعر البيع</p><p class="big">${p.sellPrice == null ? '—' : MB.money(p.sellPrice)}</p></div>
        <div class="card"><p class="kpi-label">الهامش</p><p class="big">${p.margin == null ? '—' : p.margin + '%'}</p></div>
        <div class="card"><p class="kpi-label">الحالة</p><p class="big"><span class="tag ${p.status === 'ready' ? 'ready' : p.status === 'archived' ? 'arch' : 'draft'}">${p.status === 'ready' ? 'جاهز' : p.status === 'archived' ? 'مؤرشف' : 'مسودة'}</span></p></div>
      </div>

      <div class="sheet" style="margin-top:12px">
        <table class="t"><thead><tr><th>المكوّن</th><th>المشتري</th><th>سعر العبوة</th><th>المستخدم</th><th>تكلفة الاستخدام</th></tr></thead><tbody>
          ${ing.map((x) => {
            const pack = Number(x.pack) || 0, qty = Number(x.qty) || 0, price = Number(x.price) || 0;
            const unitP = x.packUnit || 'g', unitQ = x.qtyUnit || unitP;
            const ratio = pack > 0 ? qty / pack : 0;
            const cost = Math.round(price * ratio * 100) / 100;
            return `<tr><td>${E(x.name || '—')}</td><td class="num">${pack} ${E(unitP)}</td><td class="num">${MB.money(price)}</td><td class="num">${qty} ${E(unitQ)}</td><td class="num">${MB.money(cost)}</td></tr>`;
          }).join('') || '<tr><td colspan="5" class="hint">لم تُسجّل مكونات في الحاسبة بعد.</td></tr>'}
        </tbody></table>
      </div>

      <div style="display:flex;gap:8px;margin-top:14px;flex-wrap:wrap">
        <a class="btn" href="/public/?project=${encodeURIComponent(p.projectId)}&product=${encodeURIComponent(p.id)}&start=1">افتح في حاسبة الدفتر</a>
        <button class="ghost" id="mStatus">تعيين كجاهز</button>
        <button class="ghost" id="mArchive">أرشفة</button>
        <button class="ghost" id="mDelete" style="color:var(--bad);border-color:var(--bad)">حذف</button>
      </div>`;
    $('#mStatus').addEventListener('click', async () => {
      try { await MB.put('/api/merchant/products/' + p.id, { status: p.status === 'ready' ? 'draft' : 'ready' }); route(); } catch (e) { MB.toast(e.message, 'bad'); }
    });
    $('#mArchive').addEventListener('click', async () => {
      try { await MB.put('/api/merchant/products/' + p.id, { status: p.status === 'archived' ? 'draft' : 'archived' }); route(); } catch (e) { MB.toast(e.message, 'bad'); }
    });
    $('#mDelete').addEventListener('click', async () => {
      if (!confirm('حذف المنتج نهائيًا؟')) return;
      try { await MB.del('/api/merchant/products/' + p.id); location.hash = '#/products'; } catch (e) { MB.toast(e.message, 'bad'); }
    });
  }

  /* ---------- الوصفات ---------- */
  async function viewRecipes() {
    const r = await MB.get('/api/merchant/recipes');
    const pr = await MB.get('/api/merchant/projects');
    view.innerHTML = `
      <h1 class="pg">الوصفات</h1>
      <p class="lede">اجمع مكونات منتج لتعيد استخدامها في منتج آخر.</p>
      <div class="sheet" style="padding:16px">
        <h3 style="margin:0 0 8px;font-family:Rubik;font-weight:500;font-size:.96rem">وصفة جديدة</h3>
        <div style="display:grid;grid-template-columns:1fr 1fr auto;gap:8px" class="addp">
          <div><label class="ld">المشروع</label>
            <select class="input" id="rProj">${pr.projects.map((x) => `<option value="${x.id}">${E(x.name)}</option>`).join('')}</select>
          </div>
          <div><label class="ld">اسم الوصفة</label><input class="input" id="rName" placeholder="مثال: أساس الكوكيز" /></div>
          <div style="display:flex;align-items:flex-end"><button class="btn" id="rAdd">حفظ</button></div>
        </div>
        <p class="hint">تُحفظ كقائمة مكونات أساسية (أحجام وأسعار تُعاد عند الإضافة).</p>
      </div>
      <div class="sheet" style="margin-top:12px">
        <table class="t"><thead><tr><th>الوصفة</th><th>المكونات</th><th>التاريخ</th></tr></thead><tbody>
          ${r.recipes.map((x) => `<tr><td>${E(x.name)}</td><td class="num">${x.items.length}</td><td class="num">${new Date(x.createdAt).toLocaleDateString('ar-SA')}</td></tr>`).join('') || '<tr><td colspan="3" class="hint">لا وصفات بعد.</td></tr>'}
        </tbody></table>
      </div>`;
    $('#rAdd').addEventListener('click', async () => {
      const name = $('#rName').value.trim();
      if (!name) { MB.toast('اكتب اسم الوصفة', 'bad'); return; }
      try {
        await MB.post('/api/merchant/recipes', { projectId: $('#rProj').value, name, items: [{ note: 'مكوّن أجري لاحقًا' }] });
        route();
      } catch (e) { MB.toast(e.message, 'bad'); }
    });
  }

  /* ---------- الحساب ---------- */
  async function viewSettings() {
    view.innerHTML = `
      <h1 class="pg">الحساب</h1>
      <p class="lede">بياناتك وراحتك في الأمان.</p>
      <div class="grid g2">
        <div class="card">
          <h3>كلمة المرور</h3>
          <p class="sub">٨ أحرف على الأقل. ستُسجَّل العملية في سجل الأمان.</p>
          <label class="ld">كلمة المرور الحالية</label><input class="input" id="pwCur" type="password" />
          <label class="ld">الجديدة</label><input class="input" id="pwNew" type="password" />
          <button class="btn" id="pwSave" style="margin-top:10px">تحديث</button>
        </div>
        <div class="card">
          <h3>عن الحساب</h3>
          <dl class="rows">
            <div><dt>الاسم</dt><dd>${E(state.user.name)}</dd></div>
            <div><dt>البريد</dt><dd dir="ltr">${E(state.user.email)}</dd></div>
            <div><dt>الدور</dt><dd>تاجر</dd></div>
          </dl>
          <p class="hint">حسابك لا يمنح أي صلاحية إدارية على المنصة.</p>
        </div>
      </div>`;
    $('#pwSave').addEventListener('click', async () => {
      try {
        await MB.post('/api/auth/password', { current: $('#pwCur').value, next: $('#pwNew').value });
        MB.toast('تم تحديث كلمة المرور', 'ok');
        $('#pwCur').value = ''; $('#pwNew').value = '';
      } catch (e) { MB.toast(e.message, 'bad'); }
    });
  }

  /* ---------- تشغيل ---------- */
  async function loadAll() {
    const r = await MB.get('/api/merchant/projects');
    state.projects = r.projects;
    return r;
  }

  async function boot() {
    try {
      const me = await MB.get('/api/auth/me');
      if (!me.user) { location.href = '/login/?next=/dashboard/'; return; }
      if (me.user.role !== 'merchant') { location.href = '/owner-admin/'; return; }
      state.user = me.user;
      document.getElementById('whoText').textContent = me.user.name;
      await route();
    } catch (e) {
      view.innerHTML = '<div class="empty"><b>تعذّر الدخول</b>' + E(e.message) + '</div>';
    }
  }

  document.getElementById('logout').addEventListener('click', async () => {
    try { await MB.post('/api/auth/logout', {}); } catch (e) {}
    location.href = '/login/';
  });
  window.addEventListener('hashchange', () => {
    if ((location.hash || '#/').replace(/^#\/?/, '') === 'setup') return viewSetup();
    route();
  });
  boot();
})();
