// Órdenes del admin.
//
// DOS ciclos de vida separados (migración 006):
//   orders.status             → estado del PAGO. Lo escribe Mercado Pago vía
//                               webhook. El admin solo lo toca para cancelar a
//                               mano (y solo si es admin).
//   orders.fulfillment_status → estado de PREPARACIÓN/ENVÍO. Lo escribe solo el
//                               admin. Un webhook tardío de MP ya no lo pisa.
//
// El historial de cambios sale del audit_log (entity_type='order'), que ya
// guarda before/after de cada mutación — no hace falta una tabla nueva.

const express = require("express");
const db = require("../../db");
const audit = require("../../lib/audit");
const stock = require("../../lib/stock");
const tz = require("../../lib/tz");
const mailer = require("../../lib/mailer");
const { requireAdmin } = require("../../middleware/auth");

const router = express.Router();

// Estados de fulfillment permitidos. `unfulfilled` es el default de la columna.
const FULFILLMENT_STATES = ["unfulfilled", "preparing", "shipped", "delivered", "cancelled"];
// Estados de pago que el admin puede forzar a mano (el resto los pone MP).
const MANUAL_PAYMENT_STATES = ["pending", "approved", "rejected", "cancelled", "refunded"];
const CHANNELS = ["online", "store", "instagram", "transfer", "cash"];
const PAYMENT_METHODS = ["cash", "transfer", "card", "mercadopago", "other"];

const SELECT_COLUMNS = `
  id, status, fulfillment_status, channel, payment_method,
  subtotal, shipping_cost, total, buyer_json, shipping_json, items_json,
  tracking_code, tracking_carrier, admin_notes,
  created_at, updated_at, mp_payment_id, coupon_code
`;

// Construye WHERE + params compartidos por la lista, el conteo y el export.
function buildFilters(q) {
  const where = [];
  const params = {};
  if (q.status) { where.push("status = @status"); params.status = String(q.status); }
  if (q.fulfillment_status) {
    where.push("fulfillment_status = @fulfillment_status");
    params.fulfillment_status = String(q.fulfillment_status);
  }
  if (q.channel) { where.push("channel = @channel"); params.channel = String(q.channel); }
  if (q.q) {
    // Búsqueda libre sobre id, datos del comprador y nombre de los productos.
    where.push("(id LIKE @q OR buyer_json LIKE @q OR items_json LIKE @q OR tracking_code LIKE @q)");
    params.q = `%${String(q.q).trim()}%`;
  }
  // Las fechas llegan como YYYY-MM-DD (día de Santiago). Comparamos contra el
  // día local calculado, no contra el texto UTC crudo.
  if (q.from) { where.push("date(created_at, @tzmod) >= @from"); params.from = String(q.from).slice(0, 10); }
  if (q.to) { where.push("date(created_at, @tzmod) <= @to"); params.to = String(q.to).slice(0, 10); }
  if (params.from != null || params.to != null) params.tzmod = tz.sqliteModifier();
  return { clause: where.length ? "WHERE " + where.join(" AND ") : "", params };
}

// Fila cruda → objeto de lista (sin PII de más: sin payment_json ni dirección completa).
function toListItem(o) {
  const buyer = o.buyer_json ? safeParse(o.buyer_json, null) : null;
  const shipping = safeParse(o.shipping_json, null);
  const items = safeParse(o.items_json, []) || [];
  const itemCount = items.reduce((a, it) => a + (Number(it.qty) || 1), 0);
  const first = items[0];
  const itemsLabel = first ? `${first.model || "Producto"}${first.storage ? " " + first.storage : ""}` : null;
  const isPickup = shipping && (shipping.method === "pickup" || shipping.serviceCode === "PICKUP");
  return {
    id: o.id,
    status: o.status,
    fulfillment_status: o.fulfillment_status || "unfulfilled",
    channel: o.channel || "online",
    payment_method: o.payment_method || null,
    subtotal: o.subtotal,
    shipping_cost: o.shipping_cost,
    total: o.total,
    coupon_code: o.coupon_code,
    mp_payment_id: o.mp_payment_id,
    tracking_code: o.tracking_code || null,
    tracking_carrier: o.tracking_carrier || null,
    created_at: o.created_at,
    updated_at: o.updated_at,
    buyer,
    delivery: shipping ? {
      method: isPickup ? "pickup" : "shipping",
      county: shipping.address?.county || null,
      region: shipping.address?.region || null,
    } : null,
    itemCount,
    itemsLabel,
  };
}

function safeParse(json, fallback) {
  if (!json) return fallback;
  try { return JSON.parse(json); } catch { return fallback; }
}

const GET = db.prepare("SELECT * FROM orders WHERE id = ?");
const DELETE_ORDER = db.prepare("DELETE FROM orders WHERE id = ?");

// =========================================================
// LISTA — filtros + búsqueda + paginación
// =========================================================
router.get("/", (req, res) => {
  const { clause, params } = buildFilters(req.query);
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200);
  const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);

  const total = db.prepare(`SELECT COUNT(*) AS n FROM orders ${clause}`).get(params).n;
  const rows = db.prepare(`
    SELECT ${SELECT_COLUMNS} FROM orders
    ${clause}
    ORDER BY created_at DESC, id DESC
    LIMIT @limit OFFSET @offset
  `).all({ ...params, limit, offset });

  res.json({
    orders: rows.map(toListItem),
    page: { total, limit, offset, hasMore: offset + rows.length < total },
  });
});

// =========================================================
// EXPORT CSV — datos del cliente ⇒ solo admin
// =========================================================
router.get("/export.csv", requireAdmin, (req, res) => {
  const { clause, params } = buildFilters(req.query);
  const rows = db.prepare(`
    SELECT ${SELECT_COLUMNS} FROM orders ${clause} ORDER BY created_at DESC LIMIT 5000
  `).all(params);

  const header = [
    "id", "fecha", "estado_pago", "estado_envio", "canal", "medio_pago",
    "cliente", "email", "telefono", "rut", "instagram",
    "entrega", "region", "comuna", "direccion",
    "items", "unidades", "subtotal", "envio", "total", "cupon", "tracking", "mp_payment_id",
  ];

  const lines = [header.join(",")];
  for (const o of rows) {
    const b = safeParse(o.buyer_json, {}) || {};
    const s = safeParse(o.shipping_json, {}) || {};
    const items = safeParse(o.items_json, []) || [];
    const isPickup = s.method === "pickup" || s.serviceCode === "PICKUP";
    const addr = s.address || {};
    lines.push([
      o.id,
      o.created_at,
      o.status,
      o.fulfillment_status || "unfulfilled",
      o.channel || "online",
      o.payment_method || "",
      b.name || "",
      b.email || "",
      b.phone || "",
      b.rut || "",
      b.instagram || "",
      isPickup ? "Retiro en tienda" : "Despacho",
      addr.region || "",
      addr.county || "",
      isPickup ? (addr.store || "") : [addr.branch, addr.street, addr.number].filter(Boolean).join(" "),
      items.map(i => `${i.model || ""} ${i.storage || ""}${i.color ? " " + i.color : ""}`.trim()).join(" | "),
      items.reduce((a, i) => a + (Number(i.qty) || 1), 0),
      o.subtotal, o.shipping_cost, o.total,
      o.coupon_code || "",
      o.tracking_code || "",
      o.mp_payment_id || "",
    ].map(csvCell).join(","));
  }

  audit.log(req, {
    action: "export", entity_type: "order", entity_id: null,
    after: { rows: rows.length, filters: req.query },
  });

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="ordenes-${tz.today()}.csv"`);
  // BOM para que Excel en Windows respete los acentos.
  res.send("﻿" + lines.join("\r\n") + "\r\n");
});

// Escapa una celda CSV. El guión inicial en fórmulas (=,+,-,@) se neutraliza
// con una comilla simple para evitar CSV injection al abrir en Excel.
function csvCell(v) {
  let s = v == null ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  if (/[",\r\n]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
  return s;
}

// =========================================================
// DETALLE
// =========================================================
router.get("/:id", (req, res) => {
  const row = GET.get(req.params.id);
  if (!row) return res.status(404).json({ error: "No existe" });
  res.json({
    ...row,
    fulfillment_status: row.fulfillment_status || "unfulfilled",
    channel: row.channel || "online",
    buyer: safeParse(row.buyer_json, null),
    shipping: safeParse(row.shipping_json, null),
    items: safeParse(row.items_json, []) || [],
    payment: safeParse(row.payment_json, null),
  });
});

// Historial de cambios de la orden (item 5). Sale del audit_log.
router.get("/:id/history", (req, res) => {
  const row = GET.get(req.params.id);
  if (!row) return res.status(404).json({ error: "No existe" });
  const entries = audit.list({ entity_type: "order", entity_id: req.params.id, limit: 100 });
  res.json({
    entries: entries.map(e => ({
      id: e.id,
      action: e.action,
      created_at: e.created_at,
      user_name: e.user_name,
      user_email: e.user_email,
      before: e.before,
      after: e.after,
    })),
  });
});

// =========================================================
// ACTUALIZAR — fulfillment (editor+) / estado de pago (solo admin)
// =========================================================
const UPDATE_FULFILLMENT = db.prepare(`
  UPDATE orders SET
    fulfillment_status = COALESCE(@fulfillment_status, fulfillment_status),
    tracking_code      = COALESCE(@tracking_code, tracking_code),
    tracking_carrier   = COALESCE(@tracking_carrier, tracking_carrier),
    admin_notes        = COALESCE(@admin_notes, admin_notes),
    updated_at         = datetime('now')
  WHERE id = @id
`);
const UPDATE_PAYMENT_STATUS = db.prepare(`
  UPDATE orders SET status = @status, updated_at = datetime('now') WHERE id = @id
`);
// Sella el momento de la entrega la PRIMERA vez que la orden pasa a 'delivered'.
// El follow-up se agenda contra esta fecha y no contra `updated_at`, que se
// mueve con cualquier edición posterior (una nota, un tracking corregido).
const STAMP_DELIVERED = db.prepare(`
  UPDATE orders SET delivered_at = COALESCE(delivered_at, datetime('now')) WHERE id = ?
`);

// Emails que dispara un cambio de fulfillment. Se llama DESPUÉS de responder al
// admin y con todo aislado: que un email falle no puede hacer fallar el guardado
// del estado de envío.
function notifyFulfillment(orderRow, newStatus) {
  try {
    const buyer = safeParse(orderRow.buyer_json, {}) || {};
    if (!buyer.email) return;
    const template = newStatus === "shipped" ? "order_shipped"
      : newStatus === "delivered" ? "order_delivered"
      : null;
    if (!template) return;
    mailer.sendSafe({
      template,
      to: buyer.email,
      orderId: orderRow.id,
      // Si el estado va y vuelve (shipped → preparing → shipped) no se
      // reenvía: la key es única por orden y template.
      idempotencyKey: `${template}:${orderRow.id}`,
      data: {
        order: {
          id: orderRow.id,
          buyer,
          items: safeParse(orderRow.items_json, []) || [],
          shipping: safeParse(orderRow.shipping_json, {}) || {},
          tracking_code: orderRow.tracking_code || null,
          tracking_carrier: orderRow.tracking_carrier || null,
          total: orderRow.total,
          subtotal: orderRow.subtotal,
        },
      },
    });
  } catch (err) {
    console.error("[orders] email de fulfillment:", err.message);
  }
}

router.patch("/:id", (req, res) => {
  const before = GET.get(req.params.id);
  if (!before) return res.status(404).json({ error: "No existe" });

  const { status, fulfillment_status, tracking_code, tracking_carrier, admin_notes } = req.body || {};

  if (status !== undefined) {
    // Cambiar el estado del PAGO a mano es sensible (afecta ingresos y el
    // descuento de stock), así que queda reservado a admin.
    if (req.user.role !== "admin") {
      return res.status(403).json({ error: "Solo un admin puede cambiar el estado de pago" });
    }
    if (!MANUAL_PAYMENT_STATES.includes(status)) {
      return res.status(400).json({ error: `status inválido: ${MANUAL_PAYMENT_STATES.join(", ")}` });
    }
  }
  if (fulfillment_status !== undefined && !FULFILLMENT_STATES.includes(fulfillment_status)) {
    return res.status(400).json({ error: `fulfillment_status inválido: ${FULFILLMENT_STATES.join(", ")}` });
  }
  if (status === undefined && fulfillment_status === undefined &&
      tracking_code === undefined && tracking_carrier === undefined && admin_notes === undefined) {
    return res.status(400).json({ error: "Nada que actualizar" });
  }

  UPDATE_FULFILLMENT.run({
    id: req.params.id,
    fulfillment_status: fulfillment_status ?? null,
    tracking_code: tracking_code === undefined ? null : String(tracking_code).trim(),
    tracking_carrier: tracking_carrier === undefined ? null : String(tracking_carrier).trim(),
    admin_notes: admin_notes === undefined ? null : String(admin_notes),
  });
  if (status !== undefined) UPDATE_PAYMENT_STATUS.run({ id: req.params.id, status });
  if (fulfillment_status === "delivered") STAMP_DELIVERED.run(req.params.id);

  const after = GET.get(req.params.id);

  // Solo avisamos en la TRANSICIÓN. Guardar de nuevo una orden ya enviada (para
  // corregir una nota) no debe volver a escribirle al cliente.
  if (fulfillment_status !== undefined && fulfillment_status !== before.fulfillment_status) {
    notifyFulfillment(after, fulfillment_status);
  }

  audit.log(req, {
    action: "update", entity_type: "order", entity_id: req.params.id,
    before: {
      status: before.status, fulfillment_status: before.fulfillment_status,
      tracking_code: before.tracking_code, tracking_carrier: before.tracking_carrier,
      admin_notes: before.admin_notes,
    },
    after: {
      status: after.status, fulfillment_status: after.fulfillment_status,
      tracking_code: after.tracking_code, tracking_carrier: after.tracking_carrier,
      admin_notes: after.admin_notes,
    },
  });
  res.json({ ...after, items: safeParse(after.items_json, []) || [] });
});

// =========================================================
// ORDEN MANUAL — venta en tienda / Instagram / transferencia / efectivo
// =========================================================
// Reusa el mismo shape de items del carro público
// ({model, storage, color, price, sealed, phoneId, img, qty}) para que órdenes
// manuales y online sean indistinguibles aguas abajo (stock, export, KPIs).
const INSERT_MANUAL = db.prepare(`
  INSERT INTO orders (
    id, status, fulfillment_status, channel, payment_method,
    subtotal, shipping_cost, total,
    buyer_json, shipping_json, items_json,
    created_by_user_id, created_at, updated_at
  ) VALUES (
    @id, @status, @fulfillment_status, @channel, @payment_method,
    @subtotal, @shipping_cost, @total,
    @buyer_json, @shipping_json, @items_json,
    @created_by_user_id, datetime('now'), datetime('now')
  )
`);

function makeManualOrderId() {
  // Mismo prefijo que las órdenes del checkout para no romper nada que parsee
  // el id, con sufijo -M para distinguir el origen a simple vista.
  return "ORD-" + Date.now().toString(36).toUpperCase() + "-M" +
    Math.random().toString(36).slice(2, 6).toUpperCase();
}

router.post("/", (req, res) => {
  const {
    items, buyer, channel = "store", payment_method = "cash",
    shipping_cost = 0, status = "approved", fulfillment_status = "delivered",
    notes, discount = 0,
  } = req.body || {};

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: "items requerido" });
  }
  if (!CHANNELS.includes(channel)) {
    return res.status(400).json({ error: `channel inválido: ${CHANNELS.join(", ")}` });
  }
  if (!PAYMENT_METHODS.includes(payment_method)) {
    return res.status(400).json({ error: `payment_method inválido: ${PAYMENT_METHODS.join(", ")}` });
  }
  if (!MANUAL_PAYMENT_STATES.includes(status)) {
    return res.status(400).json({ error: `status inválido: ${MANUAL_PAYMENT_STATES.join(", ")}` });
  }
  if (!FULFILLMENT_STATES.includes(fulfillment_status)) {
    return res.status(400).json({ error: `fulfillment_status inválido` });
  }

  // Resolvemos cada item contra una variante real: el precio y los datos del
  // producto salen de la DB, no del body, para que nadie pueda registrar una
  // venta con un precio inventado y descuadrar los KPIs.
  const resolved = [];
  for (const raw of items) {
    const variantId = Number(raw.variant_id);
    if (!Number.isInteger(variantId)) {
      return res.status(400).json({ error: "cada item necesita variant_id" });
    }
    const v = db.prepare(`
      SELECT v.id, v.storage, v.color, v.price, v.stock,
             m.name AS model, m.sealed, m.img AS model_img,
             p.id AS product_id, p.hero_img
      FROM variants v
      JOIN product_models m ON m.id = v.model_id
      JOIN products p ON p.id = m.product_id
      WHERE v.id = ?
    `).get(variantId);
    if (!v) return res.status(400).json({ error: `variant_id ${variantId} no existe` });

    const qty = Math.max(1, Math.round(Number(raw.qty) || 1));
    // El precio puede diferir del de lista (negociación en tienda), pero queda
    // explícito en la orden y en el audit.
    const price = raw.price == null ? v.price : Math.max(0, Math.round(Number(raw.price)));
    resolved.push({
      // shape del carro público — no cambiar sin tocar mercadopago.js/stock.js
      model: v.model,
      storage: v.storage,
      color: v.color || "",
      price,
      sealed: !!v.sealed,
      phoneId: v.product_id,
      img: v.model_img || v.hero_img || "",
      qty,
      variant_id: v.id,
      list_price: v.price,
    });
  }

  const subtotal = resolved.reduce((a, i) => a + i.price * i.qty, 0);
  const ship = Math.max(0, Math.round(Number(shipping_cost) || 0));
  const disc = Math.max(0, Math.round(Number(discount) || 0));
  const total = Math.max(0, subtotal + ship - disc);

  const id = makeManualOrderId();
  const order = {
    id,
    status,
    fulfillment_status,
    channel,
    payment_method,
    subtotal,
    shipping_cost: ship,
    total,
    buyer_json: JSON.stringify({
      name: (buyer?.name || "").trim(),
      email: (buyer?.email || "").trim(),
      phone: (buyer?.phone || "").trim(),
      rut: (buyer?.rut || "").trim(),
      instagram: (buyer?.instagram || "").trim(),
    }),
    shipping_json: JSON.stringify(
      ship > 0
        ? { method: "shipping", cost: ship, name: "Despacho manual" }
        : { method: "pickup", serviceCode: "PICKUP", cost: 0, address: { store: "Padre Mariano 98, Of. 105, Providencia" } }
    ),
    items_json: JSON.stringify(resolved),
    created_by_user_id: req.user?.id ?? null,
  };

  // La orden y el descuento de stock van en la misma transacción: si el stock
  // falla, no queremos una venta registrada sin movimiento de inventario.
  let stockResult = { skipped: true };
  try {
    db.transaction(() => {
      INSERT_MANUAL.run(order);
      if (status === "approved") {
        stockResult = stock.commitOrderSale({ id, items: resolved });
      }
      // Una venta en tienda nace entregada: sellamos la fecha para que el
      // follow-up post-entrega la tome. NO mandamos confirmación de pago ni de
      // entrega — el cliente está en el mostrador, un email ahí es ruido.
      if (fulfillment_status === "delivered") STAMP_DELIVERED.run(id);
    })();
  } catch (err) {
    return res.status(500).json({ error: "No se pudo registrar la venta: " + err.message });
  }

  audit.log(req, {
    action: "create", entity_type: "order", entity_id: id,
    after: {
      channel, payment_method, status, fulfillment_status,
      subtotal, shipping_cost: ship, discount: disc, total,
      items: resolved.map(i => ({ variant_id: i.variant_id, label: `${i.model} ${i.storage}${i.color ? " " + i.color : ""}`, qty: i.qty, price: i.price, list_price: i.list_price })),
      notes: notes || null,
      stock: stockResult,
    },
  });

  const created = GET.get(id);
  res.status(201).json({ ...created, items: resolved, stock: stockResult });
});

// =========================================================
// ELIMINAR — destructivo ⇒ solo admin
// =========================================================
router.delete("/:id", requireAdmin, (req, res) => {
  const before = GET.get(req.params.id);
  if (!before) return res.status(404).json({ error: "No existe" });
  DELETE_ORDER.run(req.params.id);
  audit.log(req, {
    action: "delete", entity_type: "order", entity_id: req.params.id,
    before: { status: before.status, fulfillment_status: before.fulfillment_status, total: before.total, channel: before.channel },
  });
  res.json({ ok: true });
});

module.exports = router;
