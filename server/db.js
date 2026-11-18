'use strict';
/* =============================================================
   مِرْباح — طبقة قاعدة البيانات (SQLite عبر node:sqlite)
   - بلا تبعيات خارجية.
   - تجهز الجداول، تبذر الكتالوج من data.js عند أول إقلاع،
     وتترك المؤشرات marquee بيانات حقيقية فقط.
   ============================================================= */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { DatabaseSync } = require('node:sqlite');

const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = process.env.MIRBAH_DB || path.join(DATA_DIR, 'mirbah.db');
const BACKUP_DIR = path.join(DATA_DIR, 'backups');

function ensureDirs() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

function open() {
  ensureDirs();
  const db = new DatabaseSync(DB_FILE);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');
  migrate(db);
  return db;
}

function backup(reason) {
  try {
    ensureDirs();
    if (!fs.existsSync(DB_FILE)) return null;
    const name = 'mirbah-' + new Date().toISOString().replace(/[:.]/g, '-') + '.db';
    const target = path.join(BACKUP_DIR, name);
    fs.copyFileSync(DB_FILE, target);
    return { name, bytes: fs.statSync(target).size, reason: reason || 'manual' };
  } catch (e) { return null; }
}

/* ---------------- الجداول ---------------- */
function migrate(db) {
  db.exec(`
  CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);

  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('owner','merchant')),
    status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','suspended')),
    password_hash TEXT NOT NULL, password_salt TEXT NOT NULL,
    totp_secret TEXT, totp_enabled INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL, last_login_at TEXT
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL, expires_at TEXT NOT NULL, last_seen_at TEXT NOT NULL,
    ip TEXT, ua TEXT, mfa INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL, activity_key TEXT, start_mode TEXT NOT NULL DEFAULT 'single',
    created_at TEXT NOT NULL, archived_at TEXT
  );

  CREATE TABLE IF NOT EXISTS categories (
    id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name TEXT NOT NULL, position INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    category_id TEXT REFERENCES categories(id) ON DELETE SET NULL,
    name TEXT NOT NULL, catalog_product_id TEXT,
    status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','ready','archived')),
    state_json TEXT NOT NULL DEFAULT '{}',
    unit_cost REAL, sell_price REAL, margin REAL,
    updated_at TEXT NOT NULL, created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS recipes (
    id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name TEXT NOT NULL, items_json TEXT NOT NULL, packaging_json TEXT NOT NULL DEFAULT '[]',
    notes TEXT, created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS catalog_activities (
    key TEXT PRIMARY KEY, name TEXT NOT NULL, icon TEXT, position INTEGER NOT NULL DEFAULT 0,
    visible INTEGER NOT NULL DEFAULT 1
  );
  CREATE TABLE IF NOT EXISTS catalog_categories (
    id TEXT PRIMARY KEY, activity_key TEXT NOT NULL, name TEXT NOT NULL,
    position INTEGER NOT NULL DEFAULT 0, visible INTEGER NOT NULL DEFAULT 1
  );
  CREATE TABLE IF NOT EXISTS catalog_products (
    id TEXT PRIMARY KEY, category_id TEXT NOT NULL, name TEXT NOT NULL, ing_key TEXT,
    visible INTEGER NOT NULL DEFAULT 1, position INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS catalog_suggestions (
    id INTEGER PRIMARY KEY AUTOINCREMENT, ing_key TEXT NOT NULL, name TEXT NOT NULL,
    kind TEXT NOT NULL DEFAULT 'core', unit TEXT, position INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS ingredient_library (
    id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, category TEXT,
    default_unit TEXT, notes TEXT, updated_by TEXT, updated_at TEXT NOT NULL
  );
  /* مكتبة المكونات العامة (المرجع) — id مفتاح نصي مشتق من الاسم اللاتيني/العربي */
  CREATE TABLE IF NOT EXISTS library_items (
    key TEXT PRIMARY KEY, name TEXT NOT NULL, en_name TEXT, cls TEXT NOT NULL DEFAULT 'ingredient',
    category TEXT, default_unit TEXT NOT NULL DEFAULT 'g', notes TEXT,
    active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL
  );
  /* اقتراحات التاجر (لا تدخل القاعدة العامة قبل مراجعة) */
  CREATE TABLE IF NOT EXISTS merchant_suggestions (
    id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL, unit TEXT, note TEXT, status TEXT NOT NULL DEFAULT 'pending'
      CHECK(status IN ('pending','approved','rejected')),
    reviewed_by TEXT, reviewed_at TEXT, created_at TEXT NOT NULL
  );
  /* بلاغ عن اقتراح غير مناسب */
  CREATE TABLE IF NOT EXISTS suggestion_reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT, ing_key TEXT, name TEXT,
    reason TEXT, created_at TEXT NOT NULL, resolved INTEGER NOT NULL DEFAULT 0
  );
  /* مكتبة التاجر الشخصية + سجل أسعاره */
  CREATE TABLE IF NOT EXISTS merchant_items (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    library_key TEXT, name TEXT NOT NULL, unit TEXT NOT NULL, category TEXT,
    last_price REAL, last_pack REAL, supplier TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS merchant_item_prices (
    id INTEGER PRIMARY KEY AUTOINCREMENT, item_id TEXT NOT NULL REFERENCES merchant_items(id) ON DELETE CASCADE,
    at TEXT NOT NULL, price REAL NOT NULL, pack REAL, unit TEXT, supplier TEXT, product_id TEXT, note TEXT
  );
  /* مقارنة الأسعار والاستيراد/التصدير */
  CREATE TABLE IF NOT EXISTS catalog_imports (
    id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT NOT NULL, by_user TEXT, kind TEXT,
    summary TEXT, backup_name TEXT
  );

  CREATE TABLE IF NOT EXISTS price_sources (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, url TEXT NOT NULL, kind TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1, notes TEXT, last_ok_at TEXT, last_error TEXT
  );

  CREATE TABLE IF NOT EXISTS ai_settings (
    kind TEXT PRIMARY KEY, model TEXT, temperature REAL NOT NULL DEFAULT 0.3,
    enabled INTEGER NOT NULL DEFAULT 1, max_tokens INTEGER, system_note TEXT, updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS ai_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT NOT NULL, merchant_id TEXT, kind TEXT,
    model TEXT, ok INTEGER NOT NULL, latency_ms INTEGER, error TEXT
  );

  CREATE TABLE IF NOT EXISTS site_content (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_by TEXT, updated_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS theme_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT NOT NULL, actor_id TEXT, actor_role TEXT,
    action TEXT NOT NULL, entity TEXT, entity_id TEXT, meta_json TEXT, ip TEXT
  );
  CREATE TABLE IF NOT EXISTS login_attempts (
    id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT NOT NULL, email TEXT, ip TEXT,
    ok INTEGER NOT NULL, reason TEXT
  );
  CREATE TABLE IF NOT EXISTS backups (id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT NOT NULL, path TEXT, bytes INTEGER, by_user TEXT);

  CREATE INDEX IF NOT EXISTS idx_projects_owner ON projects(owner_id);
  CREATE INDEX IF NOT EXISTS idx_products_project ON products(project_id);
  CREATE INDEX IF NOT EXISTS idx_categories_project ON categories(project_id);
  CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
  `);
  // ترقية آمنة للقواعد القديمة (إضافة أعمدة ناقصة دون فقدان)
  try {
    const cols = db.prepare('PRAGMA table_info(sessions)').all().map((c) => c.name);
    if (!cols.includes('mfa')) db.exec('ALTER TABLE sessions ADD COLUMN mfa INTEGER NOT NULL DEFAULT 0');
  } catch (e) {}
}

const nowIso = () => new Date().toISOString();
const uid = () => crypto.randomUUID();

/* ---------------- بذر الكتالوج (مرة واحدة) ----------------
   يُستدعى من server.js بعد import ملف الـESM وإرساله عبر MIRBAH_CATALOG_ACTIVITIES. */
function seedCatalog(db) {
  const flag = db.prepare("SELECT value FROM meta WHERE key = 'catalog_seeded'").get();
  if (flag && flag.value === '1') return { seeded: false };

  const { RECIPES, BY_DOMAIN } = require('./seed-suggestions.js');
  let D = null;
  let seedErr = null;
  try {
    if (global.__MIRBAH_DOMAINS__ && Array.isArray(global.__MIRBAH_DOMAINS__)) {
      D = { DOMAINS: global.__MIRBAH_DOMAINS__ };
    } else {
      seedErr = 'لم تُرسل شجرة الكتالوج (catalog-esm); التشغيل يجب أن يبدأ من server.js';
    }
  } catch (e) { seedErr = 'خطأ في قراءة الكتالوج: ' + (e && e.message); D = null; }

  backup('before-catalog-seed');
  if (D && Array.isArray(D.DOMAINS)) {
    const ia = db.prepare('INSERT OR REPLACE INTO catalog_activities(key,name,icon,position,visible) VALUES(?,?,?,?,1)');
    const ic = db.prepare('INSERT OR REPLACE INTO catalog_categories(id,activity_key,name,position,visible) VALUES(?,?,?,?,1)');
    const ip = db.prepare('INSERT OR REPLACE INTO catalog_products(id,category_id,name,ing_key,visible,position) VALUES(?,?,?,?,1,?)');
    D.DOMAINS.forEach((dom, di) => {
      ia.run(dom.id, dom.name, dom.icon || '', di);
      (dom.subcategories || []).forEach((sc, si) => {
        ic.run(dom.id + ':' + sc.id, dom.id, sc.name, si);
        (sc.products || []).forEach((p, pi) => ip.run(dom.id + ':' + sc.id + ':' + p.id, dom.id + ':' + sc.id, p.name, p.id, pi));
      });
    });
  } else {
    return { seeded: false, error: seedErr || 'الكتالوج لم يُبذر' };
  }
  // الاقتراحات تُضاف مرة واحدة فقط (مفتاح فريد على ing_key+name)
  const isg = db.prepare("INSERT OR IGNORE INTO catalog_suggestions(ing_key,name,kind,unit,position) VALUES(?,?,?,?,?)");
  Object.keys(RECIPES).forEach((k) => RECIPES[k].forEach((x, i) => isg.run(k, x.name, x.kind, x.unit || null, i)));
  Object.keys(BY_DOMAIN).forEach((k) => BY_DOMAIN[k].forEach((x, i) => isg.run('domain:' + k, x.name, x.kind, x.unit || null, i)));
  db.prepare("INSERT OR REPLACE INTO meta(key,value) VALUES('catalog_seeded','1')").run();
  return { seeded: true, activities: (db.prepare('SELECT COUNT(*) AS n FROM catalog_activities').get() || {}).n };
}

/* ---------------- بذر مكتبة المكونات العامة ---------------- */
const CATEGORY_OF = (cls) => ({
  ingredient: 'مواد خام', extra: 'إضافات وحشوات', packaging: 'تغليف وتقديم', tool: 'أدوات ومستهلكات'
}[cls] || 'مواد خام');

function seedLibrary(db) {
  const flag = db.prepare("SELECT value FROM meta WHERE key = 'library_seeded_v2'").get();
  if (flag && flag.value === '1') return { seeded: false };
  const { LIB } = require('./data/ingredient-library.js');
  const ins = db.prepare(`INSERT OR REPLACE INTO library_items(key,name,en_name,cls,category,default_unit,notes,active,created_at)
    VALUES(?,?,?,?,?,?,?,1,?)`);
  const t = nowIso();
  let n = 0;
  Object.keys(LIB).forEach((k) => {
    const x = LIB[k];
    ins.run(k, x.name, x.en, x.cls, CATEGORY_OF(x.cls), x.unit, null, t);
    n++;
  });
  db.prepare("INSERT OR REPLACE INTO meta(key,value) VALUES('library_seeded_v2','1')").run();
  return { seeded: true, items: n };
}

/* ---------------- بذر ما تبقى ---------------- */
function seedBase(db) {
  const t = nowIso();
  const sources = [
    ['muwazin', 'موازن (Muwazin)', 'https://muwazin.me/', 'api', 1, 'API رسمي مدفوع — يحتاج مفتاحًا على الخادم'],
    ['hypesave', 'HypeSave', 'https://www.hype-save.com/en/prices/', 'link', 1, 'بحث يدوي — لا API معلن'],
    ['marker', 'Marker', 'https://marker.alriyadh.dev/en', 'link', 1, 'بحث يدوي — لا API معلن'],
    ['arksli', 'Arksli', 'https://arksli.com/en/basket', 'link', 1, 'بحث يدوي — لا API معلن']
  ];
  const ip = db.prepare('INSERT OR IGNORE INTO price_sources(id,name,url,kind,enabled,notes) VALUES(?,?,?,?,?,?)');
  sources.forEach((s) => ip.run(...s));

  const ai = [
    ['analyze', 'gemini-3.8-flash', 0.3, 1, 8192, 'تحليل النتائج — أرقام محسوبة فقط'],
    ['suggest', 'gemini-3.8-flash', 0.4, 1, 2048, 'اقتراح مكونات إضافية — لا يضيف إلا بموافقة التاجر'],
    ['price', 'gemini-3.8-flash', 0.2, 0, 512, 'فحص سعر تقديري — معطّل افتراضيًا']
  ];
  const ia = db.prepare("INSERT OR IGNORE INTO ai_settings(kind,model,temperature,enabled,max_tokens,system_note,updated_at) VALUES(?,?,?,?,?,?,?)");
  ai.forEach((a) => ia.run(a[0], a[1], a[2], a[3], a[4], a[5], t));

  const content = [
    ['site.tagline', 'مِرْباح — تسعيرٌ يُكتب في الدفتر'],
    ['site.faq', JSON.stringify([
      { q: 'هل بياناتي محفوظة عندكم؟', a: 'تبقى على جهازك حتى تُنشئ حسابًا، وبعدها تُحفظ في مساحة مشروعك وحدها.' },
      { q: 'كيف أحسب تكلفة الجزء المستخدم؟', a: 'سعر الشراء × (المستخدم ÷ المشتري) — لا تُحتسب العبوة كاملة.' }
    ])],
    ['site.notice', ''],
    ['site.contact', JSON.stringify({ email: '', phone: '', x: '', instagram: '' })]
  ];
  const ic = db.prepare('INSERT OR IGNORE INTO site_content(key,value,updated_by,updated_at) VALUES(?,?,NULL,?)');
  content.forEach((c) => ic.run(c[0], c[1], t));

  const theme = [['primary', '#a8552f'], ['paper', '#f3ecdd'], ['ink', '#33291f'], ['headingFont', 'Rubik'], ['showMethod', '1'], ['showLimits', '1']];
  const it = db.prepare('INSERT OR IGNORE INTO theme_settings(key,value) VALUES(?,?)');
  theme.forEach((x) => it.run(...x));
}

function init() {
  const db = open();
  const seed = seedCatalog(db);
  const libSeed = seedLibrary(db);
  seedBase(db);
  try { db.exec('PRAGMA wal_checkpoint(FULL);'); } catch (e) {}
  return { db, seed, libSeed };
}

module.exports = { init, open, backup, migrate, seedCatalog, seedLibrary, uid, nowIso, DB_FILE, BACKUP_DIR, DATA_DIR };
