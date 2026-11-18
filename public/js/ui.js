/* =============================================================
   مِرْباح — أدوات مشتركة بين صفحات المصادقة ولوحتي التحكم
   - كل طلب يرسل X-Requested-With: mirbah (حماية الطلبات الحساسة).
   - لا تخزين للأسرار في المتصفح.
   ============================================================= */
(function (w) {
  'use strict';

  async function api(method, path, body) {
    const res = await fetch(path, {
      method,
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'mirbah' },
      body: body ? JSON.stringify(body) : undefined
    });
    let data = null;
    try { data = await res.json(); } catch (e) {}
    if (!res.ok || (data && data.ok === false)) {
      const err = new Error((data && data.message) || 'تعذر تنفيذ الطلب (' + res.status + ')');
      err.code = data && data.code;
      err.status = res.status;
      throw err;
    }
    return data;
  }
  const get = (p) => api('GET', p);
  const post = (p, b) => api('POST', p, b || {});
  const patch = (p, b) => api('PATCH', p, b || {});
  const put = (p, b) => api('PUT', p, b || {});
  const del = (p) => api('DELETE', p);

  const esc = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  const money = (n) => {
    const v = Number(n);
    if (!isFinite(v)) return '—';
    return v.toLocaleString('ar-SA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ر.س';
  };
  const num = (n) => (isFinite(Number(n)) ? Number(n) : 0);

  function toast(msg, type) {
    let host = document.querySelector('.toast-host');
    if (!host) {
      host = document.createElement('div');
      host.className = 'toast-host';
      document.body.appendChild(host);
    }
    const t = document.createElement('div');
    t.className = 'toast ' + (type || '');
    t.textContent = msg;
    host.appendChild(t);
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 320); }, 3200);
  }

  function requireRole(role) {
    return get('/api/auth/me').then((r) => {
      if (!r.user) { location.href = role === 'owner' ? '/owner-login/' : '/login/?next=' + encodeURIComponent(location.pathname); return null; }
      if (r.user.role !== role) { location.href = r.user.role === 'owner' ? '/owner-admin/' : '/dashboard/'; return null; }
      return r.user;
    });
  }

  return w.MB = { api, get, post, patch, put, del, esc, money, num, toast, requireRole };
})(window);
