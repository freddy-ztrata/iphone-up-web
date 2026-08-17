// Carritos abandonados (/api/admin/carts).
//
// Los carros contienen el email y el nombre de gente que NO llegó a comprar, o
// sea PII de alguien que solo dejó su correo. Mismo criterio que las órdenes:
// leer requiere sesión (editor sirve, es operación diaria), y todo lo que
// escribe o borra requiere admin.

const express = require("express");
const carts = require("../../lib/carts");
const mailer = require("../../lib/mailer");
const settings = require("../../lib/settings");
const audit = require("../../lib/audit");
const { requireAdmin } = require("../../middleware/auth");

const router = express.Router();

// GET /api/admin/carts?status=&q=&has_email=&from=&to=&limit=&offset=
router.get("/", (req, res) => {
  try {
    const { carts: rows, page } = carts.list(req.query);
    res.json({ carts: rows, page, summary: carts.summary() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/carts/:id  → carro + los emails que se le mandaron
router.get("/:id", (req, res) => {
  const cart = carts.getById(req.params.id);
  if (!cart) return res.status(404).json({ error: "No existe" });
  const { entries } = mailer.listLog({ cart_id: cart.id, limit: 50 });
  res.json({
    ...cart,
    resumeUrl: carts.resumeUrl(cart.token),
    emails: entries,
  });
});

// POST /api/admin/carts/:id/remind  → reenvío manual
// `force: true` en el mailer crea una fila nueva de email_log (con sufijo
// :retryN) en vez de rebotar contra la idempotencia del envío automático.
router.post("/:id/remind", requireAdmin, async (req, res) => {
  const cart = carts.getById(req.params.id);
  if (!cart) return res.status(404).json({ error: "No existe" });
  if (!cart.email) return res.status(400).json({ error: "Este carro no tiene email capturado" });

  const kind = req.body?.kind === "24h" ? "24h" : "1h";
  const template = kind === "24h" ? "cart_reminder_24h" : "cart_reminder_1h";
  const config = settings.getEmailConfig();

  const result = await mailer.send({
    template,
    to: cart.email,
    cartId: cart.id,
    force: true,
    data: {
      cart,
      coupon: config.cartCouponCode || null,
      resumeUrl: carts.resumeUrl(cart.token),
      expireDays: config.cartExpireDays,
    },
  });

  audit.log(req, {
    action: "update", entity_type: "cart", entity_id: cart.id,
    after: { manual_reminder: template, to: cart.email, result: { ok: result.ok, status: result.status, reason: result.reason } },
  });

  if (!result.ok) return res.status(502).json({ error: result.reason || "No se pudo enviar", result });
  res.json({ ok: true, result });
});

// DELETE /api/admin/carts/:id — destructivo ⇒ solo admin
router.delete("/:id", requireAdmin, (req, res) => {
  const cart = carts.getById(req.params.id);
  if (!cart) return res.status(404).json({ error: "No existe" });
  carts.remove(cart.id);
  audit.log(req, {
    action: "delete", entity_type: "cart", entity_id: cart.id,
    before: { email: cart.email, status: cart.status, subtotal: cart.subtotal, itemCount: cart.itemCount },
  });
  res.json({ ok: true });
});

module.exports = router;
