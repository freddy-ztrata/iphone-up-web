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

// ----- Emails + carritos abandonados -----
// Cascada de resolución para CADA campo: valor guardado en `settings` → env →
// default de fábrica. La env existe para poder configurar el remitente en el
// deploy sin entrar al panel; el panel gana si el cliente lo tocó alguna vez.
//
// Los tres campos que Freddy todavía no definió (reply-to, correo interno,
// cupón de recuperación) tienen default "" a propósito: vacío significa
// "omitir esa parte", NO "usar un placeholder". Un reply-to inventado rebota y
// un correo interno inventado le manda las ventas a un tercero.
const EMAIL_DEFAULTS = {
  // Interruptor general. En false NADA sale (ni transaccional): el mailer
  // registra el intento como `disabled` y sigue.
  enabled: true,
  // Remitente. `onboarding@resend.dev` es el sandbox documentado de Resend:
  // solo entrega al dueño de la cuenta, así que es imposible spamear a un
  // tercero con la config de fábrica. Reemplazar por el dominio verificado.
  from: "iPhone UP <onboarding@resend.dev>",
  // "" ⇒ no se manda la cabecera Reply-To (las respuestas van al `from`).
  replyTo: "",
  // "" ⇒ los avisos internos de venta nueva quedan desactivados. Admite varios
  // destinatarios separados por coma (ver parseEmailList).
  internalTo: "",
  cartRemindersEnabled: true,
  cartReminder1hEnabled: true,
  cartReminder24hEnabled: true,
  cartReminder1hHours: 1,
  cartReminder24hHours: 24,
  cartExpireDays: 14,
  // "" ⇒ los recordatorios NO ofrecen descuento (default aprobado).
  cartCouponCode: "",
  followupEnabled: true,
  followupDays: 7,
  // Captura del email en el checkout (con su leyenda visible).
  captureEnabled: true,
};

const EMAIL_KEYS = {
  enabled:               { key: "emails_enabled",                type: "bool",   env: "EMAILS_ENABLED" },
  from:                  { key: "emails_from",                   type: "string", env: "EMAIL_FROM" },
  replyTo:               { key: "emails_reply_to",               type: "string", env: "EMAIL_REPLY_TO" },
  internalTo:            { key: "emails_internal_to",            type: "string", env: "EMAIL_INTERNAL_TO" },
  cartRemindersEnabled:  { key: "cart_reminders_enabled",        type: "bool" },
  cartReminder1hEnabled: { key: "cart_reminder_1h_enabled",      type: "bool" },
  cartReminder24hEnabled:{ key: "cart_reminder_24h_enabled",     type: "bool" },
  cartReminder1hHours:   { key: "cart_reminder_1h_hours",        type: "number", min: 0.25, max: 240 },
  cartReminder24hHours:  { key: "cart_reminder_24h_hours",       type: "number", min: 0.5,  max: 720 },
  cartExpireDays:        { key: "cart_expire_days",              type: "number", min: 1,    max: 180 },
  cartCouponCode:        { key: "cart_coupon_code",              type: "string" },
  followupEnabled:       { key: "email_followup_enabled",        type: "bool" },
  followupDays:          { key: "email_followup_days",           type: "number", min: 1,    max: 180 },
  captureEnabled:        { key: "email_capture_enabled",         type: "bool" },
};

function parseBool(raw, fallback) {
  if (raw == null || raw === "") return fallback;
  const s = String(raw).trim().toLowerCase();
  if (["true", "1", "yes", "on"].includes(s)) return true;
  if (["false", "0", "no", "off"].includes(s)) return false;
  return fallback;
}

function parseNumber(raw, fallback, { min, max } = {}) {
  if (raw == null || raw === "") return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  if (min != null && n < min) return min;
  if (max != null && n > max) return max;
  return n;
}

function getEmailConfig() {
  const out = {};
  for (const [field, spec] of Object.entries(EMAIL_KEYS)) {
    const fallback = spec.env ? (process.env[spec.env] ?? EMAIL_DEFAULTS[field]) : EMAIL_DEFAULTS[field];
    const raw = getRaw(spec.key);
    if (spec.type === "bool") out[field] = parseBool(raw, parseBool(fallback, EMAIL_DEFAULTS[field]));
    else if (spec.type === "number") out[field] = parseNumber(raw, parseNumber(fallback, EMAIL_DEFAULTS[field], spec), spec);
    else out[field] = String(raw ?? fallback ?? "").trim();
  }
  // El aviso interno puede tener varios destinatarios. Se expone de las dos
  // formas: `internalToList` es la canónica (la que usa el mailer y el panel) y
  // `internalTo` queda como string normalizado — sigue siendo "" cuando no hay
  // ninguno, así que todo lo que preguntaba `if (config.internalTo)` para saber
  // si está activado sigue funcionando igual.
  out.internalToList = parseEmailList(out.internalTo).list;
  out.internalTo = out.internalToList.join(", ");
  return out;
}

// Un email "suelto" (sin display name) para validar destinatarios internos y
// reply-to. Deliberadamente laxo: no queremos rechazar direcciones válidas
// raras, solo atajar los errores de tipeo obvios y cualquier CR/LF (inyección
// de cabeceras si terminara pegado en un header SMTP).
const EMAIL_RE = /^[^\s@<>",;:]+@[^\s@<>",;:]+\.[^\s@<>",;:]{2,}$/;

function isEmail(value) {
  const s = String(value || "").trim();
  return s.length <= 254 && EMAIL_RE.test(s);
}

// Tope de destinatarios del aviso interno. No hay caso operativo para más y
// evita que un pegado accidental convierta el aviso de venta en una lista de
// correo (cada destinatario es un envío más al proveedor).
const INTERNAL_TO_MAX = 10;

/**
 * Normaliza una lista de destinatarios.
 *
 * Acepta un array (lo que manda el panel) o un string con comas, punto y coma o
 * saltos de línea — que es como quedaba guardado el valor viejo de un solo
 * correo y también lo que sale de pegar una columna de planilla. Por eso NO hay
 * migración de datos: `"ventas@x.cl"` entra por el mismo camino y sale como una
 * lista de uno.
 *
 * Devuelve `{ list, invalid }` en vez de lanzar: quien llama decide si un
 * inválido es error duro (guardar) o algo que se descarta (leer lo guardado).
 */
function parseEmailList(value) {
  const parts = (Array.isArray(value) ? value : [value])
    .flatMap(v => String(v ?? "").split(/[,;\n\r\t]+/));
  const list = [];
  const invalid = [];
  const seen = new Set();
  for (const part of parts) {
    // "Ventas <ventas@dominio.cl>" → "ventas@dominio.cl": es lo que copia
    // cualquier cliente de correo y el usuario no tiene por qué limpiarlo.
    let s = String(part ?? "").trim();
    const named = s.match(/^[^<>]*<([^<>]+)>$/);
    if (named) s = named[1].trim();
    if (!s) continue;
    if (!isEmail(s)) { invalid.push(s.slice(0, 80)); continue; }
    // Dedupe sin distinguir mayúsculas: el dominio no las distingue y mandar el
    // mismo aviso dos veces a la misma persona no le sirve a nadie.
    const key = s.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    list.push(s);
  }
  return { list, invalid };
}

// `from` puede venir como "Nombre <mail@dominio>" o solo "mail@dominio".
function isFromAddress(value) {
  const s = String(value || "").trim();
  if (/[\r\n]/.test(s)) return false;
  const m = s.match(/^(.*)<([^<>]+)>$/);
  return isEmail(m ? m[2] : s);
}

function setEmailConfig(patch = {}) {
  for (const [field, spec] of Object.entries(EMAIL_KEYS)) {
    if (!(field in patch) || patch[field] == null) continue;
    const value = patch[field];
    if (spec.type === "bool") {
      setRaw(spec.key, value ? "true" : "false");
    } else if (spec.type === "number") {
      const n = Number(value);
      if (!Number.isFinite(n)) throw new Error(`${field} debe ser un número`);
      if (spec.min != null && n < spec.min) throw new Error(`${field} mínimo ${spec.min}`);
      if (spec.max != null && n > spec.max) throw new Error(`${field} máximo ${spec.max}`);
      setRaw(spec.key, String(n));
    } else if (field === "internalTo") {
      // Puede venir como array (panel) o como string con separadores (env,
      // valor viejo, API). Se guarda siempre como lista separada por comas.
      const { list, invalid } = parseEmailList(value);
      if (invalid.length) {
        const muestra = invalid.slice(0, 3).map(v => `"${v}"`).join(", ");
        throw new Error(`internalTo inválido: ${muestra} no ${invalid.length > 1 ? "son correos" : "es un correo"}`);
      }
      if (list.length > INTERNAL_TO_MAX) {
        throw new Error(`internalTo admite hasta ${INTERNAL_TO_MAX} destinatarios (llegaron ${list.length})`);
      }
      // Lista vacía = avisos internos desactivados, igual que el string vacío.
      if (!list.length) { db.prepare("DELETE FROM settings WHERE key = ?").run(spec.key); continue; }
      setRaw(spec.key, list.join(", "));
    } else {
      const s = String(value).trim();
      // Vaciar es una acción válida y significa "volver al default/omitir".
      if (s === "") { db.prepare("DELETE FROM settings WHERE key = ?").run(spec.key); continue; }
      if (field === "from" && !isFromAddress(s)) {
        throw new Error('from inválido: usa "Nombre <correo@dominio.cl>" o "correo@dominio.cl"');
      }
      if (field === "replyTo" && !isEmail(s)) {
        throw new Error(`${field} inválido: debe ser un correo (o vacío para desactivarlo)`);
      }
      if (field === "cartCouponCode" && !/^[A-Za-z0-9._-]{2,40}$/.test(s)) {
        throw new Error("cartCouponCode inválido: 2–40 caracteres alfanuméricos, punto, guion o guion bajo");
      }
      setRaw(spec.key, s);
    }
  }
  return getEmailConfig();
}

module.exports = {
  getRaw, setRaw,
  getPaymentFee, setPaymentFee,
  getTradeinPrices, setTradeinPrices, resetTradeinPrices,
  getEmailConfig, setEmailConfig, isEmail, parseEmailList, EMAIL_DEFAULTS,
  INTERNAL_TO_MAX,
};
