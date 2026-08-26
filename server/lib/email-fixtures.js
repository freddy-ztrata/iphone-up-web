// Datos ficticios para probar los templates de email desde el panel.
//
// Por qué existe: hasta ahora el único email que se podía probar era `test`,
// que no ejerce ninguno de los templates reales. Un cambio en el template de
// "pago confirmado" solo se veía cuando un cliente compraba de verdad.
//
// REGLAS DURAS de este archivo:
//   1. NO toca la base. Ni stock, ni órdenes, ni carritos: son objetos armados
//      en memoria con el mismo shape que produce el flujo real.
//   2. Todo dato es inventado y se identifica como tal — la orden es
//      ORD-PRUEBA-0000, el comprador es "Cliente de Prueba" y el asunto sale
//      con el prefijo [PRUEBA] (lo agrega el mailer vía `subjectPrefix`).
//   3. Un id de template sin fixture acá NO es probable desde el panel. La
//      whitelist es este objeto, no lo que mande el cliente.
//
// Los precios son valores redondos a propósito: no son precios del catálogo y
// nadie debería confundirlos con uno (ver CLAUDE.md sobre precios reales).

const carts = require("./carts");
const templatesLib = require("./email-templates");

/** Prefijo del asunto de toda prueba. El mailer lo antepone al render. */
const SUBJECT_PREFIX = "[PRUEBA] ";

const FAKE_ORDER_ID = "ORD-PRUEBA-0000";
// 32 hex como los tokens reales de `carts`, pero con un prefijo legible. No
// existe en la tabla: el link de recuperación abre el checkout vacío.
const FAKE_CART_TOKEN = "prueba00" + "0".repeat(24);
const FAKE_TRACKING = "PRUEBA000000001";

const BUYER = {
  name: "Cliente de Prueba",
  email: "cliente.de.prueba@example.com",
  phone: "+56 9 0000 0000",
  rut: "11.111.111-1",
  instagram: "@cliente.de.prueba",
};

// Mismo shape que el carro real: {model, storage, color, price, sealed, phoneId, img}.
function fakeItems() {
  return [
    {
      model: "iPhone 14 Pro", storage: "256GB", color: "Morado Oscuro",
      price: 700000, sealed: false, phoneId: 14, qty: 1,
      img: "assets/iphones/variants/iphone-14-pro.webp",
    },
    {
      model: "iPhone 13", storage: "128GB", color: "Medianoche",
      price: 400000, sealed: false, phoneId: 13, qty: 1,
      img: "assets/iphones/variants/iphone-13.webp",
    },
  ];
}

const SHIPPING_COST = 5990;
const FEE_RATE = 0.035;

/**
 * Orden ficticia completa. `extra` permite el estado de cada template
 * (tracking del envío, fecha de entrega) sin duplicar el resto.
 */
function fakeOrder(extra = {}) {
  const items = fakeItems();
  const subtotal = items.reduce((acc, it) => acc + it.price * (it.qty || 1), 0);
  const fee = Math.round(subtotal * FEE_RATE);
  return {
    id: FAKE_ORDER_ID,
    status: "approved",
    buyer: { ...BUYER },
    items,
    subtotal,
    total: subtotal + fee + SHIPPING_COST,
    shipping: {
      method: "delivery",
      name: "Chilexpress Express",
      serviceCode: "EXP",
      cost: SHIPPING_COST,
      address: {
        street: "Av. Providencia", number: "1234", extra: "Depto 55",
        county: "Providencia", region: "Región Metropolitana",
      },
    },
    ...extra,
  };
}

/** Carro ficticio con el shape que devuelve `carts.rowToCart()`. */
function fakeCart() {
  const items = fakeItems();
  return {
    id: null,
    token: FAKE_CART_TOKEN,
    name: BUYER.name,
    email: BUYER.email,
    items,
    subtotal: items.reduce((acc, it) => acc + it.price * (it.qty || 1), 0),
    status: "active",
  };
}

// ---------------------------------------------------------------------------
// Registro: id de template → ctx de prueba.
//
// Object.create(null) y no `{}`: la clave llega del body de una request. Con un
// literal, pedir el template "constructor" o "toString" devolvería una función
// del prototipo y pasaría el chequeo de existencia.
// ---------------------------------------------------------------------------
const FIXTURES = Object.create(null);

FIXTURES.order_paid = () => ({ order: fakeOrder() });

FIXTURES.order_shipped = () => ({
  order: fakeOrder({
    fulfillment_status: "shipped",
    tracking_code: FAKE_TRACKING,
    tracking_carrier: "Chilexpress",
  }),
});

FIXTURES.order_delivered = () => ({
  order: fakeOrder({ fulfillment_status: "delivered", delivered_at: "2026-01-15 12:00:00" }),
});

FIXTURES.followup_delivered = () => ({
  order: fakeOrder({ fulfillment_status: "delivered", delivered_at: "2026-01-15 12:00:00" }),
});

FIXTURES.internal_new_order = () => ({ order: fakeOrder() });

// Los dos recordatorios comparten datos; lo que cambia es el template.
// El cupón es fijo y ficticio: probamos que el bloque de descuento se pinte,
// sin depender de que haya un cupón real vigente en la DB.
function cartFixture({ config }) {
  return {
    cart: fakeCart(),
    coupon: "PRUEBA-DEMO",
    resumeUrl: carts.resumeUrl(FAKE_CART_TOKEN),
    expireDays: config?.cartExpireDays || 14,
  };
}
FIXTURES.cart_reminder_1h = cartFixture;
FIXTURES.cart_reminder_24h = cartFixture;

// El template `test` se renderiza solo con la config que ya le pasa el mailer.
FIXTURES.test = () => ({});

// ---------------------------------------------------------------------------

/** Agrupación para el panel. Solo estética. */
const GROUPS = {
  order_paid: "Ventas",
  order_shipped: "Ventas",
  order_delivered: "Ventas",
  internal_new_order: "Ventas",
  cart_reminder_1h: "Carritos",
  cart_reminder_24h: "Carritos",
  followup_delivered: "Post venta",
  test: "Sistema",
};

/** Qué representa cada prueba, para que el panel no muestre solo un id. */
const DESCRIPTIONS = {
  order_paid: "Lo que recibe el cliente cuando Mercado Pago aprueba el pago.",
  order_shipped: "Aviso de despacho con código de seguimiento.",
  order_delivered: "Confirmación de entrega con la garantía.",
  internal_new_order: "Aviso interno de venta nueva, con los datos del comprador.",
  cart_reminder_1h: "Primer recordatorio de carro abandonado.",
  cart_reminder_24h: "Segundo y último recordatorio de carro abandonado.",
  followup_delivered: "Seguimiento a los días de entregado el pedido.",
  test: "Verifica el remitente y la conexión con el proveedor.",
};

/** ¿Se puede probar este template? Es LA whitelist del endpoint. */
function isTestable(templateId) {
  const id = String(templateId || "");
  return typeof FIXTURES[id] === "function" && Boolean(templatesLib.get(id));
}

/**
 * Arma el ctx de prueba de un template.
 * @returns {object|null} data para mailer.send(), o null si no es probable.
 */
function build(templateId, { config = {}, requestedBy = null } = {}) {
  if (!isTestable(templateId)) return null;
  const data = FIXTURES[String(templateId)]({ config }) || {};
  return {
    ...data,
    // Queda en email_log.meta_json: así una fila de prueba se distingue de una
    // real sin tener que adivinar por el destinatario.
    meta: {
      test: true,
      fixture: String(templateId),
      requestedBy: requestedBy || null,
      note: "Prueba desde el panel — datos ficticios, no corresponde a una venta real",
    },
  };
}

/** Catálogo de pruebas para el panel (un botón por entrada). */
function list() {
  return templatesLib.TEMPLATE_IDS.filter(isTestable).map(id => ({
    id,
    label: templatesLib.TEMPLATE_LABELS[id] || id,
    group: GROUPS[id] || "Otros",
    description: DESCRIPTIONS[id] || "",
    transactional: templatesLib.get(id).transactional !== false,
  }));
}

/**
 * Templates registrados que no tienen fixture. Debería estar siempre vacío:
 * si alguien agrega un template nuevo y no lo cubre acá, el panel no lo podría
 * probar y nadie se enteraría. Lo usa `npm run verify:emails`.
 */
function missingFixtures() {
  return templatesLib.TEMPLATE_IDS.filter(id => !isTestable(id));
}

module.exports = {
  build, list, isTestable, missingFixtures,
  SUBJECT_PREFIX, FAKE_ORDER_ID, FAKE_CART_TOKEN,
};
