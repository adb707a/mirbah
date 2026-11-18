/* =============================================================
   مِرْباح — منطق الواجهة (شجرة القرار + المحررات + النتائج)
   ============================================================= */
(function () {
  'use strict';

  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  const esc = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const LS_KEY = 'mirbah_daftar_v3';

  const fmt = (n) => (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmt0 = (n) => (Number(n) || 0).toLocaleString('en-US', { maximumFractionDigits: 0 });
  const money = (n) => fmt(n) + ' ر.س';
  const fmt1 = (n) => (Number(n) || 0).toLocaleString('en-US', { maximumFractionDigits: 1 });
  const fmtNumber = (n) => (Number(n) || 0).toLocaleString('en-US', { maximumFractionDigits: 3 });

  const STEP_KEYS = ['project', 'domain', 'subcategory', 'product', 'ingredients', 'packaging', 'operations', 'pricing', 'results'];
  const STEP_INDEX = { project: 0, domain: 1, subcategory: 1, product: 2, ingredients: 3, packaging: 4, operations: 5, pricing: 6, results: 7 };
  const STEPPER = [
    { idx: 0, label: 'نوع المنشأة', go: 'project' },
    { idx: 1, label: 'النشاط والتصنيف', go: 'domain' },
    { idx: 2, label: 'المنتج', go: 'product' },
    { idx: 3, label: 'المكونات', go: 'ingredients' },
    { idx: 4, label: 'التغليف', go: 'packaging' },
    { idx: 5, label: 'التشغيل', go: 'operations' },
    { idx: 6, label: 'التسعير', go: 'pricing' },
    { idx: 7, label: 'النتائج', go: 'results' }
  ];

  const D = window.AppData;
  const Calc = window.Calc;

  let state = defaultState();
  let charts = [];
  let saveTimer = null;
  // شجرة القرار المرئية (وحدة مستقلة: js/tree.js)
  const Tree = window.MirbahTree;
  // موضوع حقل التعديل الحالي — يُستخدم لإعادة بناء الحقول فقط عند تغيّر يخصّها
  // (مثل تكرار شراء مكوّن) بدل مسح تركيز المستخدم في كل ضغطة مفتاح.
  let editingField = null;

  function defaultState() {
    return {
      started: false, step: 'project',
      projectTypeId: null, domainId: null, subcategoryId: null, productId: null, productName: '',
      ingredients: [], packaging: [], operational: [],
      units: 1, timeMinutes: 0, hourlyRate: 0, batchesPerMonth: 1,
      sellPrice: 0, bundleQty: 0, bundlePrice: 0, discountPct: 0,
      purchaseMode: 'custom', packCount: 0, monthlyQty: 0,
      paymentGateways: [],
      gatewaysOpen: false,
      priceChecks: {},
      ai: null, aiError: null
    };
  }

  /* ---------------- حفظ واسترجاع ---------------- */
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch (e) {}
    }, 200);
  }
  function load() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        state = Object.assign(defaultState(), parsed);
        if (!Array.isArray(state.ingredients)) state.ingredients = [];
        if (!Array.isArray(state.packaging)) state.packaging = [];
        if (!Array.isArray(state.operational)) state.operational = [];
        // حالة التحميل مؤقتة: لا يجب أن تُستعاد من التخزين فتبقى عالقة
        state.aiLoading = false;
      }
    } catch (e) {}
  }

  /* ---------------- أدوات ---------------- */
  function unitName(id) {
    const u = D.UNITS.find((x) => x.id === id);
    return u ? u.name : '';
  }
  // تسمية المخرجات حسب المنتج النشط: كوب/أكواب، علبة/علب، قطعة/قطع، توزيعة/توزيعات
  function outputLabel() {
    const product = state.productId ? D.getProduct(state.domainId, state.subcategoryId, state.productId) : null;
    return D.labelFor(state.domainId, product);
  }

  function metaNames() {
    const pt = D.getProjectType(state.projectTypeId);
    const dm = D.getDomain(state.domainId);
    const sc = D.getSubcategory(state.domainId, state.subcategoryId);
    return {
      projectType: pt ? pt.name : '',
      domain: dm ? dm.name : '',
      subcategory: sc ? sc.name : '',
      product: state.productName || ''
    };
  }
  function signature() {
    return JSON.stringify({
      p: state.productId, i: state.ingredients, k: state.packaging, o: state.operational,
      u: state.units, t: state.timeMinutes, h: state.hourlyRate, b: state.batchesPerMonth,
      s: state.sellPrice, bq: state.bundleQty, bp: state.bundlePrice, d: state.discountPct
    });
  }
  function clearAi() { state.ai = null; state.aiError = null; }

  /* ---------------- التنقل بين الأقسام ---------------- */
  function showLanding() {
    $('#landing').classList.remove('hidden');
    $('#wizard').classList.add('hidden');
    $('#results').classList.add('hidden');
    refreshResumeButtons();
  }

  function render() {
    save();
    // موضع الصفحة قبل إعادة التصيير — نُعيده بعده حتى لا يقفز المحتوى
    const pageY = window.scrollY;
    if (state.step === 'results') {
      $('#landing').classList.add('hidden');
      $('#wizard').classList.add('hidden');
      $('#results').classList.remove('hidden');
      renderResults();
      restorePageScroll(pageY);
      return;
    }
    $('#landing').classList.add('hidden');
    $('#results').classList.add('hidden');
    $('#wizard').classList.remove('hidden');
    renderStepper();
    renderHistory();
    // لا نُحرّك نافذة المتصفح هنا: القفز للأعلى يدمّر تجربة المستخدم.
    // التمرير يقتصر على ما يطلبه المستخدم (اختيار خطوة) أدناه.
    renderStep();
    restorePageScroll(pageY);
  }

  // استعادة موضع الصفحة بعد إعادة التصيير (والتحقق بعد إطارين لأن الارتفاع قد يتغيّر)
  function restorePageScroll(y) {
    if (y == null) return;
    const fix = () => {
      if (Math.abs(window.scrollY - y) > 1) window.scrollTo({ top: y, left: window.scrollX, behavior: 'auto' });
    };
    fix();
    requestAnimationFrame(fix);
    setTimeout(fix, 60);
    setTimeout(fix, 220);
  }

  function startJourney() {
    const hasData = state.productId && state.ingredients.length;
    if (!hasData) state = defaultState();
    state.started = true;
    // دفتر V3: أي مسار غير الشجرة يحتاج المنتج كاملًا؛ وإلا نبدأ من الشجرة
    const treeOk = state.projectTypeId && state.domainId && state.subcategoryId && state.productId;
    if (!treeOk) state.step = 'project';
    else if (!needsTree(state.step) && !state.productId) state.step = 'product';
    if (state.step === 'results') state.step = 'pricing';
    clearAi();
    render();
  }
  function resumeJourney() {
    if (!state.started) return startJourney();
    render();
  }
  function resetJourney(silent) {
    if (!silent && !confirm('هل تريد بدء رحلة تسعير جديدة؟ سيتم حذف البيانات الحالية المحفوظة على جهازك.')) return;
    state = defaultState();
    try { localStorage.removeItem(LS_KEY); } catch (e) {}
    showLanding();
  }
  function refreshResumeButtons() {
    const btn = $('#ctaResume');
    const nav = $('#navResume');
    const canResume = state.started && (state.projectTypeId || state.productId);
    if (btn) btn.style.display = canResume ? '' : 'none';
    if (nav) nav.style.display = canResume ? '' : 'none';
  }

  /* ---------------- شريط التقدم والسجل ---------------- */
  function renderStepper() {
    const active = STEP_INDEX[state.step] != null ? STEP_INDEX[state.step] : 0;
    $('#stepper').innerHTML = STEPPER.map((s, i) => {
      const done = s.idx < active;
      const isActive = s.idx === active;
      const allowed = s.idx === 0 || (s.idx === 1 ? !!state.projectTypeId : s.idx === 2 ? !!state.subcategoryId : s.idx === 7 ? (!!state.productId && Calc.num(state.sellPrice) > 0) : !!state.productId);
      return `<button type="button" class="step-item ${isActive ? 'active' : ''} ${done ? 'done' : ''}" data-action="goto" data-step="${s.go}" ${allowed ? '' : 'disabled'} style="${allowed ? '' : 'opacity:.35;pointer-events:none'}">
        <span class="step-dot">${done ? '✓' : i + 1}</span><span>${s.label}</span>
      </button>${i < STEPPER.length - 1 ? '<span class="faint text-[10px] px-0.5">—</span>' : ''}`;
    }).join('');
    const pct = Math.round(((active + 1) / STEPPER.length) * 100);
    $('#progressFill').style.width = pct + '%';
    const titles = { project: 'ما نوع منشأتك؟', domain: 'ما نوع نشاطك؟', subcategory: 'أي تصنيف أقرب لمنتجك؟', product: 'اختر المنتج', ingredients: 'المكونات والتكاليف', packaging: 'التغليف والاستهلاكيات', operations: 'المصاريف التشغيلية ووقتك', pricing: 'سعر البيع المتوقع', results: 'نتائج التسعير' };
    $('#wizardTitle').textContent = titles[state.step] || 'رحلة التسعير';
  }

  function renderHistory() {
    const bar = $('#historyBar');
    const chips = [];
    const pt = D.getProjectType(state.projectTypeId);
    const dm = D.getDomain(state.domainId);
    const sc = D.getSubcategory(state.domainId, state.subcategoryId);
    if (pt) chips.push({ label: 'نوع المنشأة', value: pt.name, go: 'project' });
    if (dm) chips.push({ label: 'نوع النشاط', value: dm.name, go: 'domain' });
    if (sc) chips.push({ label: 'التصنيف', value: sc.name, go: 'subcategory' });
    if (state.productName) chips.push({ label: 'المنتج', value: state.productName, go: 'product' });
    if (!chips.length) { bar.innerHTML = '<span class="text-xs faint">ستظهر اختياراتك هنا أثناء الرحلة.</span>'; return; }
    bar.innerHTML = chips.map((c) =>
      `<button type="button" class="chip" data-action="goto" data-step="${c.go}">
        <span class="chip-key">${esc(c.label)}:</span><span>${esc(c.value)}</span><span class="chip-x">✕</span>
      </button>`).join('');
  }

  /* ---------------- المحتوى حسب الخطوة ---------------- */
  function needsTree(step) {
    return step === 'project' || step === 'domain' || step === 'subcategory' || step === 'product';
  }

  function renderStep() {
    // دفتر V3: لا يمكن دخول قسم المكونات بلا منتج كامل — نرجع للشجرة بدل شاشة فارغة
    if (!needsTree(state.step) && !(state.productId && state.subcategoryId && state.domainId)) {
      state.step = state.subcategoryId ? 'product' : state.domainId ? 'subcategory' : state.projectTypeId ? 'domain' : 'project';
      return renderTreeStep();
    }
    switch (state.step) {
      case 'project':
      case 'domain':
      case 'subcategory':
      case 'product': return renderTreeStep();
      case 'ingredients': return renderIngredientsStep();
      case 'packaging': return renderPackagingStep();
      case 'operations': return renderOperationsStep();
      case 'pricing': return renderPricingStep();
      default: return renderTreeStep();
    }
  }

  function questionShell(title, subtitle, options) {
    $('#wizardBody').innerHTML = `
      <div class="fade-up max-w-3xl">
        <h3 class="text-2xl sm:text-[1.9rem] font-semibold tracking-tight leading-snug">${title}</h3>
        ${subtitle ? `<p class="text-soft mt-2 text-sm">${subtitle}</p>` : ''}
        <div class="grid sm:grid-cols-2 gap-3 mt-6">
          ${options.map((o) => `
            <button type="button" class="option-card" data-action="${o.action}" data-id="${esc(o.id)}">
              <span class="opt-icon">${o.icon || '•'}</span>
              <span class="min-w-0">
                <span class="opt-title block">${esc(o.title)}</span>
                ${o.desc ? `<span class="opt-desc block truncate">${esc(o.desc)}</span>` : ''}
              </span>
              <span class="opt-arrow">←</span>
            </button>`).join('')}
        </div>
      </div>`;
  }

  function renderProjectStep() {
    questionShell('ما طبيعة مشروعك؟', 'اختر ما يصف مشروعك بدقة، وسنتفرّع بالأسئلة حسب اختيارك.',
      D.PROJECT_TYPES.map((p) => ({ action: 'select-project', id: p.id, icon: p.icon, title: p.name, desc: p.desc })));
  }
  function renderDomainStep() {
    const pt = D.getProjectType(state.projectTypeId);
    if (!pt) { state.step = 'project'; return renderStep(); }
    questionShell('في أي مجال تعمل؟', `مجالات مناسبة لـ «${esc(pt.name)}» — اختر المجال الأقرب.`,
      pt.domains.map((id) => { const d = D.getDomain(id); return d ? { action: 'select-domain', id: d.id, icon: d.icon, title: d.name, desc: d.subcategories.map((s) => s.name).slice(0, 3).join(' · ') } : null; }).filter(Boolean));
  }
  function renderSubcategoryStep() {
    const dm = D.getDomain(state.domainId);
    if (!dm) { state.step = 'domain'; return renderStep(); }
    questionShell('أي تصنيف أقرب لمنتجك؟', `تصنيفات «${esc(dm.name)}».`,
      dm.subcategories.map((s) => ({ action: 'select-subcategory', id: s.id, icon: '›', title: s.name, desc: `${s.products.length} منتج` })));
  }
  function renderProductStep() {
    const sc = D.getSubcategory(state.domainId, state.subcategoryId);
    if (!sc) { state.step = 'subcategory'; return renderStep(); }
    questionShell('اختر المنتج', 'سنبدأ بقالب افتراضي قابل للتعديل بالكامل — عدّل المكونات والكميات كما تريد.',
      sc.products.map((p) => ({ action: 'select-product', id: p.id, icon: '📦', title: p.name, desc: p.tpl ? 'قالب مفصّل جاهز' : 'قالب افتراضي' })));
  }

  /* ---------------- شجرة القرار المرئية ---------------- */
  // الجذر ← نوع المنشأة ← نوع النشاط ← التصنيف ← المنتج
  // TREE_LEVELS معرّفة أعلى الملف (أسماء المستويات وعناصر الأكشن)

  function treeSelection(key) {
    if (key === 'project') {
      const p = D.getProjectType(state.projectTypeId);
      return p ? { name: p.name, icon: p.icon } : null;
    }
    if (key === 'domain') {
      const d = D.getDomain(state.domainId);
      return d ? { name: d.name, icon: d.icon } : null;
    }
    if (key === 'subcategory') {
      const s = D.getSubcategory(state.domainId, state.subcategoryId);
      return s ? { name: s.name, icon: '🗂️' } : null;
    }
    if (key === 'product') {
      return state.productId ? { name: state.productName, icon: '📦' } : null;
    }
    return null;
  }

  // هل توجد اختيارات أعمق من هذا المستوى؟ (لتنبيه المستخدم قبل التعديل)
  function hasDeeperSelection(step) {
    if (step === 'project') return !!(state.domainId || state.subcategoryId || state.productId);
    if (step === 'domain') return !!(state.subcategoryId || state.productId);
    if (step === 'subcategory') return !!state.productId;
    return false;
  }

  function treeOptions(step) {
    if (step === 'project') {
      return {
        subtitle: 'اختر نوع المنشأة الأقرب لوضعك، وستتفرّع بقية الأسئلة تلقائيًا.',
        options: D.PROJECT_TYPES.map((p) => ({ id: p.id, icon: p.icon, title: p.name, desc: p.desc }))
      };
    }
    if (step === 'domain') {
      const pt = D.getProjectType(state.projectTypeId);
      if (!pt) return null;
      const options = pt.domains.map((id) => {
        const d = D.getDomain(id);
        return d ? { id: d.id, icon: d.icon, title: d.name, desc: d.subcategories.map((s) => s.name).slice(0, 3).join(' · ') } : null;
      }).filter(Boolean);
      return { subtitle: `أنشطة مناسبة لـ «${pt.name}».`, options };
    }
    if (step === 'subcategory') {
      const dm = D.getDomain(state.domainId);
      if (!dm) return null;
      return {
        subtitle: `تصنيفات «${dm.name}».`,
        options: dm.subcategories.map((s) => ({ id: s.id, icon: '🗂️', title: s.name, desc: `${s.products.length} منتج` }))
      };
    }
    if (step === 'product') {
      const sc = D.getSubcategory(state.domainId, state.subcategoryId);
      if (!sc) return null;
      return {
        subtitle: `منتجات «${sc.name}». سنبدأ بقالب قابل للتعديل بالكامل.`,
        options: sc.products.map((p) => ({ id: p.id, icon: '📦', title: p.name, desc: p.tpl ? 'قالب مفصّل جاهز' : 'قالب افتراضي' }))
      };
    }
    return null;
  }

  /* ---------------- بناء الشجرة ---------------- */
  const TREE_LEVELS = [
    { key: 'project', label: 'نوع المنشأة', action: 'select-project' },
    { key: 'domain', label: 'نوع النشاط', action: 'select-domain' },
    { key: 'subcategory', label: 'التصنيف', action: 'select-subcategory' },
    { key: 'product', label: 'المنتج', action: 'select-product' }
  ];

  // يبني نموذج الشجرة من حالة الاختيار الحالية
  function treeModel() {
    const active = TREE_LEVELS.findIndex((l) => l.key === state.step);
    if (active < 0) return null;
    const levels = [];
    // المستويات من 0 إلى المستوى النشط فقط — كل عنصر يمثل عمودًا واحدًا في الشجرة
    for (let i = 0; i <= active; i++) {
      const lv = TREE_LEVELS[i];
      const info = treeLevelOptions(lv.key);
      if (!info) return null;
      const selectedId = lv.key === 'project' ? state.projectTypeId
        : lv.key === 'domain' ? state.domainId
          : lv.key === 'subcategory' ? state.subcategoryId
            : state.productId;
      const isActive = i === active;
      const sel = info.options.find((o) => o.id === selectedId);
      levels.push({
        key: lv.key,
        label: lv.label,
        active: isActive,
        // الخيارات تُعرض فقط للمستوى النشط؛ المثبتة تكفي لعرض الاختيار
        options: isActive ? info.options : [],
        selectedId,
        selection: sel || { icon: '•', title: '—' }
      });
    }
    return { activeIndex: active, levels, subtitle: TREE_LEVELS[active] ? treeLevelOptions(TREE_LEVELS[active].key).subtitle : '' };
  }

  function treeLevelOptions(key) {
    if (key === 'project') {
      return {
        subtitle: 'اختر نوع المنشأة الأقرب لوضعك، وستتفرّع شجرة النشاط تلقائيًا.',
        options: D.PROJECT_TYPES.map((p) => ({ id: p.id, icon: p.icon, title: p.name, desc: p.desc }))
      };
    }
    if (key === 'domain') {
      const pt = D.getProjectType(state.projectTypeId);
      if (!pt) return null;
      return {
        subtitle: 'أنشطة مناسبة لـ «' + pt.name + '».',
        options: pt.domains.map((id) => {
          const d = D.getDomain(id);
          return d ? { id: d.id, icon: d.icon, title: d.name, desc: d.subcategories.map((s) => s.name).slice(0, 3).join(' · ') } : null;
        }).filter(Boolean)
      };
    }
    if (key === 'subcategory') {
      const dm = D.getDomain(state.domainId);
      if (!dm) return null;
      return {
        subtitle: 'تصنيفات «' + dm.name + '».',
        options: dm.subcategories.map((s) => ({ id: s.id, icon: '🗂️', title: s.name, desc: s.products.length + ' منتج' }))
      };
    }
    if (key === 'product') {
      const sc = D.getSubcategory(state.domainId, state.subcategoryId);
      if (!sc) return null;
      return {
        subtitle: 'منتجات «' + sc.name + '». سنبدأ بقالب قابل للتعديل بالكامل.',
        options: sc.products.map((p) => ({ id: p.id, icon: '📦', title: p.name, desc: p.tpl ? 'قالب مفصّل جاهز' : 'قالب افتراضي' }))
      };
    }
    return null;
  }

  // نُثبّت موضع الصفحة حول إعادة تصيير الشجرة: العقدة الجديدة تمرّر داخل اللوحة فقط.
  function renderTreeStep() {
    const pageY = window.scrollY;
    renderTreeStepInner();
    // إن حرّك المتصفح الصفحة (تغيّر ارتفاع/scrollIntoView) نُعيدها فورًا
    if (Math.abs(window.scrollY - pageY) > 1) {
      window.scrollTo({ top: pageY, left: window.scrollX, behavior: 'auto' });
      requestAnimationFrame(() => {
        if (Math.abs(window.scrollY - pageY) > 1) window.scrollTo({ top: pageY, left: window.scrollX, behavior: 'auto' });
      });
    }
  }

  function renderTreeStepInner() {
    const model = treeModel();
    if (!model || model.activeIndex < 0) {
      // لا يوجد اختيار أب — نرجع خطوة للخلف بدل شجرة ناقصة
      state.step = state.step === 'product' ? 'subcategory' : state.step === 'subcategory' ? 'domain' : 'project';
      return renderStep();
    }

    const revisit = hasDeeperSelection(state.step)
      ? '<div class="tree-revisit">أنت تعدّل اختيارًا سابقًا — لن تُحذف بياناتك الحالية حتى تختار خيارًا مختلفًا.</div>'
      : '';

    $('#wizardBody').innerHTML = `
      <div class="tree-stage fade-in">
        <div class="tree-topline">
          <p class="text-sm text-soft">${esc(model.subtitle)}</p>
          <span class="tree-count">${model.levels[model.activeIndex].options.length} خيارات</span>
        </div>
        ${revisit}
        ${Tree.render(model)}
        <div class="tree-foot">
          ${model.activeIndex > 0 ? '<button type="button" class="tree-backchip" data-action="tree-back">← رجوع للمستوى السابق</button>' : ''}
          <p class="tree-hint">كل اختيار يفتح فرعًا جديدًا. اضغط أي عقدة مثبتة لتغييرها، وتُعاد الفروع التابعة تلقائيًا.</p>
        </div>
      </div>`;

    Tree.observe();
    Tree.drawSoon();
    // تمرير داخلي فقط داخل لوحة الشجرة، وبحركة ناعمة نحو العقدة الجديدة
    if (typeof Tree.revealActiveNode === 'function') Tree.revealActiveNode();
    else Tree.scrollToActive(true);
  }

  function drawTreeWires() { Tree.draw(); }

  function drawTreeWiresSoon() { Tree.drawSoon(); }

  /* ---------------- حركة الاختيار (تُدار داخل js/tree.js) ---------------- */
  // ينفّذ الاختيار الفعلي مباشرة (بدون حدث click) لأن الزر يفصل من DOM أثناء الحركة
  function applyTreeChoice(btn) {
    if (!btn) return;
    const action = btn.getAttribute('data-action');
    const id = btn.getAttribute('data-id');
    if (action === 'select-project') return selectProject(id);
    if (action === 'select-domain') return selectDomain(id);
    if (action === 'select-subcategory') return selectSubcategory(id);
    if (action === 'select-product') return selectProduct(id);
    return undefined;
  }

  function animateTreeSelection(btn) { return Tree.animateSelection(btn, applyTreeChoice); }

  function resetTreeAnim() { Tree.reset(); }

  function scrollTreeToActive() {
    const panel = document.getElementById('treePanel');
    const item = panel ? panel.querySelector('.tn-item.active') : null;
    if (!panel || !item) return;
    const target = Math.max(0, item.offsetTop - 16);
    try { panel.scrollTo({ top: target, behavior: 'smooth' }); } catch (e) { panel.scrollTop = target; }
  }

  // حالة تكرار الشراء داخل الدفعة: نفس المكوّن + نفس العبوة + نفس السعر = عبوة واحدة
  function ingredientRepeatState() {
    const first = new Map();
    return (Calc.compute(state).ingredientRows || []).map((row, i) => {
      const ing = state.ingredients[i] || {};
      const key = [String(ing.name || '').trim(), String(ing.qtyUnit || ing.unit || ''), String(ing.packUnit || ing.unit || ''), Calc.num(ing.pack), Calc.num(ing.price)].join('|');
      if (!String(ing.name || '').trim() || Calc.num(ing.pack) <= 0) return { row, mode: 'none', first: i };
      const prev = first.get(key);
      if (prev === undefined) { first.set(key, i); return { row, mode: 'first', first: i }; }
      return { row, mode: 'repeat', first: prev };
    });
  }

  // بصمة حكم التكرار — نُعيد بناء البطاقات فقط عند تغيّر فعلي في الحكم
  function repeatSig() {
    return ingredientRepeatState().map((x) => x.mode).join(',');
  }
  let lastRepeatSig = null;

  function rebuildIngredientsKeepingFocus(index, caret) {
    if (state.step !== 'ingredients') return;
    lastRepeatSig = repeatSig();
    renderStep();
    const target = $(`[data-group="ingredients"][data-index="${index}"][data-field="name"]`);
    if (target) {
      target.focus();
      const pos = caret == null ? target.value.length : Math.min(caret, target.value.length);
      try { target.setSelectionRange(pos, pos); } catch (e) {}
    }
  }

  function refreshEditorTotals() {
    const rep = ingredientRepeatState();
    rep.forEach((info, i) => {
      const row = info.row;
      const ce = $(`[data-cost="ing-${i}"]`);
      if (ce) ce.innerHTML = row.dupCost > 0
        ? `${money(row.costUsed)} <span class="faint text-xs">(مكرر ${money(row.dupCost)} معفى)</span>`
        : money(row.costUsed);
      const le = $(`[data-leftover="ing-${i}"]`);
      if (le) le.textContent = money(row.leftoverValue);
    });
    state.packaging.forEach((p, i) => {
      const ce = $(`[data-cost="pkg-${i}"]`);
      if (ce) ce.textContent = money(Calc.packagingCost(p));
    });
    state.operational.forEach((o, i) => {
      const ce = $(`[data-cost="op-${i}"]`);
      if (ce) ce.textContent = money(Calc.operationalPerBatch(o, state.batchesPerMonth));
    });
    const r = Calc.compute(state);
    const ingSub = $('[data-subtotal="ingredients"]');
    if (ingSub) ingSub.textContent = money(r.ingredientsTotal);
    const pkgSub = $('[data-subtotal="packaging"]');
    if (pkgSub) pkgSub.textContent = money(r.packagingTotal);
  }

  function renderIngredientsStep() {
    const r = Calc.compute(state);
    const repeat = ingredientRepeatState();
    const collapsed = state.collapsedIng || {};
    const rows = state.ingredients.map((ing, i) => ingredientCard(ing, i, repeat[i], !!collapsed[i])).join('');

    $('#wizardBody').innerHTML = `
      <div class="fade-up">
        <div class="df-sec-title">
          <h3>المكونات والتكاليف</h3>
          <p>ثلاثة أسطر لكل مكوّن: ما اشتريته، وبكم، وكم استخدمت. النظام يحاسبك على الجزء المستهلك فقط.</p>
        </div>
        ${totalsBar(r)}

        <div class="df-stage" data-stage="suggest" id="dfSuggestStage">
          <div class="df-stage-head"><span class="n">١</span><h4>اقتراحات لِـ «${esc(state.productName || 'منتجك')}»</h4></div>
          <div id="dfSmartRoot" aria-live="polite"></div>
          <div class="df-search" style="margin-top:10px">
            <input class="input" id="dfIngSearch" type="search" autocomplete="off" placeholder="ابحث عن أي مكوّن… مثلاً: سكر، شمع، خيط" />
            <div class="df-search-results" id="dfIngSearchResults" hidden></div>
          </div>
          <button type="button" class="btn btn-secondary" data-action="add-ingredient">＋ مكوّن جديد من الصفر</button>
        </div>

        <div class="df-ing-list">${rows || '<p class="df-empty">لم تُضف مكونات بعد. ابدأ من الاقتراحات بالأعلى.</p>'}</div>
        ${editorFooter('product', 'packaging', 'التالي: التغليف')}
      </div>`;
    refreshEditorTotals();
    bindIngredientSearch();
    mountSmartProposals();
  }

  /* دفتر V3: تركيب لوحة الاقتراحات الذكية (js/smart-proposals.js) */
  function mountSmartProposals() {
    const root = document.getElementById('dfSmartRoot');
    if (!root || !window.MirbahProposals) return;
    const product = activeProduct();
    const ingKey = (product && (product.ingKey || product.id)) || state.productId || '';
    window.MirbahProposals.mount(root, {
      ingKey,
      domainId: state.domainId,
      productName: state.productName || (product ? product.name : ''),
      existing: state.ingredients.map((x) => String(x.name || '').trim()).filter(Boolean)
    });
  }

  /* جسر الاقتراحات: يُضيف مكوّنات إلى نفس نموذج الحالة ومحرك الحساب الموحد */
  window.MirbahBridge = window.MirbahBridge || {};
  window.MirbahBridge.addIngredient = function (name, unit) {
    const nm = String(name || '').trim();
    if (!nm) return false;
    if (state.ingredients.some((x) => String(x.name || '').trim() === nm)) return false;
    const allowed = ['g', 'ml', 'pc', 'm', 'kg', 'l', 'sheet', 'pair', 'box', 'bottle', 'bag', 'carton', 'set', 'spool'];
    const u = allowed.indexOf(unit) > -1 ? unit : 'g';
    state.ingredients.push({ name: nm, qty: 0, qtyUnit: u, pack: 0, packUnit: u, price: 0, type: 'estimated', marketPrice: '', marketStore: '' });
    return true;
  };
  window.MirbahBridge.addMany = function (items) {
    let n = 0;
    (items || []).forEach(function (it) {
      if (!it || !it.name) return;
      if (window.MirbahBridge.addIngredient(it.name, it.unit)) {
        const ing = state.ingredients[state.ingredients.length - 1];
        if (it.pack != null && it.pack !== '') ing.pack = it.pack;
        if (it.price != null && it.price !== '') ing.price = it.price;
        n++;
      }
    });
    return n;
  };  window.MirbahBridge.afterAdd = function (n) {
    clearAi();
    renderStep();
    if (n) {
      const cards = document.querySelectorAll('.df-ing');
      const last = cards[cards.length - 1];
      if (last) { try { last.scrollIntoView({ block: 'center' }); } catch (e) {} }
    }
  };

  function ingredientSuggester() {
    const Sg = window.IngredientSuggestions;
    const product = activeProduct();
    if (!Sg) {
      return { items: D.quickAddFor(state.domainId, product).map((n) => ({ name: n, kind: 'core' })) };
    }
    return Sg.lookup({ domainId: state.domainId, subcategoryId: state.subcategoryId, productId: state.productId }, product);
  }

  function bindIngredientSearch() {
    const input = $('#dfIngSearch');
    const box = $('#dfIngSearchResults');
    if (!input || !box) return;
    const Sg = window.IngredientSuggestions;
    const render = () => {
      const term = input.value.trim();
      const res = Sg ? Sg.search(term, 8) : [];
      if (!term || !res.length) { box.hidden = true; box.innerHTML = ''; return; }
      box.hidden = false;
      box.innerHTML = res.map((x) => `<button type="button" class="df-search-item" data-action="suggest-add" data-name="${esc(x.name)}" data-kind="${x.kind}">＋ ${esc(x.name)}</button>`).join('');
    };
    input.addEventListener('input', render);
    input.addEventListener('focus', render);
    document.addEventListener('click', (e) => {
      if (!box.contains(e.target) && e.target !== input) box.hidden = true;
    }, { once: false });
  }

  /* ---------------- خيارات الوحدات حسب المجموعة ---------------- */
  function unitOptionsFor(selectedUnit, group) {
    const S = window.SmartUnits;
    if (!S) {
      return D.UNITS.map((u) => `<option value="${u.id}" ${selectedUnit === u.id ? 'selected' : ''}>${u.name}</option>`).join('');
    }
    const want = group || S.groupOf(selectedUnit || 'g');
    const list = Object.keys(S.UNITS).filter((k) => S.UNITS[k].group === want);
    // المجموعة العددية: نعرض الوحدات الأكثر استخدامًا أولًا
    return list.map((k) => `<option value="${k}" ${selectedUnit === k ? 'selected' : ''}>${S.UNITS[k].label}</option>`).join('');
  }

  function groupSelect(value, index, field, label) {
    const S = window.SmartUnits;
    const groups = S ? ['mass', 'volume', 'count', 'length', 'kitchen', 'custom'] : ['mass', 'volume', 'count', 'length'];
    const cur = S ? S.groupOf(value) : 'mass';
    return `<div>
      <label class="field-label">${label}</label>
      <select class="select" data-group="ingredients" data-index="${index}" data-field="${field}-group" aria-label="${label}">
        ${groups.map((g) => `<option value="${g}" ${cur === g ? 'selected' : ''}>${S ? S.GROUPS[g].label : g}</option>`).join('')}
      </select>
    </div>`;
  }

  function unitSelect(selected, group, index, field, label) {
    return `<div>
      <label class="field-label">${label}</label>
      <select class="select" data-group="ingredients" data-index="${index}" data-field="${field}" aria-label="${label}" data-unit-group="${group || ''}">
        ${unitOptionsFor(selected, group)}
      </select>
    </div>`;
  }

  // متى نُغيّر وحدة الاستخدام تلقائيًا: إذا كانت المجموعتان متوافقتين ونوع الوحدة مختلفًا
  function suggestUseUnit(packUnit) {
    const S = window.SmartUnits;
    if (!S) return packUnit;
    // بما أن الكمية المستخدمة أصغر عادةً، نقترح الوحدة الأصغر في نفس المجموعة
    const smaller = { kg: 'g', l: 'ml', m: 'cm', ton: 'kg', box: 'pc', bottle: 'pc', bag: 'g' };
    return smaller[packUnit] || packUnit;
  }

  /* ---------------- بطاقة المكوّن (٣ مراحل) ---------------- */
  function ingredientCard(ing, i, repeatInfo, isCollapsed) {
    const S = window.SmartUnits;
    const c = Calc.ingredientCost(ing);
    const qtyUnit = ing.qtyUnit || ing.unit || 'g';
    const packUnit = ing.packUnit || ing.unit || 'g';
    const det = S ? S.purchaseBreakdown({ ...ing, qtyUnit, packUnit }) : null;
    const rep = repeatInfo || { mode: 'none' };
    const isRepeat = rep.mode === 'repeat';
    const packInfo = S ? S.info(packUnit) : null;
    const useInfo = S ? S.info(qtyUnit) : null;
    const packLbl = det ? det.packLabel : { bought: 'الكمية المشتراة', used: 'الكمية المستخدمة', short: packUnit };
    const useLbl = S ? S.label(qtyUnit) : packLbl;
    const cmp = det ? det.compare : { label: 'وحدة' };

    const summary = det && det.ok
      ? `مشترياتك ${fmtNumber(det.pack)} ${packInfo ? packInfo.label : ''} بـ ${money(det.price)} · استخدمت ${fmtNumber(det.qty)} ${useInfo ? useInfo.label : ''} · تكلفة الاستخدام <b>${money(det.usedCost)}</b> · المتبقي <b>${fmtNumber(det.leftoverQty)} ${packInfo ? packInfo.label : ''}</b>`
      : 'أكمل بيانات الشراء والاستخدام ليظهر الملخص.';

    const status = !det ? '' : det.reason === 'incompatible'
      ? `<p class="df-warn">وحدتا الشراء والاستخدام من نوعين مختلفين (${det.packLabel ? S.groupLabel(packUnit) : ''}/${S.groupLabel(qtyUnit)}). لا يمكن التحويل بين الوزن والحجم دون كثافة موثوقة — اختر وحدة من نفس النوع.</p>`
      : det.reason === 'no-pack'
        ? `<p class="df-warn">أدخل الكمية المشتراة (أكبر من صفر) لتُحسب التكلفة.</p>`
        : det.reason === 'overuse'
          ? `<p class="df-warn">الكمية المستخدمة أكبر من المشتراة — راجع الأرقام.</p>`
          : '';

    const priceLine = det && det.ok ? `${money(det.unitPrice)} / ${cmp.label}` : '—';

    const isCollapsedNow = isCollapsed && det && det.ok;
    return `
      <article class="df-ing${isCollapsedNow ? ' is-collapsed' : ''}${isRepeat ? ' is-repeat' : ''}" data-ing="${i}">
        <header class="df-ing-head">
          <button type="button" class="df-ing-toggle" data-action="toggle-ingredient" data-index="${i}" aria-expanded="${isCollapsedNow ? 'false' : 'true'}">
            <span class="df-ing-no">${arNoSmall(i + 1)}</span>
            <span class="df-ing-title">${esc(ing.name || 'مكوّن جديد')}</span>
            <span class="df-ing-cost">${det && det.ok ? money(det.usedCost) : '—'}</span>
            <span class="df-ing-chev">${isCollapsedNow ? '▾' : '▴'}</span>
          </button>
          <button type="button" class="df-ing-del" data-action="del-ingredient" data-index="${i}" aria-label="حذف المكوّن">حذف</button>
        </header>

        <div class="df-ing-body">
          <section class="df-stage">
            <div class="df-stage-head"><span class="n">١</span><h4>بيانات المكوّن</h4></div>
            <div class="grid sm:grid-cols-2 gap-3">
              <div>
                <label class="field-label">اسم المكوّن</label>
                <input class="input" data-group="ingredients" data-index="${i}" data-field="name" value="${esc(ing.name)}" placeholder="مثال: سكر" aria-label="اسم المكوّن" />
              </div>
              <div>
                <label class="field-label">التصنيف / المتجر (اختياري)</label>
                <input class="input" data-group="ingredients" data-index="${i}" data-field="marketStore" value="${esc(ing.marketStore || '')}" placeholder="مثال: سوق العزيزية" />
              </div>
            </div>
            <div class="grid sm:grid-cols-2 gap-3 mt-2">
              <div>
                <label class="field-label">العلامة التجارية (اختياري)</label>
                <input class="input" data-group="ingredients" data-index="${i}" data-field="brand" value="${esc(ing.brand || '')}" placeholder="لتضييق البحث عن سعر أفضل" />
              </div>
              <div>
                <label class="field-label">رابط المنتج (اختياري)</label>
                <input class="input" data-group="ingredients" data-index="${i}" data-field="shopLink" value="${esc(ing.shopLink || '')}" placeholder="https://…" />
              </div>
            </div>
          </section>

          <section class="df-stage">
            <div class="df-stage-head"><span class="n">٢</span><h4>من أين اشتريته وبكم؟</h4></div>
            <div class="df-fields">
              <div>
                <label class="field-label">طريقة الشراء</label>
                <select class="select" data-group="ingredients" data-index="${i}" data-field="packUnit-group">
                  ${(S ? ['mass', 'volume', 'count', 'length', 'kitchen', 'custom'] : ['mass', 'volume', 'count', 'length']).map((g) => `<option value="${g}" ${S && S.groupOf(packUnit) === g ? 'selected' : ''}>${S ? S.GROUPS[g].label : g}</option>`).join('')}
                </select>
              </div>
              <div>
                <label class="field-label">وحدة الشراء</label>
                <select class="select" data-group="ingredients" data-index="${i}" data-field="packUnit">
                  ${unitOptionsFor(packUnit, S ? S.groupOf(packUnit) : null)}
                </select>
              </div>
              <div>
                <label class="field-label">${esc(packLbl.bought)}</label>
                <input class="input ${det && det.reason === 'no-pack' ? 'input-error' : ''}" inputmode="decimal" data-group="ingredients" data-index="${i}" data-field="pack" value="${esc(ing.pack)}" placeholder="مثال: 1000" />
              </div>
              <div>
                <label class="field-label">سعر الشراء (ر.س)</label>
                <input class="input" inputmode="decimal" data-group="ingredients" data-index="${i}" data-field="price" value="${esc(ing.price)}" placeholder="مثال: 6" />
              </div>
            </div>
            <p class="df-help">مثال: اشتريت ${fmtNumber(det ? det.pack || 1 : 1)} ${packInfo ? packInfo.label : ''} بـ ${money(Calc.num(ing.price) || 0)} — الأدخل هو مبلغ العبوة كاملة.</p>
          </section>

          <section class="df-stage">
            <div class="df-stage-head"><span class="n">٣</span><h4>كم استخدمت في هذه الدفعة؟</h4></div>
            <div class="df-fields">
              <div>
                <label class="field-label">وحدة الاستخدام</label>
                <select class="select" data-group="ingredients" data-index="${i}" data-field="qtyUnit">
                  ${unitOptionsFor(qtyUnit, S ? S.groupOf(qtyUnit) : null)}
                </select>
              </div>
              <div>
                <label class="field-label">${esc(useLbl.used)}</label>
                <input class="input" inputmode="decimal" data-group="ingredients" data-index="${i}" data-field="qty" value="${esc(ing.qty)}" placeholder="مثال: 500" />
              </div>
            </div>
            ${status}
            ${det && det.ok ? `<div class="df-receipt">
              <p>اشتريت ${fmtNumber(det.pack)} ${packInfo.label} بـ ${money(det.price)}.</p>
              <p>استخدمت ${fmtNumber(det.qty)} ${useInfo.label} ← تكلفة الاستخدام <b>${money(det.usedCost)}</b>.</p>
              <p>المتبقي ${fmtNumber(det.leftoverQty)} ${packInfo.label} · قيمته <b>${money(det.leftoverValue)}</b>.</p>
              <p class="df-receipt-price">سعر الوحدة: ${priceLine} · نسبة الاستهلاك ${det.usedSharePct}%</p>
            </div>` : ''}
          </section>

          <section class="df-stage df-stage-quiet">
            <div class="df-stage-head"><span class="n">٤</span><h4>الملخص</h4></div>
            <dl class="df-summary">
              <div><dt>تكلفة الجزء المستخدم</dt><dd data-cost="ing-${i}">${money(c.costUsed)}</dd></div>
              <div><dt>المتبقي (قيمة)</dt><dd data-leftover="ing-${i}">${money(c.leftoverValue)}</dd></div>
              <div><dt>سعر الوحدة</dt><dd>${priceLine}</dd></div>
            </dl>
            <div class="df-options">
              <div>
                <p class="field-label">نوع السعر</p>
                <div class="pill-toggle">
                  <button type="button" data-action="price-type" data-index="${i}" data-type="actual" class="${ing.type === 'actual' ? 'on' : ''}">فعلي</button>
                  <button type="button" data-action="price-type" data-index="${i}" data-type="estimated" class="${ing.type !== 'actual' ? 'on' : ''}">تقديري</button>
                </div>
              </div>
              <div>
                <label class="field-label">سعر السوق لنفس العبوة (اختياري)</label>
                <input class="input" inputmode="decimal" data-group="ingredients" data-index="${i}" data-field="marketPrice" value="${ing.marketPrice == null ? '' : esc(ing.marketPrice)}" placeholder="لمقارنة الشراء" />
              </div>
              <div class="price-check-wrap">
                <button type="button" class="price-check-btn" data-action="check-price" data-index="${i}"
                  ${(!ing.name || Calc.num(ing.pack) <= 0 || Calc.num(ing.price) <= 0) ? 'disabled' : ''}>
                  <span class="pc-spark">${state.priceChecks && state.priceChecks[i] && state.priceChecks[i].loading ? '⏳' : '💰'}</span>
                  ${state.priceChecks && state.priceChecks[i] && state.priceChecks[i].loading ? 'يفحص…' : 'ابحث عن سعر أفضل'}
                </button>
                ${priceCheckBadge(i)}
                <p class="df-help">يفتح بحث «موازن» بنفس الاسم والحجم، ويلوّن السعر إن كان أعلى ٥٪ من سعر السوق الذي أدخلته.</p>
              </div>
            </div>
            ${isRepeat ? `<p class="df-help is-warn">مكرر مع عبوة سابقة: ${money(rep.row.dupCost)} لا تُضاف مرتين.</p>` : ''}
            ${summary ? `<p class="df-summary-line">${summary}</p>` : ''}
          </section>
        </div>
      </article>`;
  }

  function arNoSmall(n) {
    const map = { 0: '٠', 1: '١', 2: '٢', 3: '٣', 4: '٤', 5: '٥', 6: '٦', 7: '٧', 8: '٨', 9: '٩' };
    return String(n).split('').map((d) => map[d] || d).join('');
  }

  /* دفتر V3 — تحديث البطاقة حيًّا دون تفقّد التركيز */
  function liveIngredientUpdate(index, field, caret) {
    const S = window.SmartUnits;
    const ing = state.ingredients[index];
    if (!ing) return false;
    const card = document.querySelector(`[data-ing="${index}"]`);
    if (!card) return false;
    // تغيير المجموعة: نضبط الوحدة لأول خيار في المجموعة ونعيد التصيير
    if (/-group$/.test(field)) {
      const S2 = window.SmartUnits;
      const base = field.replace(/-group$/, '');
      if (S2) {
        const list = Object.keys(S2.UNITS).filter((k) => S2.UNITS[k].group === ing[field] );
        const first = list[0];
        if (first) {
          ing[base] = first;
          if (base === 'packUnit' && !S2.compatible(ing.qtyUnit || ing.unit || first, first)) ing.qtyUnit = suggestUseUnit(first);
        }
      }
      clearAi();
      renderStep();
      return true;
    }
    // تغيير وحدة الشراء: نقترح وحدة استخدام متوافقة إن اختلفت المجموعة
    if (field === 'packUnit' && S) {
      if (!S.compatible(ing.qtyUnit || ing.unit || 'g', ing.packUnit)) {
        ing.qtyUnit = suggestUseUnit(ing.packUnit);
        clearAi();
        renderStep();
        return true;
      }
    }
    const det = S ? S.purchaseBreakdown({ ...ing, qtyUnit: ing.qtyUnit || ing.unit || 'g', packUnit: ing.packUnit || ing.unit || 'g' }) : null;
    // تحديث الملخص والتسميات داخل البطاقة نفسها
    const fresh = document.createElement('div');
    fresh.innerHTML = ingredientCard(ing, index, ingredientRepeatState()[index], false);
    const freshCard = fresh.firstElementChild;
    if (freshCard) {
      card.replaceWith(freshCard);
      const el = document.querySelector(`[data-group="ingredients"][data-index="${index}"][data-field="${field}"]`);
      if (el && el !== document.activeElement) {
        el.focus();
        if (caret != null && el.setSelectionRange) { try { el.setSelectionRange(caret, caret); } catch (e) {} }
      }
      refreshEditorTotals();
      save();
      return true;
    }
    return false;
  }

  /* شريط الاقتراحات السريعة — يُقرأ من بيانات المنتج النشط فقط */
  const MAX_QUICK_ADD = 6;

  function activeProduct() {
    if (!state.productId) return null;
    return D.getProduct(state.domainId, state.subcategoryId, state.productId);
  }

  // شريط مقترحات التغليف (يبقى لأنها ليست مرتبطة بمنتج بعينه)
  function presetBar(kind, groups, placeholder) {
    const keys = Object.keys(groups || {});
    if (!keys.length) return '';
    const chips = (name) => `<span class="chip-group" data-preset-group="${esc(name)}" hidden>`
      + groups[name].map((x) => `<button type="button" class="chip chip-sm" data-action="add-packaging-preset" data-name="${esc(x)}">${esc(x)}</button>`).join('')
      + '</span>';
    return '<div class="preset-bar" data-preset-bar="' + kind + '">'
      + '<p class="field-label">' + esc(placeholder) + '</p>'
      + '<div class="preset-groups">'
      + keys.map((k) => `<button type="button" class="chip chip-sm preset-group-btn" data-action="toggle-preset-group" data-group-name="${esc(k)}">${esc(k)} ▾</button>`).join('')
      + '</div>'
      + keys.map((k) => chips(k)).join('')
      + '</div>';
  }

  function quickAddBar() {
    const product = activeProduct();
    const items = D.quickAddFor(state.domainId, product).slice(0, MAX_QUICK_ADD);
    if (!items.length) return '';
    const existing = new Set(state.ingredients.map((x) => String(x.name || '').trim()));
    const productName = state.productName || (product ? product.name : '');
    const chips = items.map((x) => {
      const added = existing.has(x);
      const cls = 'chip chip-sm' + (added ? ' chip-added' : '');
      const attrs = added ? 'disabled aria-disabled="true"' : '';
      return `<button type="button" class="${cls}" data-action="add-ingredient-preset" data-name="${esc(x)}" ${attrs}>${added ? '✓ ' : '＋ '}${esc(x)}</button>`;
    }).join('');
    return ''
      + '<div class="preset-bar" data-preset-bar="ingredients">'
      + `<p class="field-label">اقتراحات سريعة لـ «${esc(productName)}»</p>`
      + `<div class="preset-groups">${chips}</div>`
      + '</div>';
  }

  // شارة نتيجة فحص السعر (أخضر جيد / أحمر غالي / رمادي محايد)
  function priceCheckBadge(i) {
    const pc = state.priceChecks && state.priceChecks[i];
    if (!pc) return '';
    if (pc.loading) return '<span class="pc-badge pc-loading">⏳ يفحص الذكاء الاصطناعي…</span>';
    if (pc.error) return `<span class="pc-badge pc-bad">${esc(pc.error)}</span>`;
    const tone = pc.tone === 'good' ? 'pc-good' : pc.tone === 'bad' ? 'pc-bad' : 'pc-neutral';
    const icon = pc.tone === 'good' ? '✓' : pc.tone === 'bad' ? '!' : '•';
    return `<span class="pc-badge ${tone}">${icon} ${esc(pc.verdict || '')}</span>`;
  }

  /* ---------------- محرر التغليف ---------------- */
  function renderPackagingStep() {
    const rows = state.packaging.map((p, i) => packagingCard(p, i)).join('');
    $('#wizardBody').innerHTML = `
      <div class="fade-up">
        <div class="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h3 class="text-2xl font-semibold tracking-tight">التغليف والاستهلاكيات</h3>
            <p class="text-soft mt-1.5 text-sm max-w-2xl">كل عنصر: عدد القطع في العبوة وسعرها وعدد القطع المستخدمة. يحسب النظام تكلفة التغليف لكل دفعة.</p>
          </div>
          <div class="text-left">
            <p class="text-xs faint">إجمالي التغليف</p>
            <p class="text-xl font-semibold" data-subtotal="packaging">—</p>
          </div>
        </div>
        <div class="space-y-3 mt-5">${rows || '<p class="text-sm muted">لا توجد عناصر تغليف. أضف عنصرًا.</p>'}</div>
        ${presetBar('packaging', D.PACKAGING_PRESETS, 'أضف عنصر تغليف سريعًا')}
        <button type="button" class="btn btn-secondary mt-4" data-action="add-packaging">＋ إضافة عنصر تغليف</button>
        ${editorFooter('ingredients', 'operations', 'التالي: التشغيل')}
      </div>`;
    refreshEditorTotals();
  }

  function packagingCard(p, i) {
    const cost = Calc.packagingCost(p);
    return `
      <div class="item-row">
        <div class="flex items-start gap-3">
          <input class="input font-medium flex-1" data-group="packaging" data-index="${i}" data-field="name" value="${esc(p.name)}" placeholder="اسم عنصر التغليف" aria-label="اسم عنصر التغليف" />
          <button type="button" class="btn btn-quiet text-[13px]" data-action="del-packaging" data-index="${i}" style="color:var(--bad)">حذف</button>
        </div>
        <div class="grid grid-cols-3 gap-3 mt-3">
          <div><label class="field-label">عدد القطع في العبوة</label><input class="input" inputmode="decimal" data-group="packaging" data-index="${i}" data-field="piecesPerPack" value="${esc(p.piecesPerPack)}" /></div>
          <div><label class="field-label">سعر العبوة (ر.س)</label><input class="input" inputmode="decimal" data-group="packaging" data-index="${i}" data-field="packPrice" value="${esc(p.packPrice)}" /></div>
          <div><label class="field-label">عدد القطع المستخدمة</label><input class="input" inputmode="decimal" data-group="packaging" data-index="${i}" data-field="piecesUsed" value="${esc(p.piecesUsed)}" /></div>
        </div>
        <div class="mt-3">
          <p class="field-label">تكلفة الاستخدام</p>
          <p class="font-semibold text-[15px]" data-cost="pkg-${i}">${money(cost)}</p>
        </div>
      </div>`;
  }

  /* ---------------- محرر التشغيل ---------------- */
  function renderOperationsStep() {
    const opts = D.OPERATIONAL_PRESETS.map((p) =>
      `<button type="button" class="chip" data-action="add-op" data-name="${esc(p.name)}">${p.icon} ${esc(p.name)}</button>`).join('');
    const rows = state.operational.map((o, i) => operationalCard(o, i)).join('');
    const h = Math.floor(Calc.num(state.timeMinutes) / 60);
    const m = Math.round(Calc.num(state.timeMinutes) % 60);
    $('#wizardBody').innerHTML = `
      <div class="fade-up">
        <h3 class="text-2xl font-semibold tracking-tight">المصاريف التشغيلية ووقتك</h3>
        <p class="text-soft mt-1.5 text-sm max-w-2xl">لا تنسَ المصاريف غير المباشرة. أدخلها يومية أو شهرية أو لكل دفعة، وسيوزّعها النظام على الدفعات بدل تحميل مصروف شهري كامل على منتج واحد.</p>

        <div class="card card-sm p-4 mt-5 bg-[#fbfbfd]">
          <label class="field-label">كم دفعة تنتج شهريًا؟ <span class="faint">(لتوزيع المصاريف الشهرية واليومية)</span></label>
          <input class="input max-w-[180px]" inputmode="decimal" data-group="meta" data-field="batchesPerMonth" value="${esc(state.batchesPerMonth)}" />
        </div>

        <p class="text-xs faint mt-5 mb-2">أضف مصروفًا سريعًا:</p>
        <div class="flex flex-wrap gap-2">${opts}</div>

        <div class="space-y-3 mt-4">${rows || '<p class="text-sm muted">لا توجد مصاريف تشغيلية بعد.</p>'}</div>
        <button type="button" class="btn btn-secondary mt-3" data-action="add-op" data-name="مصروف آخر">＋ إضافة مصروف</button>

        ${renderPaymentGateways()}

        <div class="grid sm:grid-cols-2 gap-4 mt-6">
          <div class="card card-sm p-4">
            <h4 class="font-semibold text-[15px] mb-3">وقت إعداد الدفعة</h4>
            <div class="grid grid-cols-2 gap-3">
              <div><label class="field-label">ساعات</label><input class="input" inputmode="decimal" data-group="meta" data-field="timeHours" value="${h}" /></div>
              <div><label class="field-label">دقائق</label><input class="input" inputmode="decimal" data-group="meta" data-field="timeMinutesPart" value="${m}" /></div>
            </div>
            <div class="mt-3">
              <label class="field-label">قيمة ساعة العمل (ر.س) — اختياري</label>
              <input class="input" inputmode="decimal" data-group="meta" data-field="hourlyRate" value="${esc(state.hourlyRate)}" />
              <p class="text-[11px] faint mt-1">وقتك له قيمة؛ اتركه صفرًا إن لم ترغب باحتسابه.</p>
            </div>
          </div>
          <div class="card card-sm p-4">
            <h4 class="font-semibold text-[15px] mb-3">كمية الإنتاج من هذه الدفعة</h4>
            <label class="field-label">كم عدد ${outputLabel().many} في هذه الدفعة؟</label>
            <input class="input" inputmode="decimal" data-group="meta" data-field="units" value="${esc(state.units)}" />
            <p class="text-[11px] faint mt-1">مثال: 10 ${outputLabel().many}، أو 15 ${outputLabel().one}.</p>
          </div>
        </div>

        ${editorFooter('packaging', 'pricing', 'التالي: التسعير')}
      </div>`;
    refreshEditorTotals();
  }

  /* ---------------- بوابات الدفع (رسوم نسبة + مبلغ ثابت) ---------------- */
  // حالة المستخدم: state.paymentGateways = [{ id, enabled, pct, fixed }]
  const DEFAULT_GATEWAYS = [
    { id: 'mada', name: 'مدى (Mada)', icon: '💳', pct: 0.8, fixed: 1 },
    { id: 'card', name: 'البطاقات الائتمانية (Visa / Mastercard)', icon: '🏦', pct: 2.2, fixed: 1 },
    { id: 'installment', name: 'التقسيط (تابي / تمارا)', icon: '🧾', pct: 5, fixed: 0 }
  ];

  function gatewayState() {
    const list = Array.isArray(state.paymentGateways) ? state.paymentGateways : [];
    return DEFAULT_GATEWAYS.map((g) => {
      const found = list.find((x) => x && x.id === g.id);
      return {
        id: g.id,
        name: g.name,
        icon: g.icon,
        enabled: !!(found && found.enabled),
        pct: found && found.pct != null ? Calc.num(found.pct) : g.pct,
        fixed: found && found.fixed != null ? Calc.num(found.fixed) : g.fixed
      };
    });
  }

  function gatewayFees(r) {
    return Calc.paymentFees(gatewayState(), r.sellPrice, r.units);
  }

  // تحديث حي لرسوم البوابة أثناء الكتابة (بدون إعادة بناء الحقول)
  function refreshGatewayTotals() {
    const panel = document.getElementById('gatewayPanel');
    if (!panel) return;
    const r = Calc.compute(state);
    const fees = gatewayFees(r);
    gatewayState().forEach((g) => {
      const cell = panel.querySelector('[data-gw-per="' + g.id + '"]');
      if (cell) cell.textContent = g.enabled ? money(Calc.paymentFees([{ ...g, enabled: true }], r.sellPrice, r.units).perUnit) : '—';
    });
    const batchEl = panel.querySelector('[data-gw-batch]');
    if (batchEl) batchEl.textContent = money(fees.perBatch);
    const netEl = panel.querySelector('[data-gw-net]');
    if (netEl) { netEl.textContent = money(r.profitTotal); netEl.className = 'font-semibold text-[16px] ' + (r.profitTotal < 0 ? 'text-[--bad]' : 'text-[--good]'); }
  }

  function renderPaymentGateways() {
    const list = gatewayState();
    const r = Calc.compute(state);
    const fees = Calc.paymentFees(list, r.sellPrice, r.units);
    const enabledCount = list.filter((g) => g.enabled).length;
    const open = !!state.gatewaysOpen;

    const body = `
      <div class="gateway-list mt-3">
        ${list.map((g) => `
          <div class="gateway-row${g.enabled ? ' on' : ''}">
            <label class="gateway-check">
              <input type="checkbox" data-action="toggle-gateway" data-id="${g.id}" ${g.enabled ? 'checked' : ''} />
              <span class="gw-title">${g.icon} ${esc(g.name)}</span>
            </label>
            <div class="gateway-inputs">
              <div>
                <label class="field-label">النسبة %</label>
                <input class="input input-sm" inputmode="decimal" data-group="gateway" data-id="${g.id}" data-field="pct" value="${esc(g.pct)}" ${g.enabled ? '' : 'disabled'} />
              </div>
              <div>
                <label class="field-label">مبلغ ثابت (ر.س)</label>
                <input class="input input-sm" inputmode="decimal" data-group="gateway" data-id="${g.id}" data-field="fixed" value="${esc(g.fixed)}" ${g.enabled ? '' : 'disabled'} />
              </div>
              <div class="gateway-per">
                <p class="field-label">لكل ${esc(outputLabel().one)}</p>
                <p class="font-semibold text-[14px]" data-gw-per="${g.id}">${g.enabled ? money(Calc.paymentFees([{ ...g, enabled: true }], r.sellPrice, r.units).perUnit) : '—'}</p>
              </div>
            </div>
          </div>`).join('')}
      </div>

      ${fees.enabledCount ? `
        <div class="gateway-total mt-3">
          <div>
            <p class="text-xs faint">إجمالي الرسوم على الدفعة (${fmt0(r.units)} ${outputLabel().one})</p>
            <p class="font-semibold text-[16px]" data-gw-batch>${money(fees.perBatch)}</p>
          </div>
          <div>
            <p class="text-xs faint">صافي الربح بعد الرسوم</p>
            <p class="font-semibold text-[16px] ${r.profitTotal < 0 ? 'text-[--bad]' : 'text-[--good]'}" data-gw-net>${money(r.profitTotal)}</p>
          </div>
        </div>` : ''}
    `;

    return `
      <div class="card card-sm p-4 mt-6 gateway-card${open ? ' open' : ''}" id="gatewayPanel">
        <button type="button" class="gateway-toggle" data-action="toggle-gateways-panel" aria-expanded="${open ? 'true' : 'false'}" aria-controls="gatewayBody">
          <span class="gw-toggle-icon">${open ? '−' : '＋'}</span>
          <span class="gw-toggle-text">
            <b>هل تقبل الدفع الإلكتروني؟</b>
            <small>أضف رسوم مدى، فيزا، تابي — تُخصم من الربح ولا تدخل تكلفة الصنع.</small>
          </span>
          <span class="gw-toggle-meta">${enabledCount ? money(fees.perBatch) + ' رسوم' : 'غير مفعّلة'}</span>
        </button>
        <div class="gw-body" id="gatewayBody" aria-hidden="${open ? 'false' : 'true'}" style="max-height:${open ? 'none' : '0px'}">
          <div class="gw-body-inner">${body}</div>
        </div>
      </div>`;
  }

  function operationalCard(o, i) {
    const perBatch = Calc.operationalPerBatch(o, state.batchesPerMonth);
    return `
      <div class="item-row">
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 items-end">
          <div class="col-span-2 sm:col-span-1"><label class="field-label">المصروف</label><input class="input" data-group="operational" data-index="${i}" data-field="name" value="${esc(o.name)}" /></div>
          <div><label class="field-label">المبلغ (ر.س)</label><input class="input" inputmode="decimal" data-group="operational" data-index="${i}" data-field="amount" value="${esc(o.amount)}" /></div>
          <div><label class="field-label">الدورية</label>
            <select class="select" data-group="operational" data-index="${i}" data-field="period">
              <option value="perBatch" ${o.period === 'perBatch' ? 'selected' : ''}>لكل دفعة</option>
              <option value="daily" ${o.period === 'daily' ? 'selected' : ''}>يومي</option>
              <option value="monthly" ${o.period === 'monthly' ? 'selected' : ''}>شهري</option>
            </select>
          </div>
          <div class="flex items-center justify-between gap-2">
            <div><p class="field-label">لكل دفعة</p><p class="font-semibold text-[14px]" data-cost="op-${i}">${money(perBatch)}</p></div>
            <button type="button" class="btn btn-quiet" data-action="del-op" data-index="${i}" style="color:var(--bad)">حذف</button>
          </div>
        </div>
      </div>`;
  }

  /* ---------------- التسعير ---------------- */
  const TARGET_MARGIN_KEY = 'mirbah_daftar_target_margin';
  function targetMargin() {
    const v = Calc.num(localStorage.getItem(TARGET_MARGIN_KEY));
    return v > 0 && v < 95 ? v : 40; // هامش افتراضي 40%
  }
  // سعر مقترح من الهامش المستهدف: السعر = التكلفة ÷ (1 - الهامش)
  function suggestedPrice(unitCost, marginPct) {
    const c = Calc.num(unitCost);
    const m = Math.min(90, Math.max(0, Calc.num(marginPct))) / 100;
    if (c <= 0) return 0;
    return Calc.round2(c / (1 - m));
  }

  function renderPricingStep() {
    const r = Calc.compute(state);
    const balanced = r.pricingOptions[1];
    const tm = targetMargin();
    const suggested = suggestedPrice(r.unitCost, tm);
    const cur = Calc.num(state.sellPrice) || suggested;
    const perUnit = Calc.round2(r.batchTotal / Math.max(1, r.units));
    const profit = Calc.round2(cur - perUnit);
    const marginNow = cur > 0 ? Calc.round1((profit / cur) * 100) : 0;
    $('#wizardBody').innerHTML = `
      <div class="fade-up max-w-3xl">
        ${totalsBar(r)}
        <div class="df-stage-head mt-5"><span class="n">السعر</span><h4>بكم تبيع ${outputLabel().one}؟</h4></div>
        <p class="df-help">اقترحنا سعرًا من هامش الربح المستهدف، لكنك حرّ: عدّل الهامش أو اكتب سعرك، وكل الأرقام تتحدّث فورًا.</p>

        <div class="df-price-grid">
          <div class="df-price-box">
            <label class="field-label">هامش الربح المستهدف %</label>
            <input class="input" inputmode="decimal" id="dfTargetMargin" data-group="meta" data-field="targetMargin" value="${tm}" />
            <div class="df-target-row">
              <button type="button" class="df-target" data-action="set-margin" data-value="20">20%</button>
              <button type="button" class="df-target" data-action="set-margin" data-value="30">30%</button>
              <button type="button" class="df-target" data-action="set-margin" data-value="40">40%</button>
              <button type="button" class="df-target" data-action="set-margin" data-value="50">50%</button>
            </div>
            <p class="df-help">السعر المقترح = التكلفة ÷ (١ − الهامش).</p>
            <p class="df-price-hint">السعر المقترح: <button type="button" class="df-use" data-action="apply-price" data-price="${suggested}">${money(suggested)}</button> — اضغط لتطبيقه.</p>
          </div>
          <div class="df-price-box df-price-box-main">
            <label class="field-label">سعر بيع ${outputLabel().one} (ر.س)</label>
            <input class="input" style="height:56px;font-size:1.4rem" inputmode="decimal" data-group="meta" data-field="sellPrice" value="${esc(state.sellPrice)}" placeholder="${suggested}" />
            <div class="df-price-live">
              <div><span>التكلفة</span><b>${money(r.unitCost)}</b></div>
              <div><span>سعر البيع</span><b>${money(cur)}</b></div>
              <div><span>الربح</span><b class="${profit < 0 ? 'is-bad' : 'is-good'}">${money(profit)}</b></div>
              <div><span>الهامش</span><b>${marginNow}%</b></div>
            </div>
          </div>
        </div>

        <div class="grid sm:grid-cols-2 gap-4 mt-4">
          <div class="card card-sm p-4">
            <h4 class="font-semibold text-[15px] mb-1">عرض مجموعة (اختياري)</h4>
            <p class="df-help">عرض ٣ علب بسعر أقل من مجموعها.</p>
            <div class="grid grid-cols-2 gap-3 mt-2">
              <div><label class="field-label">عدد ${outputLabel().many}</label><input class="input" inputmode="decimal" data-group="meta" data-field="bundleQty" value="${esc(state.bundleQty)}" placeholder="مثال: 3" /></div>
              <div><label class="field-label">سعر المجموع (ر.س)</label><input class="input" inputmode="decimal" data-group="meta" data-field="bundlePrice" value="${esc(state.bundlePrice)}" placeholder="مثال: 27" /></div>
            </div>
          </div>
          <div class="card card-sm p-4">
            <h4 class="font-semibold text-[15px] mb-1">خصم عروض الكميات (اختياري)</h4>
            <p class="df-help">نسبة بداية لخفض أسعار الكميات عند عرض العروض.</p>
            <label class="field-label">نسبة الخصم %</label>
            <input class="input" inputmode="decimal" data-group="meta" data-field="discountPct" value="${esc(state.discountPct)}" placeholder="مثال: 10" />
          </div>
        </div>

        ${renderPurchaseModel(r)}

        <div class="flex flex-wrap items-center justify-between gap-3 mt-6">
          <button type="button" class="btn btn-secondary" data-action="goto" data-step="operations">→ رجوع</button>
          <button type="button" class="btn btn-primary btn-lg" data-action="show-results">اعرض النتائج والتحليل</button>
        </div>
      </div>`;
    // التحديث الحي: هامش مستهدف يُعيد السعر والميزانية فورًا دون فقد التركيز
    const marginEl = $('#dfTargetMargin');
    if (marginEl) {
      const sync = () => {
        const v = Calc.num(marginEl.value);
        try { localStorage.setItem(TARGET_MARGIN_KEY, String(v)); } catch (e) {}
        const computed = Calc.compute(state);
        const next = suggestedPrice(computed.unitCost, v);
        const use = document.querySelector('.df-use');
        if (use) { use.textContent = money(next); use.setAttribute('data-price', next); }
        const box = document.querySelector('.df-price-box-main');
        if (box) {
          const sell = Calc.num(state.sellPrice) || next;
          const per = computed.units > 0 ? computed.batchTotal / computed.units : 0;
          const live = box.querySelector('.df-price-live');
          if (live) {
            const vals = [money(per), money(sell), money(Calc.round2(sell - per)), (sell > 0 ? Calc.round1(((sell - per) / sell) * 100) : 0) + '%'];
            live.querySelectorAll('b').forEach((b, i) => { if (vals[i] != null) b.textContent = vals[i]; });
          }
        }
      };
      marginEl.addEventListener('input', sync);
    }
  }

  /* ---------------- نموذج الشراء (كم تشتري؟) ---------------- */
  // ملاحظة المخزون: هل كمية الشراء الشهرية تكفي دفعات الشهر؟
  function purchaseStockNote(r) {
    const pm = r.purchase;
    if (!pm) return '';
    if (pm.expectedPacks == null) {
      return `<p class="text-[11px] faint mt-2">أدخل عدد العبوات المشتراة لتحسب تكلفة الدفعة بدقة.</p>`;
    }
    if (pm.shortfall > 0) {
      return `<p class="purchase-warn mt-2">كمية الشراء الشهرية أقل مما تحتاجه دفعات الشهر بـ <b>${fmt0(pm.shortfall)} عبوة</b>. أضفها إلى مشترياتك لتغطية ${fmt0(pm.batches)} دفعة.</p>`;
    }
    const perBatch = pm.unitsPerPack != null ? ` · كل عبوة تكفي ~${fmt0(pm.unitsPerPack)} ${outputLabel().one}` : '';
    return `<p class="text-[11px] muted mt-2">مخزون الشهر يكفي ${fmt0(pm.expectedPacks || 0)} عبوة لـ ${fmt0(pm.batches)} دفعة${perBatch}.` +
      (pm.daysOfStock != null ? ` يكفي تقريبًا ${fmt1(pm.daysOfStock)} شهر من الدفعات.` : '') + '</p>';
  }

  /* =============================================================
     دفتر V3 — «كم تشتري وكم تنتج؟» (إعادة بناء)
     القاعدة: كمية الشراء تُشتق من المكونات المدخلة، والمستخدم يضبط الإنتاج.
     ============================================================= */
  function totalsBar(r) {
    const ing = r.ingredientsTotal, pkg = r.packagingTotal, op = r.operationalTotal, t = r.timeTotal;
    return `<div class="df-totals">
      <div class="df-total df-total-main"><span>تكلفة الدفعة</span><b>${money(r.batchTotal)}</b></div>
      <div class="df-total"><span>المكونات</span><b>${money(ing)}</b></div>
      <div class="df-total"><span>التغليف</span><b>${money(pkg)}</b></div>
      <div class="df-total"><span>التشغيل + الوقت</span><b>${money(op + t)}</b></div>
      <div class="df-total"><span>تكلفة ${outputLabel().one}</span><b>${money(r.unitCost)}</b></div>
    </div>`;
  }

  function purchaseLayers(r) {
    const one = outputLabel().one;
    const many = outputLabel().many;
    const usedInBatch = r.ingredientsTotal;
    const perUnitMat = r.units > 0 ? usedInBatch / r.units : 0;
    const perUnitPkg = r.units > 0 ? r.packagingTotal / r.units : 0;
    const perUnitOp = r.units > 0 ? (r.operationalTotal + r.timeTotal) / r.units : 0;
    return `<div class="df-layers">
      <div class="df-layer">
        <span class="k">كم تشتري؟</span>
        <b>ما تحمله العبوة</b>
        <p>الكمية التي تدفع لها في المتجر (وزن أو حجم أو عدد). تُدخلها في كل مكوّن، ويُحسب منها سعر الوحدة.</p>
      </div>
      <div class="df-layer">
        <span class="k">كم تستهلك؟</span>
        <b>ما يدخل في الدفعة فقط</b>
        <p>الجزء المستهلك من العبوة. النظام يحاسبك عليه وحده: <em>سعر العبوة × (المستخدم ÷ المشترى)</em>.</p>
      </div>
      <div class="df-layer">
        <span class="k">كم تنتج؟</span>
        <b>عدد ${many} النهائية</b>
        <p>كل ما تنتجه هذه الدفعة. تكلفة الواحدة = إجمالي التكاليف ÷ هذا العدد.</p>
      </div>
      <div class="df-layer df-layer-sum">
        <span class="k">كم تكلفة الواحدة؟</span>
        <b>${money(r.unitCost)}</b>
        <p>مواد ${money(perUnitMat)} + تغليف ${money(perUnitPkg)} + تشغيل ${money(perUnitOp)} لكل ${one}.</p>
      </div>
    </div>`;
  }

  function renderPurchaseModel(r) {
    return `${purchaseLayers(r)}
      <div class="card card-sm p-4 mt-4" id="purchaseModel">
        <div class="df-stage-head"><span class="n">الإنتاج</span><h4>كم تنتج من هذه الدفعة؟</h4></div>
        <p class="df-help">هذا الرقم يوزّع التكلفة على المنتجات. مثال: صنعت 20 ${outputLabel().one} من المواد أعلاه ← تكلفة كل ${outputLabel().one} = إجمالي التكاليف ÷ 20.</p>
        <div class="grid sm:grid-cols-3 gap-3 mt-3">
          <div>
            <label class="field-label">عدد ${outputLabel().many} الناتجة</label>
            <input class="input" inputmode="decimal" data-group="meta" data-field="units" value="${esc(state.units)}" />
            <p class="df-help">عدد المنتجات الجاهزة للبيع من هذه الدفعة كلها.</p>
          </div>
          <div>
            <label class="field-label">عدد الدفعات شهريًا</label>
            <input class="input" inputmode="decimal" data-group="meta" data-field="batchesPerMonth" value="${esc(state.batchesPerMonth)}" />
            <p class="df-help">لتوزيع المصاريف الشهرية (الإيجار، الكهرباء) على دفعاتك.</p>
          </div>
          <div>
            <label class="field-label">عدد العبوات المشتراة (اختياري)</label>
            <input class="input" inputmode="decimal" data-group="meta" data-field="packCount" value="${esc(state.packCount || '')}" placeholder="مثال: 12" />
            <p class="df-help">للمقارنة مع إنتاجك الشهري فقط.</p>
          </div>
        </div>
        <div class="df-model-summary">
          <span>تكلفة المواد للدفعة <b>${money(r.ingredientsTotal)}</b></span>
          <span>تكلفة المواد للـ${outputLabel().one} <b>${money(r.units > 0 ? r.ingredientsTotal / r.units : 0)}</b></span>
          <span>إجمالي تكلفة الـ${outputLabel().one} <b>${money(r.unitCost)}</b></span>
        </div>
        ${purchaseStockNote(r)}
      </div>`;
  }

  function editorFooter(back, next, nextLabel) {
    return `<div class="flex flex-wrap items-center justify-between gap-3 mt-7 pt-5" style="border-top:1px solid var(--line)">
      <button type="button" class="btn btn-secondary" data-action="goto" data-step="${back}">→ رجوع</button>
      <button type="button" class="btn btn-primary" data-action="goto" data-step="${next}">${nextLabel} ←</button>
    </div>`;
  }

  /* ---------------- صفحة النتائج ---------------- */
  function destroyCharts() {
    charts.forEach((c) => { try { c.destroy(); } catch (e) {} });
    charts = [];
  }

  function statusInfo(status) {
    if (status === 'profit') return { label: 'ربح', badge: 'badge-good', hero: 'status-profit', emoji: '📈', text: 'منتجك يحقق ربحًا بعد كل التكاليف.' };
    if (status === 'loss') return { label: 'خسارة', badge: 'badge-bad', hero: 'status-loss', emoji: '📉', text: 'السعر الحالي لا يغطي التكاليف الحقيقية.' };
    return { label: 'قريب من نقطة التعادل', badge: 'badge-warn', hero: 'status-breakeven', emoji: '⚖️', text: 'الربح شبه معدوم ويحتاج مراجعة.' };
  }

  function kpi(label, value, sub) {
    return `<div class="card card-sm p-4">
      <p class="kpi-label">${label}</p>
      <p class="kpi-value">${value}</p>
      ${sub ? `<p class="text-[11px] faint mt-1">${sub}</p>` : ''}
    </div>`;
  }

  function renderResults() {
    destroyCharts();
    const r = Calc.compute(state);
    const meta = metaNames();
    const st = statusInfo(r.status);
    const L = outputLabel();
    const uOne = L.one;
    const uMany = L.many;

    const costRows = [
      ['المكونات', r.ingredientsTotal, '#1d1d1f'],
      ['التغليف', r.packagingTotal, '#6e6e73'],
      ['المصاريف التشغيلية', r.operationalTotal, '#a1a1a6'],
      ['قيمة وقت العمل', r.timeTotal, '#d2d2d7']
    ];

    const bundleLine = (Calc.num(state.bundleQty) > 0 && Calc.num(state.bundlePrice) > 0)
      ? (() => {
          const q = Calc.num(state.bundleQty);
          const bp = Calc.num(state.bundlePrice);
          const perUnit = bp / q;
          const profit = bp - (r.unitCost * q);
          return `<div class="mt-3 text-sm muted">عرض المجموعة: ${fmt0(q)} ${uMany} بـ ${money(bp)} — سعر ال${uOne} ${money(perUnit)} — ربح العرض <b class="${profit >= 0 ? '' : 'text-[--bad]'}">${money(profit)}</b></div>`;
        })() : '';

    const applyDiscountNote = Calc.num(state.discountPct) > 0
      ? `<p class="text-xs faint mt-2">الخصم المحدد: ${fmt0(state.discountPct)}% — يظهر أثره في عروض الكميات بالأسفل.</p>` : '';

    $('#resultsBody').innerHTML = `
      <div class="fade-up">
        <div class="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <p class="section-kicker">نتيجة التسعير</p>
            <h2 class="text-2xl sm:text-3xl font-semibold tracking-tight">${esc(meta.product || 'منتجك')}</h2>
            <p class="text-sm faint mt-1">${esc(meta.projectType)} · ${esc(meta.domain)} · ${esc(meta.subcategory)}</p>
          </div>
          <div class="flex gap-2">
            <button class="btn btn-secondary" data-action="goto" data-step="pricing">تعديل الأسعار</button>
            <button class="btn btn-quiet" data-action="new-journey">بدء رحلة جديدة</button>
          </div>
        </div>

        <!-- مؤشر الحالة -->
        <div class="status-hero ${st.hero}">
          <div class="flex flex-wrap items-center justify-between gap-4">
            <div>
              <span class="badge ${st.badge}">${st.emoji} ${st.label}</span>
              <p class="text-2xl sm:text-[1.7rem] font-semibold tracking-tight mt-3">${st.text}</p>
              <p class="text-sm muted mt-1">${r.status === 'loss' ? 'الخسارة في ال' + uOne + ': ' : 'الربح في ال' + uOne + ': '}<b>${money(Math.abs(r.profitPerUnit))}</b> · هامش ${r.margin}%</p>
            </div>
            <div class="text-start sm:text-left">
              <p class="text-xs faint">إجمالي ربح الدفعة</p>
              <p class="text-3xl sm:text-4xl font-semibold tracking-tight ${r.profitTotal < 0 ? 'text-[--bad]' : 'text-[--good]'}">${money(r.profitTotal)}</p>
              <p class="text-xs faint mt-1">${fmt0(r.units)} ${uOne} × ${money(r.sellPrice)}</p>
            </div>
          </div>
        </div>

        <!-- المؤشرات الأساسية -->
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-4">
          ${kpi('إجمالي تكلفة الدفعة', money(r.batchTotal), `${fmt0(r.units)} ${uOne}`)}
          ${kpi('تكلفة ال' + uOne, money(r.unitCost), 'مكونات + تغليف + تشغيل + وقت')}
          ${kpi('السعر المتوقع', money(r.sellPrice), `لكل ${uOne}`)}
          ${kpi(r.profitPerUnit >= 0 ? `ربح ال${uOne}` : `خسارة ال${uOne}`, money(r.profitPerUnit), `هامش ${r.margin}%`)}
          ${kpi('إجمالي ربح الدفعة', money(r.profitTotal), 'بعد كل التكاليف والرسوم')}
          ${kpi('نقطة التعادل', r.breakEvenUnits == null ? '—' : `${fmt0(r.breakEvenUnits)} ${uOne}`, 'لبيعها لتغطية الدفعة')}
          ${kpi('هامش الربح', `${r.margin}%`, 'من إيراد الدفعة')}
          ${kpi('المخزون المتبقي', money(r.leftoverInventory), 'قيمة ما تبقّى من العبوات')}
          ${r.paymentFees.enabledCount
            ? kpi('عمولة بوابات الدفع المخصومة', money(r.paymentFees.perBatch), `${money(r.paymentFees.perUnit)} لكل ${uOne} · ${r.paymentFees.pctOfPrice}% من السعر`)
            : kpi('عمولة بوابات الدفع', '—', 'لم تُفعّل في خطوة التشغيل')}

        </div>

        ${r.paymentFees.enabledCount ? `
        <div class="card p-5 mt-4" id="feesPanel">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 class="font-semibold text-[15px]">عمولة بوابات الدفع المخصومة</h3>
              <p class="text-xs faint">تُحسب كنسبة من سعر البيع + مبلغ ثابت، ولا تدخل في تكلفة الصنع.</p>
            </div>
            <span class="badge badge-neutral">${r.paymentFees.enabledCount} بوابة مفعّلة</span>
          </div>
          <div class="overflow-x-auto mt-3">
            <table class="table-clean">
              <thead><tr><th>البوابة</th><th>النسبة</th><th>المبلغ الثابت</th><th>لكل ${uOne}</th><th>على الدفعة</th></tr></thead>
              <tbody>
                ${r.paymentFees.rows.map((f) => `<tr>
                  <td class="font-medium">${esc(f.name)}</td>
                  <td>${f.pct}%</td>
                  <td>${money(f.fixed)}</td>
                  <td>${money(f.perUnit)}</td>
                  <td class="font-medium">${money(f.perBatch)}</td>
                </tr>`).join('')}
              </tbody>
            </table>
          </div>
          <div class="net-split mt-4">
            <div><p class="field-label">الربح الإجمالي قبل الرسوم</p><p class="text-[18px] font-semibold">${money(r.grossProfitTotal)}</p></div>
            <div class="net-minus">−</div>
            <div><p class="field-label">الرسوم</p><p class="text-[18px] font-semibold">${money(r.paymentFees.perBatch)}</p></div>
            <div class="net-eq">=</div>
            <div><p class="field-label">صافي الربح</p><p class="text-[18px] font-semibold ${r.profitTotal < 0 ? 'text-[--bad]' : 'text-[--good]'}">${money(r.profitTotal)}</p></div>
          </div>
        </div>` : ''}

        <!-- الرسوم -->
        <div class="grid lg:grid-cols-2 gap-4 mt-4">
          <div class="card p-5">
            <h3 class="font-semibold text-[15px] mb-1">توزيع تكلفة الدفعة</h3>
            <p class="text-xs faint mb-3">أين تذهب كل ريال من تكلفتك؟</p>
            <div class="chart-box"><canvas id="costChart"></canvas></div>
            <div class="mt-4 space-y-1.5">
              ${costRows.map(([label, val, color]) => `<div class="flex items-center justify-between text-sm">
                <span class="flex items-center gap-2"><span style="width:9px;height:9px;border-radius:3px;background:${color};display:inline-block"></span>${label}</span>
                <span class="font-medium">${money(val)} <span class="faint text-xs">(${r.batchTotal > 0 ? Math.round((val / r.batchTotal) * 100) : 0}%)</span></span>
              </div>`).join('')}
            </div>
          </div>

          <div class="card p-5">
            <h3 class="font-semibold text-[15px] mb-1">مقارنة السعر والربح</h3>
            <p class="text-xs faint mb-3">ربح ال${uOne} عند الخيارات الثلاثة المحسوبة.</p>
            <div class="chart-box"><canvas id="priceChart"></canvas></div>
            <div class="mt-4">
              <div class="flex items-center justify-between text-xs mb-1"><span class="muted">دقة البيانات: فعلي مقابل تقديري</span><span class="font-medium">${r.actualShare}% فعلي</span></div>
              <div class="progress-track"><div class="progress-fill" style="width:${r.actualShare}%;background:var(--good)"></div></div>
              <div class="flex justify-between text-[11px] faint mt-1"><span>فعلي: ${money(r.actualCost)}</span><span>تقديري: ${money(r.estimatedCost)}</span></div>
            </div>
          </div>
        </div>

        <!-- خيارات التسعير -->
        <div class="mt-6">
          <h3 class="text-xl font-semibold tracking-tight">التسعير المثالي المقترح</h3>
          <p class="text-sm muted mt-1">محسوب من تكلفة ال${uOne} (${money(r.unitCost)}) داخل المتصفح — وليس تخمينًا من الذكاء الاصطناعي.</p>
          <div class="grid sm:grid-cols-3 gap-3 mt-4">
            ${r.pricingOptions.map((o, i) => `
              <div class="card card-sm p-5 ${i === 1 ? 'border-black/10' : ''}">
                <div class="flex items-center justify-between">
                  <p class="font-semibold text-[15px]">${o.name}</p>
                  ${i === 1 ? '<span class="badge badge-neutral">موصى به</span>' : ''}
                </div>
                <p class="text-2xl font-semibold tracking-tight mt-2">${money(o.price)}</p>
                <p class="text-xs muted mt-1">ربح ال${uOne} ${money(o.profitPerUnit)} · هامش ${o.margin}%</p>
                <button type="button" class="btn btn-secondary w-full mt-4" data-action="apply-price" data-price="${o.price}">طبّق هذا السعر</button>
              </div>`).join('')}
          </div>
          ${r.pricingOptions[1] && r.pricingOptions[1].price ? `<p class="text-xs faint mt-3">ملاحظة: السعر المتوازن المقترح ${money(r.pricingOptions[1].price)}؛ يمكنك تعديله في أي وقت والعودة لإعادة الحساب دون إعادة إدخال البيانات.</p>` : ''}
        </div>

        <!-- عروض الكميات -->
        <div class="card p-5 mt-4">
          <h3 class="font-semibold text-[15px]">عروض الكميات المقترحة</h3>
          <p class="text-xs faint mb-3">كل عرض محسوب بشكل مستقل بناءً على تكلفة ال${uOne}. ${r.offerBase > r.sellPrice + 0.001 ? `لأن سعرك الحالي قريب من التكلفة أو أقل، بُنيت العروض على سعر ${money(r.offerBase)} لضمان الربح.` : 'مبنية على سعر البيع الحالي مع خصومات تدريجية.'}</p>
          <div class="overflow-x-auto">
            <table class="table-clean">
              <thead><tr><th>الكمية</th><th>الخصم</th><th>سعر ال${uOne}</th><th>إجمالي الإيراد</th><th>إجمالي التكلفة</th><th>الربح</th><th>الهامش</th></tr></thead>
              <tbody>
                ${r.volumeOffers.map((o) => `<tr>
                  <td class="font-medium">${fmt0(o.qty)} ${uOne}</td>
                  <td>${o.discountPct}%</td>
                  <td>${money(o.unitPrice)}</td>
                  <td>${money(o.revenue)}</td>
                  <td>${money(o.cost)}</td>
                  <td class="font-medium ${o.profit < 0 ? 'text-[--bad]' : 'text-[--good]'}">${money(o.profit)}</td>
                  <td>${o.margin}%</td>
                </tr>`).join('')}
              </tbody>
            </table>
          </div>
          ${bundleLine}
          ${applyDiscountNote}
        </div>

        <!-- تقييم المشتريات -->
        <div class="card p-5 mt-4" id="marketPanel">
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 class="font-semibold text-[15px]">مقارنة المشتريات بالسوق</h3>
              <p class="text-xs faint">مقارنة السعر الموحّد (ريال لكل كجم / لتر / متر / حبة) بأسعار السوق التي أدخلتها أنت فقط.</p>
            </div>
            ${r.market.hasData ? `<div class="flex flex-wrap gap-2">
              <span class="badge badge-bad">${r.market.highCount} أعلى من السوق</span>
              <span class="badge badge-good">${r.market.lowCount} أفضل من السوق</span>
              <span class="badge badge-neutral">${r.market.equalCount} مماثل</span>
            </div>` : ''}
          </div>
          ${r.market.hasData ? `
            ${r.market.highCount ? `
              <div class="market-verdict market-verdict-warn mt-3">
                <div>
                  <p class="font-semibold text-sm">يوجد ما يمكن توفيره</p>
                  <p class="text-xs mt-1">تقدير التوفير لو اشتريت العبوات ذات السعر الأعلى بسعر السوق: <b>${money(r.market.potentialSaving)}</b> لكل عبوة، أي <b>${money(r.market.potentialSavingPerBatch)}</b> في هذه الدفعة.</p>
                </div>
                <span class="badge badge-warn">${r.market.worst.map((w) => esc(w.name)).slice(0, 3).join(' · ')}</span>
              </div>` : `
              <div class="market-verdict market-verdict-good mt-3">
                <p class="font-semibold text-sm">مشترياتك ممتازة</p>
                <p class="text-xs mt-1">لا يوجد مشترى أكبر من السعر الذي أدخلته للسوق (حد التسامح 5%).</p>
              </div>`}
            <div class="overflow-x-auto mt-3"><table class="table-clean">
              <thead><tr><th>المكوّن</th><th>مكان الشراء</th><th>سعر شرائك</th><th>سعر السوق</th><th>الفرق</th><th>الحكم</th></tr></thead>
              <tbody>${r.market.rows.map((p) => `<tr>
                <td class="font-medium">${esc(p.name)}</td>
                <td class="text-xs muted">${p.store ? esc(p.store) : '—'}</td>
                <td>${money(p.paidNorm)} / ${p.groupLabel}</td>
                <td>${money(p.marketNorm)} / ${p.groupLabel}</td>
                <td class="${p.verdict === 'high' ? 'text-[--bad]' : p.verdict === 'low' ? 'text-[--good]' : ''}">${p.diffPct > 0 ? '+' : ''}${p.diffPct}%</td>
                <td>${p.verdict === 'high' ? '<span class="badge badge-bad">أعلى من السوق</span>' : p.verdict === 'low' ? '<span class="badge badge-good">أفضل من السوق</span>' : '<span class="badge badge-neutral">مماثل</span>'}</td>
              </tr>`).join('')}</tbody>
            </table></div>
            <p class="text-[11px] faint mt-2">متوسط الفرق: ${r.market.avgGapPct > 0 ? '+' : ''}${r.market.avgGapPct}%. الفرق موجب يعني أنك تدفع أكثر من السوق.</p>`
            : `<div class="mt-3">
                <div class="market-verdict market-verdict-empty">
                  <p class="font-semibold text-sm">لا توجد أسعار سوق بعد</p>
                  <p class="text-xs mt-1">أضف «سعر السوق لنفس العبوة» في بطاقة أي مكوّن ليقارن النظام تلقائيًا. لن نخترع أسعارًا أو مصادر غير حقيقية.</p>
                </div>
                <button type="button" class="btn btn-secondary mt-3" data-action="goto" data-step="ingredients">← أضف أسعار السوق</button>
              </div>`}
        </div>

        <!-- الذكاء الاصطناعي -->
        <div id="aiPanel" class="card p-5 sm:p-6 mt-4">
          ${renderAiPanel(r, meta)}
        </div>

        <!-- كيف تزيد أرباحك -->
        <div class="card p-5 sm:p-6 mt-4">
          <h3 class="text-xl font-semibold tracking-tight">كيف تزيد أرباحك؟</h3>
          <p class="text-sm muted mt-1">توصيات عملية مبنية على أرقامك.</p>
          <div id="tipsPanel" class="mt-4">${renderTips(r, meta)}</div>
        </div>

        <div class="flex flex-wrap items-center justify-between gap-3 mt-6">
          <button class="btn btn-secondary" data-action="goto" data-step="pricing">→ تعديل الأسعار وإعادة الحساب</button>
          <button class="btn btn-quiet" data-action="new-journey">بدء رحلة جديدة</button>
        </div>
      </div>`;

    drawCharts(r);
  }

  function renderAiPanel(r, meta) {
    if (state.aiError) {
      return `
        <div class="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h3 class="font-semibold text-[16px]">رأي المساعد الذكي في مشروعك</h3>
            <p class="text-sm mt-2" style="color:var(--bad)">${esc(state.aiError)}</p>
            <p class="text-xs faint mt-2">لن نعرض نتائج وهمية بدلًا من التحليل الحقيقي.</p>
          </div>
          <div class="flex gap-2">
            <button class="btn btn-secondary" data-action="ai-local">عرض تحليل محلي (بدون AI)</button>
            <button class="btn btn-primary" data-action="ai-analyze">إعادة المحاولة</button>
          </div>
        </div>`;
    }
    if (state.aiLoading) {
      return `<div class="flex items-center gap-3">
        <span class="spinner spinner-dark"></span>
        <div><p class="font-semibold text-[15px]">جارٍ تحليل مشروعك…</p><p class="text-xs faint">يتم إرسال الأرقام إلى خدمة Gemini الآمنة.</p></div>
      </div>`;
    }
    if (state.ai) {
      const a = state.ai;
      const isGemini = a.source === 'gemini';
      return `
        <div class="flex flex-wrap items-center justify-between gap-2">
          <h3 class="font-semibold text-[16px]">رأي المساعد الذكي في مشروعك</h3>
          <div class="flex items-center gap-2">
            <span class="badge ${isGemini ? 'badge-good' : 'badge-neutral'}">${isGemini ? 'Gemini · تحليل حقيقي' : 'تحليل محلي (بدون AI)'}</span>
            <button class="btn btn-quiet text-xs" data-action="ai-analyze">تحديث</button>
          </div>
        </div>
        <div class="ai-prose mt-4 space-y-4">
          ${a.summary ? `<p class="text-[15px] font-medium text-ink">${esc(a.summary)}</p>` : ''}
          ${a.realityCheck ? `<div><p class="font-semibold text-ink text-sm mb-1">صدمة الواقع</p><p>${esc(a.realityCheck)}</p></div>` : ''}
          ${Array.isArray(a.costAnalysis) && a.costAnalysis.length ? `<div><p class="font-semibold text-ink text-sm mb-1">تحليل التكاليف</p><ul class="ai-list">${a.costAnalysis.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>` : ''}
          ${a.purchaseEvaluation ? `<div><p class="font-semibold text-ink text-sm mb-1">تقييم المشتريات</p><p>${esc(a.purchaseEvaluation)}</p></div>` : ''}
          ${a.pricingStrategy ? `<div><p class="font-semibold text-ink text-sm mb-1">استراتيجية التسعير</p><p>${esc(a.pricingStrategy)}</p></div>` : ''}
          ${a.volumeStrategy ? `<div><p class="font-semibold text-ink text-sm mb-1">بيع الكميات</p><p>${esc(a.volumeStrategy)}</p></div>` : ''}
          ${Array.isArray(a.risks) && a.risks.length ? `<div><p class="font-semibold text-ink text-sm mb-1">تنبيهات</p><ul class="ai-list">${a.risks.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>` : ''}
          ${a.rawText ? `<details class="ai-raw"><summary>عرض نص الرد الكامل</summary><pre>${esc(a.rawText)}</pre></details>` : ''}
        </div>
        ${!isGemini ? `<p class="text-[11px] faint mt-3">هذا التحليل حسابي محلي وليس ذكاءً اصطناعيًا. لإعداد Gemini الحقيقي راجع README.</p>` : ''}`;
    }
    return `
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 class="font-semibold text-[16px]">رأي المساعد الذكي في مشروعك</h3>
          <p class="text-sm muted mt-1 max-w-xl">اطلب تحليلًا حقيقيًا من Gemini لقراءة أرقامك وتقييم المشتريات واستراتيجية التسعير.</p>
          <p class="text-[11px] faint mt-1">يتطلب إعداد مفتاح Gemini المجاني على الخادم (server/.env).</p>
        </div>
        <div class="flex gap-2">
          <button class="btn btn-secondary" data-action="ai-local">تحليل محلي</button>
          <button class="btn btn-primary" data-action="ai-analyze">اطلب تحليل الذكاء الاصطناعي</button>
        </div>
      </div>`;
  }

  function renderTips(r, meta) {
    let tips;
    if (state.ai && Array.isArray(state.ai.profitTips) && state.ai.profitTips.length) {
      tips = state.ai.profitTips;
    } else {
      tips = [];
      if (r.status !== 'profit') tips.push(`ارفع السعر نحو ${money(r.pricingOptions[1].price)} أو خفّض أكبر بند تكلفة.`);
      const biggest = [
        ['المكونات', r.ingredientsTotal], ['التغليف', r.packagingTotal],
        ['التشغيل', r.operationalTotal], ['الوقت', r.timeTotal]
      ].sort((a, b) => b[1] - a[1])[0];
      if (biggest[1] > 0) tips.push(`أكبر بند تكلفة هو «${biggest[0]}» (${money(biggest[1])})؛ ابدأ بتحسينه.`);
      if (r.estimatedCost > 0) tips.push('أدخل أسعارًا فعلية بدل التقديرية لتحليل أدق.');
      tips.push('جرّب عرض 3 أو 5 ${uMany} بخصم بسيط لزيادة قيمة السلة.');
      tips.push('راقب أسعار المكونات دوريًا؛ تغيّر سعر عبوة واحدة قد يغيّر ربحك.');
    }
    return `<ul class="ai-list">${tips.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>`;
  }

  /* ---------------- الرسوم البيانية ---------------- */
  function drawCharts(r) {
    if (!window.Chart) return;
    const costEl = document.getElementById('costChart');
    if (costEl) {
      charts.push(new Chart(costEl, {
        type: 'doughnut',
        data: {
          labels: ['المكونات', 'التغليف', 'التشغيل', 'الوقت'],
          datasets: [{ data: [r.ingredientsTotal, r.packagingTotal, r.operationalTotal, r.timeTotal], backgroundColor: ['#1d1d1f', '#6e6e73', '#a1a1a6', '#d2d2d7'], borderWidth: 0, hoverOffset: 4 }]
        },
        options: {
          responsive: true, maintainAspectRatio: false, cutout: '68%',
          plugins: { legend: { display: false }, tooltip: { rtl: true, callbacks: { label: (c) => ` ${c.label}: ${money(c.parsed)}` } } }
        }
      }));
    }
    const priceEl = document.getElementById('priceChart');
    if (priceEl) {
      const opts = r.pricingOptions;
      charts.push(new Chart(priceEl, {
        type: 'bar',
        data: {
          labels: opts.map((o) => o.name),
          datasets: [{
            label: 'ربح ' + outputLabel().one,
            data: opts.map((o) => o.profitPerUnit),
            backgroundColor: opts.map((o) => o.profitPerUnit >= 0 ? '#1d1d1f' : '#c0362c'),
            borderRadius: 8, maxBarThickness: 54
          }]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false }, tooltip: { rtl: true, callbacks: { label: (c) => ` ${money(c.parsed.y)}` } } },
          scales: {
            y: { beginAtZero: true, grid: { color: '#eeeef2' }, ticks: { callback: (v) => v + ' ر.س', color: '#86868b', font: { size: 10 } } },
            x: { grid: { display: false }, ticks: { color: '#6e6e73', font: { size: 10 } } }
          }
        }
      }));
    }
  }

  /* ---------------- الذكاء الاصطناعي ---------------- */
  function parseLooseAi(text) {
    if (!text) return null;
    try { return JSON.parse(text); } catch (e) {}
    const start = text.indexOf('{');
    if (start < 0) return null;
    const end = text.lastIndexOf('}');
    const slice = end > start ? text.slice(start, end + 1) : text.slice(start);
    try { return JSON.parse(slice); } catch (e) {}
    return null;
  }

  async function runAi() {
    const r = Calc.compute(state);
    const meta = metaNames();
    state.aiLoading = true;
    state.aiError = null;
    state.ai = null;
    const panel = $('#aiPanel');
    if (panel) panel.innerHTML = renderAiPanel(r, meta);
    try {
      const resp = await window.AI.analyze({
        projectType: meta.projectType, domain: meta.domain, subcategory: meta.subcategory, product: meta.product,
        input: {
          units: state.units, timeMinutes: state.timeMinutes, hourlyRate: state.hourlyRate,
          batchesPerMonth: state.batchesPerMonth, sellPrice: state.sellPrice
        },
        computed: r
      });
      // بعض الردود تصل مغلّفة بـ ```json أو مقطوعة؛ نحاول قراءتها بدل عرض JSON خام
      const analysis = resp.analysis || parseLooseAi(resp.raw);
      if (analysis && typeof analysis === 'object') {
        state.ai = analysis;
      } else {
        state.ai = {
          source: 'gemini',
          summary: 'وصل رد من الخدمة لكنه غير مكتمل. يمكنك التحديث للمحاولة مرة أخرى.',
          rawText: resp.raw || ''
        };
      }
      state.ai.source = 'gemini';
      state.ai._sig = signature();
    } catch (e) {
      state.aiLoading = false;
      state.aiError = e.message || 'تعذّر الحصول على التحليل.';
      state.aiErrorCode = e.code || 'error';
    }
    state.aiLoading = false;
    if (state.step === 'results') renderResults();
  }

  function useLocalAi() {
    const r = Calc.compute(state);
    const meta = metaNames();
    state.ai = window.AI.localAnalysis(r, meta);
    state.ai.source = 'local';
    state.aiError = null;
    state.ai._sig = signature();
    if (state.step === 'results') renderResults();
  }

  /* ---------------- فحص سعر مكوّن (Micro AI) ---------------- */
  // يرسل حقلًا واحدًا فقط إلى Gemini، ويعرض النتيجة كشارة أسفل البطاقة
  async function runPriceCheck(index) {
    const ing = state.ingredients[index];
    if (!ing) return;
    const name = String(ing.name || '').trim();
    const pack = Calc.num(ing.pack);
    const price = Calc.num(ing.price);
    if (!name || pack <= 0 || price <= 0) return;

    // دفتر V3: «ابحث عن سعر أفضل» = فتح مقارنة موازن + تحذير من سعر السوق اليدوي عند وجوده.
    const link = window.PriceAgent ? window.PriceAgent.queryUrl({
      name, brand: ing.brand, pack, packUnit: window.SmartUnits ? window.SmartUnits.info(ing.packUnit || ing.unit).label : ing.packUnit
    }) : '';
    if (link) {
      const win = window.open(link, '_blank', 'noopener,noreferrer');
      if (!win) {
        state.priceChecks[index] = { verdict: 'اسمح بالنوافذ المنبثقة للبحث', tone: 'neutral', source: 'link' };
      }
    }
    const market = Calc.num(ing.marketPrice);
    if (market > 0) {
      const S = window.SmartUnits;
      const paid = S ? S.unitPrice(price, pack, ing.packUnit || ing.unit) : null;
      const mkt = S ? S.unitPrice(market, pack, ing.packUnit || ing.unit) : null;
      if (paid && paid.ok && mkt && mkt.ok && mkt.value > 0) {
        const diff = Calc.round1(((paid.value - mkt.value) / mkt.value) * 100);
        state.priceChecks[index] = diff > 5
          ? { verdict: `أغلى ${Math.abs(diff)}% من سعرك السوقي (${mkt.value} ر.س/${paid.label})`, tone: 'bad', source: 'manual' }
          : diff < -5
            ? { verdict: `أرخص ${Math.abs(diff)}% من سوقك (${mkt.value} ر.س/${paid.label})`, tone: 'good', source: 'manual' }
            : { verdict: `مطابق لسعرك السوقي (${mkt.value} ر.س/${paid.label})`, tone: 'neutral', source: 'manual' };
      }
    }
    save();
    refreshEditorTotals();
    renderStep();
  }

  /* ---------------- أحداث ---------------- */
  function selectProject(id) {
    if (state.projectTypeId !== id) {
      state.domainId = null; state.subcategoryId = null; state.productId = null; state.productName = '';
      state.ingredients = []; state.packaging = []; state.operational = [];
      clearAi();
    }
    state.projectTypeId = id;
    state.step = 'domain';
    render();
  }
  function selectDomain(id) {
    if (state.domainId !== id) {
      state.subcategoryId = null; state.productId = null; state.productName = '';
      state.ingredients = []; state.packaging = []; state.operational = [];
      clearAi();
    }
    state.domainId = id;
    state.step = 'subcategory';
    render();
  }
  function selectSubcategory(id) {
    if (state.subcategoryId !== id) {
      state.productId = null; state.productName = '';
      state.ingredients = []; state.packaging = []; state.operational = [];
      clearAi();
    }
    state.subcategoryId = id;
    state.step = 'product';
    render();
  }
  function selectProduct(id) {
    const sc = D.getSubcategory(state.domainId, state.subcategoryId);
    const product = sc ? sc.products.find((p) => p.id === id) : null;
    if (!product) return;
    if (state.productId !== id || !state.ingredients.length) {
      const tpl = D.getTemplate(state.domainId, product);
      state.ingredients = (tpl.ingredients || []).map((x) => ({ ...x }));
      state.packaging = (tpl.packaging || []).map((x) => ({ ...x }));
      state.operational = (tpl.operational || []).map((x) => ({ ...x }));
      state.units = tpl.units || 1;
      state.timeMinutes = tpl.timeMinutes || 0;
      state.hourlyRate = tpl.hourlyRate || 0;
      state.sellPrice = tpl.sellPrice || 0;
      state.batchesPerMonth = state.batchesPerMonth || 1;
      clearAi();
    }
    state.productId = id;
    state.productName = product.name;
    state.step = 'ingredients';
    render();
  }

  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    // منع السلوك الافتراضي (وخصوصًا القفز للأعلى عبر href='#')
    if (btn.tagName === 'A' || btn.hasAttribute('href')) e.preventDefault();
    const action = btn.getAttribute('data-action');
    const idx = Number(btn.getAttribute('data-index'));

    switch (action) {
      case 'select-project':
        if (animateTreeSelection(btn)) return;
        return selectProject(btn.getAttribute('data-id'));
      case 'select-domain':
        if (animateTreeSelection(btn)) return;
        return selectDomain(btn.getAttribute('data-id'));
      case 'select-subcategory':
        if (animateTreeSelection(btn)) return;
        return selectSubcategory(btn.getAttribute('data-id'));
      case 'select-product':
        if (animateTreeSelection(btn)) return;
        return selectProduct(btn.getAttribute('data-id'));
      case 'tree-back': {
        const order = ['project', 'domain', 'subcategory', 'product'];
        const i = order.indexOf(state.step);
        if (i > 0) { state.step = order[i - 1]; clearAi(); render(); }
        return;
      }
      case 'goto': {
        const step = btn.getAttribute('data-step');
        if (step) { state.step = step; clearAi(); render(); }
        return;
      }
      case 'show-results': {
        const r = Calc.compute(state);
        if (Calc.num(state.sellPrice) <= 0) { alert('أدخل سعر بيع ' + outputLabel().one + ' أولًا.'); return; }
        clearAi();
        state.step = 'results';
        return render();
      }
      case 'price-type': {
        state.ingredients[idx].type = btn.getAttribute('data-type');
        save(); return renderStep();
      }
      case 'add-ingredient': {
        state.ingredients.push({ name: '', qty: 0, qtyUnit: 'g', pack: 0, packUnit: 'g', price: 0, type: 'estimated', marketPrice: '', marketStore: '' });
        return renderStep();
      }
      case 'add-ingredient-preset': {
        const nm = btn.getAttribute('data-name') || 'مكوّن';
        state.ingredients.push({ name: nm, qty: 0, qtyUnit: 'g', pack: 0, packUnit: 'g', price: 0, type: 'estimated', marketPrice: '', marketStore: '' });
        clearAi();
        renderStep();
        const last = state.ingredients.length - 1;
        const q = $(`[data-group="ingredients"][data-index="${last}"][data-field="qty"]`);
        if (q) q.focus();
        return;
      }
      case 'add-packaging-preset': {
        const nm = btn.getAttribute('data-name') || 'تغليف';
        state.packaging.push({ name: nm, piecesPerPack: 0, packPrice: 0, piecesUsed: 0 });
        clearAi();
        renderStep();
        const last = state.packaging.length - 1;
        const per = $(`[data-group="packaging"][data-index="${last}"][data-field="piecesPerPack"]`);
        if (per) per.focus();
        return;
      }
      case 'purchase-mode': {
        const mode = btn.getAttribute('data-mode');
        state.purchaseMode = mode;
        if (mode === 'packs') {
          const packs = Calc.num(state.packCount);
          if (packs > 0) state.units = packs;
        }
        clearAi();
        return renderStep();
      }
      case 'toggle-preset-group': {
        const name = btn.getAttribute('data-group-name');
        const bar = btn.closest('[data-preset-bar]');
        if (!bar) return;
        const target = bar.querySelector(`[data-preset-group="${CSS.escape(name)}"]`);
        const isOpen = target && !target.hidden;
        bar.querySelectorAll('[data-preset-group]').forEach((g) => { g.hidden = true; });
        bar.querySelectorAll('.preset-group-btn').forEach((b) => b.classList.remove('on'));
        if (target && !isOpen) { target.hidden = false; btn.classList.add('on'); }
        return;
      }
      case 'del-ingredient': {
        state.ingredients.splice(idx, 1); clearAi(); return renderStep();
      }
      /* ---------------- دفتر V3: اقتراحات وطي وهامش ---------------- */
      case 'suggest-add': {
        const nm = btn.getAttribute('data-name') || '';
        const kind = btn.getAttribute('data-kind') || 'core';
        if (!nm) return;
        if (state.ingredients.some((x) => String(x.name || '').trim() === nm)) return;
        // الحالة الافتراضية للحقل: تسمية «حجم/وزن/عدد» حسب تصنيف الاقتراح
    const inferUnit = (name, kind) => {
      if (kind === 'packaging') return 'pc';
      if (/^(زجاج|أغطية|بخاخ|ملصق|علب|أكياس|شرائط|بطاقات|أوعية|فتائل|ملاعق|شفاطات|أطباق|كرت|ورق)/.test(name)) return 'pc';
      if (/^(كحول|مذيب|مثبت)/.test(name)) return 'ml';
      return 'g';
    };
    const unit = inferUnit(nm, kind);
        state.ingredients.push({ name: nm, kind, qty: 0, qtyUnit: unit, pack: 0, packUnit: unit, price: 0, type: 'estimated', marketPrice: '', marketStore: '' });
        clearAi();
        renderStep();
        // التمركز على حقل شراء الكميّة أولاً (بدل السعر) حتى يكتمل الإدخال بالترتيب
        const last = state.ingredients.length - 1;
        const target = document.querySelector(`[data-ing="${last}"] [data-field="pack"]`);
        if (target) { try { target.focus({ preventScroll: true }); } catch (e) { target.focus(); } }
        return;
      }
      case 'toggle-ingredient': {
        if (!state.collapsedIng) state.collapsedIng = {};
        state.collapsedIng[idx] = !state.collapsedIng[idx];
        save();
        return renderStep();
      }
      case 'set-margin': {
        const v = Calc.num(btn.getAttribute('data-value'));
        try { localStorage.setItem(TARGET_MARGIN_KEY, String(v)); } catch (e) {}
        return renderStep();
      }
      case 'add-packaging': {
        state.packaging.push({ name: '', piecesPerPack: 0, packPrice: 0, piecesUsed: 0 });
        return renderStep();
      }
      case 'del-packaging': {
        state.packaging.splice(idx, 1); clearAi(); return renderStep();
      }
      case 'add-op': {
        state.operational.push({ name: btn.getAttribute('data-name') || 'مصروف', amount: 0, period: 'perBatch' });
        clearAi(); return renderStep();
      }
      case 'del-op': {
        state.operational.splice(idx, 1); clearAi(); return renderStep();
      }
      case 'toggle-gateways-panel': {
        state.gatewaysOpen = !state.gatewaysOpen;
        save();
        const panelEl = document.getElementById('gatewayPanel');
        if (panelEl) {
          panelEl.classList.toggle('open', state.gatewaysOpen);
          const body = panelEl.querySelector('.gw-body');
          if (body) {
            body.style.maxHeight = state.gatewaysOpen ? body.scrollHeight + 40 + 'px' : '0px';
            body.setAttribute('aria-hidden', state.gatewaysOpen ? 'false' : 'true');
          }
          const btnEl = panelEl.querySelector('[data-action="toggle-gateways-panel"]');
          if (btnEl) {
            btnEl.setAttribute('aria-expanded', state.gatewaysOpen ? 'true' : 'false');
            const icon = btnEl.querySelector('.gw-toggle-icon');
            if (icon) icon.textContent = state.gatewaysOpen ? '−' : '＋';
          }
        }
        return;
      }
      case 'check-price': return runPriceCheck(idx);
      case 'apply-price': {
        state.sellPrice = Number(btn.getAttribute('data-price')) || 0;
        clearAi();
        return render();
      }
      case 'ai-analyze': return runAi();
      case 'ai-local': return useLocalAi();
      case 'new-journey': return resetJourney();
      default: return;
    }
  });

  document.addEventListener('input', (e) => {
    const el = e.target.closest('[data-group]');
    if (!el) return;
    const group = el.getAttribute('data-group');
    const field = el.getAttribute('data-field');
    const index = Number(el.getAttribute('data-index'));
    const val = el.value;

    if (group === 'gateway') {
      const gid = el.getAttribute('data-id');
      const field = el.getAttribute('data-field');
      const list = Array.isArray(state.paymentGateways) ? state.paymentGateways.slice() : [];
      const def = DEFAULT_GATEWAYS.find((g) => g.id === gid);
      if (!def) return;
      let entry = list.find((x) => x && x.id === gid);
      if (!entry) { entry = { id: gid, enabled: true, pct: def.pct, fixed: def.fixed }; list.push(entry); }
      entry[field] = val;
      state.paymentGateways = list;
      clearAi();
      refreshGatewayTotals();
      save();
      return;
    }
    if (group === 'meta') {
      if (field === 'targetMargin') {
        state.targetMargin = Calc.num(val);
        try { localStorage.setItem(TARGET_MARGIN_KEY, String(state.targetMargin)); } catch (e) {}
        const computed = Calc.compute(state);
        const next = suggestedPrice(computed.unitCost, state.targetMargin);
        const use = document.querySelector('.df-use');
        if (use) { use.textContent = money(next); use.setAttribute('data-price', next); }
        const live = document.querySelector('.df-price-box-main .df-price-live');
        if (live) {
          const sell = Calc.num(state.sellPrice) || next;
          const per = computed.units > 0 ? computed.batchTotal / computed.units : 0;
          const vals = [money(per), money(sell), money(Calc.round2(sell - per)), (sell > 0 ? Calc.round1(((sell - per) / sell) * 100) : 0) + '%'];
          live.querySelectorAll('b').forEach((b, i) => { if (vals[i] != null) b.textContent = vals[i]; });
        }
        return;
      }
      if (field === 'timeHours') {
        const minutesPart = Math.round(Calc.num(state.timeMinutes) % 60);
        state.timeMinutes = Calc.num(val) * 60 + minutesPart;
      } else if (field === 'timeMinutesPart') {
        const hours = Math.floor(Calc.num(state.timeMinutes) / 60);
        state.timeMinutes = hours * 60 + Calc.num(val);
      } else {
        state[field] = val;
      }
      if (field === 'units' && state.purchaseMode === 'packs' && Calc.num(val) > 0) state.packCount = val;
      if (field === 'packCount' && state.purchaseMode === 'packs' && Calc.num(val) > 0) state.units = val;
      if (['sellPrice', 'units', 'timeMinutes', 'hourlyRate', 'batchesPerMonth', 'bundleQty', 'bundlePrice', 'discountPct', 'packCount', 'monthlyQty'].includes(field) || field === 'timeHours' || field === 'timeMinutesPart') clearAi();
      if (state.step === 'pricing') {
        // تحديث حي لتكلفة الوحدة
        const r = Calc.compute(state);
        const bal = $('[data-mini="balanced"]');
        if (bal) bal.textContent = money(r.pricingOptions[1].price);
        const uc = $('[data-mini="unitcost"]');
        if (uc) uc.textContent = money(r.unitCost);
        if (field === 'units' || field === 'packCount') {
          const packInput = $('[data-group="meta"][data-field="packCount"]');
          if (packInput && state.purchaseMode === 'packs') packInput.value = state.packCount;
          const unitsInput = $('[data-group="meta"][data-field="units"]');
          if (unitsInput && state.purchaseMode === 'packs') unitsInput.value = state.units;
        }
      }
      save();
      return;
    }

    if (!state[group] || !state[group][index]) return;
    const item = state[group][index];
    if (field === 'name' || field === 'unit') item[field] = val;
    else if (field === 'qtyUnit' || field === 'packUnit' || field === 'packUnit-group' || field === 'qtyUnit-group') item[field] = val;
    else if (field === 'type') item[field] = val;
    else if (field === 'marketPrice') item.marketPrice = val === '' ? null : val;
    else if (field === 'marketStore') item.marketStore = val;
    else if (field === 'brand' || field === 'shopLink') item[field] = val;
    else item[field] = val;
    clearAi();
    // دفتر V3: تحديث بطاقة المكوّن فورًا بعد التعديل (التسميات والمتبقي والملخص)
    if (group === 'ingredients' && ['name', 'pack', 'price', 'packUnit', 'qtyUnit', 'qty', 'brand', 'marketPrice', 'marketStore', 'packUnit-group', 'qtyUnit-group'].includes(field)) {
      if (state.step === 'ingredients' && typeof liveIngredientUpdate === 'function') {
        const active = document.activeElement;
        const caret = active && active.selectionStart != null ? active.selectionStart : null;
        if (liveIngredientUpdate(index, field, caret)) return;
      }
    }
    // تحديث التكاليف فورًا؛ بطاقات التكرار تُعاد بناؤها فقط عند تغيّرها (أدناه)
    refreshEditorTotals();
    save();

    // فحص السعر لا يصلح لمدخلات قديمة: نُبطله عند تغيّر الاسم/العبوة/الوحدة/السعر
    if (group === 'ingredients' && ['name', 'pack', 'price', 'packUnit', 'qtyUnit'].includes(field) && state.priceChecks && state.priceChecks[index]) {
      delete state.priceChecks[index];
      const host = el.closest ? el.closest('.item-row') : null;
      const badge = host ? host.querySelector('.pc-badge') : null;
      if (badge) badge.remove();
    }
    // إعادة البناء فقط عند تغيّر يُؤثر على حكم تكرار الشراء (اسم/وحدة/عبوة/سعر)
    if (group === 'ingredients' && ['name', 'unit', 'qtyUnit', 'packUnit', 'pack', 'price', 'qty'].includes(field)) {
      const sig = repeatSig();
      if (sig !== lastRepeatSig) return rebuildIngredientsKeepingFocus(index, el.selectionStart);
      lastRepeatSig = sig;
    }
  });

  document.addEventListener('change', (e) => {
    // مفاتيح تفعيل بوابات الدفع (checkbox)
    const gwToggle = e.target.closest ? e.target.closest('input[data-action="toggle-gateway"]') : null;
    if (gwToggle) {
      const gid = gwToggle.getAttribute('data-id');
      const list = Array.isArray(state.paymentGateways) ? state.paymentGateways.slice() : [];
      const def = DEFAULT_GATEWAYS.find((g) => g.id === gid);
      if (!def) return;
      const existing = list.find((x) => x && x.id === gid);
      const on = !!gwToggle.checked;
      if (existing) existing.enabled = on;
      else list.push({ id: gid, enabled: on, pct: def.pct, fixed: def.fixed });
      state.paymentGateways = list;
      state.gatewaysOpen = true;
      clearAi();
      save();
      // تحديث في المكان: لا نُعيد بناء القسم حتى لا يقفز المؤشر أو تُفقد الحالة
      const panel = document.getElementById('gatewayPanel');
      if (panel) {
        const row = gwToggle.closest('.gateway-row');
        if (row) row.classList.toggle('on', on);
        row && row.querySelectorAll('input[data-group="gateway"]').forEach((inp) => { inp.disabled = !on; });
        panel.classList.add('open');
        const body = panel.querySelector('.gw-body');
        if (body) { body.style.maxHeight = body.scrollHeight + 60 + 'px'; body.setAttribute('aria-hidden', 'false'); }
        const r = Calc.compute(state);
        const fees = gatewayFees(r);
        gatewayState().forEach((g) => {
          const cell = panel.querySelector('[data-gw-per="' + g.id + '"]');
          if (cell) cell.textContent = g.enabled ? money(Calc.paymentFees([{ ...g, enabled: true }], r.sellPrice, r.units).perUnit) : '—';
        });
        const meta = panel.querySelector('.gw-toggle-meta');
        if (meta) meta.textContent = fees.enabledCount ? money(fees.perBatch) + ' رسوم' : 'غير مفعّلة';
        const total = panel.querySelector('.gateway-total');
        if (!fees.enabledCount && total) total.remove();
      }
      return;
    }

    const el = e.target.closest('select[data-group]');
    if (!el) return;
    const group = el.getAttribute('data-group');
    const field = el.getAttribute('data-field');
    const index = Number(el.getAttribute('data-index'));
    if (group === 'ingredients' && state.ingredients[index]) {
      const ing = state.ingredients[index];
      if (/-group$/.test(field)) {
        // دفتر V3: تغيير «طريقة الشراء» يضبط الوحدة على أول وحدة في المجموعة ويقترح استخدامًا متوافقًا
        const S3 = window.SmartUnits;
        const base = field.replace(/-group$/, '');
        const key = el.value;
        if (S3) {
          const list = Object.keys(S3.UNITS).filter((k) => S3.UNITS[k].group === key);
          const first = list[0] || (base === 'qtyUnit' ? 'g' : 'g');
          ing[base] = first;
          if (base === 'packUnit' && !S3.compatible(ing.qtyUnit || 'g', first)) ing.qtyUnit = suggestUseUnit(first);
        }
      } else {
        ing[field] = el.value;
        // دفتر V3: تغيير وحدة الشراء يقترح وحدة استخدام متوافقة إن اختلفت المجموعة
        if (field === 'packUnit' && window.SmartUnits && !window.SmartUnits.compatible(ing.qtyUnit || 'g', ing.packUnit)) {
          ing.qtyUnit = suggestUseUnit(ing.packUnit);
        }
      }
      clearAi();
      renderStep();
    } else if (group === 'operational' && state.operational[index]) {
      state.operational[index][field] = el.value;
      clearAi();
      renderStep();
    }
    save();
  });

  /* ---------------- التهيئة ---------------- */
  function bind() {
    $('#navStart').addEventListener('click', startJourney);
    $('#ctaStart').addEventListener('click', startJourney);
    $('#navResume').addEventListener('click', resumeJourney);
    $('#ctaResume').addEventListener('click', resumeJourney);
    $('#navReset').addEventListener('click', () => resetJourney());
    $('#wizardReset').addEventListener('click', () => resetJourney());
    $('#brandHome').addEventListener('click', (e) => { e.preventDefault(); if (state.started) render(); else showLanding(); });

    // إعادة رسم وصلات الشجرة عند تغيّر المقاس أو تحميل الخطوط
    let treeResizeTimer = null;
    window.addEventListener('resize', () => {
      clearTimeout(treeResizeTimer);
      treeResizeTimer = setTimeout(drawTreeWires, 120);
    });
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(() => { Tree.observe(); drawTreeWires(); }).catch(() => {});
    }
    // إعادة رسم الشجرة عند تغيّر أبعادها (خطوط، تمرير، فتح فرع)
    if (window.ResizeObserver && document.getElementById('treeList')) {
      Tree.observe();
    }
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) drawTreeWires();
    });
  }

  async function init() {
    load();
    // دفتر V3: تخزين تفضيل هامش الربح المستهدف (خارج كائن الحالة)
    const savedMargin = Calc.num(localStorage.getItem(TARGET_MARGIN_KEY));
    if (savedMargin > 0) state.targetMargin = savedMargin;
    bind();
    refreshResumeButtons();
    // فحص حالة الذكاء الاصطناعي
    try {
      const h = await window.AI.health();
      const badge = $('#aiStatusBadge');
      if (badge) {
        if (h && h.aiConfigured) { badge.textContent = 'التحليل الذكي: جاهز (' + h.model + ')'; }
        else if (h && h.offline) { badge.textContent = 'وضع التحليل المحلي'; }
        else { badge.textContent = 'الذكاء الاصطناعي غير مهيأ'; }
      }
    } catch (e) {
      const badge = $('#aiStatusBadge');
      if (badge) badge.textContent = 'وضع التحليل المحلي';
    }
    // إن كانت هناك جلسة سابقة، ابقَ على الواجهة الرئيسية مع زر الاستئناف
    showLanding();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
