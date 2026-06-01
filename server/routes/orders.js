const express = require("express");
const { getOrder } = require("../lib/storage");

const router = express.Router();

// GET /api/orders/:id  → estado de una orden (para la pantalla de "gracias")
router.get("/:id", (req, res) => {
  const o = getOrder(req.params.id);
  if (!o) return res.status(404).json({ error: "Orden no encontrada" });
  // No exponemos datos sensibles del comprador.
  res.json({
    id: o.id,
    status: o.status,
    total: o.total,
    subtotal: o.subtotal,
    items: o.items,
    shipping: { name: o.shipping?.name, cost: o.shipping?.cost, county: o.shipping?.address?.county, region: o.shipping?.address?.region },
    payment: o.payment ? { status: o.payment.status, paymentMethod: o.payment.paymentMethod } : null,
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
  });
});

module.exports = router;
