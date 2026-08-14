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

// ----- Precios de recompra (trade-in) -----
// Antes vivían hardcodeados en catalog-extras.js. Ahora la fuente de verdad es
// esta key; catalog-extras queda como DEFAULT de fábrica para instalaciones que
// nunca los editaron (y como red de seguridad si el JSON guardado se corrompe).
const TRADEIN_KEY = "tradein_prices";

// Shape: { "iPhone 14 Pro": { "128GB": 400000, "256GB": 420000 }, ... }
// Se valida al guardar para que el frontend nunca reciba algo que rompa el
// <select> de "vende tu iPhone".
function normalizeTradein(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const out = {};
  for (const [model, caps] of Object.entries(raw)) {
    const name = String(model).trim();
    if (!name || !caps || typeof caps !== "object" || Array.isArray(caps)) continue;
    const entry = {};
    for (const [cap, price] of Object.entries(caps)) {
      const label = String(cap).trim();
      const value = Math.round(Number(price));
      // Un precio 0 o negativo significaría "pagamos nada": se descarta la
      // capacidad en vez de mostrarla, igual que si no estuviera cotizada.
      if (label && Number.isFinite(value) && value > 0) entry[label] = value;
    }
    if (Object.keys(entry).length) out[name] = entry;
  }
  return Object.keys(out).length ? out : null;
}

function getTradeinPrices() {
  const raw = getRaw(TRADEIN_KEY);
  if (raw) {
    try {
      const parsed = normalizeTradein(JSON.parse(raw));
      if (parsed) return parsed;
      console.warn("[settings] tradein_prices guardado no es válido — usando defaults");
    } catch (err) {
      console.warn("[settings] tradein_prices no parsea:", err.message);
    }
  }
  return require("./catalog-extras").TRADEIN_PRICES;
}

function setTradeinPrices(value) {
  const clean = normalizeTradein(value);
  if (!clean) throw new Error("Formato inválido: { \"iPhone X\": { \"128GB\": 100000 } } con precios > 0");
  setRaw(TRADEIN_KEY, JSON.stringify(clean));
  return clean;
}

// Vuelve a los precios de fábrica (borra la key para que caiga al default).
function resetTradeinPrices() {
  db.prepare("DELETE FROM settings WHERE key = ?").run(TRADEIN_KEY);
  return getTradeinPrices();
}

module.exports = {
  getRaw, setRaw,
  getPaymentFee, setPaymentFee,
  getTradeinPrices, setTradeinPrices, resetTradeinPrices,
};
