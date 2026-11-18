/* =============================================================
   دَفْتَر — شجرة «أوراق الدفتر»
   مراجع: Money in Check (ورق مسطّر وأرقام عارية) · Really Good Emails
   (سطر واحد للسطر) · Animista (easeOutCubic). كل خيار ورقة تُطوى في
   الفهرس، والمسار لصاقات فهرسة في هامش الصفحة.
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
    const options = lv.options || [];

    const sheets = options.map((o, i) => `
      <li>
        <button type="button" class="df-sheet" data-action="select-${lv.key}" data-id="${esc(o.id)}">
          <span class="df-sheet-no">${ar(i + 1)}</span>
          <span class="df-sheet-body">
            <b>${esc(o.title)}</b>
            ${o.desc ? `<small>${esc(o.desc)}</small>` : ''}
          </span>
        </button>
      </li>`).join('');

    return `
      <div class="tree-panel df-index" id="treePanel">
        ${trail.length ? `<nav class="df-tabs-trail" aria-label="لصاقات الفهرس">${trail.join('')}</nav>` : ''}
        <div class="df-sheet-head">
          <h3>${esc(def.label)}</h3>
          <small>${ar(options.length)} أوراق في هذا الدرج</small>
        </div>
        <ol class="df-leaves" id="treeList">${sheets}</ol>
      </div>`;
  };

  T.draw = function () { };
  T.drawSoon = function () { };
  T.observe = function () { };
  T.revealActiveNode = function () { };

  T.animateSelection = function (btn, done) {
    if (!btn || !btn.classList.contains('df-sheet')) return false;
    const now = Date.now();
    if (now < lock) return true;
    lock = now + 320;
    btn.classList.add('df-picked');
    Array.from(document.querySelectorAll('.df-sheet')).forEach((s) => { if (s !== btn) s.classList.add('df-fold'); });
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
