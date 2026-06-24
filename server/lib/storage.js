// Almacenamiento de órdenes en SQLite.
// La API expuesta es la misma que la versión JSON anterior — el resto del
// código no se entera del cambio.
//
// Migración: si existe `server/data/orders.json` en disco, se importa una
// única vez al boot y luego se renombra a `orders.json.migrated.bak`.

const fs = require("fs");
const path = require("path");
const db = require("../db");

const LEGACY_FILE = path.resolve(__dirname, "..", "data", "orders.json");

const INSERT_OR_REPLACE = db.prepare(`
  INSERT INTO orders (
    id, status, subtotal, shipping_cost, total,
    buyer_json, shipping_json, items_json, payment_json,
    mp_preference_id, mp_payment_id, coupon_code,
    created_at, updated_at
  ) VALUES (
    @id, @status, @subtotal, @shipping_cost, @total,
    @buyer_json, @shipping_json, @items_json, @payment_json,
    @mp_preference_id, @mp_payment_id, @coupon_code,
    COALESCE(@created_at, datetime('now')),
    datetime('now')
  )
  ON CONFLICT(id) DO UPDATE SET
    status            = excluded.status,
    subtotal          = excluded.subtotal,
    shipping_cost     = excluded.shipping_cost,
    total             = excluded.total,
    buyer_json        = excluded.buyer_json,
    shipping_json     = excluded.shipping_json,
    items_json        = excluded.items_json,
    payment_json      = COALESCE(excluded.payment_json, orders.payment_json),
    mp_preference_id  = COALESCE(excluded.mp_preference_id, orders.mp_preference_id),
    mp_payment_id     = COALESCE(excluded.mp_payment_id, orders.mp_payment_id),
    coupon_code       = COALESCE(excluded.coupon_code, orders.coupon_code),
    updated_at        = datetime('now')
`);

const SELECT_ONE = db.prepare("SELECT * FROM orders WHERE id = ?");

const UPDATE_STATUS = db.prepare(`
  UPDATE orders
  SET status = @status,
      payment_json = @payment_json,
      mp_payment_id = COALESCE(@mp_payment_id, mp_payment_id),
      updated_at = datetime('now')
  WHERE id = @id
`);

function rowToOrder(row) {
  if (!row) return null;
  return {
    id: row.id,
    status: row.status,
    subtotal: row.subtotal,
    total: row.total,
    shipping: {
      ...(row.shipping_json ? JSON.parse(row.shipping_json) : {}),
      cost: row.shipping_cost,
    },
    buyer: row.buyer_json ? JSON.parse(row.buyer_json) : {},
    items: row.items_json ? JSON.parse(row.items_json) : [],
    payment: row.payment_json ? JSON.parse(row.payment_json) : null,
    mp: {
      preferenceId: row.mp_preference_id,
      paymentId: row.mp_payment_id,
    },
    couponCode: row.coupon_code || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function saveOrder(order) {
  const params = {
    id: order.id,
    status: order.status || "pending",
    subtotal: order.subtotal || 0,
    shipping_cost: order.shipping?.cost ?? 0,
    total: order.total || 0,
    buyer_json: order.buyer ? JSON.stringify(order.buyer) : null,
    shipping_json: order.shipping ? JSON.stringify(order.shipping) : null,
    items_json: order.items ? JSON.stringify(order.items) : null,
    payment_json: order.payment ? JSON.stringify(order.payment) : null,
    mp_preference_id: order.mp?.preferenceId || null,
    mp_payment_id: order.mp?.paymentId || null,
    coupon_code: order.couponCode || null,
    created_at: order.createdAt || null,
  };
  INSERT_OR_REPLACE.run(params);
  return getOrder(order.id);
}

function getOrder(id) {
  return rowToOrder(SELECT_ONE.get(id));
}

function updateOrderStatus(id, status, paymentInfo = {}) {
  const row = SELECT_ONE.get(id);
  if (!row) return null;
  const existing = row.payment_json ? JSON.parse(row.payment_json) : {};
  const merged = { ...existing, ...paymentInfo };
  UPDATE_STATUS.run({
    id,
    status,
    payment_json: JSON.stringify(merged),
    mp_payment_id: paymentInfo.paymentId || null,
  });
  return getOrder(id);
}

// ----- Migración one-shot desde el JSON legacy -----
function migrateLegacyJson() {
  if (!fs.existsSync(LEGACY_FILE)) return { migrated: 0 };
  try {
    const raw = fs.readFileSync(LEGACY_FILE, "utf-8");
    const data = JSON.parse(raw || "{}");
    const ids = Object.keys(data);
    if (!ids.length) {
      fs.renameSync(LEGACY_FILE, LEGACY_FILE + ".migrated.bak");
      return { migrated: 0 };
    }
    let count = 0;
    db.transaction(() => {
      for (const id of ids) {
        const o = data[id];
        if (!o || !o.id) continue;
        saveOrder({
          id: o.id,
          status: o.status || "pending",
          subtotal: o.subtotal || 0,
          total: o.total || 0,
          shipping: o.shipping || {},
          buyer: o.buyer || {},
          items: o.items || [],
          payment: o.payment || null,
          mp: o.mp || {},
          createdAt: o.createdAt,
        });
        count++;
      }
    })();
    fs.renameSync(LEGACY_FILE, LEGACY_FILE + ".migrated.bak");
    console.log(`[storage] migradas ${count} órdenes de orders.json a SQLite`);
    return { migrated: count };
  } catch (err) {
    console.error("[storage] error migrando JSON legacy:", err.message);
    return { migrated: 0, error: err.message };
  }
}

migrateLegacyJson();

module.exports = { saveOrder, getOrder, updateOrderStatus };
