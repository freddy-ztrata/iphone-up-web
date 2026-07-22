// Configuración editable del admin (/api/admin/settings/*).

const express = require("express");
const settings = require("../../lib/settings");
const audit = require("../../lib/audit");

const router = express.Router();

// GET  /api/admin/settings/payment-fee  → { rate, enabled }
router.get("/payment-fee", (_req, res) => res.json(settings.getPaymentFee()));

// PATCH /api/admin/settings/payment-fee  { rate?:0..1, enabled?:bool }
router.patch("/payment-fee", (req, res) => {
  const before = settings.getPaymentFee();
  const { rate, enabled } = req.body || {};
  const patch = {};
  if (rate != null) {
    const r = Number(rate);
    if (!Number.isFinite(r) || r < 0 || r > 1) {
      return res.status(400).json({ error: "rate inválido: usa una fracción entre 0 y 1 (ej. 0.035 = 3,5%)" });
    }
    patch.rate = r;
  }
  if (enabled != null) patch.enabled = !!enabled;
  const after = settings.setPaymentFee(patch);
  audit.log(req, { action: "update", entity_type: "settings", entity_id: "payment-fee", before, after });
  res.json(after);
});

module.exports = router;
