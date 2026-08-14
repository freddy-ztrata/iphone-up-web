// Ajuste de stock + registro en stock_movements.
//
// Toda mutación de variants.stock pasa por aquí para que quede el rastro.

const db = require("../db");

const ADJUST = db.prepare(`
  UPDATE variants SET stock = MAX(0, stock + @delta), updated_at = datetime('now') WHERE id = @variant_id
`);
const INSERT_MOVEMENT = db.prepare(`
  INSERT INTO stock_movements (variant_id, delta, reason, order_id, user_id, note)
  VALUES (@variant_id, @delta, @reason, @order_id, @user_id, @note)
`);
const SELECT_VARIANT = db.prepare("SELECT * FROM variants WHERE id = ?");
const SELECT_MOVEMENTS = db.prepare(`
  SELECT sm.*, u.email AS user_email
  FROM stock_movements sm
  LEFT JOIN users u ON u.id = sm.user_id
  WHERE sm.variant_id = ?
  ORDER BY sm.created_at DESC
  LIMIT ?
`);

/**
 * Ajusta stock con motivo. Transactional.
 * @param {object} params
 * @param {number} params.variant_id
 * @param {number} params.delta       (+ ingreso, - venta)
 * @param {string} params.reason      'manual' | 'sale' | 'return' | 'adjust' | 'reserve' | 'release'
 * @param {string} [params.order_id]
 * @param {number} [params.user_id]
 * @param {string} [params.note]
 */
const adjust = db.transaction((params) => {
  const v = SELECT_VARIANT.get(params.variant_id);
  if (!v) throw new Error("variant_id no existe");
  ADJUST.run({ variant_id: params.variant_id, delta: params.delta });
  INSERT_MOVEMENT.run({
    variant_id: params.variant_id,
    delta: params.delta,
    reason: params.reason || "manual",
    order_id: params.order_id || null,
    user_id: params.user_id || null,
    note: params.note || null,
  });
  return SELECT_VARIANT.get(params.variant_id);
});

function listMovements(variant_id, limit = 50) {
  return SELECT_MOVEMENTS.all(variant_id, Math.min(Math.max(parseInt(limit, 10) || 50, 1), 500));
}

// Resuelve la variante exacta de un item del carro.
//
// El COLOR es parte de la identidad de la variante desde la migración 005: dos
// filas comparten (línea, modelo, capacidad) y solo difieren en color. Buscar
// sin color y cortar con LIMIT 1 descontaba stock de un color al azar. Primero
// intentamos el match exacto con color; recién si el item no trae color (carros
// viejos en sessionStorage, órdenes creadas por el webhook desde MP) caemos al
// match sin color.
const FIND_VARIANT_WITH_COLOR = db.prepare(`
  SELECT v.id FROM variants v
  JOIN product_models m ON m.id = v.model_id
  JOIN products p ON p.id = m.product_id
  WHERE p.id = ? AND m.name = ? AND v.storage = ? AND v.color = ?
  LIMIT 1
`);
const FIND_VARIANT_ANY_COLOR = db.prepare(`
  SELECT v.id FROM variants v
  JOIN product_models m ON m.id = v.model_id
  JOIN products p ON p.id = m.product_id
  WHERE p.id = ? AND m.name = ? AND v.storage = ?
  ORDER BY v.is_active DESC, v.stock DESC, v.id ASC
  LIMIT 1
`);

function findVariantForItem(item) {
  // El item puede traer el variant_id resuelto (órdenes manuales del admin).
  if (item.variant_id) {
    const v = SELECT_VARIANT.get(item.variant_id);
    if (v) return { id: v.id, exact: true };
  }
  if (item.color) {
    const hit = FIND_VARIANT_WITH_COLOR.get(item.phoneId, item.model, item.storage, item.color);
    if (hit) return { id: hit.id, exact: true };
  }
  const any = FIND_VARIANT_ANY_COLOR.get(item.phoneId, item.model, item.storage);
  return any ? { id: any.id, exact: false } : null;
}

// Descuenta stock de todos los items de una orden aprobada (idempotente vía order_id).
function commitOrderSale(order) {
  const alreadyMoved = db.prepare(`
    SELECT COUNT(*) AS n FROM stock_movements WHERE order_id = ? AND reason = 'sale'
  `);

  if (alreadyMoved.get(order.id).n > 0) return { skipped: true };

  const out = [];
  const missing = [];
  for (const item of order.items || []) {
    const variant = findVariantForItem(item);
    if (!variant) {
      const label = `${item.model} ${item.storage}${item.color ? " " + item.color : ""}`;
      console.warn(`[stock] no se encontró variant para ${label} (orden ${order.id})`);
      missing.push(label);
      continue;
    }
    const note = variant.exact
      ? `Venta orden ${order.id}`
      : `Venta orden ${order.id} — color sin match exacto, descontado del color con más stock`;
    adjust({
      variant_id: variant.id,
      delta: -Number(item.qty || 1),
      reason: "sale",
      order_id: order.id,
      note,
    });
    out.push(variant.id);
  }
  return { skipped: false, updated: out, missing };
}

module.exports = { adjust, listMovements, commitOrderSale, findVariantForItem };
