/* =============================================================
   مِرْباح — بيانات شجرة القرار والتصنيفات والمنتجات وقوالبها
   ملف مستقل تمامًا عن منطق الواجهة (يمكن إضافة تصنيفات/منتجات
   جديدة هنا دون تغيير أي كود في الواجهة).
   ============================================================= */
(function (global) {
  'use strict';

  /* ---------------- وحدات القياس ---------------- */
  // وحدات قياس حقيقية — factor = معامل التحويل إلى الوحدة الأساسية للمجموعة
  // أي: 1 كجم = 1000 جرام، 1 لتر = 1000 مل، 1 سم = 0.01 متر
  const UNITS = [
    { id: 'g',    name: 'جرام',      short: 'جم',   group: 'mass',   factor: 1 },
    { id: 'kg',   name: 'كيلوجرام',  short: 'كجم',  group: 'mass',   factor: 1000 },
    { id: 'ml',   name: 'ملليلتر',   short: 'مل',   group: 'volume', factor: 1 },
    { id: 'l',    name: 'لتر',       short: 'لتر',  group: 'volume', factor: 1000 },
    { id: 'm',    name: 'متر',       short: 'متر',  group: 'length', factor: 1 },
    { id: 'cm',   name: 'سنتيمتر',   short: 'سم',   group: 'length', factor: 0.01 },
    { id: 'spool',name: 'بكرة',      short: 'بكرة', group: 'count',  factor: 1 },
    { id: 'bag',  name: 'كيس',       short: 'كيس',  group: 'count',  factor: 1 },
    { id: 'carton',name: 'كرتون',    short: 'كرتون',group: 'count',  factor: 1 },
    { id: 'pc',   name: 'حبة',       short: 'حبة',  group: 'count',  factor: 1 }
  ];

  const UNIT_GROUPS = {
    mass:   { base: 'g',  label: 'الوزن',  short: 'جرام' },
    volume: { base: 'ml', label: 'الحجم',  short: 'مل' },
    count:  { base: 'pc', label: 'العدد',  short: 'حبة' },
    length: { base: 'm',  label: 'الطول',  short: 'متر' }
  };

  const unitById = (id) => UNITS.find((u) => u.id === id) || null;

  // معامل التحويل بين وحدتين داخل نفس المجموعة — null إن كانتا غير متوافقتين
  function unitFactor(fromId, toId) {
    const a = unitById(fromId);
    const b = unitById(toId);
    if (!a || !b || a.group !== b.group) return null;
    return a.factor / b.factor;
  }

  // تسمية المخرجات: الحقل الجديد outputLabel على المنتج، وإلا تسمية المجال، وإلا "قطعة"
  const DOMAIN_LABELS = {
    saudi_food:        { one: 'علبة',    many: 'علب' },
    sweets:            { one: 'علبة',    many: 'علب' },
    bakery:            { one: 'قطعة',    many: 'قطع' },
    fast_food:         { one: 'وجبة',    many: 'وجبات' },
    home_cooking:      { one: 'وجبة',    many: 'وجبات' },
    frozen:            { one: 'كيس',     many: 'أكياس' },
    coffee_saudi:      { one: 'كوب',     many: 'أكواب' },
    specialty_coffee:  { one: 'كوب',     many: 'أكواب' },
    cold_drinks:       { one: 'كوب',     many: 'أكواب' },
    traditional_drinks:{ one: 'كوب',     many: 'أكواب' },
    juices:            { one: 'كوب',     many: 'أكواب' },
    fashion:           { one: 'قطعة',    many: 'قطع' },
    crochet:           { one: 'قطعة',    many: 'قطع' },
    accessories:       { one: 'قطعة',    many: 'قطع' },
    perfumes:          { one: 'زجاجة',   many: 'زجاجات' },
    incense:           { one: 'علبة',    many: 'علب' },
    printing:          { one: 'قطعة',    many: 'قطع' },
    digital:           { one: 'خدمة',    many: 'خدمات' },
    occasions:         { one: 'توزيعة',  many: 'توزيعات' }
  };
  const DEFAULT_LABEL = { one: 'قطعة', many: 'قطع' };

  function labelFor(domainId, product) {
    if (product && product.outputLabel) return product.outputLabel;
    return DOMAIN_LABELS[domainId] || DEFAULT_LABEL;
  }

  /* ---------------- أنواع المشاريع وفروعها ---------------- */
  // domains: ترتيب المجالات المتاحة لكل نوع مشروع (هنا يحدث التفرّع الحقيقي)
  const PROJECT_TYPES = [
    { id: 'family',  name: 'منتج منزلي (أسرة منتجة)', icon: '🏡',
      desc: 'إنتاج منزلي بمكونات محلية',
      domains: ['saudi_food','sweets','bakery','traditional_drinks','juices','coffee_saudi','perfumes','incense','crochet','accessories','occasions','frozen','home_cooking'] },
    { id: 'home_project', name: 'مشروع منزلي ناشئ', icon: '🍰',
      desc: 'حلويات ومأكولات ومشروبات منزلية',
      domains: ['sweets','bakery','home_cooking','traditional_drinks','juices','coffee_saudi','crochet','accessories','perfumes','printing','occasions'] },
    { id: 'sole',    name: 'مؤسسة فردية مرخّصة', icon: '🧾',
      desc: 'نشاط تجاري مرخّص',
      domains: ['saudi_food','fast_food','home_cooking','frozen','coffee_saudi','specialty_coffee','cold_drinks','printing','fashion','digital'] },
    { id: 'online',  name: 'متجر إلكتروني', icon: '🛍️',
      desc: 'بيع عبر الإنترنت والشحن',
      domains: ['fashion','accessories','perfumes','incense','printing','crochet','digital','occasions','sweets','frozen'] },
    { id: 'seasonal',name: 'مشروع موسمي', icon: '🌙',
      desc: 'رمضان والأعياد والمناسبات',
      domains: ['frozen','occasions','sweets','traditional_drinks','juices','printing','incense'] },
    { id: 'business',name: 'محل أو كشك أو عربة', icon: '🏪',
      desc: 'نشاط تجاري صغير',
      domains: ['saudi_food','fast_food','bakery','cold_drinks','specialty_coffee','fashion','printing','digital','occasions'] },
    { id: 'freelance',name: 'عمل حر (خدمات)', icon: '💻',
      desc: 'خدمات وتصميم ومنتجات رقمية',
      domains: ['digital','printing','fashion','crochet','accessories','sweets','coffee_saudi'] },
    { id: 'other',   name: 'فكرة منتج جديدة', icon: '✨',
      desc: 'أي فكرة منتج أخرى',
      domains: ['saudi_food','sweets','bakery','fast_food','home_cooking','frozen','coffee_saudi','specialty_coffee','cold_drinks','traditional_drinks','juices','fashion','crochet','accessories','perfumes','incense','printing','digital','occasions'] }
  ];

  /* ---------------- قوالب المنتجات ---------------- */
  // كل مكوّن: qty = الكمية المستخدمة، pack = حجم العبوة المشتراة (بنفس الوحدة)
  // price = سعر تقديري مبدئي (يعدّله التاجر). type: 'estimated' | 'actual'
  // كل مكوّن: qty + qtyUnit (كمية مستخدمة)، pack + packUnit (عبوة مشتراة) — الوحدتان مستقلتان
  const I = (name, qty, unit, pack, price, type, qtyUnit, packUnit) => ({
    name, qty, qtyUnit: qtyUnit || unit, pack, packUnit: packUnit || unit, price, type: type || 'estimated'
  });
  const PK = (name, piecesPerPack, packPrice, piecesUsed) => ({ name, piecesPerPack, packPrice, piecesUsed });
  const OP = (name, amount, period) => ({ name, amount, period: period || 'perBatch' });

  const TEMPLATES = {
    /* ===== العريكة الجنوبية ===== */
    tpl_okraika: {
      units: 15, timeMinutes: 180, hourlyRate: 20, sellPrice: 21,
      ingredients: [
        I('دقيق', 500, 'g', 1000, 6),
        I('تمر', 250, 'g', 1000, 18),
        I('سمن', 100, 'g', 500, 22),
        I('عسل', 50, 'g', 500, 45),
        I('قشطة', 200, 'g', 500, 15),
        I('ماء', 300, 'ml', 1500, 2)
      ],
      packaging: [
        PK('علب تغليف', 20, 25, 15),
        PK('ملاعق', 50, 8, 30),
        PK('أغطية', 20, 12, 15),
        PK('أكياس', 100, 15, 15),
        PK('ملصقات', 50, 10, 15)
      ],
      operational: [ OP('كهرباء', 3), OP('غاز', 4), OP('مياه', 1), OP('هدر وتالف', 2) ]
    },

    /* ===== السوبيا ===== */
    tpl_sobia: {
      units: 10, timeMinutes: 60, hourlyRate: 10, sellPrice: 5,
      ingredients: [
        I('ماء', 2000, 'ml', 6000, 6),
        I('سكر', 300, 'g', 2000, 12),
        I('حليب بودرة', 100, 'g', 400, 18),
        I('جوز هند', 50, 'g', 200, 8),
        I('قشطة', 100, 'g', 170, 7),
        I('هيل', 10, 'g', 100, 20),
        I('زعفران', 1, 'g', 5, 25)
      ],
      packaging: [
        PK('أكواب بلاستيك', 50, 15, 10),
        PK('أغطية أكواب', 50, 8, 10),
        PK('شفاطات', 100, 5, 10),
        PK('أكياس', 100, 10, 10),
        PK('ملصقات', 50, 10, 10),
        PK('مناديل', 100, 6, 10)
      ],
      operational: [ OP('كهرباء', 1.5), OP('مياه', 0.5), OP('هدر وتالف', 1) ]
    },

    /* ===== القهوة العربية ===== */
    tpl_coffee: {
      units: 20, timeMinutes: 45, hourlyRate: 15, sellPrice: 12,
      ingredients: [
        I('بن أخضر محمص', 250, 'g', 1000, 60),
        I('هيل', 30, 'g', 100, 20),
        I('زعفران', 2, 'g', 5, 25),
        I('قرنفل', 5, 'g', 100, 8),
        I('ماء', 4000, 'ml', 6000, 6)
      ],
      packaging: [ PK('أكواب ورقية', 50, 12, 20), PK('أغطية', 50, 6, 20), PK('ملصقات', 50, 10, 20) ],
      operational: [ OP('كهرباء', 3), OP('غاز', 3), OP('مياه', 1) ]
    },

    /* ===== عصير البرتقال ===== */
    tpl_orange: {
      units: 10, timeMinutes: 30, hourlyRate: 15, sellPrice: 7,
      ingredients: [
        I('برتقال طازج', 3000, 'g', 5000, 20),
        I('سكر', 100, 'g', 2000, 12),
        I('ماء', 1000, 'ml', 6000, 6)
      ],
      packaging: [ PK('أكواب', 50, 15, 10), PK('أغطية', 50, 8, 10), PK('شفاطات', 100, 5, 10), PK('ملصقات', 50, 10, 10) ],
      operational: [ OP('كهرباء', 2), OP('مياه', 1), OP('هدر وتالف', 1) ]
    },

    /* ===== الليمون بالنعناع ===== */
    tpl_lemon: {
      units: 10, timeMinutes: 25, hourlyRate: 15, sellPrice: 7,
      ingredients: [
        I('ليمون', 1500, 'g', 3000, 15),
        I('نعناع', 100, 'g', 300, 5),
        I('سكر', 150, 'g', 2000, 12),
        I('ماء', 1500, 'ml', 6000, 6)
      ],
      packaging: [ PK('أكواب', 50, 15, 10), PK('أغطية', 50, 8, 10), PK('شفاطات', 100, 5, 10) ],
      operational: [ OP('كهرباء', 2), OP('مياه', 1), OP('هدر وتالف', 1) ]
    },

    /* ===== الكوكيز ===== */
    tpl_cookies: {
      units: 24, timeMinutes: 60, hourlyRate: 18, sellPrice: 4,
      ingredients: [
        I('دقيق', 500, 'g', 1000, 6),
        I('زبدة', 250, 'g', 500, 25),
        I('سكر', 200, 'g', 2000, 12),
        I('شوكولاتة', 150, 'g', 300, 18),
        I('بيض', 2, 'pc', 30, 15)
      ],
      packaging: [ PK('أكياس شفافة', 100, 15, 24), PK('ملصقات', 50, 10, 24) ],
      operational: [ OP('كهرباء', 4), OP('غاز', 3), OP('هدر وتالف', 2) ]
    },

    /* ===== العباية ===== */
    tpl_abaya: {
      units: 1, timeMinutes: 240, hourlyRate: 30, sellPrice: 320,
      ingredients: [
        I('قماش عباية', 3, 'm', 3, 120),
        I('خيط', 1, 'pc', 10, 15),
        I('أزرار/إكسسوار', 1, 'pc', 20, 10)
      ],
      packaging: [ PK('كيس تغليف', 10, 20, 1), PK('علاقة', 20, 15, 1), PK('ملصق', 50, 10, 1) ],
      operational: [ OP('كهرباء', 3), OP('إهلاك ماكينة', 4) ]
    },

    /* ===== عطر مركّب ===== */
    tpl_perfume: {
      units: 10, timeMinutes: 60, hourlyRate: 20, sellPrice: 45,
      ingredients: [
        I('زيت عطري مركّز', 50, 'ml', 100, 150),
        I('كحول عطري', 450, 'ml', 1000, 40),
        I('مثبت عطر', 20, 'ml', 100, 25)
      ],
      packaging: [ PK('زجاجات عطر', 50, 75, 10), PK('بخاخات', 50, 25, 10), PK('علب كرتون', 50, 20, 10) ],
      operational: [ OP('كهرباء', 1), OP('هدر وتالف', 3) ]
    },

    /* ===== بخور معطّر ===== */
    tpl_incense: {
      units: 12, timeMinutes: 40, hourlyRate: 18, sellPrice: 30,
      ingredients: [
        I('رقائق عود', 60, 'g', 250, 90),
        I('عطر بخور', 30, 'ml', 100, 60),
        I('مسك', 20, 'g', 100, 30)
      ],
      packaging: [ PK('علب بخور', 24, 40, 12), PK('أكياس', 100, 15, 12) ],
      operational: [ OP('كهرباء', 1), OP('هدر وتالف', 2) ]
    },

    /* ===== كوب مطبوع ===== */
    tpl_mug: {
      units: 10, timeMinutes: 90, hourlyRate: 20, sellPrice: 35,
      ingredients: [
        I('أكواب سيراميك', 10, 'pc', 12, 60),
        I('ورق حراري', 10, 'sheet', 100, 35),
        I('حبر طباعة', 1, 'pc', 10, 40)
      ],
      packaging: [ PK('علب كرتون', 25, 30, 10), PK('فلين حماية', 50, 20, 10) ],
      operational: [ OP('كهرباء', 2), OP('إهلاك ماكينة', 3) ]
    },

    /* ===== تصميم شعار ===== */
    tpl_logo: {
      units: 1, timeMinutes: 180, hourlyRate: 60, sellPrice: 250,
      ingredients: [],
      packaging: [],
      operational: [ OP('اشتراك برامج تصميم', 15, 'perBatch'), OP('إنترنت', 3, 'perBatch') ]
    },

    /* ===== توزيعات مناسبات ===== */
    tpl_favor: {
      units: 20, timeMinutes: 120, hourlyRate: 18, sellPrice: 12,
      ingredients: [
        I('علب توزيعات', 20, 'pc', 50, 40),
        I('حلوى صغيرة', 100, 'g', 500, 25),
        I('شرائط واكسسوار', 20, 'pc', 100, 15)
      ],
      packaging: [ PK('أكياس توزيعات', 50, 15, 20), PK('ملصقات أسماء', 50, 10, 20) ],
      operational: [ OP('كهرباء', 2), OP('هدر وتالف', 2) ]
    }
  };

  /* ---------------- قوالب احتياطية حسب المجال ---------------- */
  // تضمن أن لكل منتج (حتى غير المفصّل) قالبًا افتراضيًا قابلًا للتعديل
  const CATEGORY_TEMPLATES = {
    saudi_food:        { units: 10, timeMinutes: 120, hourlyRate: 20, sellPrice: 25,
      ingredients: [ I('مكوّن أساسي', 500, 'g', 1000, 15), I('بهارات', 20, 'g', 100, 8), I('زيت', 100, 'ml', 1000, 12) ],
      packaging: [ PK('علب تغليف', 20, 25, 10), PK('ملصقات', 50, 10, 10) ],
      operational: [ OP('كهرباء', 3), OP('غاز', 4), OP('هدر وتالف', 2) ] },
    sweets:            { units: 20, timeMinutes: 60, hourlyRate: 18, sellPrice: 6,
      ingredients: [ I('دقيق', 500, 'g', 1000, 6), I('سكر', 200, 'g', 2000, 12), I('زبدة', 150, 'g', 500, 25) ],
      packaging: [ PK('أكياس', 100, 15, 20), PK('ملصقات', 50, 10, 20) ],
      operational: [ OP('كهرباء', 3), OP('غاز', 3), OP('هدر وتالف', 2) ] },
    bakery:            { units: 15, timeMinutes: 90, hourlyRate: 18, sellPrice: 8,
      ingredients: [ I('دقيق', 1000, 'g', 1000, 6), I('خميرة', 10, 'g', 100, 3), I('زيت', 100, 'ml', 1000, 12) ],
      packaging: [ PK('أكياس', 100, 15, 15), PK('ملصقات', 50, 10, 15) ],
      operational: [ OP('كهرباء', 3), OP('غاز', 4) ] },
    fast_food:         { units: 10, timeMinutes: 45, hourlyRate: 18, sellPrice: 15,
      ingredients: [ I('خبز برجر', 10, 'pc', 12, 15), I('لحم/دجاج', 1000, 'g', 1000, 35), I('صوصات', 200, 'ml', 500, 10) ],
      packaging: [ PK('علب برجر', 50, 40, 10), PK('أكياس', 100, 15, 10) ],
      operational: [ OP('كهرباء', 2), OP('غاز', 3), OP('عمولة دفع إلكتروني', 3) ] },
    home_cooking:      { units: 10, timeMinutes: 120, hourlyRate: 20, sellPrice: 20,
      ingredients: [ I('أرز', 1500, 'g', 5000, 30), I('لحم/دجاج', 1500, 'g', 1500, 30), I('بهارات', 30, 'g', 100, 10) ],
      packaging: [ PK('علب وجبات', 50, 45, 10), PK('أكياس', 100, 15, 10) ],
      operational: [ OP('كهرباء', 3), OP('غاز', 4), OP('عمولة توصيل', 5) ] },
    frozen:            { units: 20, timeMinutes: 120, hourlyRate: 18, sellPrice: 15,
      ingredients: [ I('دقيق', 1000, 'g', 1000, 6), I('حشوة', 800, 'g', 1000, 25) ],
      packaging: [ PK('أكياس تفريز', 100, 20, 20), PK('ملصقات', 50, 10, 20) ],
      operational: [ OP('كهرباء', 5), OP('غاز', 3), OP('هدر وتالف', 2) ] },
    coffee_saudi:      { units: 20, timeMinutes: 45, hourlyRate: 15, sellPrice: 12,
      ingredients: [ I('بن', 250, 'g', 1000, 60), I('هيل', 30, 'g', 100, 20) ],
      packaging: [ PK('أكواب', 50, 12, 20), PK('أغطية', 50, 6, 20) ],
      operational: [ OP('كهرباء', 3), OP('غاز', 3) ] },
    specialty_coffee:  { units: 1, timeMinutes: 8, hourlyRate: 20, sellPrice: 16,
      ingredients: [ I('حبوب قهوة', 18, 'g', 1000, 90), I('حليب', 200, 'ml', 1000, 7) ],
      packaging: [ PK('أكواب', 50, 15, 1), PK('أغطية', 50, 8, 1) ],
      operational: [ OP('كهرباء', 1), OP('هدر وتالف', 1) ] },
    cold_drinks:       { units: 10, timeMinutes: 20, hourlyRate: 15, sellPrice: 8,
      ingredients: [ I('شراب أساسي', 300, 'ml', 1000, 15), I('ماء غازي', 1000, 'ml', 1500, 5), I('ثلج', 500, 'g', 2000, 3) ],
      packaging: [ PK('أكواب', 50, 15, 10), PK('أغطية', 50, 8, 10) ],
      operational: [ OP('كهرباء', 2), OP('هدر وتالف', 1) ] },
    traditional_drinks:{ units: 10, timeMinutes: 60, hourlyRate: 15, sellPrice: 6,
      ingredients: [ I('مكوّن أساسي', 500, 'g', 1000, 15), I('سكر', 200, 'g', 2000, 12), I('ماء', 2000, 'ml', 6000, 6) ],
      packaging: [ PK('أكواب', 50, 15, 10), PK('أغطية', 50, 8, 10), PK('شفاطات', 100, 5, 10) ],
      operational: [ OP('كهرباء', 2), OP('مياه', 1), OP('هدر وتالف', 2) ] },
    juices:            { units: 10, timeMinutes: 25, hourlyRate: 15, sellPrice: 7,
      ingredients: [ I('فاكهة طازجة', 2000, 'g', 3000, 18), I('سكر', 100, 'g', 2000, 12) ],
      packaging: [ PK('أكواب', 50, 15, 10), PK('أغطية', 50, 8, 10) ],
      operational: [ OP('كهرباء', 2), OP('مياه', 1), OP('هدر وتالف', 1) ] },
    fashion:           { units: 1, timeMinutes: 180, hourlyRate: 30, sellPrice: 260,
      ingredients: [ I('قماش', 3, 'm', 3, 100), I('خيط', 1, 'pc', 10, 15) ],
      packaging: [ PK('كيس تغليف', 10, 20, 1) ],
      operational: [ OP('كهرباء', 3), OP('إهلاك ماكينة', 4) ] },
    crochet:           { units: 1, timeMinutes: 240, hourlyRate: 20, sellPrice: 90,
      ingredients: [ I('خيوط', 3, 'pc', 10, 30), I('إبرة/أدوات', 1, 'pc', 5, 10) ],
      packaging: [ PK('أكياس', 50, 15, 1) ],
      operational: [ OP('كهرباء', 1) ] },
    accessories:       { units: 5, timeMinutes: 90, hourlyRate: 20, sellPrice: 25,
      ingredients: [ I('خرز', 100, 'pc', 500, 20), I('خيط/سلك', 50, 'pc', 200, 10) ],
      packaging: [ PK('علب صغيرة', 50, 30, 5) ],
      operational: [ OP('كهرباء', 1) ] },
    perfumes:          { units: 10, timeMinutes: 60, hourlyRate: 20, sellPrice: 45,
      ingredients: [ I('زيت عطري', 50, 'ml', 100, 150), I('كحول', 450, 'ml', 1000, 40) ],
      packaging: [ PK('زجاجات', 50, 75, 10) ],
      operational: [ OP('هدر وتالف', 3) ] },
    incense:           { units: 12, timeMinutes: 40, hourlyRate: 18, sellPrice: 30,
      ingredients: [ I('رقائق عود', 60, 'g', 250, 90), I('عطر بخور', 30, 'ml', 100, 60) ],
      packaging: [ PK('علب بخور', 24, 40, 12) ],
      operational: [ OP('هدر وتالف', 2) ] },
    printing:          { units: 10, timeMinutes: 90, hourlyRate: 20, sellPrice: 35,
      ingredients: [ I('منتج خام', 10, 'pc', 12, 60), I('ورق حراري', 10, 'sheet', 100, 35) ],
      packaging: [ PK('علب كرتون', 25, 30, 10) ],
      operational: [ OP('كهرباء', 2), OP('إهلاك ماكينة', 3) ] },
    digital:           { units: 1, timeMinutes: 180, hourlyRate: 60, sellPrice: 250,
      ingredients: [], packaging: [],
      operational: [ OP('اشتراك برامج', 15), OP('إنترنت', 3) ] },
    occasions:         { units: 20, timeMinutes: 120, hourlyRate: 18, sellPrice: 12,
      ingredients: [ I('علب توزيعات', 20, 'pc', 50, 40), I('حلوى', 100, 'g', 500, 25) ],
      packaging: [ PK('أكياس توزيعات', 50, 15, 20) ],
      operational: [ OP('كهرباء', 2), OP('هدر وتالف', 2) ] }
  };

  /* ---------------- المجالات والتصنيفات والمنتجات ---------------- */
  // P(id, name, tpl?) — tpl اختياري؛ إن غاب يُستخدم قالب المجال
  // P(id, name, tpl?, outputLabel?, quickAdd?)
  // outputLabel: { one, many } — تسمية المخرجات («علبة/علب»، «كوب/أكواب»)
  // quickAdd: اقتراحات المكونات السريعة الخاصة بهذا المنتج
  const P = (id, name, tpl, outputLabel, quickAdd) => {
    const p = { id, name };
    if (tpl) p.tpl = tpl;
    if (outputLabel) p.outputLabel = outputLabel;
    if (quickAdd) p.quickAdd = quickAdd;
    p.ingKey = id;
    return p;
  };

  const DOMAINS = [
    { id: 'saudi_food', name: 'المأكولات الشعبية السعودية', icon: '🍛', subcategories: [
      { id: 'southern', name: 'الأكلات الجنوبية', products: [
        P('okraika', 'العريكة الجنوبية', 'tpl_okraika', { one: 'علبة', many: 'علب' }, ['دقيق بر', 'سمن بلدي', 'تمر خلاص', 'مياه']), P('maasoub', 'المعصوب', null, { one: 'علبة', many: 'علب' }, ['دقيق بر', 'تمر خلاص', 'سمن بلدي', 'مياه']),
        P('qursan', 'القرصان'), P('marqooq', 'المرقوق') ] },
      { id: 'central', name: 'الأكلات الوسطى', products: [
        P('jareesh', 'الجريش'), P('kabsa', 'الكبسة') ] },
      { id: 'western', name: 'الأكلات الغربية', products: [
        P('mandi', 'المندي'), P('haneeth', 'الحنيذ') ] }
    ]},
    { id: 'sweets', name: 'الحلويات', icon: '🍪', subcategories: [
      { id: 'cookies', name: 'الكوكيز', products: [
        P('choco_cookies', 'كوكيز شوكولاتة', 'tpl_cookies'), P('plain_cookies', 'كوكيز سادة'), P('salted_cookies', 'كوكيز مالح') ] },
      { id: 'brownies', name: 'البراونيز', products: [ P('brownie', 'براوني كلاسيك'), P('nutella_brownie', 'براوني نوتيلا') ] },
      { id: 'cakes', name: 'الكيك', products: [ P('choco_cake', 'كيك شوكولاتة'), P('vanilla_cake', 'كيك فانيلا'), P('honey_cake', 'كيك عسل') ] },
      { id: 'cheesecake', name: 'التشيز كيك', products: [ P('lotus_cheesecake', 'تشيز كيك لوتس'), P('strawberry_cheesecake', 'تشيز كيك فراولة') ] },
      { id: 'maamoul', name: 'المعمول', products: [ P('date_maamoul', 'معمول تمر'), P('walnut_maamoul', 'معمول جوز') ] },
      { id: 'luqaimat', name: 'اللقيمات', products: [ P('luqaimat', 'لقيمات كلاسيك') ] }
    ]},
    { id: 'bakery', name: 'المعجنات والمخبوزات', icon: '🥐', subcategories: [
      { id: 'pies', name: 'الفطائر', products: [ P('cheese_pie', 'فطيرة جبن'), P('zaatar_pie', 'فطيرة زعتر'), P('meat_pie', 'فطيرة لحم') ] },
      { id: 'croissant', name: 'الكرواسون', products: [ P('plain_croissant', 'كرواسون سادة'), P('choco_croissant', 'كرواسون شوكولاتة') ] },
      { id: 'sambosa', name: 'السمبوسة', products: [ P('chicken_sambosa', 'سمبوسة دجاج'), P('cheese_sambosa', 'سمبوسة جبن') ] },
      { id: 'pizza', name: 'البيتزا', products: [ P('margherita', 'بيتزا مارغريتا'), P('chicken_pizza', 'بيتزا دجاج') ] },
      { id: 'bread', name: 'الخبز', products: [ P('samoli', 'خبز صامولي'), P('brown_bread', 'خبز أسمر') ] }
    ]},
    { id: 'fast_food', name: 'الوجبات السريعة', icon: '🍔', subcategories: [
      { id: 'burger', name: 'البرجر', products: [ P('beef_burger', 'برجر لحم'), P('chicken_burger', 'برجر دجاج') ] },
      { id: 'sandwich', name: 'الساندويتشات', products: [ P('shawarma', 'ساندويتش شاورما'), P('falafel', 'ساندويتش فلافل') ] },
      { id: 'fries', name: 'البطاطس', products: [ P('fries', 'بطاطس مقلية'), P('cheese_fries', 'بطاطس بالجبن') ] }
    ]},
    { id: 'home_cooking', name: 'الوجبات المنزلية', icon: '🍲', subcategories: [
      { id: 'daily', name: 'الوجبات اليومية', products: [ P('kabsa_meal', 'وجبة كبسة'), P('maqluba_meal', 'وجبة مقلوبة'), P('mandi_meal', 'وجبة مندي') ] },
      { id: 'healthy', name: 'الوجبات الصحية', products: [ P('diet_meal', 'وجبة دايت'), P('protein_salad', 'سلطة بروتين') ] }
    ]},
    { id: 'frozen', name: 'التفريزات والمنتجات الموسمية', icon: '🧊', subcategories: [
      { id: 'frozen_sambosa', name: 'السمبوسة المجمدة', products: [ P('frozen_sambosa', 'سمبوسة مجمدة') ] },
      { id: 'frozen_pastry', name: 'المعجنات المجمدة', products: [ P('frozen_pastry', 'معجنات مجمدة') ] },
      { id: 'ramadan', name: 'تجهيزات رمضان', products: [ P('ramadan_sambosa', 'سمبوسة رمضان'), P('ramadan_luqaimat', 'لقيمات رمضان') ] },
      { id: 'occasions_products', name: 'منتجات المناسبات', products: [ P('eid_maamoul', 'معمول العيد'), P('kahk', 'كحك') ] }
    ]},
    { id: 'coffee_saudi', name: 'القهوة السعودية', icon: '☕', subcategories: [
      { id: 'arabic', name: 'القهوة العربية', products: [ P('arabic_coffee', 'قهوة عربية', 'tpl_coffee'), P('cardamom_coffee', 'قهوة بالهيل') ] },
      { id: 'blends', name: 'خلطات القهوة', products: [ P('saffron_blend', 'خلطة قهوة بالزعفران'), P('cardamom_blend', 'خلطة قهوة بالهيل') ] }
    ]},
    { id: 'specialty_coffee', name: 'القهوة المختصة', icon: '🫖', subcategories: [
      { id: 'v60', name: 'V60', products: [ P('v60', 'V60 مختص', null, { one: 'كوب', many: 'أكواب' }, ['بن إسبريسو', 'حليب طازج', 'سيروب', 'ثلج']) ] },
      { id: 'espresso', name: 'الإسبريسو', products: [ P('espresso', 'إسبريسو', null, { one: 'كوب', many: 'أكواب' }, ['بن إسبريسو', 'حليب طازج', 'سيروب', 'ثلج']) ] },
      { id: 'latte', name: 'الآيس لاتيه', products: [ P('iced_latte', 'آيس لاتيه', null, { one: 'كوب', many: 'أكواب' }, ['بن إسبريسو', 'حليب طازج', 'سيروب', 'ثلج']) ] }
    ]},
    { id: 'cold_drinks', name: 'المشروبات الباردة', icon: '🥤', subcategories: [
      { id: 'mojito', name: 'الموهيتو', products: [ P('classic_mojito', 'موهيتو كلاسيك'), P('strawberry_mojito', 'موهيتو فراولة') ] },
      { id: 'iced_tea', name: 'الآيس تي', products: [ P('peach_tea', 'آيس تي خوخ'), P('lemon_tea', 'آيس تي ليمون') ] },
      { id: 'flavored', name: 'المشروبات المنكهة', products: [ P('flavored_drink', 'مشروب منكه') ] }
    ]},
    { id: 'traditional_drinks', name: 'المشروبات الشعبية', icon: '🌴', subcategories: [
      { id: 'sobia', name: 'السوبيا', products: [ P('sobia', 'سوبيا', 'tpl_sobia') ] },
      { id: 'tamarind', name: 'التمر الهندي', products: [ P('tamarind', 'تمر هندي') ] },
      { id: 'karkade', name: 'الكركديه', products: [ P('karkade', 'كركديه') ] },
      { id: 'qamar', name: 'قمر الدين', products: [ P('qamar_el_deen', 'قمر الدين') ] }
    ]},
    { id: 'juices', name: 'العصائر الطازجة', icon: '🍊', subcategories: [
      { id: 'orange', name: 'عصير البرتقال', products: [ P('orange_juice', 'عصير برتقال', 'tpl_orange') ] },
      { id: 'mango', name: 'المانجو', products: [ P('mango_juice', 'عصير مانجو') ] },
      { id: 'strawberry', name: 'الفراولة', products: [ P('strawberry_juice', 'عصير فراولة') ] },
      { id: 'lemon', name: 'الليمون بالنعناع', products: [ P('lemon_mint', 'ليمون بالنعناع', 'tpl_lemon') ] }
    ]},
    { id: 'fashion', name: 'الخياطة والأزياء', icon: '🧵', subcategories: [
      { id: 'abaya', name: 'العبايات', products: [ P('plain_abaya', 'عباية سادة', 'tpl_abaya', { one: 'قطعة', many: 'قطع' }, ['قماش عباية', 'خيط خياطة', 'بطانة', 'أزرار خفية']), P('embroidered_abaya', 'عباية مطرزة', null, { one: 'قطعة', many: 'قطع' }, ['قماش عباية', 'خيط تطريز', 'بطانة', 'خرز']) ] },
      { id: 'clothes', name: 'الملابس', products: [ P('dress', 'فستان', null, { one: 'قطعة', many: 'قطع' }, ['قماش', 'خيط خياطة', 'سحاب', 'بطانة']), P('thobe', 'ثوب', null, { one: 'قطعة', many: 'قطع' }, ['قماش ثوب', 'خيط خياطة', 'أزرار'])] },
      { id: 'alterations', name: 'التعديلات والخياطة', products: [ P('alteration', 'تعديل خياطة', null, { one: 'قطعة', many: 'قطع' }, ['خيط خياطة', 'أزرار', 'سحاب']) ] }
    ]},
    { id: 'crochet', name: 'الكروشيه والأعمال اليدوية', icon: '🧶', subcategories: [
      { id: 'bags', name: 'الحقائب', products: [ P('crochet_bag', 'حقيبة كروشيه', null, { one: 'قطعة', many: 'قطع' }, ['خيوط قطن', 'إبر كروشيه', 'بطانة قماش', 'سحاب']) ] },
      { id: 'dolls', name: 'الدمى', products: [ P('crochet_doll', 'دمية كروشيه', null, { one: 'قطعة', many: 'قطع' }, ['خيوط قطن', 'إبر كروشيه', 'حشوة قطنية', 'خرز للعينين']) ] },
      { id: 'covers', name: 'المفارش', products: [ P('crochet_cover', 'مفرش كروشيه', null, { one: 'قطعة', many: 'قطع' }, ['خيوط قطن', 'إبر كروشيه', 'نشا']) ] },
      { id: 'laces', name: 'أربطة الأحذية', products: [
        P('shoe_laces', 'أربطة أحذية كروشيه', null, { one: 'طقم', many: 'أطقم' }, ['خيوط قطن', 'إبر كروشيه', 'أطراف معدنية']),
        P('baby_shoe_laces', 'أربطة أحذية أطفال', null, { one: 'طقم', many: 'أطقم' }, ['خيوط قطن', 'إبر كروشيه', 'أطراف معدنية']),
        P('lace_hair_ties', 'أربطة شعر كروشيه', null, { one: 'حبة', many: 'حبات' }, ['خيوط قطن', 'إبر كروشيه', 'مطاط شعر'])
      ] }
    ]},
    { id: 'accessories', name: 'الإكسسوارات', icon: '📿', subcategories: [
      { id: 'bracelets', name: 'الأساور', products: [ P('bead_bracelet', 'أساور خرز') ] },
      { id: 'necklaces', name: 'القلائد', products: [ P('handmade_necklace', 'قلادة يدوية') ] },
      { id: 'handmade_acc', name: 'الإكسسوارات اليدوية', products: [ P('accessory_set', 'طقم إكسسوار') ] }
    ]},
    { id: 'perfumes', name: 'العطور', icon: '🌸', subcategories: [
      { id: 'compound', name: 'العطور المركبة', products: [ P('custom_perfume', 'عطر مركب', 'tpl_perfume') ] },
      { id: 'hair', name: 'عطور الشعر', products: [ P('hair_perfume', 'عطر شعر') ] },
      { id: 'perfume_blends', name: 'خلطات العطور', products: [ P('perfume_blend', 'خلطة عطر') ] }
    ]},
    { id: 'incense', name: 'البخور', icon: '🪵', subcategories: [
      { id: 'scented', name: 'البخور المعطر', products: [ P('scented_incense', 'بخور معطر', 'tpl_incense') ] },
      { id: 'oud', name: 'خلطات العود', products: [ P('oud_blend', 'خلطة عود') ] }
    ]},
    { id: 'printing', name: 'الطباعة الحرارية', icon: '🖨️', subcategories: [
      { id: 'mugs', name: 'الأكواب', products: [ P('printed_mug', 'كوب مطبوع', 'tpl_mug') ] },
      { id: 'printed_clothes', name: 'الملابس', products: [ P('printed_tshirt', 'تيشيرت مطبوع') ] },
      { id: 'stickers', name: 'الملصقات', products: [ P('stickers', 'ملصقات') ] },
      { id: 'gifts', name: 'الهدايا المطبوعة', products: [ P('printed_gift', 'هدية مطبوعة') ] }
    ]},
    { id: 'digital', name: 'التصميم والخدمات الرقمية', icon: '🎨', subcategories: [
      { id: 'logos', name: 'تصميم الشعارات', products: [ P('logo_design', 'تصميم شعار', 'tpl_logo') ] },
      { id: 'ads', name: 'التصاميم الإعلانية', products: [ P('ad_design', 'تصميم إعلاني') ] },
      { id: 'cards', name: 'بطاقات المناسبات', products: [ P('occasion_card', 'بطاقة مناسبة') ] }
    ]},
    { id: 'occasions', name: 'توزيعات المناسبات والهدايا', icon: '🎁', subcategories: [
      { id: 'weddings', name: 'توزيعات الأعراس', products: [ P('wedding_favor', 'توزيع عرس', 'tpl_favor') ] },
      { id: 'newborns', name: 'توزيعات المواليد', products: [ P('newborn_favor', 'توزيع مولود') ] },
      { id: 'gifts', name: 'هدايا المناسبات', products: [ P('occasion_gift', 'هدية مناسبة') ] }
    ]}
  ];

  /* ---------------- المصاريف التشغيلية المقترحة ---------------- */
  const OPERATIONAL_PRESETS = [
    { name: 'الكهرباء',        icon: '💡' },
    { name: 'الغاز',           icon: '🔥' },
    { name: 'المياه',          icon: '💧' },
    { name: 'البنزين',         icon: '⛽' },
    { name: 'التوصيل',         icon: '🛵' },
    { name: 'عمولة تطبيق توصيل', icon: '📱' },
    { name: 'عمولة دفع إلكتروني', icon: '💳' },
    { name: 'الإيجار',         icon: '🏠' },
    { name: 'الهدر والتالف',   icon: '🗑️' },
    { name: 'مصاريف أخرى',     icon: '➕' }
  ];

  /* ---------------- تصنيفات المكونات والتغليف (مقترحات قابلة للنقر) ---------------- */
  const INGREDIENT_PRESETS = {
    'خيوط وأقمشة': ['خيط كروشيه', 'خيط قطن', 'خيط صوف', 'قماش', 'بطانة', 'تطريز'],
    'دقيق وحبوب': ['دقيق', 'سكر', 'أرز', 'شوفان', 'سميد', 'نشا', 'خميرة'],
    'منتجات ألبان وبيض': ['حليب', 'لبن', 'قشطة', 'كريمة', 'زبد', 'جبن', 'بيض'],
    'زيوت وسمن': ['زيت', 'سمن', 'زيت زيتون', 'سمن نباتي'],
    'بهارات وتوابل': ['هيل', 'زعفران', 'قرنفل', 'قرفة', 'بهارات', 'ملح', 'فلفل'],
    'شوكولاتة وحلويات': ['شوكولاتة', 'كاكاو', 'نوتيلا', 'عسل', 'نستله', 'كراميل'],
    'فواكه ومكسرات': ['تمر', 'لوز', 'جوز', 'فستق', 'مانجو', 'فراولة', 'ليمون'],
    'مشروبات': ['قهوة', 'شاي', 'ماء ورد', 'ماء زهر', 'عصير'],
    'مكونات أخرى': ['ماء', 'مواد حافظة', 'ملونات', 'مواد عطرية']
  };

  const PACKAGING_PRESETS = {
    'علب وأكواب': ['علب تغليف', 'علب كرتون', 'أكواب بلاستيك', 'أكواب ورقية', 'أطباق', 'أكياس ورقية'],
    'أغطية وإغلاق': ['أغطية', 'أغطية أكواب', 'ملصقات', 'شرائط لاصقة', 'استيكرات'],
    'حماية وتعليق': ['أكياس', 'أكياس شفافة', 'قصدير', 'بلاستيك تغليف', 'بطاقات تعليق', 'شرائط'],
    'أدوات مائدة': ['ملاعق', 'شوك', 'مناديل', 'شفاطات', 'أعواد'],
    'هدايا ومناسبات': ['شرائط هدايا', 'علب هدايا', 'أوراق تغليف', 'كرت إهداء', 'سيلوفان']
  };

  /* ---------------- الاقتراحات السريعة لكل مجال (احتياط عند غياب quickAdd للمنتج) ---------------- */
  const DOMAIN_QUICK_ADD = {
    saudi_food:         ['دقيق بر', 'سمن بلدي', 'تمر خلاص', 'مياه'],
    sweets:             ['دقيق', 'سكر', 'شوكولاتة', 'زبد', 'بيض'],
    bakery:             ['دقيق', 'خميرة', 'زبد', 'حليب', 'سكر'],
    fast_food:          ['لحم', 'خبز برجر', 'جبن شيدر', 'صوص', 'بطاطس'],
    home_cooking:       ['أرز', 'لحم', 'دجاج', 'بهارات', 'زيت'],
    frozen:             ['دقيق', 'حشوة', 'بهارات', 'أكياس تفريز'],
    coffee_saudi:       ['بن أخضر محمص', 'هيل', 'زعفران', 'قرنفل', 'مياه'],
    specialty_coffee:   ['بن إسبريسو', 'حليب طازج', 'سيروب', 'ثلج'],
    cold_drinks:        ['شراب أساسي', 'مياه غازية', 'ثلج', 'ليمون'],
    traditional_drinks: ['تمر هندي', 'سكر', 'مياه', 'هيل'],
    juices:             ['برتقال طازج', 'مانجو', 'فراولة', 'سكر'],
    fashion:            ['قماش', 'خيط خياطة', 'أزرار', 'بطانة', 'سحاب'],
    crochet:            ['خيوط قطن', 'خيط كروشيه', 'إبر كروشيه', 'حشوة قطنية'],
    accessories:        ['خرز', 'خيط/سلك', 'مشابك', 'أحجار'],
    perfumes:           ['زيت عطري', 'كحول عطري', 'مثبت', 'زجاجات'],
    incense:            ['رقائق عود', 'عطر بخور', 'فحم', 'مسك'],
    printing:           ['منتج خام', 'ورق حراري', 'حبر', 'فيلم حرارة'],
    digital:            ['اشتراك برامج', 'خطوط', 'صور مرخّصة'],
    occasions:          ['علب توزيعات', 'حلوى', 'شرائط', 'كرت إهداء']
  };

  // يرجّع قائمة الاقتراحات السريعة للمنتج النشط — لا تخلط بين المجالات أبدًا
  /* مزامنة الكتالوج من الخادم (SQLite): نفس شكل DOMAINS المحلي */
  let LIVE_DOMAINS = null;
  function setLiveCatalog(activities) {
    if (!Array.isArray(activities) || !activities.length) return;
    LIVE_DOMAINS = activities.map((a) => ({
      id: a.id, name: a.name, icon: a.icon,
      subcategories: (a.subcategories || []).map((s) => ({
        id: s.id, name: s.name,
        products: (s.products || []).map((p) => ({ id: p.id, name: p.name, ingKey: p.ingKey }))
      }))
    }));
  }
  function getDomain(id) { return (LIVE_DOMAINS || DOMAINS).find((x) => x.id === id) || null; }
  function quickAddFor(domainId, product) {
    if (product && Array.isArray(product.quickAdd) && product.quickAdd.length) return product.quickAdd.slice();
    return (DOMAIN_QUICK_ADD[domainId] || DOMAIN_QUICK_ADD.saudi_food).slice();
  }

  /* ---------------- بوابات الدفع (نسبة + مبلغ ثابت) ---------------- */
  // تُخصم من الربح الإجمالي حسب سعر البيع، ولا تُضاف إلى تكلفة الصنع
  const PAYMENT_GATEWAYS = [
    { id: 'mada',    name: 'مدى',              icon: '💳', pct: 0.8, fixed: 1 },
    { id: 'card',    name: 'فيزا / ماستركارد',  icon: '🏦', pct: 2.2, fixed: 1 },
    { id: 'installment', name: 'تابي / تمارا', icon: '🧾', pct: 5,   fixed: 0 }
  ];

  /* ---------------- دوال مساعدة للوصول للبيانات ---------------- */
  const byId = (arr, id) => arr.find((x) => x.id === id) || null;

  function getProjectType(id) { return byId(PROJECT_TYPES, id); }

  function getSubcategory(domainId, subId) {
    const d = getDomain(domainId);
    return d ? byId(d.subcategories, subId) : null;
  }
  function getProduct(domainId, subId, productId) {
    const s = getSubcategory(domainId, subId);
    return s ? byId(s.products, productId) : null;
  }

  function cloneTemplate(tpl) {
    return JSON.parse(JSON.stringify(tpl));
  }

  // يرجع قالب المنتج: مفصل إن وُجد، وإلا قالب المجال الاحتياطي
  function getTemplate(domainId, product) {
    if (product && product.tpl && TEMPLATES[product.tpl]) {
      return { source: 'product', ...cloneTemplate(TEMPLATES[product.tpl]) };
    }
    const base = CATEGORY_TEMPLATES[domainId] || CATEGORY_TEMPLATES.saudi_food;
    return { source: 'category', ...cloneTemplate(base) };
  }

  global.AppData = {
    UNITS, UNIT_GROUPS, PROJECT_TYPES, DOMAINS, TEMPLATES,
    CATEGORY_TEMPLATES, OPERATIONAL_PRESETS,
    INGREDIENT_PRESETS, PACKAGING_PRESETS,
    DOMAIN_LABELS, DEFAULT_LABEL, PAYMENT_GATEWAYS,
    getProjectType, getDomain, getSubcategory, setLiveCatalog, getProduct, getTemplate,
    unitById, unitFactor, labelFor, quickAddFor
  };
})(window);
