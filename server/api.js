'use strict';
/* =============================================================
   مِرْباح — واجهة المنصة (REST)
   كل مسار يتحقق من الدور على الخادم:
     /api/public/*    → للزائر (قراءة)
     /api/auth/*      → تسجيل الدخول/الخروج/الحساب
     /api/merchant/*  → للتاجر فقط، ومشاريعه وحدها
     /api/owner/*     → للمالك فقط
   ============================================================= */
const A = require('./auth');

function json(res, status, obj, extraHeaders) {
  let body = JSON.stringify(obj);
  // الهوية البصرية لعربي: لا نُخرج \uXXXX
  body = body.replace(/\\u([0-9a-fA-F]{4})/g, (m, h) => String.fromCharCode(parseInt(h, 16)));
  const headers = Object.assign({
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store'
  }, extraHeaders || {});
  res.writeHead(status, headers);
  res.end(body);
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > (limit || 400000)) { reject(new Error('body_too_large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8');
        resolve(raw ? JSON.parse(raw) : {});
      } catch (e) { reject(new Error('invalid_json')); }
    });
    req.on('error', reject);
  });
}

const S = (v) => String(v == null ? '' : v);

function createApi(dbOrRef, opts) {
  // نقبل كائن قاعدة مباشرًا أو مرجعًا بدالة (للتهيئة غير المتزامنة)
  const resolve = () => (typeof dbOrRef === 'function' ? dbOrRef()
    : (dbOrRef && typeof dbOrRef.get === 'function' && !dbOrRef.prepare ? dbOrRef.get() : dbOrRef));
  const db = new Proxy({}, {
    get(_, prop) {
      const target = resolve();
      if (!target) throw new Error('db_not_ready');
      return typeof target[prop] === 'function' ? target[prop].bind(target) : target[prop];
    }
  });
  const TRUST_PROXY = process.env.MIRBAH_TRUST_PROXY === '1';
  function normalizeIp(value) {
    let ip = String(value || '').trim();
    if (ip.startsWith('::ffff:')) ip = ip.slice(7);
    const bracketed = ip.match(/^\[([^\]]+)\](?::\d+)?$/);
    if (bracketed) ip = bracketed[1];
    if (/^\d{1,3}(\.\d{1,3}){3}:\d+$/.test(ip)) ip = ip.replace(/:\d+$/, '');
    return ip;
  }
  // X-Forwarded-For is only meaningful from a trusted reverse proxy. When the
  // opt-in is absent we use the real socket address, so it cannot be spoofed.
  const ipOf = (req) => {
    if (TRUST_PROXY) {
      const xff = req.headers['x-forwarded-for'];
      if (xff) return normalizeIp(String(xff).split(',')[0]);
      const real = req.headers['x-real-ip'];
      if (real) return normalizeIp(real);
    }
    return normalizeIp(req.socket && req.socket.remoteAddress) || '';
  };

  function currentUser(req) {
    const cookies = A.parseCookies(req.headers.cookie);
    return A.readSession(db, cookies[A.COOKIE_NAME]);
  }

  function requireRole(req, role) {
    const u = currentUser(req);
    if (!u) return { error: { status: 401, code: 'auth_required', message: 'سجّل الدخول أولًا.' } };
    if (u.role !== role) return { error: { status: 403, code: 'forbidden', message: 'هذه المساحة ليست لك.' } };
    return { user: u };
  }

  /* ---------- كتالوج عام ---------- */
  function catalogTree() {
    const acts = db.prepare('SELECT * FROM catalog_activities WHERE visible = 1 ORDER BY position').all();
    return acts.map((a) => {
      const cats = db.prepare('SELECT * FROM catalog_categories WHERE activity_key = ? AND visible = 1 ORDER BY position').all(a.key);
      return {
        id: a.key, name: a.name, icon: a.icon,
        subcategories: cats.map((c) => ({
          id: c.id.slice(c.activity_key.length + 1),
          name: c.name,
          products: db.prepare('SELECT * FROM catalog_products WHERE category_id = ? AND visible = 1 ORDER BY position').all(c.id)
            .map((p) => ({ id: p.id.split(':').pop(), name: p.name, ingKey: p.ing_key }))
        }))
      };
    });
  }
  function suggestionsFor(ingKey) {
    // كل اسم مرة واحدة فقط لكل منتج — تنقية تلقائية حتى لو نُضيف اقتراح مكرر من الإدارة
    const rows = db.prepare("SELECT name, kind, COALESCE(unit,'') AS unit, MIN(position) AS pos FROM catalog_suggestions WHERE ing_key = ? GROUP BY name").all(ingKey);
    const rank = { core: 1, extra: 2, optional: 3, packaging: 4 };
    return rows
      .sort((a, b) => (rank[a.kind] || 9) - (rank[b.kind] || 9) || a.pos - b.pos)
      .map((r) => ({ name: r.name, kind: r.kind, unit: r.unit || null }));
  }

  /* ---------- مكتبة المكونات العامة (مرجع للبحث والإضافات) ---------- */
  function librarySearch(q, limit) {
    const term = '%' + String(q || '').trim() + '%';
    return db.prepare(`SELECT key,name,en_name,cls,category,default_unit FROM library_items
      WHERE active = 1 AND (name LIKE ? OR en_name LIKE ?) ORDER BY name LIMIT ?`).all(term, term, Number(limit) || 20);
  }

  /* ---------- المشاريع ---------- */
  function ownedProject(user, projectId) {
    return db.prepare('SELECT * FROM projects WHERE id = ? AND owner_id = ?').get(projectId, user.id) || null;
  }
  function projectPayload(user, project) {
    const cats = db.prepare('SELECT * FROM categories WHERE project_id = ? ORDER BY position').all(project.id);
    const prods = db.prepare('SELECT * FROM products WHERE project_id = ? ORDER BY created_at').all(project.id);
    return {
      id: project.id, name: project.name, activityKey: project.activity_key, startMode: project.start_mode,
      createdAt: project.created_at, archived: !!project.archived_at,
      categories: cats.map((c) => ({
        id: String(c.id || '').split(':').pop(), name: c.name, position: c.position,
        products: prods.filter((p) => p.category_id === c.id).map(summarize)
      })),
      products: prods.filter((p) => !p.category_id).map(summarize)
    };
  }
  function summarize(p) {
    return {
      id: p.id, name: p.name, categoryId: p.category_id ? String(p.category_id).split(':').pop() : null,
      rawCategoryId: p.category_id, status: p.status,
      unitCost: p.unit_cost, sellPrice: p.sell_price, margin: p.margin,
      updatedAt: p.updated_at, createdAt: p.created_at,
      activityKey: JSON.parse(p.state_json || '{}').domainId || null
    };
  }

  const routes = {
    /* ================= عام ================= */
    'GET /api/public/catalog': () => ({ ok: true, activities: catalogTree() }),
    'GET /api/public/suggestions': (req, params) => ({ ok: true, items: suggestionsFor(params.key || '') }),
    'GET /api/public/library': (req, params) => {
      const q = S(params.q);
      if (q.length < 2) return { ok: true, items: [] };
      return { ok: true, items: librarySearch(q, params.limit) };
    },
    /* «اقترح لي بذكاء»: خدمة الذكاء لا تُستخدم إلا بطلب صريح، والنتيجة مسودة لا تدخل المكتبة */
    'POST /api/merchant/ai-suggest': async (req) => {
      const u = currentUser(req);
      if (!u) return { error: { status: 401, code: 'auth_required', message: 'سجّل الدخول أولًا.' } };
      const st = db.prepare("SELECT enabled FROM ai_settings WHERE kind = 'suggest'").get();
      if (st && !st.enabled) return { ok: false, code: 'disabled', message: 'ميزة الاقتراح الذكي معطّلة من إدارة المنصة.' };
      const b = await readBody(req);
      const ai = require('./ai-suggest.js');
      const started = Date.now();
      const r = await ai.suggest({
        productName: S(b.productName), activityName: S(b.activityName),
        existing: (Array.isArray(b.existing) ? b.existing : []).map(S).slice(0, 40)
      });
      try {
        db.prepare('INSERT INTO ai_logs(at,merchant_id,kind,model,ok,latency_ms,error) VALUES(?,?,?,?,?,?,?)')
          .run(new Date().toISOString(), u.id, 'suggest', ai.model(), r.ok ? 1 : 0, Date.now() - started, r.ok ? null : (r.code || 'error'));
      } catch (e) {}
      return r;
    },    'GET /api/public/peek': () => {
      const c = db.prepare('SELECT COUNT(*) n FROM catalog_activities').get().n;
      const k = db.prepare('SELECT COUNT(*) n FROM catalog_products').get().n;
      return { ok: true, activities: c, products: k };
    },

    /* ================= مصادقة ================= */
    'POST /api/auth/register': async (req) => {
      const b = await readBody(req);
      const email = S(b.email).toLowerCase().trim();
      const password = S(b.password);
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: { status: 400, code: 'bad_email', message: 'أدخل بريدًا صحيحًا.' } };
      if (password.length < 8) return { error: { status: 400, code: 'weak_password', message: 'كلمة المرور 8 أحرف على الأقل.' } };
      if (A.findByEmail(db, email)) return { error: { status: 409, code: 'email_taken', message: 'هذا البريد مسجّل.' } };
      // الدور المقبول من التسجيل العام: merchant فقط — لا أحد يمنح نفسه صلاحية إدارية
      const id = A.createUser(db, { email, name: b.name, password, role: 'merchant' });
      const u = { id, role: 'merchant' };
      A.audit(db, u, 'auth.register', 'user', id, null, ipOf(req));
      return { id };
    },
    'POST /api/auth/login': async (req) => {
      const b = await readBody(req);
      const email = S(b.email).toLowerCase().trim();
      const ip = ipOf(req);
      if (A.recentFailures(db, email, ip) >= A.MAX_ATTEMPTS) {
        return { error: { status: 429, code: 'locked', message: 'محاولات كثيرة على هذا الحساب. أعد المحاولة بعد 10 دقائق.' } };
      }
      if (A.ipLocked(db, ip)) {
        return { error: { status: 429, code: 'ip_locked', message: 'محاولات كثيرة من هذا الجهاز. أعد المحاولة بعد 10 دقائق.' } };
      }
      const user = A.findByEmail(db, email);
      const okPass = user && A.verifyPassword(S(b.password), user.password_hash, user.password_salt);
      if (!okPass) {
        A.logAttempt(db, email, ip, false, 'bad_credentials');
        return { error: { status: 401, code: 'bad_credentials', message: 'البريد أو كلمة المرور غير صحيحة.' } };
      }
      if (user.status !== 'active') {
        A.logAttempt(db, email, ip, false, 'suspended');
        return { error: { status: 403, code: 'suspended', message: 'هذا الحساب موقوف. راجع الدعم.' } };
      }
      if (user.role === 'owner' && user.totp_enabled) {
        if (!A.verifyTotp(user.totp_secret, b.code)) {
          A.logAttempt(db, email, ip, false, 'totp');
          return { error: { status: 401, code: 'totp_required', message: 'أدخل رمز المصادقة الثنائية الصحيح.' } };
        }
      }
      A.logAttempt(db, email, ip, true, 'ok');
      db.prepare('UPDATE users SET last_login_at = ? WHERE id = ?').run(new Date().toISOString(), user.id);
      const sid = A.createSession(db, user.id, ip, req.headers['user-agent']);
      A.audit(db, { id: user.id, role: user.role }, 'auth.login', 'user', user.id, null, ip);
      return { redirect: user.role === 'owner' ? '/owner-admin/' : '/dashboard/', setCookie: A.sessionCookie(sid, Math.floor(A.SESSION_TTL_MS / 1000)) };
    },
    'POST /api/auth/logout': (req) => {
      const u = currentUser(req);
      const cookies = A.parseCookies(req.headers.cookie);
      if (cookies[A.COOKIE_NAME]) A.destroySession(db, cookies[A.COOKIE_NAME]);
      if (u) A.audit(db, u, 'auth.logout', 'user', u.id, null, ipOf(req));
      return { ok: true, setCookie: A.clearCookie() };
    },
    'GET /api/auth/me': (req) => {
      const u = currentUser(req);
      if (!u) return { ok: true, user: null };
      return { ok: true, user: { id: u.id, email: u.email, name: u.name, role: u.role, totpEnabled: u.totpEnabled } };
    },
    'POST /api/auth/totp/setup': (req) => {
      const r = requireRole(req, 'owner'); if (r.error) return r;
      const secret = A.newTotpSecret();
      db.prepare('UPDATE users SET totp_secret = ?, totp_enabled = 0 WHERE id = ?').run(secret, r.user.id);
      const label = encodeURIComponent('mirbah:' + r.user.email);
      return { ok: true, secret, otpauth: 'otpauth://totp/' + label + '?secret=' + secret + '&issuer=mirbah' };
    },
    'POST /api/auth/totp/enable': async (req) => {
      const r = requireRole(req, 'owner'); if (r.error) return r;
      const b = await readBody(req);
      const row = db.prepare('SELECT totp_secret FROM users WHERE id = ?').get(r.user.id);
      if (!row || !row.totp_secret) return { error: { status: 400, code: 'no_secret', message: 'ابدأ الإعداد أولًا.' } };
      if (!A.verifyTotp(row.totp_secret, b.code)) return { error: { status: 400, code: 'bad_code', message: 'الرمز غير صحيح.' } };
      db.prepare('UPDATE users SET totp_enabled = 1 WHERE id = ?').run(r.user.id);
      A.audit(db, r.user, 'owner.totp.enable', 'user', r.user.id, null, ipOf(req));
      return { ok: true };
    },
    'POST /api/auth/password': async (req) => {
      const u = currentUser(req);
      if (!u) return { error: { status: 401, code: 'auth_required', message: 'سجّل الدخول أولًا.' } };
      const b = await readBody(req);
      const row = db.prepare('SELECT * FROM users WHERE id = ?').get(u.id);
      if (!row || !A.verifyPassword(S(b.current), row.password_hash, row.password_salt)) {
        return { error: { status: 400, code: 'bad_current', message: 'كلمة المرور الحالية غير صحيحة.' } };
      }
      if (S(b.next).length < 8) return { error: { status: 400, code: 'weak_password', message: 'كلمة المرور الجديدة 8 أحرف على الأقل.' } };
      const { hash, salt } = A.hashPassword(S(b.next));
      db.prepare('UPDATE users SET password_hash = ?, password_salt = ? WHERE id = ?').run(hash, salt, u.id);
      A.audit(db, u, 'auth.password.change', 'user', u.id, null, ipOf(req));
      return { ok: true };
    },

    /* ================= التاجر ================= */
    'GET /api/merchant/overview': (req) => {
      const r = requireRole(req, 'merchant'); if (r.error) return r;
      const u = r.user;
      const projects = db.prepare('SELECT * FROM projects WHERE owner_id = ? AND archived_at IS NULL ORDER BY created_at').all(u.id);
      const prods = [];
      projects.forEach((p) => {
        db.prepare('SELECT * FROM products WHERE project_id = ?').all(p.id).forEach((x) => prods.push({ ...x, projectName: p.name }));
      });
      const computed = prods.filter((p) => p.unit_cost != null);
      const sorted = computed.slice().sort((a, b) => (b.margin || 0) - (a.margin || 0));
      return {
        ok: true,
        user: { name: u.name, email: u.email },
        projects: projects.map((p) => ({
          id: p.id, name: p.name, activityKey: p.activity_key, startMode: p.start_mode, createdAt: p.created_at,
          categories: db.prepare('SELECT COUNT(*) n FROM categories WHERE project_id = ?').get(p.id).n,
          products: db.prepare('SELECT COUNT(*) n FROM products WHERE project_id = ?').get(p.id).n
        })),
        totals: {
          projects: projects.length,
          categories: db.prepare(`SELECT COUNT(*) n FROM categories WHERE project_id IN (SELECT id FROM projects WHERE owner_id = ?)`).get(u.id).n,
          products: prods.length,
          computed: computed.length,
          avgUnitCost: computed.length ? Math.round((computed.reduce((a, p) => a + (p.unit_cost || 0), 0) / computed.length) * 100) / 100 : null,
          avgMargin: computed.length ? Math.round((computed.reduce((a, p) => a + (p.margin || 0), 0) / computed.length) * 10) / 10 : null
        },
        topMargins: sorted.slice(0, 5).map((p) => ({ id: p.id, projectId: p.project_id, name: p.name, margin: p.margin, unitCost: p.unit_cost, sellPrice: p.sell_price })),
        needsReview: prods.filter((p) => p.unit_cost == null || p.status === 'draft').slice(0, 5).map((p) => ({ id: p.id, projectId: p.project_id, name: p.name })),
        recent: prods.sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at))).slice(0, 5)
          .map((p) => ({ id: p.id, projectId: p.project_id, name: p.name, updatedAt: p.updated_at, status: p.status }))
      };
    },
    'GET /api/merchant/projects': (req) => {
      const r = requireRole(req, 'merchant'); if (r.error) return r;
      const rows = db.prepare('SELECT * FROM projects WHERE owner_id = ? ORDER BY created_at').all(r.user.id);
      return { ok: true, projects: rows.map((p) => projectPayload(r.user, p)) };
    },
    'POST /api/merchant/projects': async (req) => {
      const r = requireRole(req, 'merchant'); if (r.error) return r;
      const b = await readBody(req);
      const name = S(b.name).trim();
      if (name.length < 2) return { error: { status: 400, code: 'bad_name', message: 'اسم المشروع مطلوب.' } };
      const mode = ['single', 'category', 'full'].includes(b.startMode) ? b.startMode : 'single';
      const id = require('crypto').randomUUID();
      db.prepare('INSERT INTO projects(id,owner_id,name,activity_key,start_mode,created_at) VALUES(?,?,?,?,?,?)')
        .run(id, r.user.id, name, S(b.activityKey) || null, mode, new Date().toISOString());
      A.audit(db, r.user, 'merchant.project.create', 'project', id, { name, mode }, ipOf(req));
      return { ok: true, project: projectPayload(r.user, ownedProject(r.user, id)) };
    },    'PATCH /api/merchant/projects/:pid': async (req, params) => {
      const r = requireRole(req, 'merchant'); if (r.error) return r;
      const p = ownedProject(r.user, params.pid);
      if (!p) return { error: { status: 404, code: 'not_found', message: 'المشروع غير موجود.' } };
      const b = await readBody(req);
      if (b.name != null) db.prepare('UPDATE projects SET name = ? WHERE id = ?').run(S(b.name).trim().slice(0, 80), p.id);
      if (b.activityKey != null) db.prepare('UPDATE projects SET activity_key = ? WHERE id = ?').run(S(b.activityKey), p.id);
      if (b.archived === true) db.prepare('UPDATE projects SET archived_at = ? WHERE id = ?').run(new Date().toISOString(), p.id);
      if (b.archived === false) db.prepare('UPDATE projects SET archived_at = NULL WHERE id = ?').run(p.id);
      A.audit(db, r.user, 'merchant.project.update', 'project', p.id, b, ipOf(req));
      return { ok: true, project: projectPayload(r.user, ownedProject(r.user, p.id)) };
    },
    'POST /api/merchant/projects/:pid/categories': async (req, params) => {
      const r = requireRole(req, 'merchant'); if (r.error) return r;
      const p = ownedProject(r.user, params.pid);
      if (!p) return { error: { status: 404, code: 'not_found', message: 'المشروع غير موجود.' } };
      const b = await readBody(req);
      const name = S(b.name).trim();
      if (!name) return { error: { status: 400, code: 'bad_name', message: 'اسم التصنيف مطلوب.' } };
      const pos = db.prepare('SELECT COALESCE(MAX(position),0)+1 n FROM categories WHERE project_id = ?').get(p.id).n;
      const id = require('crypto').randomUUID();
      db.prepare('INSERT INTO categories(id,project_id,name,position,created_at) VALUES(?,?,?,?,?)').run(id, p.id, name, pos, new Date().toISOString());
      A.audit(db, r.user, 'merchant.category.create', 'category', id, { name }, ipOf(req));
      return { ok: true, project: projectPayload(r.user, p) };
    },
    'PATCH /api/merchant/categories/:cid': async (req, params) => {
      const r = requireRole(req, 'merchant'); if (r.error) return r;
      const c = db.prepare(`SELECT c.*, p.owner_id FROM categories c JOIN projects p ON p.id = c.project_id WHERE c.id = ?`).get(params.cid);
      if (!c || c.owner_id !== r.user.id) return { error: { status: 404, code: 'not_found', message: 'التصنيف غير موجود.' } };
      const b = await readBody(req);
      if (b.name != null) db.prepare('UPDATE categories SET name = ? WHERE id = ?').run(S(b.name).trim().slice(0, 60), c.id);
      if (b.position != null) db.prepare('UPDATE categories SET position = ? WHERE id = ?').run(Number(b.position) || 0, c.id);
      A.audit(db, r.user, 'merchant.category.update', 'category', c.id, b, ipOf(req));
      return { ok: true };
    },
    'DELETE /api/merchant/categories/:cid': (req, params) => {
      const r = requireRole(req, 'merchant'); if (r.error) return r;
      const c = db.prepare(`SELECT c.*, p.owner_id FROM categories c JOIN projects p ON p.id = c.project_id WHERE c.id = ?`).get(params.cid);
      if (!c || c.owner_id !== r.user.id) return { error: { status: 404, code: 'not_found', message: 'التصنيف غير موجود.' } };
      db.prepare('UPDATE products SET category_id = NULL WHERE category_id = ?').run(c.id);
      db.prepare('DELETE FROM categories WHERE id = ?').run(c.id);
      A.audit(db, r.user, 'merchant.category.delete', 'category', c.id, null, ipOf(req));
      return { ok: true };
    },
    'POST /api/merchant/projects/:pid/products': async (req, params) => {
      const r = requireRole(req, 'merchant'); if (r.error) return r;
      const p = ownedProject(r.user, params.pid);
      if (!p) return { error: { status: 404, code: 'not_found', message: 'المشروع غير موجود.' } };
      const b = await readBody(req);
      const name = S(b.name).trim();
      if (!name) return { error: { status: 400, code: 'bad_name', message: 'اسم المنتج مطلوب.' } };
      if (b.categoryId) {
        const cat = db.prepare('SELECT id FROM categories WHERE id = ? AND project_id = ?').get(b.categoryId, p.id);
        if (!cat) return { error: { status: 400, code: 'bad_category', message: 'التصنيف لا يخص هذا المشروع.' } };
      }
      const id = require('crypto').randomUUID();
      const t = new Date().toISOString();
      db.prepare('INSERT INTO products(id,project_id,category_id,name,catalog_product_id,status,state_json,updated_at,created_at) VALUES(?,?,?,?,?,?,?,?,?)')
        .run(id, p.id, b.categoryId || null, name, S(b.catalogProductId) || null, 'draft', '{}', t, t);
      A.audit(db, r.user, 'merchant.product.create', 'product', id, { name }, ipOf(req));
      return { ok: true, product: summarize(db.prepare('SELECT * FROM products WHERE id = ?').get(id)) };
    },
    'GET /api/merchant/products/:id': (req, params) => {
      const r = requireRole(req, 'merchant'); if (r.error) return r;
      const p = db.prepare(`SELECT pr.*, pj.owner_id, pj.name AS projectName FROM products pr JOIN projects pj ON pj.id = pr.project_id WHERE pr.id = ?`).get(params.id);
      if (!p || p.owner_id !== r.user.id) return { error: { status: 404, code: 'not_found', message: 'المنتج غير موجود.' } };
      return { ok: true, product: { ...summarize(p), projectId: p.project_id, projectName: p.projectName, state: JSON.parse(p.state_json || '{}') } };
    },
    'PUT /api/merchant/products/:id': async (req, params) => {
      const r = requireRole(req, 'merchant'); if (r.error) return r;
      const p = db.prepare(`SELECT pr.*, pj.owner_id FROM products pr JOIN projects pj ON pj.id = pr.project_id WHERE pr.id = ?`).get(params.id);
      if (!p || p.owner_id !== r.user.id) return { error: { status: 404, code: 'not_found', message: 'المنتج غير موجود.' } };
      const b = await readBody(req, 1200000);
      const state = b.state && typeof b.state === 'object' ? b.state : JSON.parse(p.state_json || '{}');
      const n = (v) => (v == null || !isFinite(Number(v)) ? null : Math.round(Number(v) * 100) / 100);
      db.prepare('UPDATE products SET name = ?, category_id = ?, status = ?, state_json = ?, unit_cost = ?, sell_price = ?, margin = ?, updated_at = ? WHERE id = ?')
        .run(S(b.name != null ? b.name : p.name).trim().slice(0, 80), b.categoryId !== undefined ? (b.categoryId || null) : p.category_id,
          ['draft', 'ready', 'archived'].includes(b.status) ? b.status : p.status,
          JSON.stringify(state), n(b.unitCost), n(b.sellPrice), n(b.margin), new Date().toISOString(), p.id);
      A.audit(db, r.user, 'merchant.product.update', 'product', p.id, { name: b.name, status: b.status }, ipOf(req));
      return { ok: true, product: summarize(db.prepare('SELECT * FROM products WHERE id = ?').get(p.id)) };
    },
    'DELETE /api/merchant/products/:id': (req, params) => {
      const r = requireRole(req, 'merchant'); if (r.error) return r;
      const p = db.prepare(`SELECT pr.*, pj.owner_id FROM products pr JOIN projects pj ON pj.id = pr.project_id WHERE pr.id = ?`).get(params.id);
      if (!p || p.owner_id !== r.user.id) return { error: { status: 404, code: 'not_found', message: 'المنتج غير موجود.' } };
      db.prepare('DELETE FROM products WHERE id = ?').run(p.id);
      A.audit(db, r.user, 'merchant.product.delete', 'product', p.id, null, ipOf(req));
      return { ok: true };
    },
    'GET /api/merchant/recipes': (req) => {
      const r = requireRole(req, 'merchant'); if (r.error) return r;
      const rows = db.prepare(`SELECT r.* FROM recipes r JOIN projects p ON p.id = r.project_id WHERE p.owner_id = ? ORDER BY r.created_at DESC`).all(r.user.id);
      return { ok: true, recipes: rows.map((x) => ({ id: x.id, projectId: x.project_id, name: x.name, items: JSON.parse(x.items_json), packaging: JSON.parse(x.packaging_json || '[]'), notes: x.notes, createdAt: x.created_at })) };
    },
    'POST /api/merchant/recipes': async (req) => {
      const r = requireRole(req, 'merchant'); if (r.error) return r;
      const b = await readBody(req);
      const p = ownedProject(r.user, b.projectId);
      if (!p) return { error: { status: 404, code: 'not_found', message: 'المشروع غير موجود.' } };
      const id = require('crypto').randomUUID();
      db.prepare('INSERT INTO recipes(id,project_id,name,items_json,packaging_json,notes,created_at) VALUES(?,?,?,?,?,?,?)')
        .run(id, p.id, S(b.name).trim().slice(0, 80) || 'وصفة', JSON.stringify(b.items || []), JSON.stringify(b.packaging || []), S(b.notes), new Date().toISOString());
      A.audit(db, r.user, 'merchant.recipe.create', 'recipe', id, { name: b.name }, ipOf(req));
      return { ok: true, id };
    },

    /* ================= اقتراحات التاجر (مراجعة إدارية أولًا) ================= */
    'POST /api/merchant/suggestions': async (req) => {
      const u = currentUser(req);
      const b = await readBody(req);
      const name = S(b.name).trim();
      if (name.length < 2) return { error: { status: 400, code: 'bad_name', message: 'اكتب اسم المكوّن.' } };
      const since = new Date(Date.now() - 864e5).toISOString();
      if (u && u.role === 'merchant') {
        const recent = db.prepare('SELECT COUNT(*) n FROM merchant_suggestions WHERE created_at > ? AND user_id = ?').get(since, u.id).n;
        if (recent >= 20) return { error: { status: 429, code: 'limit', message: 'تجاوزت حد الاقتراحات اليومي (٢٠).' } };
        if (db.prepare('SELECT id FROM merchant_suggestions WHERE user_id = ? AND name = ? AND status = ?').get(u.id, name, 'pending')) {
          return { error: { status: 409, code: 'duplicate', message: 'لديك اقتراح بنفس الاسم قيد المراجعة.' } };
        }
        db.prepare('INSERT INTO merchant_suggestions(user_id,name,unit,note,status,created_at) VALUES(?,?,?,?,?,?)')
          .run(u.id, name, S(b.unit) || 'g', S(b.note), 'pending', new Date().toISOString());
        A.audit(db, u, 'merchant.suggestion.create', 'merchant_suggestion', name, null, ipOf(req));
        return { ok: true, message: 'أُرسل للمراجعة.' };
      }
      return { ok: false, pending: 'سجّل الدخول ليُرسل اقتراحك للمراجعة الإدارية.' };
    },
    'GET /api/merchant/suggestions': (req) => {
      const u = currentUser(req);
      if (!u || u.role !== 'merchant') return { ok: true, rules: 'سجّل الدخول لعرض اقتراحاتك' };
      const rows = db.prepare('SELECT id,name,unit,status,reviewed_at,created_at FROM merchant_suggestions WHERE user_id = ? ORDER BY id DESC LIMIT 50').all(u.id);
      return { ok: true, rows };
    },
    'POST /api/merchant/report': async (req) => {
      const u = currentUser(req);
      const b = await readBody(req);
      const name = S(b.name).trim();
      if (!name) return { error: { status: 400, code: 'bad_request', message: 'حدّد الاقتراح.' } };
      const since = new Date(Date.now() - 864e5).toISOString();
      let recent = 0;
      try { recent = db.prepare('SELECT COUNT(*) n FROM suggestion_reports WHERE created_at > ? AND user_id = ?').get(since, u ? u.id : '').n; } catch (e) { recent = 0; }
      if (recent >= 10) return { error: { status: 429, code: 'limit', message: 'تجاوزت حد البلاغات اليومي.' } };
      db.prepare('INSERT INTO suggestion_reports(user_id,ing_key,name,reason,created_at) VALUES(?,?,?,?,?)')
        .run(u ? u.id : null, S(b.ingKey), name, S(b.reason).slice(0, 400), new Date().toISOString());
      A.audit(db, u || { id: null, role: 'visitor' }, 'merchant.report', 'suggestion_report', name, null, ipOf(req));
      return { ok: true };
    },
    /* ================= مكتبة التاجر الشخصية (مواده وأسعاره) ================= */
    'GET /api/merchant/usage': (req) => {
      const u = currentUser(req);
      if (!u || u.role !== 'merchant') return { ok: true, items: [] };
      const prods = db.prepare('SELECT pr.state_json FROM products pr JOIN projects pj ON pj.id = pr.project_id WHERE pj.owner_id = ?').all(u.id);
      const counts = new Map();
      prods.forEach((p) => {
        try {
          const st = JSON.parse(p.state_json || '{}');
          (Array.isArray(st.ingredients) ? st.ingredients : []).forEach((x) => {
            const n = String((x && x.name) || '').trim();
            if (n) counts.set(n, (counts.get(n) || 0) + 1);
          });
        } catch (e) {}
      });
      const items = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 40).map((e) => ({ name: e[0], count: e[1] }));
      return { ok: true, items };
    },
    'GET /api/merchant/items': (req, params) => {
      const r = requireRole(req, 'merchant'); if (r.error) return r;
      const q = S(params.q).trim();
      const rows = db.prepare('SELECT * FROM merchant_items WHERE user_id = ? ORDER BY name').all(r.user.id);
      const filtered = q ? rows.filter((x) => x.name.indexOf(q) > -1) : rows;
      return { ok: true, items: filtered.map((x) => ({ ...x, prices: db.prepare('SELECT at,price,pack,unit,supplier FROM merchant_item_prices WHERE item_id = ? ORDER BY id DESC LIMIT 5').all(x.id) })) };
    },    'POST /api/merchant/items': async (req) => {
      const r = requireRole(req, 'merchant'); if (r.error) return r;
      const b = await readBody(req);
      const name = S(b.name).trim();
      if (!name) return { error: { status: 400, code: 'bad_name', message: 'الاسم مطلوب.' } };
      const id = require('crypto').randomUUID();
      const t = new Date().toISOString();
      db.prepare('INSERT INTO merchant_items(id,user_id,library_key,name,unit,category,last_price,last_pack,supplier,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)')
        .run(id, r.user.id, S(b.libraryKey) || null, name, S(b.unit) || 'g', S(b.category) || null,
          Number(b.lastPrice) || null, Number(b.lastPack) || null, S(b.supplier) || null, t, t);
      if (Number(b.lastPrice) > 0) {
        db.prepare('INSERT INTO merchant_item_prices(item_id,at,price,pack,unit,supplier,note) VALUES(?,?,?,?,?,?,?)')
          .run(id, t, Number(b.lastPrice), Number(b.lastPack) || null, S(b.unit) || 'g', S(b.supplier) || null, 'أول شراء');
      }
      A.audit(db, r.user, 'merchant.item.create', 'merchant_item', id, { name }, ipOf(req));
      return { ok: true, item: { id, name } };
    },
    'PATCH /api/merchant/items/:id': async (req, params) => {
      const r = requireRole(req, 'merchant'); if (r.error) return r;
      const cur = db.prepare('SELECT * FROM merchant_items WHERE id = ? AND user_id = ?').get(params.id, r.user.id);
      if (!cur) return { error: { status: 404, code: 'not_found', message: 'المادة غير موجودة.' } };
      const b = await readBody(req);
      const t = new Date().toISOString();
      db.prepare('UPDATE merchant_items SET name=?, unit=?, category=?, supplier=?, last_price=?, last_pack=?, updated_at=? WHERE id=?')
        .run(S(b.name != null ? b.name : cur.name), S(b.unit != null ? b.unit : cur.unit), S(b.category != null ? b.category : cur.category),
          S(b.supplier != null ? b.supplier : cur.supplier), Number(b.lastPrice) || cur.last_price, Number(b.lastPack) || cur.last_pack, t, cur.id);
      if (Number(b.newPrice) > 0) {
        db.prepare('INSERT INTO merchant_item_prices(item_id,at,price,pack,unit,supplier,note) VALUES(?,?,?,?,?,?,?)')
          .run(cur.id, t, Number(b.newPrice), Number(b.newPack) || cur.last_pack, S(b.unit) || cur.unit, S(b.supplier) || cur.supplier, S(b.note) || 'شراء جديد');
      }
      A.audit(db, r.user, 'merchant.item.update', 'merchant_item', cur.id, { newPrice: b.newPrice || null }, ipOf(req));
      return { ok: true };
    },
    'GET /api/merchant/items/:id/history': (req, params) => {
      const r = requireRole(req, 'merchant'); if (r.error) return r;
      const cur = db.prepare('SELECT id,name FROM merchant_items WHERE id = ? AND user_id = ?').get(params.id, r.user.id);
      if (!cur) return { error: { status: 404, code: 'not_found', message: 'المادة غير موجودة.' } };
      return { ok: true, name: cur.name, rows: db.prepare('SELECT * FROM merchant_item_prices WHERE item_id = ? ORDER BY id DESC LIMIT 50').all(cur.id) };
    },
    'DELETE /api/merchant/items/:id': (req, params) => {
      const r = requireRole(req, 'merchant'); if (r.error) return r;
      const cur = db.prepare('SELECT id FROM merchant_items WHERE id = ? AND user_id = ?').get(params.id, r.user.id);
      if (!cur) return { error: { status: 404, code: 'not_found', message: 'المادة غير موجودة.' } };
      db.prepare('DELETE FROM merchant_items WHERE id = ?').run(cur.id);
      A.audit(db, r.user, 'merchant.item.delete', 'merchant_item', cur.id, null, ipOf(req));
      return { ok: true };
    },

    /* ================= المالك ================= */
    'GET /api/owner/stats': (req) => {
      const r = requireRole(req, 'owner'); if (r.error) return r;
      const n = (sql, ...args) => db.prepare(sql).get(...args).n;
      const since7 = new Date(Date.now() - 7 * 864e5).toISOString();
      const byActivity = db.prepare(`SELECT COALESCE(activity_key,'غير محدد') k, COUNT(*) n FROM projects GROUP BY activity_key ORDER BY n DESC LIMIT 6`).all();
      return {
        ok: true,
        merchants: n("SELECT COUNT(*) n FROM users WHERE role='merchant'"),
        newMerchants7d: n('SELECT COUNT(*) n FROM users WHERE role=\'merchant\' AND created_at > ?', since7),
        projects: n('SELECT COUNT(*) n FROM projects'),
        categories: n('SELECT COUNT(*) n FROM categories'),
        products: n('SELECT COUNT(*) n FROM products'),
        computed: n('SELECT COUNT(*) n FROM products WHERE unit_cost IS NOT NULL'),
        recipes: n('SELECT COUNT(*) n FROM recipes'),
        activitiesInUse: byActivity.map((x) => ({ key: x.k, count: x.n })),
        recentSignups: db.prepare('SELECT id,email,name,created_at FROM users WHERE role=\'merchant\' ORDER BY created_at DESC LIMIT 5').all(),
        aiCalls: n('SELECT COUNT(*) n FROM ai_logs'),
        aiErrors: n('SELECT COUNT(*) n FROM ai_logs WHERE ok = 0'),
        auditCount: n('SELECT COUNT(*) n FROM audit_log')
      };
    },
    'GET /api/owner/merchants': (req, params) => {
      const r = requireRole(req, 'owner'); if (r.error) return r;
      const q = '%' + S(params.q).trim() + '%';
      const rows = db.prepare(`SELECT u.id,u.email,u.name,u.status,u.created_at,u.last_login_at,
        (SELECT COUNT(*) FROM projects p WHERE p.owner_id = u.id) projects,
        (SELECT COUNT(*) FROM products pr JOIN projects p ON p.id = pr.project_id WHERE p.owner_id = u.id) products
        FROM users u WHERE u.role='merchant' AND (u.email LIKE ? OR u.name LIKE ?) ORDER BY u.created_at DESC LIMIT 100`).all(q, q);
      return { ok: true, merchants: rows };
    },
    'PATCH /api/owner/merchants/:id': async (req, params) => {
      const r = requireRole(req, 'owner'); if (r.error) return r;
      const b = await readBody(req);
      const u = db.prepare("SELECT * FROM users WHERE id = ? AND role='merchant'").get(params.id);
      if (!u) return { error: { status: 404, code: 'not_found', message: 'الحساب غير موجود.' } };
      if (b.status === 'active' || b.status === 'suspended') db.prepare('UPDATE users SET status = ? WHERE id = ?').run(b.status, u.id);
      if (b.status === 'suspended') db.prepare('DELETE FROM sessions WHERE user_id = ?').run(u.id);
      A.audit(db, r.user, 'owner.merchant.update', 'user', u.id, b, ipOf(req));
      return { ok: true };
    },
    'POST /api/owner/merchants/:id/notify': async (req, params) => {
      const r = requireRole(req, 'owner'); if (r.error) return r;
      const b = await readBody(req);
      const u = db.prepare("SELECT * FROM users WHERE id = ? AND role='merchant'").get(params.id);
      if (!u) return { error: { status: 404, code: 'not_found', message: 'الحساب غير موجود.' } };
      A.audit(db, r.user, 'owner.merchant.note', 'user', u.id, { note: S(b.note).slice(0, 400) }, ipOf(req));
      return { ok: true, note: 'سُجّلت الملاحظة في السجل — لا يوجد بريد فعلي مهيأ.' };
    },
    'GET /api/owner/catalog': (req) => {
      const r = requireRole(req, 'owner'); if (r.error) return r;
      return { ok: true, activities: db.prepare('SELECT * FROM catalog_activities ORDER BY position').all() };
    },
    'POST /api/owner/catalog/activities': async (req) => {
      const r = requireRole(req, 'owner'); if (r.error) return r;
      const b = await readBody(req);
      const key = S(b.key).trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
      const name = S(b.name).trim();
      if (!key || !name) return { error: { status: 400, code: 'bad_request', message: 'المفتاح والاسم مطلوبان.' } };
      const pos = db.prepare('SELECT COALESCE(MAX(position),0)+1 n FROM catalog_activities').get().n;
      db.prepare('INSERT INTO catalog_activities(key,name,icon,position,visible) VALUES(?,?,?,?,1)').run(key, name, S(b.icon), pos);
      A.audit(db, r.user, 'owner.activity.create', 'activity', key, { name }, ipOf(req));
      return { ok: true };
    },
    'PATCH /api/owner/catalog/activities/:key': async (req, params) => {
      const r = requireRole(req, 'owner'); if (r.error) return r;
      const b = await readBody(req);
      if (b.name != null) db.prepare('UPDATE catalog_activities SET name = ? WHERE key = ?').run(S(b.name), params.key);
      if (b.visible != null) db.prepare('UPDATE catalog_activities SET visible = ? WHERE key = ?').run(b.visible ? 1 : 0, params.key);
      A.audit(db, r.user, 'owner.activity.update', 'activity', params.key, b, ipOf(req));
      return { ok: true };
    },
    'POST /api/owner/catalog/categories': async (req) => {
      const r = requireRole(req, 'owner'); if (r.error) return r;
      const b = await readBody(req);
      const act = S(b.activityKey);
      if (!db.prepare('SELECT key FROM catalog_activities WHERE key = ?').get(act)) return { error: { status: 400, code: 'bad_activity', message: 'النشاط غير موجود.' } };
      const id = act + ':' + S(b.id || '').trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
      if (!S(b.name).trim()) return { error: { status: 400, code: 'bad_request', message: 'اسم التصنيف مطلوب.' } };
      db.prepare('INSERT OR REPLACE INTO catalog_categories(id,activity_key,name,position,visible) VALUES(?,?,?,?,1)').run(id, act, S(b.name), Date.now() % 100000);
      A.audit(db, r.user, 'owner.category.create', 'category', id, { name: b.name }, ipOf(req));
      return { ok: true, id };
    },
    'GET /api/owner/catalog/suggestions': (req, params) => {
      const r = requireRole(req, 'owner'); if (r.error) return r;
      const key = S(params.key);
      const rows = db.prepare('SELECT * FROM catalog_suggestions WHERE ing_key = ? ORDER BY position').all(key);
      return { ok: true, items: rows };
    },
    'POST /api/owner/catalog/suggestions': async (req) => {
      const r = requireRole(req, 'owner'); if (r.error) return r;
      const b = await readBody(req);
      const key = S(b.ingKey); const name = S(b.name).trim();
      if (!key || !name) return { error: { status: 400, code: 'bad_request', message: 'المفتاح والاسم مطلوبان.' } };
      // التقاط التكرار: نفس الاسم لنفس المفتاح
      const dup = db.prepare('SELECT id FROM catalog_suggestions WHERE ing_key = ? AND name = ?').get(key, name);
      if (dup) return { error: { status: 409, code: 'duplicate', message: 'هذا الاقتراح موجود لهذا المنتج.' } };
      const pos = db.prepare('SELECT COALESCE(MAX(position),0)+1 n FROM catalog_suggestions WHERE ing_key = ?').get(key).n;
      db.prepare('INSERT INTO catalog_suggestions(ing_key,name,kind,unit,position) VALUES(?,?,?,?,?)')
        .run(key, name, ['core', 'extra', 'optional', 'packaging'].includes(b.kind) ? b.kind : 'core', S(b.unit) || null, pos);
      A.audit(db, r.user, 'owner.suggestion.create', 'suggestion', key, { name }, ipOf(req));
      return { ok: true };
    },
    'PATCH /api/owner/catalog/suggestions/:id': async (req, params) => {
      const r = requireRole(req, 'owner'); if (r.error) return r;
      const b = await readBody(req);
      const cur = db.prepare('SELECT * FROM catalog_suggestions WHERE id = ?').get(Number(params.id));
      if (!cur) return { error: { status: 404, code: 'not_found', message: 'الاقتراح غير موجود.' } };
      db.prepare('UPDATE catalog_suggestions SET name = ?, kind = ?, unit = ?, position = ? WHERE id = ?')
        .run(S(b.name != null ? b.name : cur.name).trim() || cur.name,
          ['core', 'extra', 'optional', 'packaging'].includes(b.kind) ? b.kind : cur.kind,
          S(b.unit != null ? b.unit : cur.unit) || null,
          b.position != null ? Number(b.position) || 0 : cur.position, cur.id);
      A.audit(db, r.user, 'owner.suggestion.update', 'suggestion', cur.id, b, ipOf(req));
      return { ok: true };
    },
    /* ---------- مكتبة المكونات العامة (CRUD + بحث + تصدير/استيراد) ---------- */
    'GET /api/owner/library': (req, params) => {
      const r = requireRole(req, 'owner'); if (r.error) return r;
      const q = '%' + S(params.q).trim() + '%';
      const rows = db.prepare(`SELECT * FROM library_items WHERE (? = '%%' OR name LIKE ? OR en_name LIKE ?) ORDER BY category, name LIMIT 400`).all(q, q, q);
      return { ok: true, items: rows };
    },
    'POST /api/owner/library': async (req) => {
      const r = requireRole(req, 'owner'); if (r.error) return r;
      const b = await readBody(req);
      const name = S(b.name).trim(); if (!name) return { error: { status: 400, code: 'bad_request', message: 'الاسم مطلوب.' } };
      const key = S(b.key).trim().toLowerCase() || name.replace(/\s+/g, '_');
      if (db.prepare('SELECT key FROM library_items WHERE key = ? OR name = ?').get(key, name)) {
        return { error: { status: 409, code: 'duplicate', message: 'هذا المكوّن موجود بالفعل.' } };
      }
      db.prepare('INSERT INTO library_items(key,name,en_name,cls,category,default_unit,notes,active,created_at) VALUES(?,?,?,?,?,?,?,?,?)')
        .run(key, name, S(b.enName) || null, ['ingredient', 'extra', 'packaging', 'tool'].includes(b.cls) ? b.cls : 'ingredient',
          S(b.category) || 'مواد خام', S(b.defaultUnit) || 'g', S(b.notes) || null, 1, new Date().toISOString());
      A.audit(db, r.user, 'owner.library.create', 'library', key, { name }, ipOf(req));
      return { ok: true, key };
    },
    'PATCH /api/owner/library/:key': async (req, params) => {
      const r = requireRole(req, 'owner'); if (r.error) return r;
      const b = await readBody(req);
      const cur = db.prepare('SELECT * FROM library_items WHERE key = ?').get(params.key);
      if (!cur) return { error: { status: 404, code: 'not_found', message: 'المكوّن غير موجود.' } };
      db.prepare('UPDATE library_items SET name=?, en_name=?, cls=?, category=?, default_unit=?, notes=?, active=? WHERE key=?')
        .run(S(b.name != null ? b.name : cur.name).trim() || cur.name, S(b.enName != null ? b.enName : cur.en_name) || null,
          ['ingredient', 'extra', 'packaging', 'tool'].includes(b.cls) ? b.cls : cur.cls,
          S(b.category != null ? b.category : cur.category) || cur.category,
          S(b.defaultUnit != null ? b.defaultUnit : cur.default_unit) || cur.default_unit,
          S(b.notes != null ? b.notes : cur.notes) || null,
          b.active != null ? (b.active ? 1 : 0) : cur.active, cur.key);
      A.audit(db, r.user, 'owner.library.update', 'library', cur.key, b, ipOf(req));
      return { ok: true };
    },
    'DELETE /api/owner/library/:key': (req, params) => {
      const r = requireRole(req, 'owner'); if (r.error) return r;
      // لا حذف فعلي: تعطيل حتى تبقى الاقتراحات المرتبطة سليمة
      db.prepare('UPDATE library_items SET active = 0 WHERE key = ?').run(params.key);
      A.audit(db, r.user, 'owner.library.disable', 'library', params.key, null, ipOf(req));
      return { ok: true, note: 'عُطّل المكوّن (لم يُحذف حفاظًا على الاقتراحات)' };
    },
    /* دمج مكوّنين مكررين: تُنقل الاقتراحات من القديم إلى الجديد ثم يُعطَّل القديم */
    'POST /api/owner/library/merge': async (req) => {
      const r = requireRole(req, 'owner'); if (r.error) return r;
      const b = await readBody(req);
      const from = S(b.from); const to = S(b.to);
      if (!from || !to || from === to) return { error: { status: 400, code: 'bad_request', message: 'حدّد مكوّنين مختلفين.' } };
      const src = db.prepare('SELECT * FROM library_items WHERE key = ?').get(from);
      const dst = db.prepare('SELECT * FROM library_items WHERE key = ?').get(to);
      if (!src || !dst) return { error: { status: 404, code: 'not_found', message: 'أحد المكوّنين غير موجود.' } };
      const res = db.prepare('UPDATE catalog_suggestions SET name = ? WHERE name = ?').run(dst.name, src.name);
      db.prepare('UPDATE library_items SET active = 0 WHERE key = ?').run(src.key);
      A.audit(db, r.user, 'owner.library.merge', 'library', src.key, { into: dst.name, suggestions: res.changes }, ipOf(req));
      return { ok: true, moved: res.changes };
    },
    'GET /api/owner/library/export': (req) => {
      const r = requireRole(req, 'owner'); if (r.error) return r;
      const items = db.prepare('SELECT key,name,en_name,cls,category,default_unit FROM library_items ORDER BY category, name').all();
      const suggestions = db.prepare('SELECT ing_key,name,kind,unit,position FROM catalog_suggestions ORDER BY ing_key, position').all();
      return { ok: true, exportedAt: new Date().toISOString(), items, suggestions };
    },
    'POST /api/owner/library/import': async (req) => {
      const r = requireRole(req, 'owner'); if (r.error) return r;
      const b = await readBody(req, 2000000);
      const items = Array.isArray(b.items) ? b.items : [];
      const suggestions = Array.isArray(b.suggestions) ? b.suggestions : [];
      if (!items.length && !suggestions.length) return { error: { status: 400, code: 'bad_request', message: 'الملف لا يحتوي بيانات.' } };
      const bk = opts.makeBackup();
      const t = new Date().toISOString();
      const insItem = db.prepare('INSERT OR IGNORE INTO library_items(key,name,en_name,cls,category,default_unit,active,created_at) VALUES(?,?,?,?,?,?,1,?)');
      const insSug = db.prepare('INSERT INTO catalog_suggestions(ing_key,name,kind,unit,position) SELECT ?,?,?,?,? WHERE NOT EXISTS (SELECT 1 FROM catalog_suggestions WHERE ing_key = ? AND name = ?)');
      let nI = 0; let nS = 0;
      items.forEach((x) => { if (x && x.name) { insItem.run(S(x.key || x.name.toLowerCase().replace(/\s+/g, '_')), S(x.name), S(x.en_name) || null, S(x.cls) || 'ingredient', S(x.category) || 'مواد خام', S(x.default_unit) || 'g', t); nI++; } });
      suggestions.forEach((x) => { if (x && x.name && x.ing_key) { insSug.run(S(x.ing_key), S(x.name), S(x.kind) || 'core', S(x.unit) || null, Number(x.position) || 0, S(x.ing_key), S(x.name)); nS++; } });
      db.prepare('INSERT INTO catalog_imports(at,by_user,kind,summary,backup_name) VALUES(?,?,?,?,?)')
        .run(new Date().toISOString(), r.user.id, 'import', nI + ' مكوّن، ' + nS + ' اقتراح', bk ? bk.name : null);
      A.audit(db, r.user, 'owner.library.import', 'library', 'import', { items: nI, suggestions: nS }, ipOf(req));
      return { ok: true, items: nI, suggestions: nS, backup: bk };
    },
    'GET /api/owner/imports': (req) => {
      const r = requireRole(req, 'owner'); if (r.error) return r;
      return { ok: true, rows: db.prepare('SELECT * FROM catalog_imports ORDER BY id DESC LIMIT 20').all() };
    },
    /* ---------- مراجعة اقتراحات التجار والبلاغات ---------- */
    'GET /api/owner/suggestions-review': (req) => {
      const r = requireRole(req, 'owner'); if (r.error) return r;
      return {
        ok: true,
        pending: db.prepare(`SELECT m.*, u.email FROM merchant_suggestions m LEFT JOIN users u ON u.id = m.user_id
          WHERE m.status = 'pending' ORDER BY m.id DESC LIMIT 100`).all(),
        reports: db.prepare('SELECT * FROM suggestion_reports WHERE resolved = 0 ORDER BY id DESC LIMIT 100').all()
      };
    },
    'PATCH /api/owner/suggestions-review/:id': async (req, params) => {
      const r = requireRole(req, 'owner'); if (r.error) return r;
      const b = await readBody(req);
      const row = db.prepare('SELECT * FROM merchant_suggestions WHERE id = ?').get(Number(params.id));
      if (!row) return { error: { status: 404, code: 'not_found', message: 'الاقتراح غير موجود.' } };
      const decision = b.status === 'approved' ? 'approved' : 'rejected';
      db.prepare('UPDATE merchant_suggestions SET status = ?, reviewed_by = ?, reviewed_at = ? WHERE id = ?')
        .run(decision, r.user.id, new Date().toISOString(), row.id);
      if (decision === 'approved' && b.ingKey) {
        const pos = db.prepare('SELECT COALESCE(MAX(position),0)+1 n FROM catalog_suggestions WHERE ing_key = ?').get(b.ingKey).n;
        db.prepare('INSERT INTO catalog_suggestions(ing_key,name,kind,unit,position) VALUES(?,?,?,?,?)')
          .run(S(b.ingKey), row.name, 'optional', row.unit || null, pos);
      }
      A.audit(db, r.user, 'owner.suggestion.review', 'merchant_suggestion', row.id, { decision, ingKey: b.ingKey || null }, ipOf(req));
      return { ok: true };
    },
    'PATCH /api/owner/reports/:id': (req, params) => {
      const r = requireRole(req, 'owner'); if (r.error) return r;
      db.prepare('UPDATE suggestion_reports SET resolved = 1 WHERE id = ?').run(Number(params.id));
      A.audit(db, r.user, 'owner.report.resolve', 'suggestion_report', params.id, null, ipOf(req));
      return { ok: true };
    },
    'DELETE /api/owner/catalog/suggestions/:id': (req, params) => {
      const r = requireRole(req, 'owner'); if (r.error) return r;
      db.prepare('DELETE FROM catalog_suggestions WHERE id = ?').run(Number(params.id));
      A.audit(db, r.user, 'owner.suggestion.delete', 'suggestion', params.id, null, ipOf(req));
      return { ok: true };
    },
    'GET /api/owner/ai': (req) => {
      const r = requireRole(req, 'owner'); if (r.error) return r;
      return {
        ok: true,
        configured: !!opts.aiConfigured(),
        settings: db.prepare('SELECT * FROM ai_settings ORDER BY kind').all(),
        logs: db.prepare('SELECT * FROM ai_logs ORDER BY id DESC LIMIT 50').all()
      };
    },
    'PATCH /api/owner/ai/:kind': async (req, params) => {
      const r = requireRole(req, 'owner'); if (r.error) return r;
      const b = await readBody(req);
      const cur = db.prepare('SELECT * FROM ai_settings WHERE kind = ?').get(params.kind);
      if (!cur) return { error: { status: 404, code: 'not_found', message: 'إعداد غير موجود.' } };
      db.prepare('UPDATE ai_settings SET model=?, temperature=?, enabled=?, max_tokens=?, system_note=?, updated_at=? WHERE kind=?')
        .run(S(b.model != null ? b.model : cur.model), Number(b.temperature != null ? b.temperature : cur.temperature),
          Number(b.enabled != null ? (b.enabled ? 1 : 0) : cur.enabled), Number(b.maxTokens != null ? b.maxTokens : cur.max_tokens),
          S(b.systemNote != null ? b.systemNote : cur.system_note), new Date().toISOString(), params.kind);
      A.audit(db, r.user, 'owner.ai.update', 'ai_setting', params.kind, b, ipOf(req));
      return { ok: true };
    },
    'GET /api/owner/price-sources': (req) => {
      const r = requireRole(req, 'owner'); if (r.error) return r;
      return { ok: true, sources: db.prepare('SELECT * FROM price_sources ORDER BY id').all() };
    },
    'PATCH /api/owner/price-sources/:id': async (req, params) => {
      const r = requireRole(req, 'owner'); if (r.error) return r;
      const b = await readBody(req);
      db.prepare('UPDATE price_sources SET enabled = ? WHERE id = ?').run(b.enabled ? 1 : 0, params.id);
      A.audit(db, r.user, 'owner.price-source.update', 'price_source', params.id, b, ipOf(req));
      return { ok: true };
    },
    'GET /api/owner/content': (req) => {
      const r = requireRole(req, 'owner'); if (r.error) return r;
      const rows = db.prepare('SELECT * FROM site_content ORDER BY key').all();
      const theme = db.prepare('SELECT * FROM theme_settings').all().reduce((a, x) => (a[x.key] = x.value, a), {});
      return { ok: true, content: rows, theme };
    },
    'PUT /api/owner/content/:key': async (req, params) => {
      const r = requireRole(req, 'owner'); if (r.error) return r;
      const b = await readBody(req);
      db.prepare('INSERT INTO site_content(key,value,updated_by,updated_at) VALUES(?,?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_by=excluded.updated_by,updated_at=excluded.updated_at')
        .run(params.key, S(b.value), r.user.id, new Date().toISOString());
      A.audit(db, r.user, 'owner.content.update', 'site_content', params.key, null, ipOf(req));
      return { ok: true };
    },
    'PUT /api/owner/theme': async (req) => {
      const r = requireRole(req, 'owner'); if (r.error) return r;
      const b = await readBody(req);
      const allowed = ['primary', 'paper', 'ink', 'headingFont', 'showMethod', 'showLimits', 'logoText'];
      const st = db.prepare('INSERT INTO theme_settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value');
      Object.keys(b || {}).forEach((k) => { if (allowed.includes(k)) st.run(k, S(b[k])); });
      A.audit(db, r.user, 'owner.theme.update', 'theme', 'all', b, ipOf(req));
      return { ok: true };
    },
    'GET /api/owner/audit': (req, params) => {
      const r = requireRole(req, 'owner'); if (r.error) return r;
      const limit = Math.min(300, Number(params.limit) || 100);
      const rows = db.prepare(`SELECT a.*, COALESCE(u.email,'system') actor_email FROM audit_log a LEFT JOIN users u ON u.id = a.actor_id ORDER BY a.id DESC LIMIT ?`).all(limit);
      return { ok: true, rows };
    },
    'GET /api/owner/attempts': (req) => {
      const r = requireRole(req, 'owner'); if (r.error) return r;
      return { ok: true, rows: db.prepare('SELECT * FROM login_attempts ORDER BY id DESC LIMIT 100').all() };
    },
    'POST /api/owner/backup': (req) => {
      const r = requireRole(req, 'owner'); if (r.error) return r;
      const b = opts.makeBackup();
      if (b) {
        db.prepare('INSERT INTO backups(at,path,bytes,by_user) VALUES(?,?,?,?)').run(new Date().toISOString(), b.name, b.bytes, r.user.id);
        A.audit(db, r.user, 'owner.backup.create', 'backup', b.name, { bytes: b.bytes }, ipOf(req));
      }
      return { ok: !!b, backup: b };
    },
    'GET /api/owner/backups': (req) => {
      const r = requireRole(req, 'owner'); if (r.error) return r;
      return { ok: true, rows: db.prepare('SELECT * FROM backups ORDER BY id DESC LIMIT 30').all() };
    }
  };

  /* ---------- تطابق مسار مرن ---------- */
  function match(method, pathname) {
    const key = method + ' ' + pathname;
    if (routes[key]) return { handler: routes[key], params: {} };
    for (const route of Object.keys(routes)) {
      const [m, p] = route.split(' ');
      if (m !== method) continue;
      if (p.indexOf(':') === -1) continue;
      const rSeg = p.split('/');
      const uSeg = pathname.split('/');
      if (rSeg.length !== uSeg.length) continue;
      const params = {};
      let ok = true;
      for (let i = 0; i < rSeg.length; i++) {
        if (rSeg[i].startsWith(':')) params[rSeg[i].slice(1)] = decodeURIComponent(uSeg[i]);
        else if (rSeg[i] !== uSeg[i]) { ok = false; break; }
      }
      if (ok) return { handler: routes[route], params };
    }
    return null;
  }

  /* ---------- تطابق مسار ثابت + كويري ----------
     ملاحظة: كان يُمرَّر URLSearchParams بدل params فيُفقد المعامل ثم يرمي
     خطأً يصل للعميل كخطأ خادم. الآن نُحوّل كويري إلى params صريحة. */
  function matchWithQuery(method, url) {
    const pathname = url.pathname.replace(/\/+$/, '') || '/';
    const hit = match(method, pathname);
    if (!hit) return null;
    const params = Object.assign({}, hit.params);
    url.searchParams.forEach((v, k) => { if (params[k] === undefined) params[k] = v; });
    return { handler: hit.handler, params, pathname };
  }

  async function handle(req, res) {
    const url = new URL(req.url, 'http://localhost');
    const hit = matchWithQuery(req.method, url);
    if (!hit) return json(res, 404, { ok: false, code: 'not_found', message: 'مسار غير موجود.' });
    try {
      const result = await hit.handler(req, hit.params);
      if (result && result.error) {
        const e = result.error;
        return json(res, e.status || 400, { ok: false, code: e.code, message: e.message });
      }
      // مسارات قد تُرجع ok:false بنيّة صريحة (مثال: الذكاء غير مهيأ)
      if (result && result.ok === false) {
        const headers0 = {};
        return json(res, 200, result, headers0);
      }
      const headers = {};
      if (result && result.setCookie) { headers['Set-Cookie'] = result.setCookie; delete result.setCookie; }
      if (headers['Set-Cookie']) return json(res, 200, result, headers);
      return json(res, 200, result);
    } catch (e) {
      const code = String((e && e.message) || 'error');
      if (code === 'invalid_json' || code === 'body_too_large') return json(res, 400, { ok: false, code, message: 'صيغة الطلب غير صحيحة.' });
      opts.logError && opts.logError(e, hit.pathname);
      return json(res, 500, { ok: false, code: 'server_error', message: 'خطأ داخلي — سُجّل في سجل النظام.' });
    }
  }

  return {
    handle, currentUser, catalogTree, suggestionsFor,
    health(pathname) {
      if (pathname !== '/api/health') return null;
      const dbr = db;
      const n = (s) => { try { return dbr.prepare(s).get().n; } catch (e) { return 0; } };
      return {
        ok: true, platform: 'mirbah-open',
        activities: n('SELECT COUNT(*) n FROM catalog_activities'),
        categories: n('SELECT COUNT(*) n FROM catalog_categories'),
        products: n('SELECT COUNT(*) n FROM catalog_products'),
        suggestions: n('SELECT COUNT(*) n FROM catalog_suggestions'),
        merchants: n("SELECT COUNT(*) n FROM users WHERE role='merchant'"),
        owners: n("SELECT COUNT(*) n FROM users WHERE role='owner'")
      };
    }
  };
}

module.exports = { createApi, json, readBody };
