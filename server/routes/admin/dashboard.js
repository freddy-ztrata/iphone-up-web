// Dashboard: KPIs y series para gráficos.
//
// Todos los agregados "por día" se calculan en hora de Santiago, no en UTC.
// `date('now','localtime')` dependía de la TZ del contenedor (alpine corre en
// UTC y no trae tzdata), así que "Ventas hoy" arrancaba 3–4 horas tarde. Ahora
// el offset real viaja como modificador explícito — ver server/lib/tz.js.

const express = require("express");
const db = require("../../db");
const tz = require("../../lib/tz");

const router = express.Router();

router.get("/", (_req, res) => {
  const tzMod = tz.sqliteModifier();

  // Ventas hoy / 7d / 30d (suma de orders con status approved)
  const salesToday = db.prepare(`
    SELECT COALESCE(SUM(total), 0) AS total, COUNT(*) AS count
    FROM orders
    WHERE status = 'approved' AND date(created_at, @tz) = date('now', @tz)
  `).get({ tz: tzMod });
  const sales7 = db.prepare(`
    SELECT COALESCE(SUM(total), 0) AS total, COUNT(*) AS count
    FROM orders WHERE status = 'approved' AND created_at >= datetime('now', '-7 days')
  `).get();
  const sales30 = db.prepare(`
    SELECT COALESCE(SUM(total), 0) AS total, COUNT(*) AS count
    FROM orders WHERE status = 'approved' AND created_at >= datetime('now', '-30 days')
  `).get();

  // Órdenes pendientes de PAGO
  const pending = db.prepare(`
    SELECT COUNT(*) AS n FROM orders WHERE status IN ('pending','in_process')
  `).get();

  // Órdenes pagadas que aún no se despachan — la cola de trabajo real del día.
  const toFulfill = db.prepare(`
    SELECT COUNT(*) AS n FROM orders
    WHERE status = 'approved' AND fulfillment_status IN ('unfulfilled','preparing')
  `).get();

  // Stock crítico (variants con stock <= 2 y is_active).
  // Devolvemos variant_id/color/product_id para que el dashboard pueda ajustar
  // el stock in-situ y linkear al producto (antes solo mostraba texto).
  const critical = db.prepare(`
    SELECT v.id AS variant_id, v.storage, v.color, v.stock, v.price,
           m.id AS model_id, m.name AS model,
           p.id AS product_id, p.line, p.year
    FROM variants v
    JOIN product_models m ON m.id = v.model_id
    JOIN products p ON p.id = m.product_id
    WHERE v.is_active = 1 AND p.hidden = 0 AND v.stock <= 2
    ORDER BY v.stock ASC, p.id DESC
    LIMIT 20
  `).all();

  // Sparkline: ventas por día últimos 30 días (agrupado en días de Santiago)
  const sparkline = db.prepare(`
    SELECT date(created_at, @tz) AS day, COALESCE(SUM(total), 0) AS total
    FROM orders
    WHERE status = 'approved' AND created_at >= datetime('now', '-30 days')
    GROUP BY day
    ORDER BY day ASC
  `).all({ tz: tzMod });

  // Top productos últimos 30 días (por order_items_json — aproximación)
  const topRaw = db.prepare(`
    SELECT items_json FROM orders
    WHERE status = 'approved' AND created_at >= datetime('now', '-30 days')
  `).all();
  const counts = {};
  for (const r of topRaw) {
    try {
      const items = JSON.parse(r.items_json || "[]");
      for (const it of items) {
        const key = `${it.model} ${it.storage}`;
        counts[key] = (counts[key] || 0) + (Number(it.qty) || 1);
      }
    } catch {}
  }
  const top = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, qty]) => ({ name, qty }));

  // Actividad reciente (audit log resumido)
  const recent = db.prepare(`
    SELECT al.action, al.entity_type, al.entity_id, al.created_at, u.name AS user_name, u.email AS user_email
    FROM audit_log al
    LEFT JOIN users u ON u.id = al.user_id
    ORDER BY al.created_at DESC
    LIMIT 20
  `).all();

  // Carritos recuperables: vivos, con email capturado y consentimiento. Es el
  // número que pinta el badge del sidebar (lo que hay que hacer, no lo que hay).
  let recoverableCarts = 0;
  try {
    recoverableCarts = db.prepare(`
      SELECT COUNT(*) AS n FROM carts
      WHERE status IN ('active','recovered') AND consent = 1
        AND email IS NOT NULL AND email != '' AND item_count > 0
        AND expires_at > datetime('now')
    `).get().n;
  } catch { /* la tabla puede no existir en una DB anterior a la migración 007 */ }

  res.json({
    sales: {
      today: salesToday,
      last7: sales7,
      last30: sales30,
    },
    pending: pending.n,
    to_fulfill: toFulfill.n,
    critical_stock: critical,
    recoverable_carts: recoverableCarts,
    sparkline,
    top_products: top,
    recent_activity: recent,
    tz: { zone: tz.TZ, offsetMinutes: tz.offsetMinutes(), today: tz.today() },
  });
});

module.exports = router;
