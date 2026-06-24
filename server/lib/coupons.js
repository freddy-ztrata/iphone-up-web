// Cupones: validación y aplicación al subtotal del carro.
//
// API:
//   validate(code, { subtotal, items }) → { ok, coupon, discount, reason? }
//   incrementUsage(code)                 → registra que el cupón fue usado

const db = require("../db");

const FIND = db.prepare("SELECT * FROM coupons WHERE code = ? COLLATE NOCASE");
const INCREMENT = db.prepare(`
  UPDATE coupons SET used_count = used_count + 1, updated_at = datetime('now')
  WHERE code = ? COLLATE NOCASE
`);

function nowIso() { return new Date().toISOString(); }

function rowToCoupon(r) {
  if (!r) return null;
  return {
    id: r.id,
    code: r.code,
    type: r.type,
    value: r.value,
    min_subtotal: r.min_subtotal,
    max_uses: r.max_uses,
    used_count: r.used_count,
    starts_at: r.starts_at,
    ends_at: r.ends_at,
    applies_to: r.applies_to,
    is_active: Boolean(r.is_active),
  };
}

/**
 * Valida un cupón contra un carro.
 * @param {string} code
 * @param {object} cart  { subtotal, items: [{ phoneId, sealed, ... }] }
 * @returns {{ok, coupon?, discount?, reason?}}
 */
function validate(code, cart = {}) {
  if (!code) return { ok: false, reason: "Sin código" };
  const row = FIND.get(code);
  if (!row) return { ok: false, reason: "Cupón no existe" };
  const coupon = rowToCoupon(row);

  if (!coupon.is_active) return { ok: false, reason: "Cupón inactivo" };

  const now = nowIso();
  if (coupon.starts_at && now < coupon.starts_at) return { ok: false, reason: "Cupón aún no vigente" };
  if (coupon.ends_at && now > coupon.ends_at) return { ok: false, reason: "Cupón vencido" };

  if (coupon.max_uses != null && coupon.used_count >= coupon.max_uses) {
    return { ok: false, reason: "Cupón agotado" };
  }

  const subtotal = Number(cart.subtotal || 0);
  if (subtotal < (coupon.min_subtotal || 0)) {
    return { ok: false, reason: `Subtotal mínimo $${coupon.min_subtotal.toLocaleString("es-CL")}` };
  }

  // applies_to: 'all' | 'line:14' | 'sealed' (extensible)
  const items = cart.items || [];
  let eligibleSubtotal = subtotal;
  if (coupon.applies_to && coupon.applies_to !== "all") {
    if (coupon.applies_to.startsWith("line:")) {
      const lineId = parseInt(coupon.applies_to.slice(5), 10);
      eligibleSubtotal = items
        .filter(i => Number(i.phoneId) === lineId)
        .reduce((a, i) => a + Number(i.price || 0) * Number(i.qty || 1), 0);
    } else if (coupon.applies_to === "sealed") {
      eligibleSubtotal = items
        .filter(i => i.sealed)
        .reduce((a, i) => a + Number(i.price || 0) * Number(i.qty || 1), 0);
    }
    if (eligibleSubtotal <= 0) return { ok: false, reason: "Cupón no aplica a estos productos" };
  }

  let discount = 0;
  if (coupon.type === "percent") {
    discount = Math.round((eligibleSubtotal * coupon.value) / 100);
  } else {
    discount = Math.min(coupon.value, eligibleSubtotal);
  }

  return { ok: true, coupon, discount };
}

function incrementUsage(code) {
  if (!code) return;
  INCREMENT.run(code);
}

module.exports = { validate, incrementUsage };
