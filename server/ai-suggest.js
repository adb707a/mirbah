'use strict';
/* تجهيزات الذكاء للاقتراحات:
   - مفتاح Gemini على الخادم فقط (GEMINI_API_KEY في server/.env أو البيئة).
   - مسار «اقترح لي» في حاسبة الدفتر: يستخدم قاعدة الاقتراحات أولًا،
     والذكاء الاصطناعي للمنتجات التي لا توجد لها قائمة (أو عند طلب المستخدم).
   - كل اقتراح من الذكاء يبقى مسودة لدى التاجر، ولا يدخل المكتبة العامة أبدًا. */
const fs = require('fs');
const path = require('path');

function loadEnv() {
  const f = path.join(__dirname, '..', 'server', '.env');
  if (!fs.existsSync(f)) return;
  fs.readFileSync(f, 'utf8').split(/\r?\n/).forEach((line) => {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (!m) return;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (process.env[m[1]] == null) process.env[m[1]] = v;
  });
}
loadEnv();

const KEY = process.env.GEMINI_API_KEY || '';
const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

function buildSuggestionPrompt({ productName, activityName, existing }) {
  return [
    'أنت مساعد تسعير لمشروعات صغيرة سعودية. اقترح مكونات ومواد لتصنيع المنتج المذكور.',
    'قواعد صارمة:',
    '1) أعد JSON فقط بهذه البنية: {"items":[{"name":"اسم عربي قصير","kind":"core|extra|optional|packaging","unit":"g|ml|pc|m"}]}',
    '2) ٨ إلى ١٥ عنصرًا، بلا تكرار وبلا كميات أو أسعار.',
    '3) لا تقترح مواد كيميائية خطرة أو غير مرخّصة، ولا تشرح طرق خلط.',
    '4) التغليف والتقديم يكون kind=packaging وunit=pc.',
    '5) إن لم تعرف المنتج، اقترح مواد عامة معقولة لنشاطه فقط.',
    '',
    'المنتج: ' + (productName || 'غير محدد'),
    'النشاط: ' + (activityName || 'غير محدد'),
    'الموجود بالفعل (لا تقترحه): ' + ((existing || []).join('، ') || 'لا شيء')
  ].join('\n');
}

async function ask(prompt) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(MODEL)}:generateContent?key=${encodeURIComponent(KEY)}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.4, maxOutputTokens: 1200, responseMimeType: 'application/json' }
      })
    });
    const data = await r.json().catch(() => ({}));
    return { ok: r.ok, status: r.status, data };
  } catch (e) {
    return { ok: false, status: 0, data: { error: String(e.message || e) } };
  } finally { clearTimeout(timer); }
}

function extractText(data) {
  try { return (data.candidates[0].content.parts || []).map((p) => p.text || '').join('\n').trim(); } catch (e) { return ''; }
}

/* فحص صحة الشكل والقيم المسموحة فقط */
function sanitize(items) {
  const units = ['g', 'kg', 'ml', 'l', 'pc', 'm', 'sheet'];
  const kinds = ['core', 'extra', 'optional', 'packaging'];
  const seen = new Set();
  return (Array.isArray(items) ? items : [])
    .map((x) => ({
      name: String(x && x.name || '').trim().slice(0, 40),
      kind: kinds.indexOf(x && x.kind) > -1 ? x.kind : 'optional',
      unit: units.indexOf(x && x.unit) > -1 ? x.unit : 'g'
    }))
    .filter((x) => x.name && !seen.has(x.name) && seen.add(x.name))
    .slice(0, 15);
}

async function suggest(payload) {
  if (!KEY) return { ok: false, code: 'no_key', message: 'الذكاء الاصطناعي غير مهيأ على الخادم.' };
  const res = await ask(buildSuggestionPrompt(payload || {}));
  if (!res.ok) return { ok: false, code: 'ai_error', status: res.status, message: 'تعذر الحصول على اقتراحات الآن.' };
  const text = extractText(res.data);
  let parsed = null;
  try { parsed = JSON.parse(text); } catch (e) {
    const s = text.indexOf('{'); const e2 = text.lastIndexOf('}');
    if (s > -1 && e2 > s) { try { parsed = JSON.parse(text.slice(s, e2 + 1)); } catch (x) {} }
  }
  const items = sanitize(parsed && parsed.items);
  if (!items.length) return { ok: false, code: 'empty', message: 'لم تصل اقتراحات صالحة.' };
  return { ok: true, items, model: MODEL, source: 'ai' };
}

module.exports = { suggest, sanitize, configured: () => !!KEY, model: () => MODEL };
