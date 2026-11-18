'use strict';
/**
 * مكتبة المكونات الموسّعة — المصدر الوحيد لبذر الاقتراحات.
 * كل عنصر: [الاسم, الفئة, الوحدة الافتراضية, الاسم الإنجليزي(اختياري)]
 * الفئة تدل أين يقترحه النظام:
 *   ingredient (أساسي) · extra (إضافة/حشوة/نكهة) · packaging (تغليف/تقديم) · tool (أداة/مستهلك)
 * هذه مسميات مجال عامة كتبها فريق المنصة — ليست بيانات مسحوبة من أي قاعدة خارجية.
 */
const LIB = {};
const add = (name, cls, unit, en) => LIB[name.toLowerCase()] = { name, cls, unit: unit || 'g', en: en || null };

// مخبوزات وحلويات
[
  ['دقيق', 'ingredient', 'g', 'Flour'], ['دقيق بر', 'ingredient', 'g', 'Whole wheat flour'],
  ['سكر', 'ingredient', 'g', 'Sugar'], ['سكر أبيض', 'ingredient', 'g', 'White sugar'],
  ['سكر بني', 'ingredient', 'g', 'Brown sugar'], ['سكر بودرة', 'ingredient', 'g', 'Icing sugar'],
  ['زبدة', 'ingredient', 'g', 'Butter'], ['زبد', 'ingredient', 'g', 'Butter'], ['سمن', 'ingredient', 'g', 'Ghee'],
  ['زيت', 'ingredient', 'ml', 'Oil'], ['زيت نباتي', 'ingredient', 'ml', 'Vegetable oil'],
  ['بيض', 'ingredient', 'pc', 'Eggs'], ['حليب', 'ingredient', 'ml', 'Milk'], ['حليب بودرة', 'ingredient', 'g', 'Milk powder'],
  ['حليب طازج', 'ingredient', 'ml', 'Fresh milk'], ['قشطة', 'ingredient', 'g', 'Fresh cream'], ['كريمة', 'ingredient', 'ml', 'Cream'],
  ['فانيليا', 'extra', 'ml', 'Vanilla'], ['ملح', 'ingredient', 'g', 'Salt'],
  ['بيكنج باودر', 'ingredient', 'g', 'Baking powder'], ['بايكنج باودر', 'ingredient', 'g', 'Baking powder'],
  ['خميرة', 'ingredient', 'g', 'Yeast'], ['نشا', 'ingredient', 'g', 'Starch'],
  ['شوكولاتة', 'extra', 'g', 'Chocolate'], ['شوكولاتة داكنة', 'extra', 'g', 'Dark chocolate'],
  ['كاكاو', 'extra', 'g', 'Cocoa'], ['زبدة كاكاو', 'ingredient', 'g', 'Cocoa butter'],
  ['لوتس', 'extra', 'g', 'Lotus spread'], ['كراميل', 'extra', 'g', 'Caramel'],
  ['زبدة الفول السوداني', 'extra', 'g', 'Peanut butter'], ['نوتيلا', 'extra', 'g', 'Nutella'],
  ['عسل', 'ingredient', 'ml', 'Honey'], ['تمر', 'ingredient', 'g', 'Dates'], ['معجون تمر', 'ingredient', 'g', 'Date paste'],
  ['جريش', 'ingredient', 'g', 'Jareesh (cracked wheat)'], ['أرز', 'ingredient', 'g', 'Rice'],
  ['سميد', 'ingredient', 'g', 'Semolina'], ['شوفان', 'ingredient', 'g', 'Oats'],
  ['ماء', 'ingredient', 'ml', 'Water'], ['ماء ورد', 'extra', 'ml', 'Rosewater'], ['ماء زهر', 'extra', 'ml', 'Orange blossom water'],
  ['لوز', 'extra', 'g', 'Almonds'], ['فستق', 'extra', 'g', 'Pistachio'], ['جوز', 'extra', 'g', 'Walnuts'],
  ['مكسرات', 'extra', 'g', 'Nuts'], ['سمسم', 'extra', 'g', 'Sesame'],
  ['بهارات', 'ingredient', 'g', 'Spices'], ['بهارات كبسة', 'ingredient', 'g', 'Kabsa spice'],
  ['هيل', 'ingredient', 'g', 'Cardamom'], ['زعفران', 'ingredient', 'g', 'Saffron'], ['قرنفل', 'ingredient', 'g', 'Cloves'],
  ['قرفة', 'ingredient', 'g', 'Cinnamon'], ['فلفل', 'ingredient', 'g', 'Pepper'],
  ['بصل', 'ingredient', 'g', 'Onion'], ['طماطم', 'ingredient', 'g', 'Tomato'], ['خس', 'ingredient', 'g', 'Lettuce'],
  ['بطاطس', 'ingredient', 'g', 'Potato'], ['لحم', 'ingredient', 'g', 'Meat'], ['لحم مفروم', 'ingredient', 'g', 'Minced meat'],
  ['دجاج', 'ingredient', 'g', 'Chicken'], ['خبز', 'ingredient', 'pc', 'Bread'], ['خبز برجر', 'ingredient', 'pc', 'Burger bun'],
  ['خبز صاج', 'ingredient', 'pc', 'Saj bread'], ['جبن', 'ingredient', 'g', 'Cheese'], ['جبن شيدر', 'ingredient', 'g', 'Cheddar'],
  ['صوص', 'extra', 'ml', 'Sauce'], ['صوص ثوم', 'extra', 'ml', 'Garlic sauce'], ['مخلل', 'extra', 'g', 'Pickles'],
  ['حشوة', 'extra', 'g', 'Filling'], ['جلوكوز', 'ingredient', 'ml', 'Glucose'],
  ['كرز', 'extra', 'g', 'Cherries'], ['فراولة', 'extra', 'g', 'Strawberry'], ['مانجو', 'extra', 'g', 'Mango'],
  ['برتقال طازج', 'ingredient', 'g', 'Fresh orange'], ['ليمون', 'extra', 'g', 'Lemon'], ['نعناع', 'extra', 'g', 'Mint'],
  ['قهوة', 'ingredient', 'g', 'Coffee'], ['بن', 'ingredient', 'g', 'Coffee beans'],
  ['بن أخضر محمص', 'ingredient', 'g', 'Roasted green coffee'], ['بن إسبريسو', 'ingredient', 'g', 'Espresso beans'],
  ['شاي', 'ingredient', 'g', 'Tea'], ['تمر هندي', 'ingredient', 'g', 'Tamarind'], ['سيروب', 'extra', 'ml', 'Syrup'],
  ['شراب أساسي', 'ingredient', 'ml', 'Base syrup'], ['مياه غازية', 'ingredient', 'ml', 'Soda'],
  ['ثلج', 'ingredient', 'g', 'Ice'],
  ['شعير', 'ingredient', 'g', 'Barley'], ['خضار', 'ingredient', 'g', 'Vegetables'], ['كركديه', 'ingredient', 'g', 'Hibiscus'],
].forEach((x) => add(x[0], x[1], x[2], x[3]));

// عطور وبخور وصابون
[
  ['زيت عطري', 'ingredient', 'ml', 'Fragrance oil'], ['عطر مركز', 'ingredient', 'ml', 'Perfume concentrate'],
  ['كحول عطري', 'ingredient', 'ml', 'Perfumer alcohol'], ['مثبت', 'ingredient', 'ml', 'Fixative'],
  ['مذيب', 'ingredient', 'ml', 'Solvent'], ['ماء مقطر', 'ingredient', 'ml', 'Distilled water'],
  ['زيت جوجوبا', 'ingredient', 'ml', 'Jojoba oil'], ['عطر', 'extra', 'ml', 'Scent'],
  ['رقائق عود', 'ingredient', 'g', 'Oud chips'], ['عطر بخور', 'ingredient', 'ml', 'Bakhoor oil'],
  ['فحم', 'ingredient', 'g', 'Charcoal'], ['مسك', 'extra', 'g', 'Musk'],
  ['زيت زيتون', 'ingredient', 'ml', 'Olive oil'], ['صودا كاوية', 'ingredient', 'g', 'Sodium hydroxide'],
  ['ملونات', 'extra', 'g', 'Colours'],
].forEach((x) => add(x[0], x[1], x[2], x[3]));

// شموع
[
  ['شمع صويا', 'ingredient', 'g', 'Soy wax'], ['شمع برافين', 'ingredient', 'g', 'Paraffin wax'],
  ['فتائل', 'ingredient', 'pc', 'Wicks'], ['عطر مخصص للشموع', 'ingredient', 'ml', 'Candle fragrance'],
  ['أصباغ الشمع', 'extra', 'g', 'Wax dye'],
].forEach((x) => add(x[0], x[1], x[2], x[3]));

// كروشيه وخياطة
[
  ['خيوط كروشيه', 'ingredient', 'g', 'Crochet yarn'], ['خيط كروشيه', 'ingredient', 'g', 'Crochet thread'],
  ['خيوط قطن', 'ingredient', 'g', 'Cotton yarn'], ['خيوط صوف', 'ingredient', 'g', 'Wool yarn'],
  ['خيوط أكريليك', 'ingredient', 'g', 'Acrylic yarn'], ['خيط صوف', 'ingredient', 'g', 'Wool yarn'],
  ['حشوة قطنية', 'ingredient', 'g', 'Cotton filling'], ['إبر كروشيه', 'tool', 'pc', 'Crochet hooks'],
  ['قماش', 'ingredient', 'm', 'Fabric'], ['قماش عباية', 'ingredient', 'm', 'Abaya fabric'], ['قماش ثوب', 'ingredient', 'm', 'Thobe fabric'],
  ['خيط خياطة', 'ingredient', 'm', 'Sewing thread'], ['بطانة', 'ingredient', 'm', 'Lining'],
  ['بطانة قماش', 'ingredient', 'm', 'Fabric lining'], ['سحاب', 'ingredient', 'pc', 'Zipper'],
  ['أزرار', 'ingredient', 'pc', 'Buttons'], ['أزرار خفية', 'ingredient', 'pc', 'Hidden buttons'],
  ['خرز', 'extra', 'pc', 'Beads'], ['خرز للعينين', 'extra', 'pc', 'Safety eyes'],
  ['محابس أمان', 'extra', 'pc', 'Safety pins'], ['شرائط', 'packaging', 'm', 'Ribbons'],
  ['شريط مطاطي', 'ingredient', 'm', 'Elastic'], ['مطاط شعر', 'ingredient', 'pc', 'Hair tie'],
  ['أطراف معدنية', 'ingredient', 'pc', 'Aglets'], ['نشا', 'ingredient', 'g', 'Starch'],
].forEach((x) => add(x[0], x[1], x[2], x[3]));

// تغليف وتقديم (يُسجَّل بالعدد)
[
  ['علب تغليف', 'packaging', 'pc', 'Boxes'], ['علب كرتون', 'packaging', 'pc', 'Cardboard boxes'],
  ['علب برجر', 'packaging', 'pc', 'Burger boxes'], ['علب كيك', 'packaging', 'pc', 'Cake boxes'],
  ['علب هدايا', 'packaging', 'pc', 'Gift boxes'], ['علب هدايا صغيرة', 'packaging', 'pc', 'Small gift boxes'],
  ['علب توزيعات', 'packaging', 'pc', 'Giveaway boxes'], ['علب بخور', 'packaging', 'pc', 'Bakhoor boxes'],
  ['علب العطور', 'packaging', 'pc', 'Perfume boxes'], ['علب شموع', 'packaging', 'pc', 'Candle boxes'],
  ['أطباق ورقية', 'packaging', 'pc', 'Paper plates'], ['أطباق تقديم', 'packaging', 'pc', 'Serving plates'],
  ['أكواب ورقية', 'packaging', 'pc', 'Paper cups'], ['أكواب', 'packaging', 'pc', 'Cups'],
  ['أغطية أكواب', 'packaging', 'pc', 'Cup lids'], ['أغطية', 'packaging', 'pc', 'Lids'],
  ['شفاطات', 'packaging', 'pc', 'Straws'], ['ملاعق', 'packaging', 'pc', 'Spoons'],
  ['مناديل', 'packaging', 'pc', 'Napkins'], ['ملصقات', 'packaging', 'pc', 'Stickers'],
  ['ملصقات العطور', 'packaging', 'pc', 'Perfume labels'], ['بطاقات تعليق', 'packaging', 'pc', 'Hang tags'],
  ['أكياس', 'packaging', 'pc', 'Bags'], ['أكياس ورقية', 'packaging', 'pc', 'Paper bags'],
  ['أكياس شفافة', 'packaging', 'pc', 'Clear bags'], ['أكياس تفريز', 'packaging', 'pc', 'Freezer bags'],
  ['أكياس تغليف', 'packaging', 'pc', 'Packaging bags'], ['ورق تغليف', 'packaging', 'sheet', 'Wrapping paper'],
  ['سيلوفان', 'packaging', 'sheet', 'Cellophane'], ['شرائط هدايا', 'packaging', 'm', 'Gift ribbons'],
  ['كرت إهداء', 'packaging', 'pc', 'Gift card'], ['فواصل داخل العلبة', 'packaging', 'pc', 'Box dividers'],
  ['زجاجات العطر', 'packaging', 'pc', 'Perfume bottles'], ['زجاجات صغيرة', 'packaging', 'pc', 'Small bottles'],
  ['أغطية الزجاجات', 'packaging', 'pc', 'Bottle caps'], ['بخاخات', 'packaging', 'pc', 'Sprayers'],
  ['قطّارات', 'packaging', 'pc', 'Droppers'], ['أوعية', 'packaging', 'pc', 'Containers'],
  ['شرائط اختبار', 'packaging', 'pc', 'Test strips'], ['غلاف شاورما', 'packaging', 'pc', 'Shawarma wrap'],
  ['دلال صغيرة', 'packaging', 'pc', 'Small dallah'], ['أكياس تغليف العطور', 'packaging', 'pc', 'Perfume pouches'],
  ['ورق حراري', 'tool', 'sheet', 'Heat paper'], ['منتج خام', 'tool', 'pc', 'Blank product'],
  ['حبر', 'tool', 'pc', 'Ink'], ['فيلم حرارة', 'tool', 'pc', 'Heat film'],
  ['اشتراك برامج', 'tool', 'pc', 'Software'], ['خطوط', 'tool', 'pc', 'Fonts'], ['صور مرخّصة', 'tool', 'pc', 'Licensed images'],
  ['حلوى', 'extra', 'g', 'Sweets'], ['ورد', 'packaging', 'pc', 'Flowers'],
].forEach((x) => add(x[0], x[1], x[2], x[3]));

module.exports = { LIB };
