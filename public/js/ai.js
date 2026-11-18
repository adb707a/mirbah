/* =============================================================
   مِرْباح — عميل الذكاء الاصطناعي (الواجهة)
   لا يحتوي على أي مفتاح. يتصل فقط بخادمنا الآمن /api/analyze.
   عند غياب الخدمة يقدّم "تحليلًا محليًا" موسومًا بوضوح (ليس AI).
   ============================================================= */
(function (global) {
  'use strict';

  // عنوان خادم الـ API: فارغ = نفس الأصل (يعمل مع python server أو أي استضافة)
  // ويمكن ضبطه عبر <meta name="api-base" content="https://...">
  const API_BASE = (function () {
    const meta = document.querySelector('meta[name="api-base"]');
    const v = meta ? (meta.getAttribute('content') || '').trim() : '';
    return v.replace(/\/$/, '');
  })();
  const apiUrl = (p) => API_BASE + p;

  async function health() {
    try {
      const r = await fetch(apiUrl('/api/health'), { headers: { 'Accept': 'application/json' } });
      if (!r.ok) throw new Error('http ' + r.status);
      return await r.json();
    } catch (e) {
      return { ok: false, aiConfigured: false, offline: true };
    }
  }

  async function analyze(payload) {
    // مهلة للعميل حتى لا تبقى الواجهة عالقة إن لم يرد الخادم
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 75000);
    let r;
    try {
      r = await fetch(apiUrl('/api/analyze'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
    } catch (e) {
      const err = new Error(e && e.name === 'AbortError'
        ? 'انتهت مهلة انتظار التحليل. حاول مرة أخرى.'
        : 'تعذّر الاتصال بالخادم. تأكد أن الخادم يعمل.');
      err.code = e && e.name === 'AbortError' ? 'timeout' : 'network';
      throw err;
    } finally {
      clearTimeout(timer);
    }
    let data = {};
    try { data = await r.json(); } catch (e) {}
    if (!r.ok || !data.ok) {
      const err = new Error(data.message || 'تعذّر الحصول على تحليل من الخدمة.');
      err.code = data.code || 'error';
      err.status = r.status;
      throw err;
    }
    return data;
  }

  /* -------- فحص سعر مكوّن واحد (Micro AI) -------- */
  // طلب خفيف: اسم المكوّن + العبوة + الوحدة + السعر فقط
  async function priceCheck(payload) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    let r;
    try {
      r = await fetch(apiUrl('/api/price-check'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
    } catch (e) {
      const err = new Error(e && e.name === 'AbortError'
        ? 'تأخر فحص السعر، حاول مرة أخرى.'
        : 'فحص الأسعار يحتاج تشغيل الخادم.');
      err.code = e && e.name === 'AbortError' ? 'timeout' : 'network';
      throw err;
    } finally {
      clearTimeout(timer);
    }
    let data = {};
    try { data = await r.json(); } catch (e) {}
    if (!r.ok || !data.ok) {
      const err = new Error(data.message || 'تعذّر فحص السعر.');
      err.code = data.code || 'error';
      throw err;
    }
    return data;
  }

  /* -------- تحليل محلي (حسابي بحت، ليس ذكاءً اصطناعيًا) -------- */
  function localAnalysis(computed, meta) {
    const c = computed;
    const money = (n) => (Math.round((Number(n) || 0) * 100) / 100).toFixed(2) + ' ر.س';
    const tips = [];
    const risks = [];
    let summary = '';

    if (c.status === 'profit') {
      summary = `منتج «${meta.product || 'المنتج'}» يبيع حاليًا بربح ${money(c.profitPerUnit)} للوحدة، أي هامش ${c.margin}%.`;
    } else if (c.status === 'loss') {
      summary = `منتج «${meta.product || 'المنتج'}» يُباع بخسارة ${money(Math.abs(c.profitPerUnit))} للوحدة. السعر الحالي لا يغطي التكاليف.`;
    } else {
      summary = `سعر البيع قريب جدًا من التكلفة؛ الربح شبه معدوم ويحتاج مراجعة.`;
    }

    // تحليل التكلفة
    const parts = [
      { k: 'المكونات', v: c.ingredientsTotal },
      { k: 'التغليف', v: c.packagingTotal },
      { k: 'التشغيل', v: c.operationalTotal },
      { k: 'الوقت', v: c.timeTotal }
    ].sort((a, b) => b.v - a.v);
    const biggest = parts[0];
    const costAnalysis = [
      `أكبر بند تكلفة هو ${biggest.k} بقيمة ${money(biggest.v)} من أصل ${money(c.batchTotal)} للدفعة.`,
      `تكلفة الوحدة ${money(c.unitCost)} مقابل سعر بيع ${money(c.sellPrice)}.`,
      c.estimatedCost > 0
        ? `من تكلفة المكونات ${money(c.estimatedCost)} تعتمد على أسعار تقديرية؛ يُفضّل استبدالها بأسعار فعلية لدقة أعلى.`
        : `جميع أسعار المكونات مدخلة كأسعار فعلية، وهذا يرفع دقة التحليل.`
    ];

    // تقييم المشتريات (من بيانات المستخدم فقط)
    let purchaseEvaluation;
    if (!c.purchaseChecks || c.purchaseChecks.length === 0) {
      purchaseEvaluation = 'لم تُدخل أسعار سوق للمقارنة. أدخل سعر السوق لنفس العبوة في بطاقة المكوّن ليتمكن النظام من كشف الشراء المرتفع؛ لن نخترع أسعارًا.';
    } else {
      const high = c.purchaseChecks.filter((p) => p.verdict === 'high');
      purchaseEvaluation = high.length
        ? `يبدو أنك تشتري ${high.map((p) => p.name).join('، ')} بسعر أعلى من السوق. راجع المورد أو حجم العبوة.`
        : 'أسعار مشترياتك المدخلة قريبة من السوق أو أفضل، وهذا جيد.';
    }

    // توصيات
    if (c.status !== 'profit') {
      tips.push(`ارفع السعر إلى ${money(c.pricingOptions[1].price)} (السعر المتوازن) أو خفّض التكلفة.`);
      risks.push('الاستمرار بالسعر الحالي قد يستهلك رأس المال دون ربح حقيقي.');
    }
    if (parts[0].k === 'التغليف') tips.push('ابحث عن مورد تغليف بكميات أكبر لتقليل تكلفة القطعة.');
    if (parts[0].k === 'الوقت') tips.push('وقتك مُحتسب ضمن التكلفة؛ يمكن رفع السعر أو زيادة عدد الوحدات لتوزيع الوقت.');
    if (c.estimatedCost > 0) tips.push('أدخل الأسعار الفعلية للمكونات لمقارنة أدق.');
    if (c.breakEvenUnits != null && c.breakEvenUnits > c.units) {
      tips.push(`تحتاج بيع ${c.breakEvenUnits} وحدة لتغطية تكلفة الدفعة، بينما تنتج ${c.units} فقط.`);
    }
    if (tips.length === 0) {
      tips.push('حافظ على جودة المنتج، وراقب أسعار المكونات دوريًا.');
      tips.push('جرّب عرض عبوة أكبر (3 أو 5 وحدات) لزيادة قيمة السلة.');
    }

    return {
      source: 'local',
      label: 'تحليل محلي حسابي (بدون ذكاء اصطناعي)',
      summary,
      realityCheck: c.status === 'profit' ? 'المنتج مربح حاليًا، لكن راقب التكاليف المتغيرة.' : 'المنتج لا يحقق ربحًا حقيقيًا بالسعر الحالي.',
      costAnalysis,
      purchaseEvaluation,
      pricingStrategy: `السعر المتوازن المقترح ${money(c.pricingOptions[1].price)} للوحدة بهامش ${c.pricingOptions[1].margin}%.`,
      volumeStrategy: 'يمكنك تجربة بيع 3 أو 5 وحدات بخصم بسيط لزيادة حجم الطلب دون خسارة الهامش.',
      profitTips: tips,
      risks
    };
  }

  global.AI = { health, analyze, localAnalysis, priceCheck, apiUrl };
})(window);
