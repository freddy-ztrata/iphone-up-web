const express = require("express");
const db = require("../../db");
const audit = require("../../lib/audit");

const router = express.Router();

const SEL = db.prepare("SELECT * FROM coupons WHERE id = ?");
const LIST = db.prepare("SELECT * FROM coupons ORDER BY created_at DESC");
const INSERT = db.prepare(`
  INSERT INTO coupons (code, type, value, min_subtotal, max_uses, starts_at, ends_at, applies_to, is_active)
  VALUES (@code, @type, @value, @min_subtotal, @max_uses, @starts_at, @ends_at, @applies_to, @is_active)
`);
const UPDATE = db.prepare(`
  UPDATE coupons SET
    code = COALESCE(@code, code),
    type = COALESCE(@type, type),
    value = COALESCE(@value, value),
    min_subtotal = COALESCE(@min_subtotal, min_subtotal),
    max_uses = @max_uses,
    starts_at = @starts_at,
    ends_at = @ends_at,
    applies_to = COALESCE(@applies_to, applies_to),
    is_active = COALESCE(@is_active, is_active),
    updated_at = datetime('now')
  WHERE id = @id
`);
const DELETE = db.prepare("DELETE FROM coupons WHERE id = ?");

router.get("/", (_req, res) => {
  res.json({ coupons: LIST.all().map(c => ({ ...c, is_active: Boolean(c.is_active) })) });
});

router.post("/", (req, res) => {
  const { code, type, value, min_subtotal, max_uses, starts_at, ends_at, applies_to, is_active } = req.body || {};
  if (!code || !type || value == null) return res.status(400).json({ error: "code, type, value requeridos" });
  if (!["percent", "fixed"].includes(type)) return res.status(400).json({ error: "type inválido" });
  try {
    const r = INSERT.run({
      code: code.toUpperCase().trim(),
      type,
      value: Math.round(Number(value)),
      min_subtotal: Math.round(Number(min_subtotal || 0)),
      max_uses: max_uses == null ? null : Number(max_uses),
      starts_at: starts_at || null,
      ends_at: ends_at || null,
      applies_to: applies_to || "all",
      is_active: is_active === false ? 0 : 1,
    });
    const coupon = SEL.get(r.lastInsertRowid);
    audit.log(req, { action: "create", entity_type: "coupon", entity_id: coupon.id, after: coupon });
    res.status(201).json(coupon);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.patch("/:id", (req, res) => {
  const id = parseInt(req.params.id, 10);
  const before = SEL.get(id);
  if (!before) return res.status(404).json({ error: "No existe" });
  const { code, type, value, min_subtotal, max_uses, starts_at, ends_at, applies_to, is_active } = req.body || {};
  UPDATE.run({
    id,
    code: code ? code.toUpperCase().trim() : null,
    type: type ?? null,
    value: value == null ? null : Math.round(Number(value)),
    min_subtotal: min_subtotal == null ? null : Math.round(Number(min_subtotal)),
    max_uses: max_uses === undefined ? before.max_uses : (max_uses == null ? null : Number(max_uses)),
    starts_at: starts_at === undefined ? before.starts_at : (starts_at || null),
    ends_at: ends_at === undefined ? before.ends_at : (ends_at || null),
    applies_to: applies_to ?? null,
    is_active: is_active == null ? null : (is_active ? 1 : 0),
  });
  const after = SEL.get(id);
  audit.log(req, { action: "update", entity_type: "coupon", entity_id: id, before, after });
  res.json(after);
});

router.delete("/:id", (req, res) => {
  const id = parseInt(req.params.id, 10);
  const before = SEL.get(id);
  if (!before) return res.status(404).json({ error: "No existe" });
  DELETE.run(id);
  audit.log(req, { action: "delete", entity_type: "coupon", entity_id: id, before });
  res.json({ ok: true });
});

module.exports = router;
