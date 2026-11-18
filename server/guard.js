/* =============================================================
   أمان الطلبات الحساسة (moment of change)
   - لا جلبة/csrf لأي طلب يغيّر بيانات من غير SameSite=Strict.
   - الطلب من Origin مختلف يُرفض مطلقًا.
   - إن الواجهة في نفس الأصل: نطلب X-Requested-With: mirbah.
   ============================================================= */
'use strict';

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function resolveOrigin(req, allowlist) {
  const host = String(req.headers.host || '').toLowerCase();
  const origin = req.headers.origin;
  if (origin) {
    try { return new URL(origin).host.toLowerCase() === host; } catch (e) { return false; }
  }
  const ref = req.headers.referer;
  if (ref) {
    try { return new URL(ref).host.toLowerCase() === host; } catch (e) { return false; }
  }
  return true; // أدوات سطر أوامر / اختبارات بدون Origin
}

function guard(req) {
  if (!MUTATING.has(req.method)) return null;
  const origin = req.headers.origin;
  const host = String(req.headers.host || '').toLowerCase();
  if (origin) {
    let same = false;
    try { same = new URL(origin).host.toLowerCase() === host; } catch (e) { same = false; }
    if (!same) return { status: 403, code: 'cross_origin', message: 'طلب من أصل آخر مرفوض.' };
  }
  const reqWith = String(req.headers['x-requested-with'] || '');
  const isApi = String(req.url || '').startsWith('/api/');
  if (isApi && reqWith !== 'mirbah') {
    // اختبارات/أدوات قد لا ترسل الترويسة: نقبل فقط عند غياب Cookie وعدم وجود Origin
    const hasCookie = !!req.headers.cookie;
    const hasOrigin = !!origin;
    if (hasCookie || hasOrigin) {
      return { status: 403, code: 'csrf', message: 'الترويسة الأمنية مفقودة — حدّث الصفحة وحاول مجددًا.' };
    }
  }
  return null;
}

module.exports = { guard };
