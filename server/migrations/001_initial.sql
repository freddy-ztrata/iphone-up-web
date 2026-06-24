-- iPhone UP — Schema inicial
-- Idempotente: todas las CREATE usan IF NOT EXISTS.

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
PRAGMA synchronous = NORMAL;

-- ============================================================
-- USERS / SESSIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  email           TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash   TEXT NOT NULL,
  name            TEXT NOT NULL DEFAULT '',
  role            TEXT NOT NULL DEFAULT 'admin' CHECK (role IN ('admin','editor')),
  is_active       INTEGER NOT NULL DEFAULT 1,
  last_login_at   TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Sessions table (better-sqlite3-session-store maneja esta tabla automáticamente
-- pero la declaramos para que no se pierda el schema al hacer un dump).
CREATE TABLE IF NOT EXISTS sessions (
  sid         TEXT PRIMARY KEY,
  sess        TEXT NOT NULL,
  expired     INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_expired ON sessions(expired);

CREATE TABLE IF NOT EXISTS login_attempts (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  ip          TEXT NOT NULL,
  email       TEXT,
  success     INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_login_ip ON login_attempts(ip, created_at);
CREATE INDEX IF NOT EXISTS idx_login_email ON login_attempts(email, created_at);

-- ============================================================
-- CATÁLOGO: products → models → variants
-- ============================================================
CREATE TABLE IF NOT EXISTS products (
  id          INTEGER PRIMARY KEY,             -- id explícito (11..17, 0 para TEST)
  line        TEXT NOT NULL,                   -- "11", "12", ..., "17", "TEST"
  year        INTEGER,
  hero_img    TEXT,                            -- imagen de la línea (fallback)
  hidden      INTEGER NOT NULL DEFAULT 0,      -- 1 = oculto del catálogo público
  position    INTEGER NOT NULL DEFAULT 0,      -- orden en la grilla (asc)
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_products_hidden_pos ON products(hidden, position);

CREATE TABLE IF NOT EXISTS product_models (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id   INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,                  -- "iPhone 15 Pro Max"
  img          TEXT,                           -- imagen específica de este modelo
  sealed       INTEGER NOT NULL DEFAULT 0,
  tagline      TEXT,                           -- texto descriptivo opcional
  position     INTEGER NOT NULL DEFAULT 0,
  is_active    INTEGER NOT NULL DEFAULT 1,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_models_product ON product_models(product_id, position);

CREATE TABLE IF NOT EXISTS variants (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  model_id            INTEGER NOT NULL REFERENCES product_models(id) ON DELETE CASCADE,
  storage             TEXT NOT NULL,           -- "64GB", "128GB", "256GB", "512GB", "TEST"
  price               INTEGER NOT NULL,        -- CLP, integer
  compare_at_price    INTEGER,                 -- precio "antes" tachado, opcional
  stock               INTEGER NOT NULL DEFAULT 0,
  sku                 TEXT UNIQUE,
  position            INTEGER NOT NULL DEFAULT 0,
  is_active           INTEGER NOT NULL DEFAULT 1,
  created_at          TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_variants_model ON variants(model_id, position);
CREATE INDEX IF NOT EXISTS idx_variants_sku ON variants(sku);

-- ============================================================
-- IMÁGENES (uploads del admin, además del img inline de products/models)
-- ============================================================
CREATE TABLE IF NOT EXISTS images (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_type   TEXT NOT NULL CHECK (owner_type IN ('product','model')),
  owner_id     INTEGER NOT NULL,
  url          TEXT NOT NULL,                  -- /uploads/products/<uuid>.webp
  alt          TEXT,
  position     INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_images_owner ON images(owner_type, owner_id, position);

-- ============================================================
-- CUPONES
-- ============================================================
CREATE TABLE IF NOT EXISTS coupons (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  code           TEXT NOT NULL UNIQUE COLLATE NOCASE,
  type           TEXT NOT NULL CHECK (type IN ('percent','fixed')),
  value          INTEGER NOT NULL,             -- % o CLP (siempre positivo)
  min_subtotal   INTEGER NOT NULL DEFAULT 0,
  max_uses       INTEGER,                      -- NULL = sin tope
  used_count     INTEGER NOT NULL DEFAULT 0,
  starts_at      TEXT,                         -- ISO 8601, NULL = ya activo
  ends_at        TEXT,                         -- ISO 8601, NULL = sin vencimiento
  applies_to     TEXT NOT NULL DEFAULT 'all',  -- 'all' | 'line:14' | 'sealed' (extensible)
  is_active      INTEGER NOT NULL DEFAULT 1,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_coupons_code ON coupons(code);
CREATE INDEX IF NOT EXISTS idx_coupons_active ON coupons(is_active, ends_at);

-- ============================================================
-- STOCK MOVEMENTS (historial de cambios de stock)
-- ============================================================
CREATE TABLE IF NOT EXISTS stock_movements (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  variant_id   INTEGER NOT NULL REFERENCES variants(id) ON DELETE CASCADE,
  delta        INTEGER NOT NULL,               -- + ingreso / - venta
  reason       TEXT NOT NULL CHECK (reason IN ('manual','sale','return','adjust','reserve','release')),
  order_id     TEXT,                           -- referencia a orders.id si aplica
  user_id      INTEGER REFERENCES users(id),
  note         TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_stock_movements_variant ON stock_movements(variant_id, created_at);

-- ============================================================
-- AUDIT LOG (toda mutación admin queda aquí)
-- ============================================================
CREATE TABLE IF NOT EXISTS audit_log (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      INTEGER REFERENCES users(id),
  action       TEXT NOT NULL,                  -- 'create' | 'update' | 'delete' | 'login' | ...
  entity_type  TEXT NOT NULL,                  -- 'product' | 'variant' | 'coupon' | ...
  entity_id    TEXT,                           -- string para tolerar IDs no-numéricos
  before_json  TEXT,                           -- snapshot JSON antes del cambio (NULL en create)
  after_json   TEXT,                           -- snapshot JSON después (NULL en delete)
  ip           TEXT,
  user_agent   TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_log(entity_type, entity_id, created_at);
CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_log(user_id, created_at);

-- ============================================================
-- ORDERS (migración de server/data/orders.json)
-- ============================================================
CREATE TABLE IF NOT EXISTS orders (
  id                  TEXT PRIMARY KEY,        -- "ORD-XXX-YYY"
  status              TEXT NOT NULL DEFAULT 'pending',
  subtotal            INTEGER NOT NULL DEFAULT 0,
  shipping_cost       INTEGER NOT NULL DEFAULT 0,
  total               INTEGER NOT NULL DEFAULT 0,
  buyer_json          TEXT,                    -- email, nombre, rut, teléfono
  shipping_json       TEXT,                    -- región, comuna, dirección, courier
  items_json          TEXT,                    -- array de {model, storage, price, ...}
  payment_json        TEXT,                    -- info de MP: payment_id, status_detail, etc.
  mp_preference_id    TEXT,
  mp_payment_id       TEXT,
  coupon_code         TEXT,
  created_at          TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status, created_at);
CREATE INDEX IF NOT EXISTS idx_orders_mp_payment ON orders(mp_payment_id);

-- ============================================================
-- SETTINGS (key-value para preferencias globales)
-- ============================================================
CREATE TABLE IF NOT EXISTS settings (
  key          TEXT PRIMARY KEY,
  value        TEXT,
  updated_by   INTEGER REFERENCES users(id),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================
-- Tabla interna de migraciones (para evitar re-aplicar)
-- ============================================================
CREATE TABLE IF NOT EXISTS _migrations (
  filename     TEXT PRIMARY KEY,
  applied_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
