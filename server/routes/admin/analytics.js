// Analítica del admin: tiempo real + resumen de sesiones/páginas/ventas.
const express = require("express");
const db = require("../../db");

const router = express.Router();

// Visitas en tiempo real: visitantes activos (últimos 5 min), páginas vistas
// (últimos 30 min) y feed de actividad reciente.
router.get("/realtime", (_req, res) => {
  const activeVisitors = db.prepare(
    `SELECT COUNT(DISTINCT session_id) AS n FROM visits WHERE created_at > datetime('now','-5 minutes')`
  ).get().n;
  const pageviews30m = db.prepare(
    `SELECT COUNT(*) AS n FROM visits WHERE created_at > datetime('now','-30 minutes')`
  ).get().n;
  const recent = db.prepare(
    `SELECT path, referrer, created_at FROM visits ORDER BY id DESC LIMIT 15`
  ).all();
  res.json({ activeVisitors, pageviews30m, recent });
});

// Resumen del período (?days=30): sesiones y páginas por día, top páginas,
// referidos y ventas (órdenes aprobadas).
router.get("/overview", (req, res) => {
  const days = Math.min(Math.max(parseInt(req.query.days, 10) || 30, 1), 90);
  const since = `-${days} days`;

  const perDay = db.prepare(`
    SELECT date(created_at) AS day, COUNT(*) AS pageviews, COUNT(DISTINCT session_id) AS sessions
    FROM visits WHERE created_at > datetime('now', ?)
    GROUP BY day ORDER BY day ASC
  `).all(since);

  const topPages = db.prepare(`
    SELECT path, COUNT(*) AS pageviews, COUNT(DISTINCT session_id) AS sessions
    FROM visits WHERE created_at > datetime('now', ?)
    GROUP BY path ORDER BY pageviews DESC LIMIT 10
  `).all(since);

  const topReferrers = db.prepare(`
    SELECT CASE WHEN referrer IS NULL OR referrer = '' THEN 'Directo' ELSE referrer END AS referrer,
           COUNT(DISTINCT session_id) AS sessions
    FROM visits WHERE created_at > datetime('now', ?)
    GROUP BY referrer ORDER BY sessions DESC LIMIT 8
  `).all(since);

  const totals = db.prepare(`
    SELECT COUNT(*) AS pageviews, COUNT(DISTINCT session_id) AS sessions
    FROM visits WHERE created_at > datetime('now', ?)
  `).get(since);

  const salesPerDay = db.prepare(`
    SELECT date(created_at) AS day, COUNT(*) AS orders, COALESCE(SUM(total),0) AS revenue
    FROM orders WHERE status = 'approved' AND created_at > datetime('now', ?)
    GROUP BY day ORDER BY day ASC
  `).all(since);

  const salesTotals = db.prepare(`
    SELECT COUNT(*) AS orders, COALESCE(SUM(total),0) AS revenue
    FROM orders WHERE status = 'approved' AND created_at > datetime('now', ?)
  `).get(since);

  res.json({ days, perDay, topPages, topReferrers, totals, salesPerDay, salesTotals });
});

module.exports = router;
