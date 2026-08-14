// Configuración editable del admin (/api/admin/settings/*).
//
// Todo lo de acá cambia lo que ve/paga el cliente final, así que escribir es
// solo para admins. Leer queda abierto a cualquier sesión válida para que el
// panel pueda mostrar el estado actual.

const express = require("express");
const settings = require("../../lib/settings");
const audit = require("../../lib/audit");
const { requireAdmin } = require("../../middleware/auth");

const router = express.Router();

// GET  /api/admin/settings/payment-fee  → { rate, enabled }
router.get("/payment-fee", (_req, res) => res.json(settings.getPaymentFee()));

// PATCH /api/admin/settings/payment-fee  { rate?:0..1, enabled?:bool }
router.patch("/payment-fee", requireAdmin, (req, res) => {
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

// ----- Precios de recompra (trade-in) -----
// GET → { prices, isDefault }. `isDefault` le dice al panel si todavía está
// mostrando los valores de fábrica de catalog-extras o ya hay unos guardados.
router.get("/tradein", (_req, res) => {
  res.json({
    prices: settings.getTradeinPrices(),
    isDefault: settings.getRaw("tradein_prices") == null,
  });
});

// PATCH { prices: { "iPhone 14 Pro": { "128GB": 400000 } } } — reemplaza el set completo.
router.patch("/tradein", requireAdmin, (req, res) => {
  const before = settings.getTradeinPrices();
  const { prices } = req.body || {};
  try {
    const after = settings.setTradeinPrices(prices);
    audit.log(req, {
      action: "update", entity_type: "settings", entity_id: "tradein",
      before: { models: Object.keys(before).length },
      after: { models: Object.keys(after).length, prices: after },
    });
    res.json({ prices: after, isDefault: false });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Volver a los precios de fábrica.
router.post("/tradein/reset", requireAdmin, (req, res) => {
  const before = settings.getTradeinPrices();
  const after = settings.resetTradeinPrices();
  audit.log(req, {
    action: "update", entity_type: "settings", entity_id: "tradein",
    before: { models: Object.keys(before).length }, after: { reset: true, models: Object.keys(after).length },
  });
  res.json({ prices: after, isDefault: true });
});

module.exports = router;
