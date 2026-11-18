/* مصدر كتالوج دفتر V3 بصيغة ESM (قابل للقراءة من الخادم مباشرة)

   كل عنصر:
     { id, name, icon?, subcategories: [ { id, name, products: [ { id, name, tpl?, outputLabel?, ingKey? } ] } ] }
   - id التصنيف فريد داخل النشاط (يُخزَّن كـ activity:category).
   - ingKey يحوّل المنتج إلى مفتاح اقتراحات المكونات في server/seed-suggestions.js
   - tpl يشير إلى قالب في app (لم يُنقل بعد إلى قاعدة البيانات، ويُقبل اختياريًا).
*/
const P = (id, name, extra) => Object.assign({ id, name }, extra || {});
const S = (id, name, products) => ({ id, name, products });
const D = (id, name, icon, subcategories) => ({ id, name, icon, subcategories });

export const DOMAINS = [
  D('saudi_food', 'المأكولات الشعبية السعودية', '🍛', [
    S('southern', 'الأكلات الجنوبية', [
      P('okraika', 'العريكة الجنوبية', { ingKey: 'areika' }),
      P('maasoub', 'المعصوب', { ingKey: 'maasoub' }),
      P('qursan', 'القرصان', { ingKey: 'areika' }),
      P('marqooq', 'المرقوق', { ingKey: 'marqooq' })
    ]),
    S('central', 'الأكلات الوسطى', [
      P('jareesh', 'الجريش', { ingKey: 'jareesh' }),
      P('kabsa', 'الكبسة', { ingKey: 'kabsa' })
    ]),
    S('western', 'الأكلات الغربية', [
      P('mandi', 'المندي', { ingKey: 'meal' }),
      P('haneeth', 'الحنيذ', { ingKey: 'meal' })
    ])
  ]),
  D('sweets', 'الحلويات', '🍪', [
    S('cookies', 'الكوكيز', [
      P('choco_cookies', 'كوكيز شوكولاتة', { ingKey: 'cookies' }),
      P('plain_cookies', 'كوكيز سادة', { ingKey: 'cookies' }),
      P('salted_cookies', 'كوكيز مالح', { ingKey: 'cookies' })
    ]),
    S('brownies', 'البراونيز', [
      P('brownie', 'براوني كلاسيك', { ingKey: 'brownie' }),
      P('nutella_brownie', 'براوني نوتيلا', { ingKey: 'brownie' })
    ]),
    S('cakes', 'الكيك', [
      P('choco_cake', 'كيك شوكولاتة', { ingKey: 'cake' }),
      P('vanilla_cake', 'كيك فانيلا', { ingKey: 'cake' }),
      P('honey_cake', 'كيك عسل', { ingKey: 'cake' })
    ]),
    S('chocolate_shop', 'الشوكولاتة', [
      P('chocolate_bar', 'شوكولاتة بار', { ingKey: 'chocolate' }),
      P('chocolate_truffles', 'شوكولاتة ترافل', { ingKey: 'chocolate' })
    ])
  ]),
  D('bakery', 'المعجنات والمخبوزات', '🥖', [
    S('bread', 'الخبز', [P('fresh_bread', 'خبز طازج', { ingKey: 'bread' }), P('brown_bread', 'خبز بر', { ingKey: 'bread' })]),
    S('cakes_bakery', 'الكيك', [P('sponge_cake', 'كيك إسفنجي', { ingKey: 'cake_bakery' }), P('croissant', 'كرواسون', { ingKey: 'croissant' })]),
    S('maamoul', 'المعمول', [P('maamoul_dates', 'معمول تمر', { ingKey: 'maamoul' })])
  ]),
  D('fast_food', 'الوجبات السريعة', '🍔', [
    S('burgers', 'البرجر', [P('classic_burger', 'برجر كلاسيك', { ingKey: 'burger' })]),
    S('sandwiches', 'الساندوتشات', [P('shawarma', 'شاورما', { ingKey: 'shawarma' }), P('chicken_sandwich', 'ساندوتش دجاج', { ingKey: 'sandwich' })])
  ]),
  D('home_cooking', 'الطبخ المنزلي', '🍲', [
    S('meals', 'الوجبات', [P('rice_meal', 'وجبة أرز', { ingKey: 'meal' })]),
    S('sandwiches_home', 'الساندوتشات', [P('sandwich_home', 'ساندوتش منزلي', { ingKey: 'sandwich' })])
  ]),
  D('frozen', 'المأكولات المجمدة', '❄️', [
    S('frozen_meals', 'الوجبات المجمدة', [P('frozen_kibbeh', 'كبة مجمدة', { ingKey: 'meal' })])
  ]),
  D('coffee_saudi', 'القهوة السعودية', '☕', [
    S('saudi_coffee', 'القهوة', [P('saudi_coffee_cup', 'قهوة سعودية', { ingKey: 'coffee_saudi' })]),
    S('sweets_with_coffee', 'الحلويات مع القهوة', [P('dates_plate', 'طبق تمور', { ingKey: 'saudi_food' })])
  ]),
  D('specialty_coffee', 'القهوة المختصة', '☕', [
    S('espresso', 'الإسبريسو', [P('espresso_cup', 'إسبريسو', { ingKey: 'coffee_specialty' })]),
    S('latte', 'اللاتيه', [P('latte_cup', 'لاتيه', { ingKey: 'coffee_specialty' })])
  ]),
  D('cold_drinks', 'المشروبات الباردة', '🧋', [
    S('iced', 'المشروبات المثلجة', [P('iced_latte', 'آيس لاتيه', { ingKey: 'cold_drinks' })])
  ]),
  D('traditional_drinks', 'المشروبات الشعبية', '🌴', [
    S('sobia', 'السوبيا', [P('sobia', 'سوبيا', { ingKey: 'tea' })]),
    S('tamarind', 'التمر الهندي', [P('tamarind', 'تمر هندي', { ingKey: 'tea' })]),
    S('karkade', 'الكركديه', [P('karkade', 'كركديه', { ingKey: 'tea' })])
  ]),
  D('juices', 'العصائر الطازجة', '🍊', [
    S('orange', 'عصير البرتقال', [P('orange_juice', 'عصير برتقال', { ingKey: 'juice' })]),
    S('mango', 'المانجو', [P('mango_juice', 'عصير مانجو', { ingKey: 'juice' })]),
    S('strawberry', 'الفراولة', [P('strawberry_juice', 'عصير فراولة', { ingKey: 'juice' })]),
    S('lemon', 'الليمون بالنعناع', [P('lemon_mint', 'ليمون بالنعناع', { ingKey: 'juice' })])
  ]),
  D('fashion', 'الخياطة والأزياء', '🧵', [
    S('abaya', 'العبايات', [P('plain_abaya', 'عباية سادة', { ingKey: 'sewing' }), P('embroidered_abaya', 'عباية مطرزة', { ingKey: 'sewing' })]),
    S('clothes', 'الملابس', [P('dress', 'فستان', { ingKey: 'sewing' }), P('thobe', 'ثوب', { ingKey: 'sewing' })]),
    S('alterations', 'التعديلات والخياطة', [P('alteration', 'تعديل خياطة', { ingKey: 'sewing' })])
  ]),
  D('crochet', 'الكروشيه والأعمال اليدوية', '🧶', [
    S('bags_crochet', 'الحقائب', [P('crochet_bag', 'حقيبة كروشيه', { ingKey: 'crochet' })]),
    S('dolls', 'الدمى', [P('crochet_doll', 'دمية كروشيه', { ingKey: 'crochet_amigurumi' })]),
    S('covers', 'المفارش', [P('crochet_cover', 'مفرش كروشيه', { ingKey: 'crochet' })]),
    S('laces', 'الأربطة', [P('shoe_laces', 'أربطة أحذية كروشيه', { ingKey: 'crochet' })])
  ]),
  D('accessories', 'الإكسسوارات', '📿', [
    S('bracelets', 'الأساور', [P('bead_bracelet', 'أساور خرز', { ingKey: 'sewing' })]),
    S('necklaces', 'القلائد', [P('handmade_necklace', 'قلادة يدوية', { ingKey: 'sewing' })]),
    S('handmade_acc', 'الإكسسوارات اليدوية', [P('accessory_set', 'طقم إكسسوار', { ingKey: 'sewing' })])
  ]),
  D('perfumes', 'العطور', '🌸', [
    S('compound', 'العطور المركبة', [P('custom_perfume', 'عطر مركب', { ingKey: 'perfume' })]),
    S('hair', 'عطور الشعر', [P('hair_perfume', 'عطر شعر', { ingKey: 'perfume_oil' })]),
    S('perfume_blends', 'خلطات العطور', [P('perfume_blend', 'خلطة عطر', { ingKey: 'perfume' })])
  ]),
  D('incense', 'البخور', '🪵', [
    S('scented', 'البخور المعطر', [P('scented_incense', 'بخور معطر', { ingKey: 'bukhoor' })]),
    S('oud', 'خلطات العود', [P('oud_blend', 'خلطة عود', { ingKey: 'bukhoor' })])
  ]),
  D('printing', 'الطباعة الحرارية', '🖨️', [
    S('mugs', 'الأكواب', [P('printed_mug', 'كوب مطبوع', { ingKey: 'gift' })]),
    S('printed_clothes', 'الملابس', [P('printed_tshirt', 'تيشيرت مطبوع', { ingKey: 'gift' })]),
    S('stickers', 'الملصقات', [P('stickers', 'ملصقات', { ingKey: 'gift' })])
  ]),
  D('occasions', 'التوزيعات والهدايا', '🎁', [
    S('giveaways', 'التوزيعات', [P('giveaway_box', 'علبة توزيع', { ingKey: 'giveaway' })]),
    S('gifts', 'هدايا المناسبات', [P('occasion_gift', 'هدية مناسبة', { ingKey: 'gift' })])
  ]),
  D('candles', 'الشموع والصناعة اليدوية', '🕯️', [
    S('candles_sub', 'الشموع', [
      P('soy_candle', 'شمعة صويا', { ingKey: 'candles' }),
      P('scented_candle', 'شمعة معطرة', { ingKey: 'candles' })
    ]),
    S('soap', 'الصابون', [P('soap_bar', 'صابون طبيعي', { ingKey: 'soap' })])
  ]),
  D('digital', 'التصميم والخدمات الرقمية', '🎨', [
    S('logos', 'تصميم الشعارات', [P('logo_design', 'تصميم شعار', { ingKey: 'printing' })]),
    S('social', 'تصميم السوشال ميديا', [P('social_design', 'تصميم منشور', { ingKey: 'printing' })])
  ])
];

export default { DOMAINS };
