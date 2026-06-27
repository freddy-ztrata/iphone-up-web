const express = require("express");
const db = require("../../db");
const audit = require("../../lib/audit");

const router = express.Router();

const LIST = (filters) => {
  const where = [];
  const params = {};
  if (filters.status) { where.push("status = @status"); params.status = filters.status; }
  if (filters.q) {
    where.push("(id LIKE @q OR buyer_json LIKE @q)");
    params.q = `%${filters.q}%`;
  }
  if (filters.from) { where.push("created_at >= @from"); params.from = filters.from; }
  if (filters.to) { where.push("created_at <= @to"); params.to = filters.to; }
  const sql = `
    SELECT id, status, subtotal, shipping_cost, total, buyer_json,
           created_at, updated_at, mp_payment_id, coupon_code
    FROM orders
    ${where.length ? "WHERE " + where.join(" AND ") : ""}
    ORDER BY created_at DESC
    LIMIT 500
  `;
  return db.prepare(sql).all(params);
};

const GET = db.prepare("SELECT * FROM orders WHERE id = ?");
const UPDATE_STATUS = db.prepare(`
  UPDATE orders SET status = ?, updated_at = datetime('now') WHERE id = ?
`);
const DELETE_ORDER = db.prepare("DELETE FROM orders WHERE id = ?");

router.get("/", (req, res) => {
  const orders = LIST(req.query).map(o => ({
    ...o,
    buyer: o.buyer_json ? JSON.parse(o.buyer_json) : null,
    buyer_json: undefined,
  }));
  res.json({ orders });
});

router.get("/:id", (req, res) => {
  const row = GET.get(req.params.id);
  if (!row) return res.status(404).json({ error: "No existe" });
  res.json({
    ...row,
    buyer: row.buyer_json ? JSON.parse(row.buyer_json) : null,
    shipping: row.shipping_json ? JSON.parse(row.shipping_json) : null,
    items: row.items_json ? JSON.parse(row.items_json) : [],
    payment: row.payment_json ? JSON.parse(row.payment_json) : null,
  });
});

router.patch("/:id", (req, res) => {
  const before = GET.get(req.params.id);
  if (!before) return res.status(404).json({ error: "No existe" });
  const { status } = req.body || {};
  if (!status) return res.status(400).json({ error: "status requerido" });
  UPDATE_STATUS.run(status, req.params.id);
  const after = GET.get(req.params.id);
  audit.log(req, {
    action: "update", entity_type: "order", entity_id: req.params.id,
    before: { status: before.status }, after: { status: after.status },
  });
  res.json(after);
});

router.delete("/:id", (req, res) => {
  const before = GET.get(req.params.id);
  if (!before) return res.status(404).json({ error: "No existe" });
  DELETE_ORDER.run(req.params.id);
  audit.log(req, {
    action: "delete", entity_type: "order", entity_id: req.params.id,
    before: { status: before.status, total: before.total },
  });
  res.json({ ok: true });
});

module.exports = router;
