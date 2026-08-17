// Mercado Pago — Checkout Pro (redirect).
// Doc: https://www.mercadopago.cl/developers/es/docs/checkout-pro/landing
//
// Flujo:
//   1. Frontend manda POST /api/mercadopago/preference con items + shipping + buyer.
//   2. Backend crea Preference con access_token (secret), guarda la orden y devuelve init_point.
//   3. Frontend redirige a init_point. El usuario paga.
//   4. MP redirige a back_urls.success|failure|pending.
//   5. MP llama a notification_url cuando el pago cambia de estado.
//   6. Backend consulta el pago y marca la orden como aprobada/rechazada.

const express = require("express");
const crypto = require("crypto");
const { MercadoPagoConfig, Preference, Payment } = require("mercadopago");
const { saveOrder, getOrder, updateOrderStatus } = require("../lib/storage");
const mpSignature = require("../lib/mp-signature");
const stockLib = require("../lib/stock");
const couponsLib = require("../lib/coupons");
const cartsLib = require("../lib/carts");
const mailer = require("../lib/mailer");
const { getPaymentFee } = require("../lib/settings");

const router = express.Router();

function mpClient() {
  const token = process.env.MP_ACCESS_TOKEN;
  if (!token) throw new Error("MP_ACCESS_TOKEN no configurado");
  return new MercadoPagoConfig({ accessToken: token, options: { timeout: 8000 } });
}

function publicUrl() {
  return (process.env.PUBLIC_URL || "http://localhost:8080").replace(/\/$/, "");
}

function makeOrderId() {
  return "ORD-" + Date.now().toString(36).toUpperCase() + "-" + crypto.randomBytes(3).toString("hex").toUpperCase();
}

// POST /api/mercadopago/preference
// Body:
// {
//   items:    [{ model, storage, price, qty?, img? }],
//   shipping: { name, cost, address: { region, county, street, number, extra }, serviceCode? },
//   buyer:    { name, email, phone, rut }
// }
router.post("/preference", async (req, res) => {
  const { items, shipping, buyer, cartToken } = req.body || {};

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: "items vacío" });
  }
  if (!buyer?.email) return res.status(400).json({ error: "email del comprador requerido" });
  if (!shipping?.cost && shipping?.cost !== 0) return res.status(400).json({ error: "shipping.cost requerido" });

  const orderId = makeOrderId();

  // Items normalizados para MP.
  const mpItems = items.map((it, idx) => ({
    id: `iphone-${it.phoneId || idx}-${(it.storage || "").replace(/\s+/g, "")}`,
    title: `${it.model}${it.storage ? " " + it.storage : ""}${it.color ? " " + it.color : ""}`.slice(0, 250),
    description: it.sealed ? "Sellado · iPhone UP" : "Seminuevo A+ · iPhone UP",
    quantity: Number(it.qty || 1),
    currency_id: "CLP",
    unit_price: Math.round(Number(it.price)),
    picture_url: it.img && /^https?:\/\//.test(it.img) ? it.img : undefined,
    category_id: "electronics",
  }));

  // Envío como ítem adicional para que se muestre desglosado en MP.
  // Alternativa: usar campo `shipments.cost` — pero entonces no se ve detallado.
  if (Number(shipping.cost) > 0) {
    mpItems.push({
      id: "shipping",
      title: `Envío Chilexpress${shipping.name ? " — " + shipping.name : ""}`,
      description: shipping.address
        ? `Despacho a ${shipping.address.county || ""}, ${shipping.address.region || ""}`.trim()
        : "Despacho a domicilio",
      quantity: 1,
      currency_id: "CLP",
      unit_price: Math.round(Number(shipping.cost)),
      category_id: "services",
    });
  }

  const subtotal = items.reduce((a, i) => a + Math.round(Number(i.price)) * Number(i.qty || 1), 0);

  // Comisión del medio de pago — configurable/desactivable desde el admin.
  const fee = getPaymentFee();
  const paymentFee = fee.enabled ? Math.round(subtotal * fee.rate) : 0;
  if (paymentFee > 0) {
    const pct = (fee.rate * 100).toLocaleString("es-CL", { maximumFractionDigits: 2 });
    mpItems.push({
      id: "payment-fee",
      title: `Comisión medio de pago (${pct}%)`,
      description: "Recargo por procesamiento del pago",
      quantity: 1,
      currency_id: "CLP",
      unit_price: paymentFee,
      category_id: "services",
    });
  }

  const total = subtotal + paymentFee + Math.round(Number(shipping.cost) || 0);

  const preferenceBody = {
    items: mpItems,
    payer: {
      name: buyer.name || "",
      email: buyer.email,
      phone: buyer.phone ? { number: buyer.phone } : undefined,
      identification: buyer.rut ? { type: "RUT", number: buyer.rut } : undefined,
    },
    back_urls: {
      success: `${publicUrl()}/payment/success?order=${orderId}`,
      failure: `${publicUrl()}/payment/failure?order=${orderId}`,
      pending: `${publicUrl()}/payment/pending?order=${orderId}`,
    },
    auto_return: "approved",
    external_reference: orderId,
    notification_url: `${publicUrl()}/api/mercadopago/webhook`,
    statement_descriptor: "iPhone UP",
    metadata: {
      order_id: orderId,
      shipping_county: shipping.address?.county,
      shipping_region: shipping.address?.region,
      shipping_service: shipping.serviceCode,
    },
  };

  try {
    const pref = await new Preference(mpClient()).create({ body: preferenceBody });

    saveOrder({
      id: orderId,
      status: "pending",
      total,
      subtotal,
      shipping,
      buyer,
      items,
      mp: {
        preferenceId: pref.id,
        initPoint: pref.init_point,
        sandboxInitPoint: pref.sandbox_init_point,
      },
      createdAt: new Date().toISOString(),
    });

    // El carro capturado ya cumplió su función: queda fuera de la cola de
    // recordatorios. Aislado en try/catch — un problema acá no puede impedir
    // que el cliente llegue a pagar.
    if (cartToken) {
      try { cartsLib.markConverted(String(cartToken), orderId); }
      catch (err) { console.error("[mp] no se pudo cerrar el carro capturado:", err.message); }
    }

    res.json({
      orderId,
      preferenceId: pref.id,
      initPoint: pref.init_point,
      sandboxInitPoint: pref.sandbox_init_point,
      publicKey: process.env.MP_PUBLIC_KEY || null,
    });
  } catch (err) {
    console.error("[mp] preference error:", err?.message || err);
    res.status(500).json({ error: err?.message || "Error al crear preferencia" });
  }
});

// Webhook de Mercado Pago. MP envía POST con `?type=payment&data.id=...`
// Doc: https://www.mercadopago.cl/developers/es/docs/your-integrations/notifications/webhooks
router.post("/webhook", async (req, res) => {
  // Validar firma ANTES de responder, pero responder 200 igual para que MP
  // no reintente (las firmas inválidas suelen indicar replay attacks que
  // queremos ignorar silenciosamente).
  const sig = mpSignature.verify(req);
  if (!sig.ok) {
    console.warn("[mp webhook] firma inválida:", sig.reason);
    return res.status(401).send("invalid signature");
  }
  res.status(200).send("ok");

  const type = req.query.type || req.body?.type;
  const id = req.query["data.id"] || req.body?.data?.id;

  if (type !== "payment" || !id) return;

  try {
    const payment = await new Payment(mpClient()).get({ id });
    const externalRef = payment.external_reference;
    if (!externalRef) {
      console.warn("[mp webhook] pago sin external_reference:", id);
      return;
    }
    let order = getOrder(externalRef);
    if (!order) {
      // No hay orden local para este pago (perdida o pago fuera del checkout web).
      // La creamos desde los datos de Mercado Pago para NO perder la venta.
      try {
        const payer = payment.payer || {};
        saveOrder({
          id: externalRef,
          status: payment.status,
          subtotal: Math.round(payment.transaction_amount || 0),
          total: Math.round(payment.transaction_amount || 0),
          buyer: {
            name: [payer.first_name, payer.last_name].filter(Boolean).join(" "),
            email: payer.email || "",
            phone: (payer.phone && payer.phone.number) || "",
          },
          items: [],
          shipping: {},
          payment: {
            paymentId: String(payment.id),
            status: payment.status,
            statusDetail: payment.status_detail,
            paymentMethod: payment.payment_method_id,
            transactionAmount: payment.transaction_amount,
            approvedAt: payment.date_approved,
          },
          mp: { paymentId: String(payment.id) },
          createdAt: payment.date_created || payment.date_approved || undefined,
        });
        order = getOrder(externalRef);
        console.warn("[mp webhook] orden no existía; creada desde el pago MP:", externalRef);
      } catch (e) {
        console.error("[mp webhook] no se pudo crear orden desde el pago:", e.message);
        return;
      }
    }
    const wasApprovedBefore = order.status === "approved";
    updateOrderStatus(externalRef, payment.status, {
      paymentId: String(payment.id),
      status: payment.status,
      statusDetail: payment.status_detail,
      paymentMethod: payment.payment_method_id,
      paymentType: payment.payment_type_id,
      installments: payment.installments,
      transactionAmount: payment.transaction_amount,
      approvedAt: payment.date_approved,
    });

    // Si el pago acaba de ser aprobado, descontar stock e incrementar cupón.
    if (payment.status === "approved" && !wasApprovedBefore) {
      try {
        stockLib.commitOrderSale(getOrder(externalRef));
      } catch (err) {
        console.error("[mp webhook] no se pudo descontar stock:", err.message);
      }
      if (order.couponCode) {
        try { couponsLib.incrementUsage(order.couponCode); } catch {}
      }

      // Emails de la venta. VAN AL FINAL y en su propio try/catch a propósito:
      // el stock ya se descontó y a MP ya se le respondió 200, así que nada de
      // esto puede afectar la venta. `sendSafe` tampoco propaga rechazos, pero
      // el catch cubre una excepción sincrónica al armar el contexto.
      try {
        const paid = getOrder(externalRef);
        if (paid?.buyer?.email) {
          mailer.sendSafe({
            template: "order_paid",
            to: paid.buyer.email,
            orderId: paid.id,
            // Un webhook repetido del mismo pago no reenvía: la key es única.
            idempotencyKey: `order_paid:${paid.id}`,
            data: { order: paid },
          });
        }
        mailer.notifyInternal(paid);
      } catch (err) {
        console.error("[mp webhook] emails de venta:", err.message);
      }
    }

    console.log(`[mp webhook] orden ${externalRef} → ${payment.status}`);
  } catch (err) {
    console.error("[mp webhook] error procesando pago:", err?.message || err);
  }
});

// Algunos canales mandan GET al webhook como ping.
router.get("/webhook", (_req, res) => res.status(200).send("ok"));

module.exports = router;
