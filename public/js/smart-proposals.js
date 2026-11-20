/* =============================================================
   دفتر V3 — الاقتراحات الذكية (مجموعات قابلة للطي، تحديد متعدد،
   ملخص قبل الإضافة، إبحث فوري، إبلاغ، اقتراح جديد للمراجعة).
   كل إضافة تمر عبر window.MirbahBridge → نفس محرك التكاليف.
   ============================================================= */
(function (global) {
  'use strict';
  const E = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const AR = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
  const arNo = (n) => String(n).split('').map((d) => AR[d] || d).join('');

  const GROUPS = [
    { id: 'core', label: 'المكونات الأساسية', note: 'ما لا يقوم المنتج بدونه' },
    { id: 'extra', label: 'الإضافات والحشوات', note: 'نكهات وإضافات مُحبَّبة' },
    { id: 'optional', label: 'المكونات الاختيارية', note: 'حسب الوصفة' },
    { id: 'packaging', label: 'التغليف والتقديم', note: 'يُحتسب بالقطعة' }
  ];

  let ctx = { root: null, items: [], selected: {}, meta: {}, source: 'none' };

  async function fetchSuggestions(ingKey, domainId, productId) {
    // ١) مخطط المنتج أولًا: مجموعات باسمها الحقيقي ووحدات واقعية
    const SC = global.ProductSchemas;
    if (SC) {
      const sch = SC.schemaFor(domainId, productId || ingKey);
      if (sch && Array.isArray(sch.groups) && sch.groups.length) {
        const items = [];
        sch.groups.forEach(function (g) {
          (g.items || []).forEach(function (it) {
            items.push({
              name: it.name, unit: it.unit || 'g', kind: 'schema',
              groupTitle: g.title, groupNote: g.note || '',
              calcMode: it.calcMode || 'portion', qty: it.qty || 0,
              directCost: it.directCost, subAmount: it.subAmount,
              subPeriod: it.subPeriod, projectsPerMonth: it.projectsPerMonth,
              piecesPerPack: it.piecesPerPack, piecesUsed: it.piecesUsed
            });
          });
        });
        if (items.length) return { source: 'schema', items: items };
      }
    }
    // ٢) اقتراحات الخادم/المكتبة (احتياط)
    try {
      if (location.protocol !== 'file:') {
        const key = ingKey || ('domain:' + (domainId || ''));
        const r = await fetch(location.origin + '/api/public/suggestions?key=' + encodeURIComponent(key));
        const j = await r.json();
        if (j && j.ok && Array.isArray(j.items) && j.items.length) return { source: 'server', items: j.items };
      }
    } catch (e) { /* احتياط */ }
    const Sg = global.IngredientSuggestions;
    if (Sg) {
      const res = Sg.lookup({ productId: ingKey, domainId }, { ingKey });
      return { source: 'local', items: (res.items || []).map((x) => ({ name: x.name, kind: x.kind, unit: x.unit || 'g' })) };
    }
    return { source: 'none', items: [] };
  }

  function render() {
    const root = ctx.root;
    const existing = new Set((ctx.meta.existing || []).map((x) => String(x).trim()));
    const dup = ctx.items.filter((x) => existing.has(x.name)).length;
    const selCount = Object.keys(ctx.selected).length;
    const score = (n) => { let s2 = 0; (ctx.meta.usage || []).forEach((u) => { if (n.indexOf(u.name) > -1) s2 += u.count; }); return s2; };
    if (score('')) { /* لا شيء */ }

    let groupDefs;
    if (ctx.items.some((x) => x.groupTitle)) {
      const seen = [];
      ctx.items.forEach((x) => {
        if (!seen.some((s) => s.title === x.groupTitle)) seen.push({ title: x.groupTitle, note: x.groupNote || '' });
      });
      groupDefs = seen.map((g, i) => ({
        id: 'sg' + i, label: g.title, note: g.note,
        list: ctx.items.filter((x) => x.groupTitle === g.title)
      }));
    } else {
      groupDefs = GROUPS.map((g) => ({ id: g.id, label: g.label, note: g.note, list: ctx.items.filter((x) => (x.kind || 'core') === g.id) }))
        .filter((g) => g.list.length);
    }

    const groups = groupDefs.map((g) => {
      const list = g.list;
      // الأكثر استخدامًا أولًا، ثم الأسرع في التوصية
      const ordered = list.slice().sort((a, b) => score(b.name) - score(a.name));
      const chips = ordered.map((x) => {
        const isDup = existing.has(x.name);
        const on = !!ctx.selected[x.name];
        const uses = score(x.name);
        const modeTag = x.calcMode && x.calcMode !== 'portion' ? `<em class="mode-tag">${{ count: 'عدد', amortized: 'اشتراك', direct: 'مباشر' }[x.calcMode] || ''}</em>` : '';
        return `<button type="button" class="df-pick${on ? ' on' : ''}${isDup ? ' is-dup' : ''}" data-name="${E(x.name)}" aria-pressed="${on}"
          title="${isDup ? 'موجود في المنتج' : uses ? 'استُخدم ' + arNo(uses) + ' مرة' : 'اختر لإضافته'}"><i>${on ? '✓' : isDup ? '•' : '+'}</i> ${E(x.name)}${modeTag}${uses ? ' <em class="use">' + arNo(uses) + '</em>' : ''}${x.ai ? ' <em class="ai">ذكي</em>' : ''}</button>`;
      }).join('');
      return `<section class="df-pick-group" data-group="${g.id}">
        <button type="button" class="df-pick-head" data-toggle="${g.id}" aria-expanded="true">
          <span class="n">${arNo(list.length)}</span><b>${E(g.label)}</b><small>${E(g.note || '')}</small><span class="chev">▴</span>
        </button>
        <div class="df-pick-body">${chips}</div>
      </section>`;
    }).join('');

    root.innerHTML = `
      <div class="df-smart">
        <div class="df-smart-head">
          <p class="hint">${arNo(ctx.items.length)} اقتراحًا${ctx.source === 'schema' ? ' مخصصة لهذا المنتج' : ctx.source === 'server' ? '' : ' (نسخة محلية)'}${dup ? ` · ${arNo(dup)} منها في المنتج` : ''}. اختر ما يناسبك ثم أضِفه دفعة واحدة.</p>
          <input id="dfSmartSearch" type="search" placeholder="ابحث في الاقتراحات…" aria-label="بحث في الاقتراحات" />
        </div>
        <div class="df-pick-groups">${groups}</div>
        <div class="df-addbar" id="dfAddBar" ${selCount ? '' : 'hidden'}>
          <span class="count">${arNo(selCount)} مكوّنًا محددًا</span>
          <div class="actions">
            <button type="button" class="btn" id="dfAddSel">أضِف المحدد</button>
            <button type="button" class="btn btn-line" id="dfClearSel">إلغاء</button>
          </div>
        </div>
        <div class="df-smart-foot">
          <button type="button" class="link" id="dfAskAi">اقترح لي بذكاء</button>
          <button type="button" class="link" id="dfAskAdd">اقتراح مكوّن جديد للمراجعة</button>
          <button type="button" class="link" id="dfReport">أبلغ عن اقتراح غير مناسب</button>
        </div>
      </div>`;

    root.querySelectorAll('.df-pick').forEach((b) => b.addEventListener('click', () => {
      const k = b.getAttribute('data-name');
      if (!ctx.selected[k]) {
        const it = ctx.items.filter((x) => x.name === k)[0] || { name: k, unit: b.getAttribute('data-unit') || 'g' };
        ctx.selected[k] = it;
      } else delete ctx.selected[k];
      const on = !!ctx.selected[k];
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', String(on));
      b.querySelector('i').textContent = on ? '✓' : '+';
      updateBar();
    }));
    root.querySelectorAll('[data-toggle]').forEach((b) => b.addEventListener('click', () => {
      const sec = b.parentElement;
      sec.classList.toggle('closed');
      b.setAttribute('aria-expanded', String(!sec.classList.contains('closed')));
      b.querySelector('.chev').textContent = sec.classList.contains('closed') ? '▾' : '▴';
    }));
    const search = root.querySelector('#dfSmartSearch');
    search.addEventListener('input', () => {
      const q = search.value.trim();
      root.querySelectorAll('.df-pick-group').forEach((sec) => {
        let shown = 0;
        sec.querySelectorAll('.df-pick').forEach((b) => {
          const ok = !q || b.getAttribute('data-name').indexOf(q) > -1;
          b.style.display = ok ? '' : 'none';
          if (ok) shown++;
        });
        sec.style.display = shown ? '' : 'none';
        if (q && shown) sec.classList.remove('closed');
      });
    });
    root.querySelector('#dfClearSel').addEventListener('click', () => { ctx.selected = {}; render(); });
    root.querySelector('#dfAddSel').addEventListener('click', addSelected);
    root.querySelector('#dfAskAdd').addEventListener('click', askNewSuggestion);
    root.querySelector('#dfAskAi').addEventListener('click', askAiSuggestions);
    root.querySelector('#dfReport').addEventListener('click', reportSuggestion);
    updateBar();
  }

  function updateBar() {
    const bar = document.getElementById('dfAddBar');
    if (!bar) return;
    const n = Object.keys(ctx.selected).length;
    bar.hidden = n === 0;
    const c = bar.querySelector('.count');
    if (c) c.textContent = arNo(n) + ' مكوّنًا محددًا';
  }

  function addSelected() {
    const picked = Object.keys(ctx.selected).map((k) => ctx.selected[k]);
    if (!picked.length) return;
    const api = global.MirbahBridge;
    if (!api || typeof api.addIngredient !== 'function') { alert('تعذّر الوصول إلى الحاسبة — أعد فتح الصفحة.'); return; }
    if (typeof api.addMany !== 'function') { alert('حدّث الصفحة لإضافة مجموعة عناصر.'); return; }
    const host = document.getElementById('dfSmartRoot');
    const names = picked.map((p) => p.name).join('، ');
    let box = host.querySelector('.df-pickbox');
    if (box) box.remove();
    const unitNames = { g: 'جرام', kg: 'كيلوجرام', mg: 'مليجرام', ml: 'ملليلتر', l: 'لتر', pc: 'حبة', m: 'متر', cm: 'سنتيمتر', tola: 'تولة', ounce: 'أوقية', thumn: 'ثمن', skein: 'شلّة', spool: 'بكرة', sheet: 'ورقة', dozen: 'درزن', cup: 'كوب', pump: 'ضغطة', shot: 'شوت', yard: 'ياردة', box: 'علبة', bottle: 'زجاجة', roll: 'رول', license: 'رخصة', subscription: 'اشتراك' };
    const units = Array.from(new Set(picked.map((p) => p.unit || 'g').concat(['g', 'kg', 'ml', 'l', 'pc', 'm'])));
    host.insertAdjacentHTML('beforeend', `
      <div class="df-pickbox" role="dialog" aria-label="بيانات الشراء">
        <div class="df-pickbox-head"><b>املأ حجم العبوة وسعرها</b><span class="hint">تُطبَّق على: ${E(names)}</span></div>
        <div class="df-pickbox-fields">
          <div><label class="ld">الكمية المشتراة</label><input class="input" id="dfBulkPack" inputmode="decimal" placeholder="مثال: 1000" /></div>
          <div><label class="ld">سعر العبوة (ر.س)</label><input class="input" id="dfBulkPrice" inputmode="decimal" placeholder="مثال: 6" /></div>
          <div><label class="ld">الوحدة</label>
            <select class="input" id="dfBulkUnit">
              ${units.map((u) => `<option value="${u}" ${u === (picked[0].unit || 'g') ? 'selected' : ''}>${unitNames[u] || u}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="df-pickbox-actions">
          <button type="button" class="btn" id="dfBulkAdd">أضِف ${arNo(picked.length)} إلى المنتج</button>
          <button type="button" class="btn btn-line" id="dfBulkCancel">إلغاء</button>
        </div>
      </div>`);
    document.getElementById('dfBulkCancel').addEventListener('click', () => { const b = host.querySelector('.df-pickbox'); if (b) b.remove(); });
    document.getElementById('dfBulkAdd').addEventListener('click', () => {
      const pack = document.getElementById('dfBulkPack').value;
      const price = document.getElementById('dfBulkPrice').value;
      const unit = document.getElementById('dfBulkUnit').value;
      const items = picked.map((p) => {
        const mode = p.calcMode || 'portion';
        const it = { name: p.name, unit: p.unit || unit, calcMode: mode };
        if (p.qty) it.qty = p.qty;
        if (mode === 'direct') {
          it.directCost = p.directCost != null ? p.directCost : (price || 0);
        } else if (mode === 'amortized') {
          it.subAmount = p.subAmount != null ? p.subAmount : (price || 0);
          it.projectsPerMonth = p.projectsPerMonth != null ? p.projectsPerMonth : 1;
          it.subPeriod = p.subPeriod || 'monthly';
        } else {
          if (pack !== '') { it.pack = pack; it.packUnit = unit; }
          if (price !== '') it.price = price;
          if (mode === 'count' && pack !== '') { it.piecesPerPack = pack; it.piecesUsed = p.qty || 0; }
        }
        return it;
      });
      const added = api.addMany(items) || 0;
      ctx.selected = {};
      const b = host.querySelector('.df-pickbox');
      if (b) b.remove();
      render();
      api.afterAdd && api.afterAdd(added);
    });
  }

  async function askAiSuggestions() {
    const btn = document.getElementById('dfAskAi');
    if (btn) { btn.disabled = true; btn.textContent = 'جارٍ الاقتراح…'; }
    try {
      const r = await fetch(location.origin + '/api/merchant/ai-suggest', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'mirbah' },
        body: JSON.stringify({
          productName: ctx.meta.productName,
          existing: Object.keys(ctx.selected).concat((ctx.meta.existing || []))
        })
      });
      const j = await r.json().catch(() => null);
      if (!j || !j.ok) { alert((j && j.message) || 'اقتراح الذكاء غير متاح حاليًا — اقتراحاتنا الجاهزة أعلاه متاحة دائمًا.'); return; }
      // ندمج المقترحات الذكية كـ«مقترحات ذكية» (extra) دون كتابتها في المكتبة العامة
      const known = new Set(ctx.items.map((x) => x.name));
      const fresh = (j.items || []).filter((x) => !known.has(x.name));
      ctx.items = ctx.items.concat(fresh.map((x) => ({ name: x.name, kind: x.kind || 'optional', unit: x.unit || 'g', ai: true })));
      render();
    } catch (e) {
      alert('تعذّر الاتصال بالاقتراح الذكي.');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'اقترح لي بذكاء'; }
    }
  }

  async function askNewSuggestion() {
    const name = (prompt('اسم المكوّن الذي تريد اقتراحه للمكتبة:') || '').trim();
    if (!name) return;
    const unit = (prompt('الوحدة الافتراضية (g / ml / pc / m):', 'g') || 'g').trim();
    try {
      const r = await fetch(location.origin + '/api/merchant/suggestions', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'mirbah' },
        body: JSON.stringify({ name, unit, note: 'من حاسبة الدفتر' })
      });
      const j = await r.json().catch(() => null);
      if (j && j.ok) alert('أُرسل للمراجعة الإدارية، ولن يظهر للجميع قبل الموافقة.');
      else if (j && j.pending) alert(j.pending + '\n\nمحفوظة لك محليًا في هذا الجهاز.');
      else alert((j && j.message) || 'سجّل الدخول لإرسال اقتراح للمراجعة.');
    } catch (e) { alert('تعذّر الإرسال — يحتاج تسجيل الدخول.'); }
  }

  async function reportSuggestion() {
    const sel = Object.keys(ctx.selected);
    const name = (prompt('اسم الاقتراح غير المناسب:', sel[0] || '') || '').trim();
    if (!name) return;
    const reason = (prompt('لماذا؟ (غير مناسب / مكرر / خطأ إملائي / غير آمن)', 'غير مناسب') || '').trim();
    try {
      const r = await fetch(location.origin + '/api/merchant/report', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'mirbah' },
        body: JSON.stringify({ name, reason, ingKey: ctx.meta.ingKey })
      });
      const j = await r.json().catch(() => null);
      alert(j && j.ok ? 'وصلنا البلاغ، شكرًا.' : (j && j.message) || 'تعذّر الإرسال.');
    } catch (e) { alert('تعذّر الإرسال — يحتاج تسجيل الدخول.'); }
  }

  async function mount(root, meta) {
    ctx = { root, items: [], selected: {}, meta: meta || {}, source: 'none', usage: [] };
    const res = await fetchSuggestions(ctx.meta.ingKey, ctx.meta.domainId, ctx.meta.productId);
    ctx.source = res.source;
    ctx.items = res.items;
    // المكونات الأكثر استخدامًا عند التاجر (إن كان مسجّلًا)
    try {
      if (location.protocol !== 'file:') {
        const u = await fetch(location.origin + '/api/merchant/usage', { credentials: 'same-origin', headers: { 'X-Requested-With': 'mirbah' } });
        const uj = await u.json();
        if (uj && uj.ok && Array.isArray(uj.items)) ctx.meta.usage = uj.items;
      }
    } catch (e) {}
    if (!root.isConnected) return;
    // لا قائمة مسبقة: نعرض شريحة أساسية للبحث اليدوي فقط، مع رسالة صريحة
    if (!ctx.items.length) {
      root.innerHTML = `
        <div class="df-smart">
          <div class="df-smart-head">
            <p class="hint">لا توجد اقتراحات جاهزة لهذا المنتج بعد. استخدم البحث أو «اقترح لي بذكاء» أو أضف مكوّنًا يدويًا.</p>
          </div>
          <div class="df-smart-foot">
            <button type="button" class="link" id="dfAskAi">اقترح لي بذكاء</button>
            <button type="button" class="link" id="dfAskAdd">اقتراح مكوّن جديد للمراجعة</button>
          </div>
        </div>`;
      const a = root.querySelector('#dfAskAi'); if (a) a.addEventListener('click', askAiSuggestions);
      const b = root.querySelector('#dfAskAdd'); if (b) b.addEventListener('click', askNewSuggestion);
      return;
    }
    render();
  }

  global.MirbahProposals = { mount };
})(window);
