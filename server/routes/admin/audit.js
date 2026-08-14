// El audit log guarda snapshots before/after de TODA mutación — incluidos
// nombres, emails y teléfonos de clientes en los cambios de órdenes. Es la
// vista con más datos personales del panel, así que es solo para admins.

const express = require("express");
const audit = require("../../lib/audit");
const { requireAdmin } = require("../../middleware/auth");

const router = express.Router();

router.get("/", requireAdmin, (req, res) => {
  const list = audit.list({
    user_id: req.query.user_id ? Number(req.query.user_id) : null,
    entity_type: req.query.entity_type || null,
    entity_id: req.query.entity_id || null,
    limit: req.query.limit || 200,
  });
  res.json({ entries: list });
});

module.exports = router;
