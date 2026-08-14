-- 006 — Admin MVP: fulfillment separado del pago + órdenes manuales + normalización de fechas.
--
-- Contexto: `orders.status` guarda el estado del PAGO (lo escribe el webhook de
-- Mercado Pago). Hasta ahora el admin escribía en esa misma columna, así que un
-- webhook tardío de MP pisaba el estado de envío puesto a mano. Separamos ambos
-- ciclos de vida: `status` = pago (solo MP / creación), `fulfillment_status` =
-- preparación/envío (solo admin).
--
-- Sin PRAGMA (el runner envuelve el archivo en BEGIN/COMMIT — ver server/db.js).
-- El runner registra el archivo en _migrations, así que los ALTER corren una vez.

-- ============================================================
-- ORDERS: ciclo de vida de fulfillment, tracking y canal de venta
-- ============================================================
ALTER TABLE orders ADD COLUMN fulfillment_status TEXT NOT NULL DEFAULT 'unfulfilled';
ALTER TABLE orders ADD COLUMN tracking_code TEXT;
ALTER TABLE orders ADD COLUMN tracking_carrier TEXT;
ALTER TABLE orders ADD COLUMN admin_notes TEXT;

-- Canal de venta: 'online' = checkout público (MP). El resto son ventas
-- cargadas a mano desde el admin (item 10 del plan).
ALTER TABLE orders ADD COLUMN channel TEXT NOT NULL DEFAULT 'online';

-- Quién creó la orden a mano (NULL para órdenes del checkout público).
ALTER TABLE orders ADD COLUMN created_by_user_id INTEGER REFERENCES users(id);

-- Medio de pago declarado en ventas manuales ('cash','transfer','card','other').
ALTER TABLE orders ADD COLUMN payment_method TEXT;

CREATE INDEX IF NOT EXISTS idx_orders_fulfillment ON orders(fulfillment_status, created_at);
CREATE INDEX IF NOT EXISTS idx_orders_channel ON orders(channel, created_at);
CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at);

-- ============================================================
-- Normalización de timestamps de orders
-- ============================================================
-- `storage.saveOrder` guardaba `new Date().toISOString()` →
-- "2026-08-13T21:13:00.000Z", mientras el resto del schema usa
-- `datetime('now')` → "2026-08-13 21:13:00". Los filtros from/to y el
-- `ORDER BY created_at DESC` comparaban formatos mezclados como texto, así que
-- el orden y el filtrado por fecha quedaban mal. Normalizamos a
-- "YYYY-MM-DD HH:MM:SS" (UTC, igual que datetime('now')).
UPDATE orders
   SET created_at = replace(substr(created_at, 1, 19), 'T', ' ')
 WHERE created_at LIKE '%T%';

UPDATE orders
   SET updated_at = replace(substr(updated_at, 1, 19), 'T', ' ')
 WHERE updated_at LIKE '%T%';

-- Órdenes ya entregadas antes de existir el campo: si el pago está aprobado y
-- la orden es vieja, no asumimos nada — quedan 'unfulfilled' para que el equipo
-- las revise. (Deliberado: es preferible revisar de más que dar por enviado.)

-- ============================================================
-- VARIANTS: costo de adquisición (para margen en el admin)
-- ============================================================
-- NUNCA se expone en /data.js ni en ninguna vista pública: buildCatalog() no
-- selecciona esta columna. Solo el admin la lee para calcular margen.
ALTER TABLE variants ADD COLUMN cost INTEGER;
