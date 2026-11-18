/* =============================================================
   مِرْباح — محرك الحسابات المالية
   حسابات نقية (Pure) بلا أي اعتماد على الواجهة، قابلة للاختبار
   في Node أو المتصفح. جميع العمليات الحسابية تتم هنا فقط.
   ============================================================= */
(function (global) {
  'use strict';

  const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';
  const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
  const normalizeDigits = (v) => String(v)
    .replace(/[٠-٩]/g, (d) => String(AR_DIGITS.indexOf(d)))
    .replace(/[۰-۹]/g, (d) => String(FA_DIGITS.indexOf(d)));
  const num = (v) => {
    if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
    const n = parseFloat(normalizeDigits(v).replace(/[^\d.\-]/g, ''));
    return Number.isFinite(n) ? n : 0;
  };
  const nonNeg = (v) => Math.max(0, num(v));
  const round2 = (v) => Math.round((num(v) + Number.EPSILON) * 100) / 100;
  const round4 = (v) => Math.round((num(v) + Number.EPSILON) * 10000) / 10000;
  const round1 = (v) => Math.round((num(v) + Number.EPSILON) * 10) / 10;
  const clampPct = (v) => Math.max(-999, Math.min(999, v));

  /* =============================================================
     دفتر V3: محرك الوحدات الذكي (js/smart-units.js)
     - يحلّ محل UNIT_TABLE القديم في هذا النموذج فقط.
     - الاحتياط يبقى مطابقًا للأصلي إذا لم تُحمّل الوحدة.
     ============================================================= */
  const S = (typeof window !== 'undefined' && window.SmartUnits) || null;
  const LEGACY_UNITS = {
    g: { group: 'mass', factor: 1 }, kg: { group: 'mass', factor: 1000 },
    ml: { group: 'volume', factor: 1 }, l: { group: 'volume', factor: 1000 },
    m: { group: 'length', factor: 1 }, cm: { group: 'length', factor: 0.01 },
    spool: { group: 'count', factor: 1 }, bag: { group: 'count', factor: 1 },
    carton: { group: 'count', factor: 1 }, pc: { group: 'count', factor: 1 }
  };
  const GROUP_LABEL = { mass: 'كجم', volume: 'لتر', count: 'حبة', length: 'متر', kitchen: 'وحدة', custom: 'وحدة' };
  const GROUP_FACTOR = { mass: 1000, volume: 1000, count: 1, length: 1 };

  function unitInfo(unitId) {
    if (S) {
      const i = S.info(unitId);
      return { group: i.group, factor: i.factor == null ? 1 : i.factor, base: i.group === 'mass' ? 'g' : i.group === 'volume' ? 'ml' : i.group === 'length' ? 'm' : 'pc' };
    }
    return LEGACY_UNITS[unitId] || { group: 'count', factor: 1 };
  }

  // هل الوحدتان من نفس المجموعة؟ لا تحويل بين الوزن والحجم أبدًا
  function unitsCompatible(a, b) {
    if (S) return S.compatible(a, b);
    return unitInfo(a).group === unitInfo(b).group;
  }

  function convertQty(qty, fromUnit, toUnit) {
    if (S) {
      const r = S.convert(qty, fromUnit, toUnit);
      return r.ok ? r.qty : null;
    }
    if (fromUnit === toUnit) return nonNeg(qty);
    if (!unitsCompatible(fromUnit, toUnit)) return null;
    return round4(nonNeg(qty) * (unitInfo(fromUnit).factor / unitInfo(toUnit).factor));
  }

  // نسبة الاستهلاك بعد توحيد الوحدتين — null إن كانتا غير متوافقتين
  function usageRatio(qty, qtyUnit, pack, packUnit) {
    const p = nonNeg(pack);
    const q = nonNeg(qty);
    if (p <= 0 || q <= 0) return 0;
    if (!unitsCompatible(qtyUnit, packUnit)) return null;
    const qBase = q * unitInfo(qtyUnit).factor;
    const pBase = p * unitInfo(packUnit).factor;
    if (pBase <= 0) return 0;
    return qBase / pBase;
  }

  // سعر الوحدة الموحّد للمقارنة — null عند غياب معامل موثوق
  function normalizedUnitPrice(price, qty, unit) {
    if (S) {
      const r = S.unitPrice(price, qty, unit);
      return r.ok ? r.value : null;
    }
    const info = unitInfo(unit);
    const baseQty = nonNeg(qty) * info.factor;
    if (baseQty <= 0) return 0;
    const perBase = nonNeg(price) / baseQty;
    return round2(perBase * GROUP_FACTOR[info.group]);
  }

  // اسم الوحدة أو الوحدة المقارنة الافتراضية للمجموعة
  function compareUnitInfo(unit) {
    if (S) return S.compareUnit(unit);
    const g = unitInfo(unit).group;
    return { unit: ['mass', 'volume', 'length'].indexOf(g) > -1 ? (g === 'mass' ? 'kg' : g === 'volume' ? 'l' : 'm') : unit, label: GROUP_LABEL[g] };
  }

  // التسمية الديناميكية: «الوزن المشترى» و«الوزن المستخدم»
  function unitLabels(unit) {
    if (S) return S.label(unit);
    return { bought: 'الكمية المشتراة', used: 'الكمية المستخدمة', short: unit };
  }

  /* ---------------- تكلفة مكوّن ---------------- */
  function ingredientCost(ing) {
    const pack = nonNeg(ing.pack);
    const qty = nonNeg(ing.qty);
    const price = nonNeg(ing.price);
    const qtyUnit = ing.qtyUnit || ing.unit || 'g';
    const packUnit = ing.packUnit || ing.unit || 'g';
    if (pack <= 0) return { costUsed: 0, leftoverValue: round2(price), incompatible: false, ratio: 0 };
    const r = usageRatio(qty, qtyUnit, pack, packUnit);
    if (r == null) {
      return { costUsed: 0, leftoverValue: round2(price), incompatible: true, ratio: 0 };
    }
    const ratio = Math.min(r, 1.5);
    const costUsed = round2(price * ratio);
    const leftoverValue = round2(Math.max(0, price - costUsed));
    return { costUsed, leftoverValue, incompatible: false, ratio: r };
  }

  /* ---------------- تكلفة عنصر تغليف ---------------- */
  function packagingCost(item) {
    const per = nonNeg(item.piecesPerPack);
    const used = nonNeg(item.piecesUsed);
    const price = nonNeg(item.packPrice);
    if (per <= 0) return 0;
    return round2(price * (used / per));
  }

  /* ---------------- توزيع مصروف تشغيلي على الدفعة ---------------- */
  // period: perBatch | daily | monthly ; batchesPerMonth = عدد الدفعات شهريًا
  function operationalPerBatch(exp, batchesPerMonth) {
    const amount = nonNeg(exp.amount);
    const bpm = Math.max(1, num(batchesPerMonth) || 1);
    switch (exp.period) {
      case 'monthly': return round2(amount / bpm);
      case 'daily':   return round2((amount * 30) / bpm);
      case 'perBatch':
      default:        return round2(amount);
    }
  }

  /* ---------------- رسوم بوابات الدفع (نسبة + مبلغ ثابت) ---------------- */
  // لا تُحسب ضمن تكلفة الصنع؛ تُخصم من الربح كإيراد مفقود على كل وحدة مباعة.
  // المبلغ = (نسبة% × سعر البيع) + المبلغ الثابت
  function paymentFees(gateways, sellPrice, units) {
    const price = nonNeg(sellPrice);
    const count = Math.max(1, Math.floor(nonNeg(units) || 1));
    const rows = (Array.isArray(gateways) ? gateways : [])
      .filter((g) => g && g.enabled)
      .map((g) => {
        const pct = Math.min(100, nonNeg(g.pct));
        const fixed = nonNeg(g.fixed);
        const perUnit = round2((price * pct) / 100 + fixed);
        return {
          id: String(g.id),
          name: String(g.name || g.id),
          pct,
          fixed,
          base: price,
          perUnit,
          perBatch: round2(perUnit * count),
          netPerUnit: round2(price - perUnit)
        };
      });
    const perUnit = round2(rows.reduce((a, r) => a + r.perUnit, 0));
    return {
      rows,
      enabledCount: rows.length,
      perUnit,
      perBatch: round2(perUnit * count),
      pctOfPrice: price > 0 ? round1((perUnit / price) * 100) : 0
    };
  }

  /* ---------------- الحساب الكامل ---------------- */
  function compute(state) {
    const s = state || {};
    const units = Math.max(1, Math.floor(nonNeg(s.units) || 1));
    const batchesPerMonth = Math.max(1, num(s.batchesPerMonth) || 1);
    const timeMinutes = nonNeg(s.timeMinutes);
    const hourlyRate = nonNeg(s.hourlyRate);
    const sellPrice = nonNeg(s.sellPrice);
    const repeatMap = new Map();

    const ingredientRows = (s.ingredients || []).map((ing) => {
      // منع تكرار الشراء داخل نفس الدفعة: عند تكرار نفس المكوّن يُعفى الجزء المكرر من تكلفة الشراء
      // (لأن العبوة المشتراة واحدة تُغطي الاستخدامات المتكررة). التكرار = اسم متطابق + نفس العبوة (حجم وسعر).
      const key = [
        String(ing.name || '').trim(),
        String(ing.unit || ''),
        nonNeg(ing.pack),
        nonNeg(ing.price)
      ].join('|');
      const seen = repeatMap.get(key);
      let dupRatio = 0;
      let dupCost = 0;
      if (seen !== undefined && key !== '||0|0') {
        dupRatio = Math.max(0, Math.min(1, seen));
      }
      const c = ingredientCost(ing);
      dupCost = round2(c.costUsed * dupRatio);
      if (key !== '||0|0') repeatMap.set(key, (seen || 0) + 1);
      return {
        name: ing.name || 'مكوّن',
        qty: nonNeg(ing.qty),
        unit: ing.unit,
        pack: nonNeg(ing.pack),
        price: nonNeg(ing.price),
        type: ing.type === 'actual' ? 'actual' : 'estimated',
        marketPrice: ing.marketPrice != null && ing.marketPrice !== '' ? nonNeg(ing.marketPrice) : null,
        marketStore: ing.marketStore ? String(ing.marketStore).trim() : '',
        qtyBase: round2(nonNeg(ing.qty) * unitInfo(ing.unit).factor),
        costUsed: round2(c.costUsed - dupCost),
        dupCost,
        isRepeat: dupRatio > 0,
        leftoverValue: c.leftoverValue,
        unitPrice: normalizedUnitPrice(ing.price, ing.pack, ing.unit)
      };
    });

    const packagingRows = (s.packaging || []).map((p) => ({
      name: p.name || 'تغليف',
      piecesPerPack: nonNeg(p.piecesPerPack),
      packPrice: nonNeg(p.packPrice),
      piecesUsed: nonNeg(p.piecesUsed),
      costUsed: packagingCost(p)
    }));

    const operationalRows = (s.operational || []).map((o) => ({
      name: o.name || 'مصروف',
      amount: nonNeg(o.amount),
      period: o.period || 'perBatch',
      costPerBatch: operationalPerBatch(o, batchesPerMonth)
    }));

    const ingredientsTotal = round2(ingredientRows.reduce((a, r) => a + r.costUsed, 0));
    const packagingTotal = round2(packagingRows.reduce((a, r) => a + r.costUsed, 0));
    const operationalTotal = round2(operationalRows.reduce((a, r) => a + r.costPerBatch, 0));
    const timeTotal = round2((timeMinutes / 60) * hourlyRate);

    const batchTotal = round2(ingredientsTotal + packagingTotal + operationalTotal + timeTotal);
    const unitCost = round2(batchTotal / units);

    const revenueTotal = round2(sellPrice * units);
    const grossProfitPerUnit = round2(sellPrice - unitCost);
    const grossProfitTotal = round2(revenueTotal - batchTotal);

    // رسوم بوابات الدفع: تُخصم من الربح الإجمالي (ليست ضمن تكلفة الصنع)
    const fees = paymentFees(s.paymentGateways, sellPrice, units);
    const profitPerUnit = round2(grossProfitPerUnit - fees.perUnit);
    const profitTotal = round2(grossProfitTotal - fees.perBatch);
    const margin = revenueTotal > 0 ? round1((profitTotal / revenueTotal) * 100) : 0;
    const grossMargin = revenueTotal > 0 ? round1((grossProfitTotal / revenueTotal) * 100) : 0;

    // بيانات فعلية مقابل تقديرية (على مستوى المكونات)
    let actualCost = 0, estimatedCost = 0;
    ingredientRows.forEach((r) => {
      if (r.type === 'actual') actualCost += r.costUsed;
      else estimatedCost += r.costUsed;
    });
    actualCost = round2(actualCost);
    estimatedCost = round2(estimatedCost);
    const knownCost = actualCost + estimatedCost;
    const actualShare = knownCost > 0 ? round1((actualCost / knownCost) * 100) : 0;

    const leftoverInventory = round2(ingredientRows.reduce((a, r) => a + r.leftoverValue, 0));

    const breakEvenUnits = sellPrice > 0 ? Math.ceil(batchTotal / sellPrice) : null;
    const breakEvenPrice = unitCost;

    let status = 'breakeven';
    if (profitPerUnit > 0.009) status = 'profit';
    else if (profitPerUnit < -0.009) status = 'loss';

    // مقارنة المشتريات: هل سعر الشراء أعلى من سعر السوق المعطى؟
    const purchaseChecks = ingredientRows
      .filter((r) => r.marketPrice != null && r.pack > 0)
      .map((r) => {
        // نقارن سعر الوحدة الموحّد للشراء مقابل سعر السوق الموحّد
        // marketPrice = سعر السوق لعبوة بنفس حجم العبوة المشتراة
        const paidNorm = normalizedUnitPrice(r.price, r.pack, r.unit);
        const marketNorm = normalizedUnitPrice(r.marketPrice, r.pack, r.unit);
        let verdict = 'equal';
        if (marketNorm > 0) {
          const diffPct = ((paidNorm - marketNorm) / marketNorm) * 100;
          if (diffPct > 5) verdict = 'high';
          else if (diffPct < -5) verdict = 'low';
        }
        return {
          name: r.name,
          paidNorm,
          marketNorm,
          group: unitInfo(r.unit).group,
          groupLabel: GROUP_LABEL[unitInfo(r.unit).group],
          verdict,
          diffPct: marketNorm > 0 ? round1(((paidNorm - marketNorm) / marketNorm) * 100) : 0,
          store: r.marketStore || '',
          pack: r.pack,
          price: r.price,
          marketPrice: r.marketPrice,
          qtyBase: r.qtyBase,
          savedPerPack: r.marketPrice != null ? round2(r.marketPrice - r.price) : 0
        };
      });

    // خيارات التسعير (تُحسب في JS لا في الذكاء الاصطناعي)
    const pricingOptions = [
      { key: 'economic',  name: 'سعر اقتصادي',  multiplier: 1.15 },
      { key: 'balanced',  name: 'سعر متوازن',    multiplier: 1.40 },
      { key: 'premium',   name: 'سعر ربحي أعلى', multiplier: 1.75 }
    ].map((o) => {
      const price = round2(Math.max(unitCost * o.multiplier, unitCost + 0.5));
      const profit = round2(price - unitCost);
      const m = price > 0 ? round1((profit / price) * 100) : 0;
      return { key: o.key, name: o.name, price, profitPerUnit: profit, margin: clampPct(m) };
    });

    // عروض الكميات — تُبنى على سعر يضمن الربح (سعر المستخدم أو السعر المتوازن أيهما أعلى)
    const balancedOfferBase = round2(Math.max(unitCost * 1.40, unitCost + 0.5));
    const offerBase = Math.max(sellPrice, balancedOfferBase);
    // حد أعلى للخصم يحافظ على ربح لا يقل عن 5% فوق التكلفة
    const maxDisc = Math.max(0, 1 - (unitCost * 1.05) / (offerBase || 1));
    const userDisc = Math.min(Math.max(num(s.discountPct) || 0, 0), 60) / 100;
    const tierDiscount = userDisc > 0
      ? { 1: 0, 3: userDisc * 0.33, 5: userDisc * 0.66, 10: userDisc }
      : { 1: 0, 3: 0.05, 5: 0.10, 10: 0.15 };
    const volumeOffers = [1, 3, 5, 10].map((qty) => {
      const disc = Math.min(tierDiscount[qty] || 0, maxDisc);
      const unitPrice = round2(offerBase * (1 - disc));
      const revenue = round2(unitPrice * qty);
      const cost = round2(unitCost * qty);
      const profit = round2(revenue - cost);
      const m = revenue > 0 ? round1((profit / revenue) * 100) : 0;
      return { qty, discountPct: Math.round(disc * 100), unitPrice, revenue, cost, profit, margin: clampPct(m) };
    });

    const pm = purchaseModel(s);
    const repeatSavings = round2(ingredientRows.reduce((a, r) => a + (r.dupCost || 0), 0));
    const requiredPacks = round2(batchTotal * units);
    const budgetGap = round2(batchTotal - sellPrice * units);
    const market = buildMarketComparison(purchaseChecks);

      return {
      units, batchesPerMonth, timeMinutes, hourlyRate, sellPrice,
      ingredientRows, packagingRows, operationalRows,
      ingredientsTotal, packagingTotal, operationalTotal, timeTotal,
      batchTotal, unitCost, revenueTotal, profitPerUnit, profitTotal,
      margin: clampPct(margin), status,
      breakEvenUnits, breakEvenPrice,
      actualCost, estimatedCost, actualShare, leftoverInventory,
      purchaseChecks, pricingOptions, volumeOffers, offerBase,
      repeatSavings, requiredPacks, budgetGap, market,
      grossProfitPerUnit, grossProfitTotal, grossMargin,
      paymentFees: fees,
      purchase: pm
    };
  }

  /* ---------------- نموذج الشراء (كم أشتري وكم أبيع) ---------------- */
  function purchaseModel(s) {
    const units = Math.max(1, Math.floor(nonNeg(s.units) || 1));
    const batches = Math.max(1, num(s.batchesPerMonth) || 1);
    const packs = nonNeg(s.packCount);
    const monthly = nonNeg(s.monthlyQty);
    // عدد العبوات التي نخزّن من أجلها شهريًا: الكمية الصريحة أو (العبوات لكل دفعة × الدفعات)
    const packsPerBatch = packs > 0 ? packs : null;
    const expectedPacks = packsPerBatch != null ? round2(packsPerBatch * batches) : null;
    const monthlyStock = monthly > 0 ? monthly : expectedPacks;
    const daysOfStock = monthlyStock && packsPerBatch ? round1(monthlyStock / Math.max(0.01, packsPerBatch * batches)) : null;
    const shortfall = (expectedPacks != null && monthly > 0 && monthly < expectedPacks) ? round2(expectedPacks - monthly) : 0;
    return {
      mode: s.purchaseMode || 'custom',
      units, batches, packsPerBatch, expectedPacks, monthlyStock, daysOfStock, shortfall,
      unitsPerPack: (packsPerBatch && units) ? round2(units / packsPerBatch) : null
    };
  }

  /* ---------------- مقارنة السوق المنظّمة (من بيانات المستخدم فقط) ---------------- */
  function buildMarketComparison(checks) {
    const rows = (checks || []).map((p) => {
      const gap = round2(p.marketNorm - p.paidNorm);
      return { ...p, gap };
    });
    const high = rows.filter((p) => p.verdict === 'high');
    const low = rows.filter((p) => p.verdict === 'low');
    const equal = rows.filter((p) => p.verdict === 'equal');
    // أفدح المشتريات ارتفاعًا أولًا
    const worst = high.slice().sort((a, b) => b.diffPct - a.diffPct);
    // التوفير المقدّر: مكسب على العبوة الكاملة + فرق التكلفة المستهلكة في هذه الدفعة
    const potentialSaving = round2(high.reduce((a, p) => a + Math.max(0, p.savedPerPack), 0));
    const potentialSavingPerBatch = round2(high.reduce(
      (a, p) => a + Math.max(0, (p.paidNorm - p.marketNorm) * (p.qtyBase / GROUP_FACTOR[p.group] || 0)),
      0
    ));
    return {
      hasData: rows.length > 0,
      rows,
      highCount: high.length,
      lowCount: low.length,
      equalCount: equal.length,
      worst,
      potentialSaving,
      potentialSavingPerBatch,
      avgGapPct: rows.length ? round1(rows.reduce((a, p) => a + p.diffPct, 0) / rows.length) : 0
    };
  }

  const Calc = {
    num, nonNeg, round2, round1, round4, unitInfo, normalizedUnitPrice,
    convertQty, unitsCompatible, usageRatio, compareUnitInfo, unitLabels,
    ingredientCost, packagingCost, operationalPerBatch, compute,
    paymentFees, GROUP_LABEL,
    // دفتر V3: ملخص الشراء/الاستهلاك (انظر smart-units.js)
    purchaseBreakdown: (ing) => (S ? S.purchaseBreakdown(ing) : null),
    smartUnits: S
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = Calc;
  else global.Calc = Calc;
})(typeof window !== 'undefined' ? window : globalThis);
