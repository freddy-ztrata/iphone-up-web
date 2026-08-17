// Carritos capturados / abandonados.
//
// Un "cart" es el snapshot de lo que el cliente tenía en el carro cuando dejó
// su email en el checkout. Sirve para dos cosas: mandarle un recordatorio y
// devolverle el carro tal cual con un link firmado.
//
// SEGURIDAD — dos decisiones que importan:
//
//   1. Los PRECIOS no se creen. Cada item se re-resuelve contra la variante
//      real de la DB (stock.findVariantForItem) y se usa el precio de la DB.
//      Si aceptáramos el precio del body, cualquiera podría postear un carro
//      con "iPhone 17 Pro Max — $1" y ese número aparecería en un email
//      firmado con nuestro dominio, y peor, en el carro restaurado.
//
//   2. El `token` es de crypto.randomBytes(16) (32 hex). Es la credencial que
//      da acceso a los datos del carro, así que nunca se deriva del id ni del
//      email. Helmet manda `Referrer-Policy: no-referrer`, así que el token no
//      se filtra a terceros cuando el cliente hace clic desde el email.

const crypto = require("crypto");
const db = require("../db");
const stock = require("./stock");
const settings = require("./settings");

const MAX_ITEMS = 20;

const INSERT = db.prepare(`
  INSERT INTO carts (token, email, name, phone, items_json, item_count, subtotal,
                     consent, source, expires_at, ip, user_agent)
  VALUES (@token, @email, @name, @phone, @items_json, @item_count, @subtotal,
          @consent, @source, @expires_at, @ip, @user_agent)
`);

const UPDATE = db.prepare(`
  UPDATE carts SET
    email      = COALESCE(@email, email),
    name       = COALESCE(@name, name),
    phone      = COALESCE(@phone, phone),
    items_json = @items_json,
    item_count = @item_count,
    subtotal   = @subtotal,
    consent    = MAX(consent, @consent),
    source     = COALESCE(@source, source),
    expires_at = @expires_at,
    -- Un carro que ya se convirtió no vuelve a 'active' porque el cliente
    -- reabra el checkout: se quedaría en la cola de recordatorios para siempre.
    status     = CASE WHEN status IN ('converted') THEN status ELSE 'active' END,
    updated_at = datetime('now')
  WHERE id = @id
`);

const BY_TOKEN = db.prepare("SELECT * FROM carts WHERE token = ?");
const BY_ID = db.prepare("SELECT * FROM carts WHERE id = ?");

// Resuelve los datos reales de una variante para pintarlos en el email y en el
// carro restaurado. `cost` jamás se selecciona acá (es interno del admin).
const VARIANT_DETAIL = db.prepare(`
  SELECT v.id, v.storage, v.color, v.price, v.stock, v.is_active,
         m.name AS model, m.sealed, m.img AS model_img,
         p.id AS product_id, p.hero_img, p.hidden
  FROM variants v
  JOIN product_models m ON m.id = v.model_id
  JOIN products p ON p.id = m.product_id
  WHERE v.id = ?
`);

function newToken() {
  return crypto.randomBytes(16).toString("hex");
}

/** "YYYY-MM-DD HH:MM:SS" en UTC, igual formato que datetime('now') de SQLite. */
function sqlDate(date) {
  return date.toISOString().slice(0, 19).replace("T", " ");
}

/**
 * Normaliza los items del body al shape del carro, resolviendo cada uno contra
 * la DB. Los que no resuelven se descartan: preferimos un email con 2 de 3
 * productos antes que uno con datos inventados.
 *
 * @returns {{items: Array, subtotal: number, itemCount: number, dropped: number}}
 */
function sanitizeItems(rawItems) {
  const out = [];
  let dropped = 0;

  for (const raw of (Array.isArray(rawItems) ? rawItems : []).slice(0, MAX_ITEMS)) {
    if (!raw || typeof raw !== "object") { dropped++; continue; }
    const qty = Math.min(Math.max(1, Math.round(Number(raw.qty) || 1)), 10);

    const found = stock.findVariantForItem({
      variant_id: Number(raw.variant_id) || undefined,
      phoneId: Number(raw.phoneId),
      model: typeof raw.model === "string" ? raw.model : "",
      storage: typeof raw.storage === "string" ? raw.storage : "",
      color: typeof raw.color === "string" ? raw.color : "",
    });
    if (!found) { dropped++; continue; }

    const v = VARIANT_DETAIL.get(found.id);
    if (!v) { dropped++; continue; }

    // Mismo shape que window.cartStore — es el contrato cruzado del repo
    // ({model, storage, color, price, sealed, phoneId, img}). No agregar campos
    // acá sin tocar app.js / product.js / checkout.js / mercadopago.js.
    out.push({
      model: v.model,
      storage: v.storage,
      color: v.color || "",
      price: v.price,
      sealed: !!v.sealed,
      phoneId: v.product_id,
      img: v.model_img || v.hero_img || "",
      qty,
      variant_id: v.id,
      // Solo informativo para el panel; el frontend lo ignora al restaurar.
      available: !!v.is_active && !v.hidden && v.stock > 0,
    });
  }

  const subtotal = out.reduce((a, i) => a + i.price * i.qty, 0);
  const itemCount = out.reduce((a, i) => a + i.qty, 0);
  return { items: out, subtotal, itemCount, dropped };
}

function rowToCart(row) {
  if (!row) return null;
  let items = [];
  try { items = JSON.parse(row.items_json || "[]"); } catch { items = []; }
  return {
    id: row.id,
    token: row.token,
    email: row.email || null,
    name: row.name || null,
    phone: row.phone || null,
    items,
    itemCount: row.item_count,
    subtotal: row.subtotal,
    status: row.status,
    consent: !!row.consent,
    source: row.source || null,
    orderId: row.order_id || null,
    reminder1hSentAt: row.reminder_1h_sent_at || null,
    reminder24hSentAt: row.reminder_24h_sent_at || null,
    recoveredAt: row.recovered_at || null,
    convertedAt: row.converted_at || null,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Crea o actualiza un carro. Si viene `token` y existe, actualiza esa fila;
 * si no, crea una nueva y devuelve el token generado.
 *
 * @param {object} params
 * @param {string} [params.token]
 * @param {string} [params.email]
 * @param {string} [params.name]
 * @param {string} [params.phone]
 * @param {Array}  params.items    shape del carro público
 * @param {boolean}[params.consent]
 * @param {string} [params.source]
 * @param {string} [params.ip]
 * @param {string} [params.userAgent]
 */
function upsert(params = {}) {
  const config = settings.getEmailConfig();
  const { items, subtotal, itemCount, dropped } = sanitizeItems(params.items);
  const expiresAt = sqlDate(new Date(Date.now() + config.cartExpireDays * 24 * 60 * 60 * 1000));

  const email = params.email && settings.isEmail(params.email)
    ? String(params.email).trim().toLowerCase()
    : null;
  const name = params.name ? String(params.name).trim().slice(0, 120) : null;
  const phone = params.phone ? String(params.phone).trim().slice(0, 40) : null;

  const existing = params.token ? BY_TOKEN.get(String(params.token)) : null;

  if (existing) {
    UPDATE.run({
      id: existing.id,
      email, name, phone,
      items_json: JSON.stringify(items),
      item_count: itemCount,
      subtotal,
      consent: params.consent ? 1 : 0,
      source: params.source ? String(params.source).slice(0, 40) : null,
      expires_at: expiresAt,
    });
    return { cart: rowToCart(BY_ID.get(existing.id)), created: false, dropped };
  }

  const token = newToken();
  INSERT.run({
    token,
    email, name, phone,
    items_json: JSON.stringify(items),
    item_count: itemCount,
    subtotal,
    consent: params.consent ? 1 : 0,
    source: params.source ? String(params.source).slice(0, 40) : "checkout",
    expires_at: expiresAt,
    ip: params.ip ? String(params.ip).slice(0, 64) : null,
    user_agent: params.userAgent ? String(params.userAgent).slice(0, 300) : null,
  });
  return { cart: rowToCart(BY_TOKEN.get(token)), created: true, dropped };
}

function getByToken(token) {
  return rowToCart(BY_TOKEN.get(String(token || "")));
}

function getById(id) {
  return rowToCart(BY_ID.get(Number(id)));
}

/** El cliente volvió por el link del email. No cancela los recordatorios: si
 *  vuelve y no compra, el segundo aviso sigue teniendo sentido. */
function markRecovered(token) {
  db.prepare(`
    UPDATE carts SET
      status = CASE WHEN status = 'active' THEN 'recovered' ELSE status END,
      recovered_at = COALESCE(recovered_at, datetime('now')),
      updated_at = datetime('now')
    WHERE token = ?
  `).run(String(token || ""));
  return getByToken(token);
}

/** Terminó en una orden: sale de la cola de recordatorios para siempre. */
function markConverted(token, orderId) {
  if (!token) return null;
  db.prepare(`
    UPDATE carts SET
      status = 'converted',
      order_id = @order_id,
      converted_at = COALESCE(converted_at, datetime('now')),
      updated_at = datetime('now')
    WHERE token = @token
  `).run({ token: String(token), order_id: orderId ? String(orderId) : null });
  return getByToken(token);
}

/** Marca vencidos los carros pasados de fecha. Devuelve cuántos cambió. */
function expireOld() {
  const r = db.prepare(`
    UPDATE carts SET status = 'expired', updated_at = datetime('now')
    WHERE status IN ('active','recovered') AND expires_at <= datetime('now')
  `).run();
  return r.changes;
}

/**
 * Carros que toca recordar. `kind` es '1h' o '24h'.
 * Condiciones: activo/recuperado, con email, con consentimiento, con items,
 * SIN ACTIVIDAD desde hace ≥ el umbral configurado y sin ese recordatorio ya
 * enviado. Para el de 24h además exigimos que el de 1h ya haya salido (o esté
 * desactivado), para no mandar los dos juntos si el scheduler arrancó tarde.
 *
 * El umbral corre contra `updated_at`, no contra `created_at`: "carro
 * abandonado" es tiempo desde la ÚLTIMA señal de vida, no desde que empezó.
 * Con created_at, alguien que abre el checkout, deja su email y se toma 70
 * minutos en decidirse recibía el "dejaste algo en tu carro" con la pestaña
 * todavía abierta. `updated_at` se mueve con cada captura y con markRecovered
 * (el clic en el link del primer email), que es exactamente lo que queremos.
 */
function dueForReminder(kind, limit = 50) {
  const config = settings.getEmailConfig();
  const hours = kind === "1h" ? config.cartReminder1hHours : config.cartReminder24hHours;
  const column = kind === "1h" ? "reminder_1h_sent_at" : "reminder_24h_sent_at";
  const extra = kind === "24h" && config.cartReminder1hEnabled ? "AND reminder_1h_sent_at IS NOT NULL" : "";

  const rows = db.prepare(`
    SELECT * FROM carts
    WHERE status IN ('active','recovered')
      AND email IS NOT NULL AND email != ''
      AND consent = 1
      AND item_count > 0
      AND ${column} IS NULL
      AND updated_at <= datetime('now', @offset)
      AND expires_at > datetime('now')
      ${extra}
    ORDER BY created_at ASC
    LIMIT @limit
  `).all({
    // SQLite acepta fracciones de hora en el modificador ('-1.5 hours').
    offset: `-${hours} hours`,
    limit: Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200),
  });

  return rows.map(rowToCart);
}

// OJO: NO toca `updated_at` a propósito. Ese campo es el reloj de "última
// señal de vida del cliente" que usa dueForReminder(); si el envío del primer
// recordatorio lo moviera, el segundo se agendaría 24h después del email en vez
// de 24h después de que la persona dejó el carro.
function markReminderSent(cartId, kind) {
  const column = kind === "1h" ? "reminder_1h_sent_at" : "reminder_24h_sent_at";
  db.prepare(`UPDATE carts SET ${column} = datetime('now') WHERE id = ?`).run(Number(cartId));
}

/** URL de recuperación que va en el email. */
function resumeUrl(token) {
  const base = (process.env.PUBLIC_URL || "http://localhost:8080").replace(/\/$/, "");
  return `${base}/checkout?rc=${encodeURIComponent(token)}`;
}

// ----- Panel -----

function list({ status, q, has_email, from, to, limit = 50, offset = 0 } = {}) {
  const where = [];
  const params = {};
  if (status) { where.push("status = @status"); params.status = String(status); }
  if (has_email === "1" || has_email === true) where.push("email IS NOT NULL AND email != ''");
  if (has_email === "0" || has_email === false) where.push("(email IS NULL OR email = '')");
  if (q) {
    where.push("(email LIKE @q OR name LIKE @q OR items_json LIKE @q OR token = @exact)");
    params.q = `%${String(q).trim()}%`;
    params.exact = String(q).trim();
  }
  if (from) { where.push("date(created_at) >= @from"); params.from = String(from).slice(0, 10); }
  if (to) { where.push("date(created_at) <= @to"); params.to = String(to).slice(0, 10); }
  const clause = where.length ? "WHERE " + where.join(" AND ") : "";

  const lim = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200);
  const off = Math.max(parseInt(offset, 10) || 0, 0);
  const total = db.prepare(`SELECT COUNT(*) AS n FROM carts ${clause}`).get(params).n;
  const rows = db.prepare(`
    SELECT * FROM carts ${clause} ORDER BY created_at DESC, id DESC LIMIT @limit OFFSET @offset
  `).all({ ...params, limit: lim, offset: off });

  return { carts: rows.map(rowToCart), page: { total, limit: lim, offset: off, hasMore: off + rows.length < total } };
}

/** KPIs de la vista Carritos. `recoveryRate` = convertidos / con email. */
function summary() {
  const row = db.prepare(`
    SELECT
      COUNT(*)                                                                  AS total,
      SUM(CASE WHEN status = 'active'    THEN 1 ELSE 0 END)                     AS active,
      SUM(CASE WHEN status = 'recovered' THEN 1 ELSE 0 END)                     AS recovered,
      SUM(CASE WHEN status = 'converted' THEN 1 ELSE 0 END)                     AS converted,
      SUM(CASE WHEN status = 'expired'   THEN 1 ELSE 0 END)                     AS expired,
      SUM(CASE WHEN email IS NOT NULL AND email != '' THEN 1 ELSE 0 END)        AS with_email,
      SUM(CASE WHEN status IN ('active','recovered') THEN subtotal ELSE 0 END)  AS open_value,
      SUM(CASE WHEN status = 'converted' THEN subtotal ELSE 0 END)              AS recovered_value
    FROM carts
  `).get();
  const withEmail = row.with_email || 0;
  return {
    ...row,
    recoveryRate: withEmail > 0 ? Math.round((row.converted / withEmail) * 1000) / 10 : 0,
  };
}

function remove(id) {
  return db.prepare("DELETE FROM carts WHERE id = ?").run(Number(id)).changes;
}

module.exports = {
  upsert, getByToken, getById, markRecovered, markConverted,
  expireOld, dueForReminder, markReminderSent, resumeUrl,
  list, summary, remove, sanitizeItems, MAX_ITEMS,
};
