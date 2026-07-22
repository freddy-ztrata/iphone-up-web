// Configuración editable desde el admin, persistida en la tabla `settings`
// (key TEXT PRIMARY KEY, value TEXT). Fuente de verdad de flags/parámetros que
// el cliente puede cambiar sin tocar código (ej. la comisión del medio de pago).

const db = require("../db");

const GET = db.prepare("SELECT value FROM settings WHERE key = ?");
const SET = db.prepare("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))");

function getRaw(key, fallback = null) {
  const row = GET.get(key);
  return row ? row.value : fallback;
}
function setRaw(key, value) {
  SET.run(key, String(value));
}

// ----- Comisión del medio de pago -----
const FEE_RATE_KEY = "payment_fee_rate";        // fracción 0..1 (0.035 = 3,5%)
const FEE_ENABLED_KEY = "payment_fee_enabled";  // "true" | "false"
const DEFAULT_RATE = 0.035;

// Devuelve { rate:Number(0..1), enabled:Boolean }. Por default: ACTIVADA a 3,5%.
function getPaymentFee() {
  const rateRaw = getRaw(FEE_RATE_KEY);
  const enabledRaw = getRaw(FEE_ENABLED_KEY);
  let rate = rateRaw != null ? parseFloat(rateRaw) : DEFAULT_RATE;
  if (!Number.isFinite(rate) || rate < 0) rate = DEFAULT_RATE;
  rate = Math.min(rate, 1);
  const enabled = enabledRaw == null ? true : (enabledRaw === "true" || enabledRaw === "1");
  return { rate, enabled };
}

function setPaymentFee({ rate, enabled } = {}) {
  if (rate != null) {
    const r = parseFloat(rate);
    if (Number.isFinite(r) && r >= 0) setRaw(FEE_RATE_KEY, String(Math.min(r, 1)));
  }
  if (enabled != null) setRaw(FEE_ENABLED_KEY, enabled ? "true" : "false");
  return getPaymentFee();
}

module.exports = { getRaw, setRaw, getPaymentFee, setPaymentFee };
