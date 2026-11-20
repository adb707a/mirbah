/* =============================================================
   مِرْباح — شجرة الاختيار (إعادة بناء)
   بطاقات مضغوطة: أيقونة خطية + اسم + سطر منتجات + شارة عدد.
   قطاعات مجمّعة للنشاط، وبحث فوري، وبلا أرقام عشوائية.
   ============================================================= */
(function (global) {
  'use strict';

  const T = {};
  const LEVELS = {
    project: { label: 'نوع المنشأة', step: 'project' },
    domain: { label: 'نوع النشاط', step: 'domain' },
    subcategory: { label: 'التصنيف', step: 'subcategory' },
    product: { label: 'المنتج', step: 'product' }
  };
  const WORDS = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
  const ar = (n, pad) => {
    let s = String(n).split('').map((d) => WORDS[Number(d)] || d).join('');
    while (pad && s.length < pad) s = '٠' + s;
    return s;
  };
  const esc = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  let lock = 0;
  let timer = null;

  function iconSvg(id) {
    const SC = global.ProductSchemas;
    const inner = (SC && SC.iconFor && SC.iconFor(id)) || '';
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;
  }

  function card(o, selectedId) {
    const isCurrent = selectedId && o.id === selectedId;
    const count = o.count != null ? `<span class="df-card-count">${ar(o.count)} ${esc(o.countLabel || 'منتج')}</span>` : '';
    return `<li>
      <button type="button" class="df-sheet df-card${isCurrent ? ' is-current' : ''}" data-action="select-${o.levelKey || ''}" data-id="${esc(o.id)}"
        data-search="${esc((o.title || '') + ' ' + (o.desc || '') + ' ' + (o.search || ''))}">
        <span class="df-card-icon">${iconSvg(o.icon)}</span>
        <span class="df-card-body">
          <b>${esc(o.title)}</b>
          ${o.desc ? `<small>${esc(o.desc)}</small>` : ''}
        </span>
        ${count}
      </button>
    </li>`;
  }

  T.render = function (model) {
    if (!model || !model.levels || !model.levels.length) return '<div class="tree-panel df-index" id="treePanel"></div>';
    const active = model.activeIndex;
    const trail = [];
    for (let i = 0; i < active; i++) {
      const lv = model.levels[i];
      const sel = lv.selection || {};
      const def = LEVELS[lv.key] || { label: lv.label, step: lv.key };
      trail.push(`<button type="button" class="df-trail-tab" data-action="goto" data-step="${def.step}" title="عد إلى ${esc(def.label)}">
        <b>${esc(sel.title || '—')}</b><i>${ar(i + 1)}</i>
      </button>`);
    }
    const lv = model.levels[active];
    const def = LEVELS[lv.key] || { label: lv.label, step: lv.key };
    const options = (lv.options || []).map((o) => Object.assign({}, o, { levelKey: lv.key }));

    // تجميع حسب القطاع إن وُجد
    let body = '';
    const hasSectors = options.some((o) => o.sectorName);
    if (hasSectors) {
      const seen = [];
      options.forEach((o) => {
        const nm = o.sectorName || 'أنشطة أخرى';
        if (!seen.some((s) => s.name === nm)) seen.push({ name: nm, items: [] });
        seen.filter((s) => s.name === nm)[0].items.push(o);
      });
      // ترتيب القطاعات كما هو معرّف في مخططات المنتجات (أغذية → مشروبات → حرف → عطور)
      const SC = global.ProductSchemas;
      if (SC && Array.isArray(SC.SECTORS)) {
        const order = SC.SECTORS.map((x) => x.name);
        seen.sort((a, b) => {
          const ia = order.indexOf(a.name), ib = order.indexOf(b.name);
          return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
        });
      }
      body = seen.map((sec) => `
        <div class="df-sector">
          <div class="df-sector-head"><span></span><h4>${esc(sec.name)}</h4><span class="df-sector-line"></span></div>
          <ol class="df-leaves df-cards" id="treeList">${sec.items.map((o) => card(o, lv.selectedId)).join('')}</ol>
        </div>`).join('');
    } else {
      body = `<ol class="df-leaves df-cards" id="treeList">${options.map((o) => card(o, lv.selectedId)).join('')}</ol>`;
    }

    return `
      <div class="tree-panel df-index" id="treePanel">
        ${trail.length ? `<nav class="df-tabs-trail" aria-label="لصاقات الفهرس">${trail.join('')}</nav>` : ''}
        <div class="df-sheet-head">
          <h3>${esc(def.label)}</h3>
          <small>${ar(options.length)} ${options.some((o) => o.sectorName) ? 'نشاطًا' : 'خيارًا'}</small>
        </div>
        ${options.length > 6 ? `<div class="df-tree-search"><input type="search" id="treeSearch" placeholder="ابحث…" aria-label="ابحث في الخيارات" autocomplete="off" /></div>` : ''}
        <div class="df-tree-body">${body}</div>
        <p class="df-tree-empty" hidden>لا يوجد خيار مطابق.</p>
      </div>`;
  };

  /* بحث فوري بلا إعادة تصيير (لا يفقد التركيز ولا يقفز التمرير) */
  T.bindSearch = function () {
    const input = document.getElementById('treeSearch');
    if (!input) return;
    const apply = () => {
      const q = input.value.trim();
      let shown = 0;
      document.querySelectorAll('#treePanel .df-card').forEach((b) => {
        const ok = !q || (b.getAttribute('data-search') || '').indexOf(q) > -1;
        b.parentElement.hidden = !ok;
        if (ok) shown++;
      });
      document.querySelectorAll('#treePanel .df-sector').forEach((sec) => {
        const n = Array.from(sec.querySelectorAll('.df-card')).filter((b) => !b.parentElement.hidden).length;
        sec.hidden = n === 0;
      });
      const empty = document.querySelector('.df-tree-empty');
      if (empty) empty.hidden = shown > 0;
      const list = document.getElementById('treeList');
      if (list) list.hidden = shown === 0;
    };
    input.addEventListener('input', apply);
  };

  T.draw = function () { };
  T.drawSoon = function () { };
  T.observe = function () { };
  T.revealActiveNode = function () { };

  T.animateSelection = function (btn, done) {
    if (!btn || !btn.classList.contains('df-card')) return false;
    const now = Date.now();
    if (now < lock) return true;
    lock = now + 320;
    btn.classList.add('df-picked');
    Array.from(document.querySelectorAll('.df-card')).forEach((s) => { if (s !== btn) s.classList.add('df-fold'); });
    clearTimeout(timer);
    timer = setTimeout(() => { lock = 0; done(btn); }, 240);
    return true;
  };

  T.reset = function () { lock = 0; clearTimeout(timer); };

  T.scrollToActive = function () {
    const head = document.querySelector('#treePanel .df-sheet-head');
    if (!head) return;
    const top = head.getBoundingClientRect().top;
    if (top < 80 || top > global.innerHeight - 200) global.scrollTo({ top: global.scrollY + top - 130, behavior: 'auto' });
  };

  T.LEVELS = LEVELS;
  global.Tree = T;
  global.MirbahTree = T;
})(window);
