/* =============================================================
   مزامنة الكتالوج مع الخادم (دفتر V3)
   - تُقرأ الشجرة والمصدر من /api/public/catalog إن كان الخادم متاحًا،
     فتصير تعديلات لوحة المالك (أنشطة/تصنيفات/منتجات/اقتراحات) ظاهرة فورًا.
   - إن كان الملف مفتوحًا بلا خادم، يبقى الكتالوج المحلي (data.js) كما هو.
   - لا تُغيّر أي شكل من أشكال الحالة القائمة.
   ============================================================= */
(function () {
  'use strict';
  const remote = (path) => {
    try {
      if (location.protocol === 'file:') return null;
      // من /public/ → /api (الجذر ذو النقطة الواحدة فوق public)
      return new URL(path.replace(/^\//, ''), location.href.replace(/\/[^/]*$/, '/')).toString()
        .replace(/\/public\/api\/public\//, '/api/public/');
    } catch (e) { return null; }
  };

  async function sync() {
    if (location.protocol === 'file:') return;
    const url = location.origin + '/api/public/catalog';
    try {
      const res = await fetch(url, { headers: { Accept: 'application/json' } });
      if (!res.ok) return;
      const data = await res.json();
      if (data && data.ok && Array.isArray(data.activities) && data.activities.length && window.AppData && window.AppData.setLiveCatalog) {
        window.AppData.setLiveCatalog(data.activities);
        window.__MIRBAH_CATALOG_LIVE__ = true;
        window.dispatchEvent(new CustomEvent('mirbah:catalog', { detail: { activities: data.activities.length } }));
      }
    } catch (e) { /* وضع محلي */ }
  }

  window.MirbahCatalog = { sync, suggestionsFor: (key) => fetch(location.origin + '/api/public/suggestions?key=' + encodeURIComponent(key)).then((r) => r.json()) };
  sync();
})();
