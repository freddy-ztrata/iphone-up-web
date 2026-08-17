-- 007 — Emails transaccionales (Resend) + carritos abandonados.
--
-- Tres piezas independientes que se apoyan entre sí:
--
--   carts               → snapshot del carro con el email capturado en el
--                         checkout. Es lo que permite recordar una compra a
--                         medio terminar y restaurarla con un link firmado.
--   email_log           → un registro por email intentado. `idempotency_key` es
--                         UNIQUE: es el candado que evita enviar dos veces el
--                         mismo aviso (webhook repetido de MP, doble tick del
--                         scheduler, reintento manual del admin).
--   email_suppressions  → quién NO debe recibir. Baja voluntaria, rebote duro o
--                         marca de spam. El mailer la consulta SIEMPRE antes de
--                         hablar con el proveedor.
--
-- Sin PRAGMA (el runner envuelve el archivo en BEGIN/COMMIT — ver server/db.js).

-- ============================================================
-- CARTS — carro capturado / abandonado
-- ============================================================
-- `token` es el identificador público (32 hex de crypto.randomBytes). Va en el
-- link de recuperación del email, así que tiene que ser imposible de adivinar:
-- nunca uses el `id` autoincremental para eso.
--
-- `status`:
--   active     → sigue vivo, elegible para recordatorios
--   recovered  → el cliente volvió por el link (abrió el checkout otra vez)
--   converted  → terminó en una orden real (order_id apunta a ella)
--   expired    → pasó `expires_at` (14 días por default) sin comprar
CREATE TABLE IF NOT EXISTS carts (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  token                TEXT NOT NULL UNIQUE,
  email                TEXT,
  name                 TEXT,
  phone                TEXT,
  items_json           TEXT NOT NULL DEFAULT '[]',
  item_count           INTEGER NOT NULL DEFAULT 0,
  subtotal             INTEGER NOT NULL DEFAULT 0,
  status               TEXT NOT NULL DEFAULT 'active'
                       CHECK (status IN ('active','recovered','converted','expired')),
  -- 1 = el cliente vio la leyenda de "te podemos escribir para recordarte" y
  -- siguió. Sin consent no se le manda NADA de recuperación.
  consent              INTEGER NOT NULL DEFAULT 0,
  source               TEXT,
  order_id             TEXT,
  reminder_1h_sent_at  TEXT,
  reminder_24h_sent_at TEXT,
  recovered_at         TEXT,
  converted_at         TEXT,
  expires_at           TEXT NOT NULL,
  ip                   TEXT,
  user_agent           TEXT,
  created_at           TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at           TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_carts_status     ON carts(status, created_at);
CREATE INDEX IF NOT EXISTS idx_carts_email      ON carts(email);
CREATE INDEX IF NOT EXISTS idx_carts_expires    ON carts(expires_at);
-- Índices de la cola del scheduler: buscamos activos con email, sin el
-- recordatorio correspondiente enviado y sin actividad desde hace N horas
-- (el umbral corre contra `updated_at` — ver dueForReminder en lib/carts.js).
CREATE INDEX IF NOT EXISTS idx_carts_rem1       ON carts(status, reminder_1h_sent_at, updated_at);
CREATE INDEX IF NOT EXISTS idx_carts_rem24      ON carts(status, reminder_24h_sent_at, updated_at);

-- ============================================================
-- EMAIL_LOG — un intento de envío por fila
-- ============================================================
-- `status`:
--   queued     → fila creada, todavía no volvió el proveedor
--   sent       → el proveedor aceptó el mensaje (provider_id = id de Resend)
--   dry_run    → no hay RESEND_API_KEY: se renderizó y se logueó, no se envió
--   failed     → el proveedor devolvió error (error tiene el detalle)
--   suppressed → el destinatario está en email_suppressions
--   disabled   → los emails están apagados desde Ajustes
CREATE TABLE IF NOT EXISTS email_log (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  idempotency_key  TEXT NOT NULL UNIQUE,
  template         TEXT NOT NULL,
  to_email         TEXT NOT NULL,
  subject          TEXT,
  status           TEXT NOT NULL DEFAULT 'queued'
                   CHECK (status IN ('queued','sent','dry_run','failed','suppressed','disabled')),
  provider         TEXT,
  provider_id      TEXT,
  error            TEXT,
  order_id         TEXT,
  cart_id          INTEGER,
  meta_json        TEXT,
  -- Timestamps que escribe el webhook de Resend (solo la primera vez de cada uno).
  delivered_at     TEXT,
  opened_at        TEXT,
  clicked_at       TEXT,
  bounced_at       TEXT,
  complained_at    TEXT,
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_email_log_created  ON email_log(created_at);
CREATE INDEX IF NOT EXISTS idx_email_log_template ON email_log(template, created_at);
CREATE INDEX IF NOT EXISTS idx_email_log_to       ON email_log(to_email, created_at);
CREATE INDEX IF NOT EXISTS idx_email_log_order    ON email_log(order_id);
CREATE INDEX IF NOT EXISTS idx_email_log_cart     ON email_log(cart_id);
CREATE INDEX IF NOT EXISTS idx_email_log_provider ON email_log(provider_id);

-- ============================================================
-- EMAIL_SUPPRESSIONS — lista de exclusión
-- ============================================================
-- 'bounce' y 'complaint' bloquean TODO (seguir escribiéndole a un buzón que
-- rebota o que nos marcó como spam quema la reputación del dominio).
-- 'unsubscribe' y 'manual' bloquean solo lo no transaccional: la confirmación
-- de un pago que la persona acaba de hacer se envía igual.
CREATE TABLE IF NOT EXISTS email_suppressions (
  email       TEXT PRIMARY KEY COLLATE NOCASE,
  reason      TEXT NOT NULL DEFAULT 'manual'
              CHECK (reason IN ('unsubscribe','bounce','complaint','manual')),
  source      TEXT,
  note        TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================
-- EMAIL_EVENTS — crudo de los webhooks de Resend
-- ============================================================
-- Guardamos el evento tal cual llegó para poder auditar entregas/rebotes sin
-- depender del panel de Resend. No es la fuente de verdad del estado (eso vive
-- en email_log), es el rastro.
CREATE TABLE IF NOT EXISTS email_events (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  provider_id   TEXT,
  type          TEXT NOT NULL,
  to_email      TEXT,
  payload_json  TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_email_events_provider ON email_events(provider_id);
CREATE INDEX IF NOT EXISTS idx_email_events_created  ON email_events(created_at);

-- ============================================================
-- ORDERS: momento exacto de la entrega
-- ============================================================
-- El follow-up post-entrega se agenda a N días de la ENTREGA, no del último
-- update de la orden. `updated_at` se mueve con cualquier edición del admin
-- (una nota, un tracking corregido) y correría la fecha del follow-up.
ALTER TABLE orders ADD COLUMN delivered_at TEXT;

CREATE INDEX IF NOT EXISTS idx_orders_delivered ON orders(delivered_at);
