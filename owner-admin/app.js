/* =============================================================
   إدارة المنصة — تطبيق المالك (SPA خفيف)
   إضافة قسم جديد = module واحد + سطر في SECTIONS.
   كل استدعاء يذهب إلى /api/owner/* ويتحقق الخادم من الدور.
   ============================================================= */
(function () {
  'use strict';
  const E = MB.esc;
  const $ = (s, r) => (r || document).querySelector(s);
  const view = $('#view');
  const nav = document.getElementById('nav');
  const titleEl = $('#title');
  const crumbEl = $('#crumb');
  const headActions = $('#headActions');

  const state = { user: null, section: 'stats' };

  function setHead(sec) {
    const s = SECTIONS.find((x) => x.id === sec) || SECTIONS[0];
    titleEl.textContent = s.title;
    crumbEl.textContent = s.crumb;
    headActions.innerHTML = '';
  }

  /* ---------- السجل ---------- */
  const SECTIONS = [
    { group: 'المنصة', id: 'stats', label: 'الإحصاءات', icon: '01', mount: viewStats, title: 'لوحة المنصة', crumb: 'الإحصاءات العامة' },
    { group: 'الأشخاص', id: 'merchants', label: 'التجار', icon: '02', mount: viewMerchants, title: 'التجار', crumb: 'الحسابات' },
    { group: 'الكتالوج', id: 'catalog', label: 'الأنشطة والتصنيفات', icon: '03', mount: viewCatalog, title: 'الأنشطة والتصنيفات', crumb: 'الكتالوج' },
    { group: 'الكتالوج', id: 'suggestions', label: 'اقتراحات المكونات', icon: '04', mount: viewSuggestions, title: 'اقتراحات المكونات', crumb: 'الكتالوج' },
    { group: 'الكتالوج', id: 'library', label: 'مكتبة المكونات', icon: '05', mount: viewLibrary, title: 'مكتبة المكونات', crumb: 'الكتالوج' },
    { group: 'التشغيل', id: 'ai', label: 'الذكاء الاصطناعي', icon: '06', mount: viewAi, title: 'الذكاء الاصطناعي', crumb: 'التشغيل' },
    { group: 'التشغيل', id: 'prices', label: 'فحص الأسعار', icon: '07', mount: viewPrices, title: 'فحص الأسعار', crumb: 'التشغيل' },
    { group: 'المحتوى', id: 'content', label: 'المحتوى والإعلانات', icon: '08', mount: viewContent, title: 'محتوى الموقع', crumb: 'المحتوى' },
    { group: 'المحتوى', id: 'theme', label: 'المظهر', icon: '09', mount: viewTheme, title: 'المظهر', crumb: 'المحتوى' },
    { group: 'الأمان', id: 'audit', label: 'سجل العمليات', icon: '10', mount: viewAudit, title: 'سجل العمليات', crumb: 'الأمان' },
    { group: 'الأمان', id: 'security', label: 'الأمان والنسخ', icon: '11', mount: viewSecurity, title: 'الأمان والنسخ الاحتياطي', crumb: 'الأمان' }
  ];

  function renderNav() {
    let lastGroup = '';
    nav.innerHTML = SECTIONS.map((s) => {
      const g = s.group !== lastGroup ? `<span class="sec">${E(s.group)}</span>` : '';
      lastGroup = s.group;
      return g + `<a href="#/${s.id}" class="${state.section === s.id ? 'on' : ''}"><span class="i">${s.icon}</span>${E(s.label)}</a>`;
    }).join('');
  }

  function setHead(sec) {
    const s = SECTIONS.find((x) => x.id === sec) || SECTIONS[0];
    titleEl.textContent = s.title;
    crumbEl.textContent = s.crumb;
    headActions.innerHTML = '';
  }

  async function route() {
    const id = (location.hash || '#/stats').replace(/^#\/?/, '') || 'stats';
    state.section = id;
    renderNav();
    setHead(id);
    view.innerHTML = '<p class="loading">جارٍ التحميل…</p>';
    const sec = SECTIONS.find((s) => s.id === id) || SECTIONS[0];
    try { await sec.mount(); } catch (e) {
      if (e.status === 401) { location.href = '/owner-login/'; return; }
      view.innerHTML = `<div class="notice bad">${E(e.message)}</div>`;
    }
  }

  /* ---------- 01 · الإحصاءات ---------- */
  async function viewStats() {
    const s = await MB.get('/api/owner/stats');
    const total = Math.max(1, s.activitiesInUse.reduce((a, x) => a + x.count, 0));
    view.innerHTML = `
      <div class="kpis">
        <div class="kpi"><p>إجمالي التجار</p><b>${s.merchants}</b><small>${s.newMerchants7d} جديدًا في ٧ أيام</small></div>
        <div class="kpi"><p>المشاريع</p><b>${s.projects}</b><small>${s.categories} تصنيفًا</small></div>
        <div class="kpi"><p>المنتجات</p><b>${s.products}</b><small>${s.computed} محسوب بالتكلفة</small></div>
        <div class="kpi"><p>استدعاءات الذكاء</p><b>${s.aiCalls}</b><small>${s.aiErrors} خطأ</small></div>
      </div>
      <div class="grid2" style="margin-top:10px">
        <div class="panel">
          <h2>الأنشطة الأكثر استخدامًا <small>حسب المشاريع</small></h2>
          <div class="pad stack">
            ${s.activitiesInUse.length ? s.activitiesInUse.map((a) => `<div>
              <div style="display:flex;justify-content:space-between;font-size:.78rem"><span>${E(a.key)}</span><span class="num">${a.count}</span></div>
              <div class="bar"><i style="width:${Math.round(a.count / total * 100)}%"></i></div>
            </div>`).join('') : '<p class="hint">لا مشاريع بعد.</p>'}
          </div>
        </div>
        <div class="panel">
          <h2>أحدث الحسابات</h2>
          <table class="t"><tbody>
            ${s.recentSignups.map((u) => `<tr><td>${E(u.name)}</td><td dir="ltr" class="hint">${E(u.email)}</td><td class="num">${new Date(u.created_at).toLocaleDateString('ar-SA')}</td></tr>`).join('') || '<tr><td class="hint">لا حسابات.</td></tr>'}
          </tbody></table>
        </div>
      </div>
      <div class="grid2" style="margin-top:10px">
        <div class="panel"><h2>الوصفات المحفوظة</h2><div class="pad"><b class="num" style="font-size:1.4rem">${s.recipes}</b><p class="hint">وصفة على مستوى المنصة</p></div></div>
        <div class="panel"><h2>عمليات إدارية مسجّلة</h2><div class="pad"><b class="num" style="font-size:1.4rem">${s.auditCount}</b><p class="hint">كل تغيير إداري له سطر</p></div></div>
      </div>`;
    headActions.innerHTML = `<a class="btn btn-line" href="#/audit">فتح السجل</a>`;
  }

  /* ---------- 02 · التجار ---------- */
  async function viewMerchants() {
    view.innerHTML = `
      <div class="panel">
        <h2>الحسابات <small>بحث بالاسم أو البريد</small></h2>
        <div class="pad">
          <input class="input" id="q" placeholder="ابحث…" style="max-width:320px" />
        </div>
        <div id="tbl"></div>
      </div>`;
    const load = async (q) => {
      const r = await MB.get('/api/owner/merchants?q=' + encodeURIComponent(q || ''));
      $('#tbl').innerHTML = `<table class="t"><thead><tr><th>الاسم</th><th>البريد</th><th>المشاريع</th><th>المنتجات</th><th>الحالة</th><th>آخر دخول</th><th></th></tr></thead><tbody>
        ${r.merchants.map((m) => `<tr>
          <td>${E(m.name)}</td>
          <td dir="ltr" class="hint">${E(m.email)}</td>
          <td class="num">${m.projects}</td>
          <td class="num">${m.products}</td>
          <td><span class="tag ${m.status === 'active' ? 'ok' : 'bad'}">${m.status === 'active' ? 'نشط' : 'موقوف'}</span></td>
          <td class="num">${m.last_login_at ? new Date(m.last_login_at).toLocaleDateString('ar-SA') : '—'}</td>
          <td><button class="btn btn-line" data-toggle="${m.id}" data-status="${m.status}" style="font-size:.7rem;padding:3px 10px">${m.status === 'active' ? 'إيقاف' : 'تنشيط'}</button></td>
        </tr>`).join('') || '<tr><td colspan="7" class="hint">لا حسابات مطابقة.</td></tr>'}
      </tbody></table>`;
      $('#tbl').querySelectorAll('[data-toggle]').forEach((b) => b.addEventListener('click', async () => {
        const id = b.getAttribute('data-toggle');
        const cur = b.getAttribute('data-status');
        const next = cur === 'active' ? 'suspended' : 'active';
        if (next === 'suspended' && !confirm('إيقاف الحساب يلغي جلساته الحالية. متابعة؟')) return;
        try { await MB.patch('/api/owner/merchants/' + id, { status: next }); MB.toast('تم تحديث الحالة', 'ok'); load($('#q').value); }
        catch (e) { MB.toast(e.message, 'bad'); }
      }));
    };
    $('#q').addEventListener('input', () => load($('#q').value));
    await load('');
  }

  /* ---------- 03 · الأنشطة والتصنيفات ---------- */
  async function viewCatalog() {
    const r = await MB.get('/api/owner/catalog');
    const tree = await MB.get('/api/public/catalog');
    const map = {}; tree.activities.forEach((a) => { map[a.id] = a.subcategories; });
    view.innerHTML = `
      <div class="grid2">
        <div class="panel">
          <h2>الأنشطة <small>${r.activities.length}</small></h2>
          <table class="t"><tbody>
            ${r.activities.map((a) => `<tr>
              <td>${E(a.name)}</td>
              <td class="hint num">${E(a.key)}</td>
              <td class="num">${(map[a.key] || []).length}</td>
              <td><span class="tag ${a.visible ? 'ok' : 'warn'}">${a.visible ? 'ظاهر' : 'مخفي'}</span></td>
              <td><button class="btn btn-line" data-vis="${a.key}" data-v="${a.visible}" style="font-size:.7rem;padding:3px 10px">${a.visible ? 'إخفاء' : 'إظهار'}</button></td>
            </tr>`).join('')}
          </tbody></table>
        </div>
        <div class="stack">
          <div class="panel">
            <h2>نشاط جديد</h2>
            <div class="pad stack">
              <div class="grid2">
                <div><label class="ld">المفتاح (لاتيني)</label><input class="input" id="aKey" placeholder="candles" dir="ltr" /></div>
                <div><label class="ld">الاسم</label><input class="input" id="aName" placeholder="الشموع" /></div>
              </div>
              <button class="btn" id="aAdd" style="justify-self:start">إضافة</button>
            </div>
          </div>
          <div class="panel">
            <h2>تصنيف جديد</h2>
            <div class="pad stack">
              <div><label class="ld">النشاط</label><select class="input" id="cAct">${r.activities.map((a) => `<option value="${a.key}">${E(a.name)}</option>`).join('')}</select></div>
              <div class="grid2">
                <div><label class="ld">المعرف (لاتيني)</label><input class="input" id="cId" dir="ltr" placeholder="cookies" /></div>
                <div><label class="ld">الاسم</label><input class="input" id="cName" placeholder="الكوكيز" /></div>
              </div>
              <button class="btn" id="cAdd" style="justify-self:start">إضافة تصنيف</button>
            </div>
          </div>
        </div>
      </div>`;
    view.querySelectorAll('[data-vis]').forEach((b) => b.addEventListener('click', async () => {
      const key = b.getAttribute('data-vis');
      const v = b.getAttribute('data-v') === '1';
      try { await MB.patch('/api/owner/catalog/activities/' + key, { visible: !v }); route(); } catch (e) { MB.toast(e.message, 'bad'); }
    }));
    $('#aAdd').addEventListener('click', async () => {
      try { await MB.post('/api/owner/catalog/activities', { key: $('#aKey').value, name: $('#aName').value }); MB.toast('أُضيف النشاط', 'ok'); route(); }
      catch (e) { MB.toast(e.message, 'bad'); }
    });
    $('#cAdd').addEventListener('click', async () => {
      try { await MB.post('/api/owner/catalog/categories', { activityKey: $('#cAct').value, id: $('#cId').value, name: $('#cName').value }); MB.toast('أُضيف التصنيف', 'ok'); route(); }
      catch (e) { MB.toast(e.message, 'bad'); }
    });
  }

  /* ---------- 04 · الاقتراحات ---------- */
  async function viewSuggestions() {
    const tree = await MB.get('/api/public/catalog');
    const opts = [];
    tree.activities.forEach((a) => a.subcategories.forEach((c) => c.products.forEach((p) => opts.push({ key: p.ingKey || p.id, label: c.name + ' · ' + p.name }))));
    const keys = Array.from(new Set(opts.map((o) => o.key)));
    view.innerHTML = `
      <div class="panel">
        <h2>اقتراحات المكونات <small>المرتبطة بمنتجات الكتالوج</small></h2>
        <div class="pad stack">
          <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end">
            <div style="min-width:240px"><label class="ld">المنتج / المفتاح</label>
              <input class="input" id="k" list="ks" dir="ltr" placeholder="cookies" />
              <datalist id="ks">${keys.map((k) => `<option value="${E(k)}"></option>`).join('')}</datalist>
            </div>
            <button class="btn" id="loadKey">تحميل</button>
          </div>
          <div id="items" class="hint">اختر مفتاحًا لعرض اقتراحات المكونات.</div>
        </div>
      </div>`;
    const loadKey = async (key) => {
      const r = await MB.get('/api/owner/catalog/suggestions?key=' + encodeURIComponent(key));
      $('#items').innerHTML = `
        <table class="t"><thead><tr><th>المكوّن</th><th>النوع</th><th>الوحدة</th><th></th></tr></thead><tbody>
          ${r.items.map((x) => `<tr><td>${E(x.name)}</td><td><span class="tag ${x.kind === 'core' ? 'ok' : x.kind === 'packaging' ? 'warn' : ''}">${x.kind}</span></td><td class="num">${E(x.unit || '—')}</td>
            <td><button class="btn btn-line" data-del="${x.id}" style="font-size:.7rem;padding:3px 10px">حذف</button></td></tr>`).join('') || '<tr><td colspan="4" class="hint">لا اقتراحات لهذا المفتاح.</td></tr>'}
        </tbody></table>
        <div class="grid3" style="margin-top:10px">
          <div><label class="ld">اسم مكوّن</label><input class="input" id="sName" placeholder="قرفة" /></div>
          <div><label class="ld">النوع</label><select class="input" id="sKind"><option value="core">أساسي</option><option value="optional">اختياري</option><option value="packaging">تغليف</option></select></div>
          <div><label class="ld">الوحدة</label><select class="input" id="sUnit"><option value="g">جرام</option><option value="ml">ملليلتر</option><option value="pc">حبة</option><option value="m">متر</option></select></div>
        </div>
        <button class="btn" id="sAdd" style="margin-top:10px">إضافة اقتراح</button>`;
      $('#items').querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => {
        try { await MB.del('/api/owner/catalog/suggestions/' + b.getAttribute('data-del')); loadKey(key); } catch (e) { MB.toast(e.message, 'bad'); }
      }));
      $('#sAdd').addEventListener('click', async () => {
        try {
          await MB.post('/api/owner/catalog/suggestions', { ingKey: key, name: $('#sName').value, kind: $('#sKind').value, unit: $('#sUnit').value });
          loadKey(key);
        } catch (e) { MB.toast(e.message, 'bad'); }
      });
    };
    $('#loadKey').addEventListener('click', () => { const k = $('#k').value.trim(); if (k) loadKey(k); });
  }

  /* ---------- 05 · مكتبة المكونات ---------- */
  async function viewLibrary() {
    const r = await MB.get('/api/owner/library');
    view.innerHTML = `
      <div class="panel">
        <h2>مكتبة المكونات <small>${r.items.length} عنصرًا</small></h2>
        <div class="pad">
          <div class="grid3" style="margin-bottom:10px">
            <div><label class="ld">الاسم</label><input class="input" id="lName" placeholder="دقيق بر" /></div>
            <div><label class="ld">التصنيف</label><input class="input" id="lCat" placeholder="دقيق وحبوب" /></div>
            <div><label class="ld">الوحدة الافتراضية</label><select class="input" id="lUnit"><option value="g">جرام</option><option value="ml">ملليلتر</option><option value="pc">حبة</option><option value="m">متر</option></select></div>
          </div>
          <button class="btn" id="lAdd">إضافة للمكتبة</button>
        </div>
        <table class="t"><thead><tr><th>الاسم</th><th>التصنيف</th><th>الوحدة</th><th>أضيف في</th></tr></thead><tbody>
          ${r.items.map((x) => `<tr><td>${E(x.name)}</td><td class="hint">${E(x.category || '—')}</td><td class="num">${E(x.default_unit || '—')}</td><td class="num">${new Date(x.updated_at).toLocaleDateString('ar-SA')}</td></tr>`).join('') || '<tr><td colspan="4" class="hint">المكتبة فارغة — الاقتراحات الأساسية في قاعدة الكتالوج.</td></tr>'}
        </tbody></table>
      </div>`;
    $('#lAdd').addEventListener('click', async () => {
      try { await MB.post('/api/owner/library', { name: $('#lName').value, category: $('#lCat').value, defaultUnit: $('#lUnit').value }); MB.toast('أُضيف', 'ok'); route(); }
      catch (e) { MB.toast(e.message, 'bad'); }
    });
  }

  /* ---------- 06 · الذكاء الاصطناعي ---------- */
  async function viewAi() {
    const r = await MB.get('/api/owner/ai');
    view.innerHTML = `
      <div class="notice ${r.configured ? 'ok' : 'bad'}" style="margin-bottom:10px">${r.configured
        ? 'الخدمة مهيأة على الخادم. المفاتيح لا تُعرض هنا مطلقًا.'
        : 'لا يوجد مفتاح خدمة على الخادم — الميزات المتصلة بالذكاء معطّلة وتظهر للمستخدمين بحالة صريحة.'}</div>
      <div class="panel">
        <h2>إعدادات الخدمات <small>لكل نوع مهمة إعداد مستقل</small></h2>
        <table class="t"><thead><tr><th>المهمة</th><th>النموذج</th><th>الحرارة</th><th>الحالة</th><th>ملاحظة</th><th></th></tr></thead><tbody>
          ${r.settings.map((s) => `<tr>
            <td class="num">${E(s.kind)}</td>
            <td><input class="input" dir="ltr" data-model="${s.kind}" value="${E(s.model || '')}" style="max-width:200px" /></td>
            <td><input class="input" type="number" step="0.1" min="0" max="1" data-temp="${s.kind}" value="${s.temperature}" style="max-width:80px" /></td>
            <td><button class="btn btn-line" data-tog="${s.kind}" data-on="${s.enabled}" style="font-size:.7rem;padding:3px 10px">${s.enabled ? 'مفعّل' : 'معطّل'}</button></td>
            <td style="min-width:220px"><input class="input" data-note="${s.kind}" value="${E(s.system_note || '')}" /></td>
            <td><button class="btn" data-save="${s.kind}" style="font-size:.7rem;padding:3px 10px">حفظ</button></td>
          </tr>`).join('')}
        </tbody></table>
      </div>
      <div class="panel" style="margin-top:10px">
        <h2>مراقبة الاستدعاءات <small>${r.logs.length} سجلًا</small></h2>
        <table class="t"><thead><tr><th>الوقت</th><th>النوع</th><th>النموذج</th><th>النتيجة</th><th>المدة</th></tr></thead><tbody>
          ${r.logs.map((l) => `<tr><td class="num">${new Date(l.at).toLocaleString('ar-SA')}</td><td>${E(l.kind || '—')}</td><td class="num">${E(l.model || '—')}</td><td><span class="tag ${l.ok ? 'ok' : 'bad'}">${l.ok ? 'نجح' : 'فشل'}</span></td><td class="num">${l.latency_ms != null ? l.latency_ms + 'ms' : '—'}</td></tr>`).join('') || '<tr><td colspan="5" class="hint">لا استدعاءات بعد.</td></tr>'}
        </tbody></table>
      </div>`;
    view.querySelectorAll('[data-tog]').forEach((b) => b.addEventListener('click', async () => {
      const k = b.getAttribute('data-tog');
      const on = b.getAttribute('data-on') === '1';
      try { await MB.patch('/api/owner/ai/' + k, { enabled: !on }); route(); } catch (e) { MB.toast(e.message, 'bad'); }
    }));
    view.querySelectorAll('[data-save]').forEach((b) => b.addEventListener('click', async () => {
      const k = b.getAttribute('data-save');
      try {
        await MB.patch('/api/owner/ai/' + k, {
          model: $(`[data-model="${k}"]`).value,
          temperature: Number($(`[data-temp="${k}"]`).value),
          systemNote: $(`[data-note="${k}"]`).value
        });
        MB.toast('حُفظ', 'ok'); route();
      } catch (e) { MB.toast(e.message, 'bad'); }
    }));
  }

  /* ---------- 07 · فحص الأسعار ---------- */
  async function viewPrices() {
    const r = await MB.get('/api/owner/price-sources');
    view.innerHTML = `
      <div class="notice" style="margin-bottom:10px">المصادر هنا تُسجّل ليتحقق المستخدم بنفسه. لا نسحب أسعارًا آليًا إلا عبر خدمة مرخّصة ومفتاح على الخادم.</div>
      <div class="panel">
        <h2>مصادر الأسعار <small>${r.sources.length}</small></h2>
        <table class="t"><thead><tr><th>المصدر</th><th>الرابط</th><th>النوع</th><th>ملاحظات</th><th>الحالة</th></tr></thead><tbody>
          ${r.sources.map((s) => `<tr>
            <td>${E(s.name)}</td>
            <td dir="ltr" class="hint"><a href="${E(s.url)}" target="_blank" rel="noopener">${E(s.url)}</a></td>
            <td><span class="tag ${s.kind === 'api' ? 'ok' : ''}">${E(s.kind)}</span></td>
            <td class="hint">${E(s.notes || '')}</td>
            <td><button class="btn btn-line" data-ps="${s.id}" data-on="${s.enabled}" style="font-size:.7rem;padding:3px 10px">${s.enabled ? 'مفعّل' : 'معطّل'}</button></td>
          </tr>`).join('')}
        </tbody></table>
        <div class="pad hint">لم تُفعّل أي نقطة نهاية آلية بعد. عند تزويد مفتاح Muwazin، يُضاف على الخادم ويظهر «مراقبة آخر تحديث» هنا.</div>
      </div>`;
    view.querySelectorAll('[data-ps]').forEach((b) => b.addEventListener('click', async () => {
      const id = b.getAttribute('data-ps');
      const on = b.getAttribute('data-on') === '1';
      try { await MB.patch('/api/owner/price-sources/' + id, { enabled: !on }); route(); } catch (e) { MB.toast(e.message, 'bad'); }
    }));
  }

  /* ---------- 08 · المحتوى ---------- */
  async function viewContent() {
    const r = await MB.get('/api/owner/content');
    view.innerHTML = `
      <div class="panel">
        <h2>نصوص الموقع والإعلانات</h2>
        <div class="pad stack">
          ${r.content.map((c) => `<div>
            <label class="ld">${E(c.key)}</label>
            <textarea class="input" rows="2" data-key="${E(c.key)}">${E(c.value)}</textarea>
          </div>`).join('')}
          <button class="btn" id="cSave" style="justify-self:start">حفظ التغييرات</button>
        </div>
      </div>`;
    $('#cSave').addEventListener('click', async () => {
      let n = 0;
      for (const ta of view.querySelectorAll('[data-key]')) {
        try { await MB.put('/api/owner/content/' + ta.getAttribute('data-key'), { value: ta.value }); n++; } catch (e) { MB.toast(e.message, 'bad'); }
      }
      MB.toast('حُفظ ' + n + ' حقلًا', 'ok');
    });
  }

  /* ---------- 09 · المظهر ---------- */
  async function viewTheme() {
    const r = await MB.get('/api/owner/content');
    const t = r.theme || {};
    view.innerHTML = `
      <div class="panel">
        <h2>هوية الواجهة</h2>
        <div class="pad">
          <div class="grid3">
            <div><label class="ld">اللون الأساسي</label><input class="input" type="color" id="tPrimary" value="${E(t.primary || '#a8552f')}" style="height:36px" /></div>
            <div><label class="ld">لون الورق</label><input class="input" type="color" id="tPaper" value="${E(t.paper || '#f3ecdd')}" style="height:36px" /></div>
            <div><label class="ld">لون الحبر</label><input class="input" type="color" id="tInk" value="${E(t.ink || '#33291f')}" style="height:36px" /></div>
          </div>
          <div class="grid3" style="margin-top:10px">
            <div><label class="ld">خط العناوين</label><select class="input" id="tFont"><option ${t.headingFont === 'Rubik' ? 'selected' : ''}>Rubik</option><option ${t.headingFont === 'Amiri' ? 'selected' : ''}>Amiri</option><option ${t.headingFont === 'Tajawal' ? 'selected' : ''}>Tajawal</option></select></div>
            <div><label class="ld">إظهار قسم «الطريقة»</label><select class="input" id="tMethod"><option value="1" ${t.showMethod === '1' ? 'selected' : ''}>ظاهر</option><option value="0" ${t.showMethod === '0' ? 'selected' : ''}>مخفي</option></select></div>
            <div><label class="ld">إظهار قسم «الحدود»</label><select class="input" id="tLimits"><option value="1" ${t.showLimits === '1' ? 'selected' : ''}>ظاهر</option><option value="0" ${t.showLimits === '0' ? 'selected' : ''}>مخفي</option></select></div>
          </div>
          <button class="btn" id="tSave" style="margin-top:12px">حفظ</button>
          <p class="hint">الشعار الحالي نصّي «مِرْباح» — رفع شعار صورة يحتاج مسار وسائط لمضاف بعد.</p>
        </div>
      </div>`;
    $('#tSave').addEventListener('click', async () => {
      try {
        await MB.put('/api/owner/theme', {
          primary: $('#tPrimary').value, paper: $('#tPaper').value, ink: $('#tInk').value,
          headingFont: $('#tFont').value, showMethod: $('#tMethod').value, showLimits: $('#tLimits').value
        });
        MB.toast('حُفظ المظهر', 'ok');
      } catch (e) { MB.toast(e.message, 'bad'); }
    });
  }

  /* ---------- 10 · سجل العمليات ---------- */
  async function viewAudit() {
    const r = await MB.get('/api/owner/audit?limit=200');
    view.innerHTML = `
      <div class="panel">
        <h2>سجل العمليات <small>${r.rows.length}</small></h2>
        <table class="t"><thead><tr><th>الوقت</th><th>المستخدم</th><th>الدور</th><th>العملية</th><th>الكيان</th><th>IP</th></tr></thead><tbody>
          ${r.rows.map((x) => `<tr>
            <td class="num">${new Date(x.at).toLocaleString('ar-SA')}</td>
            <td dir="ltr" class="hint">${E(x.actor_email)}</td>
            <td><span class="tag">${E(x.actor_role || '—')}</span></td>
            <td class="num">${E(x.action)}</td>
            <td class="hint">${E(x.entity || '')} ${E(x.entity_id || '')}</td>
            <td class="num">${E(x.ip || '—')}</td>
          </tr>`).join('') || '<tr><td colspan="6" class="hint">لا عمليات بعد.</td></tr>'}
        </tbody></table>
      </div>`;
  }

  /* ---------- 11 · الأمان والنسخ ---------- */
  async function viewSecurity() {
    const [bk, att] = await Promise.all([MB.get('/api/owner/backups'), MB.get('/api/owner/attempts')]);
    const me = state.user;
    view.innerHTML = `
      <div class="grid2">
        <div class="panel">
          <h2>مصادقة المالك الثنائية</h2>
          <div class="pad stack">
            <p class="hint">الحالة: <span class="tag ${me.totpEnabled ? 'ok' : 'warn'}">${me.totpEnabled ? 'مفعّلة' : 'غير مفعّلة'}</span></p>
            <button class="btn" id="totpStart">${me.totpEnabled ? 'إعادة الإعداد' : 'ابدأ الإعداد'}</button>
            <div id="totpBox"></div>
          </div>
        </div>
        <div class="panel">
          <h2>النسخ الاحتياطي</h2>
          <div class="pad stack">
            <button class="btn" id="mkBackup">أنشئ نسخة الآن</button>
            <table class="t"><tbody>
              ${bk.rows.map((b) => `<tr><td class="num">${E(b.path)}</td><td class="num">${Math.round(b.bytes / 1024)}KB</td><td class="num">${new Date(b.at).toLocaleString('ar-SA')}</td></tr>`).join('') || '<tr><td class="hint">لا نسخ مسجّلة بعد.</td></tr>'}
            </tbody></table>
          </div>
        </div>
      </div>
      <div class="panel" style="margin-top:10px">
        <h2>محاولات الدخول الأخيرة</h2>
        <table class="t"><thead><tr><th>الوقت</th><th>البريد</th><th>IP</th><th>النتيجة</th><th>السبب</th></tr></thead><tbody>
          ${att.rows.map((a) => `<tr><td class="num">${new Date(a.at).toLocaleString('ar-SA')}</td><td dir="ltr" class="hint">${E(a.email)}</td><td class="num">${E(a.ip)}</td><td><span class="tag ${a.ok ? 'ok' : 'bad'}">${a.ok ? 'نجح' : 'فشل'}</span></td><td class="hint">${E(a.reason)}</td></tr>`).join('') || '<tr><td colspan="5" class="hint">لا محاولات.</td></tr>'}
        </tbody></table>
      </div>`;
    $('#mkBackup').addEventListener('click', async () => {
      try { const r = await MB.post('/api/owner/backup', {}); MB.toast(r.ok ? 'أُنشئت نسخة ' + r.backup.name : 'تعذّر إنشاء النسخة', r.ok ? 'ok' : 'bad'); route(); }
      catch (e) { MB.toast(e.message, 'bad'); }
    });
    $('#totpStart').addEventListener('click', async () => {
      try {
        const r = await MB.post('/api/auth/totp/setup', {});
        $('#totpBox').innerHTML = `
          <div class="notice">أضف هذا المفتاح في تطبيق المصادقة، ثم أدخل الرمز (٦ أرقام).</div>
          <code class="num" style="display:block;padding:8px;background:#0c0e12;border:1px solid var(--line2);border-radius:6px;margin:8px 0;user-select:all">${E(r.secret)}</code>
          <input class="input" id="totpCode" placeholder="123456" dir="ltr" style="max-width:160px" />
          <button class="btn" id="totpGo" style="margin-top:8px">تفعيل</button>`;
        $('#totpGo').addEventListener('click', async () => {
          try { await MB.post('/api/auth/totp/enable', { code: $('#totpCode').value }); MB.toast('فُعّلت المصادقة الثنائية', 'ok'); route(); }
          catch (e) { MB.toast(e.message, 'bad'); }
        });
      } catch (e) { MB.toast(e.message, 'bad'); }
    });
  }

  /* ---------- تشغيل ---------- */
  async function boot() {
    try {
      const me = await MB.get('/api/auth/me');
      if (!me.user) { location.href = '/owner-login/'; return; }
      if (me.user.role !== 'owner') { location.href = '/dashboard/'; return; }
      state.user = me.user;
      document.getElementById('whoName').textContent = me.user.email;
      await route();
    } catch (e) {
      view.innerHTML = `<div class="notice bad">${E(e.message)}</div>`;
    }
  }
  document.getElementById('logout').addEventListener('click', async () => {
    try { await MB.post('/api/auth/logout', {}); } catch (e) {}
    location.href = '/owner-login/';
  });
  window.addEventListener('hashchange', route);
  boot();
})();
