/* =============================================================
   دفتر V3 — مساعد أسعار الشراء (فردياً أو عبر الوكيل)
   - الوضع الافتراضي: «وكيل المتصفح» — يفتح نتيجة البحث في نافذة جديدة.
   - الوضع الاختياري: نقطة نهاية JSON على الخادم (price-search)
     لا تُستدعى إلا إذا حُدّدت عبر <meta name="price-api" content="...">.
   - المفتاح لا يظهر هنا مطلقًا؛ يعيش على الخادم فقط.
   - لا يخترع أسعارًا ولا يعرض نتائج «ذكاء اصطناعي» كأسعار حقيقية.
   ============================================================= */
(function (global) {
  'use strict';

  const meta = (name) => {
    const m = document.querySelector('meta[name="' + name + '"]');
    return m ? (m.getAttribute('content') || '').trim() : '';
  };

  function endpoint() {
    return meta('price-api').replace(/\/$/, '');
  }

  function canQuery() {
    return endpoint() !== '';
  }

  function queryUrl(ing) {
    const q = [ing.name, ing.brand, ing.pack ? ing.pack + ' ' + (ing.packUnit || '') : '']
      .filter(Boolean).join(' ').trim() || 'بقالة';
    return 'https://muwazin.me/search?q=' + encodeURIComponent(q);
  }

  /**
   * يرجّع مصفوفة أقوال:
   *  - { source:'agent', offers:[...] } عند نجاح نقطة النهاية
   *  - { source:'agent-error', message } عند فشل الخادم
   *  - { source:'manual', message } عند غياب النقطة
   * لا يُرجَع أي سعر من عندنا.
   */
  async function findOffers(ing) {
    if (!canQuery()) {
      return { ok: true, source: 'manual', offers: [], compareUrl: queryUrl(ing), message: 'لم تُفعّل خدمة الأسعار على الخادم بعد. تبقى المقارنة كما أُدخلت يدويًا.' };
    }
    try {
      const r = await fetch(endpoint() + '/search?name=' + encodeURIComponent(ing.name || '') +
        (ing.pack ? '&size=' + encodeURIComponent(ing.pack + ' ' + (ing.packUnit || '')) : ''), {
        headers: { Accept: 'application/json' }
      });
      const data = await r.json();
      if (!r.ok || !data.ok) throw new Error((data && data.message) || 'تعذّر جلب الأسعار.');
      return { ok: true, source: 'agent', offers: data.offers || [], fetchedAt: data.fetchedAt || null, compareUrl: queryUrl(ing) };
    } catch (e) {
      return { ok: false, source: 'agent-error', offers: [], compareUrl: queryUrl(ing), message: e.message || 'تعذّر جلب الأسعار من الخادم.' };
    }
  }

  global.PriceAgent = { canQuery, endpoint, queryUrl, findOffers };
})(window);
