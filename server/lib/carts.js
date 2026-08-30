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

// =============================================================================
// "COMPRÓ" = ORDEN CON PAGO APROBADO. NADA MÁS.
// =============================================================================
// Abrir el checkout no es comprar. Dejar el email no es comprar. Crear una
// preferencia de Mercado Pago TAMPOCO es comprar: en ese momento el cliente
// todavía no vio la pantalla de pago. Antes de este fix, POST /preference
// marcaba el carro como 'converted', así que el panel mostraba "Compró" para
// gente que abandonó en MP, esos carros salían para siempre de la cola de
// recordatorios (se perdía justo la recuperación que más vale) y el KPI de
// recuperados contaba intenciones como ventas.
//
// Regla única: el estado de compra lo define la ORDEN vinculada, y la orden solo
// llega a 'approved' por el webhook firmado de MP (server/routes/mercadopago.js).
//
// Por eso el estado que ve el panel es DERIVADO en cada lectura
// (`effective_status`) en vez de confiar en la columna `status`: además de
// arreglar el flujo nuevo, normaliza sin borrar nada los carros que ya quedaron
// mal marcados en producción. La columna se repara aparte y de forma idempotente
// con repairFalseConversions().

/** Único estado de orden que significa "compró". */
const PAID_STATUS = "approved";

/** Órdenes en las que el pago está en curso: NO es compra, pero tampoco es
 *  un carro "que nunca intentó nada". El panel lo muestra como pago pendiente. */
const PENDING_STATUSES = ["pending", "in_process"];

/** Un carro cuya orden ya se pagó alguna vez no vuelve a la cola de
 *  recuperación aunque después se haya devuelto o contracargado la plata. */
const NO_REMIND_STATUSES = ["approved", "refunded", "charged_back"];

// Estado efectivo. `c` = carts, `o` = la orden vinculada (LEFT JOIN, puede no
// existir). El segundo CASE es la normalización de los datos históricos: un
// carro marcado 'converted' sin pago aprobado vuelve al estado recuperable que
// le corresponde según su propia historia.
const EFFECTIVE_STATUS = `
  CASE
    WHEN o.status = '${PAID_STATUS}' THEN 'converted'
    WHEN c.status = 'converted' THEN
      CASE WHEN c.expires_at <= datetime('now') THEN 'expired'
           WHEN c.recovered_at IS NOT NULL      THEN 'recovered'
           ELSE 'active' END
    ELSE c.status
  END`;

const CART_SELECT = `
  SELECT c.*, o.status AS order_status, ${EFFECTIVE_STATUS} AS effective_status
  FROM carts c
  LEFT JOIN orders o ON o.id = c.order_id
`;

/** Sub-consulta reutilizable: "este carro terminó en una venta real". */
const HAS_PAID_ORDER = `
  EXISTS (SELECT 1 FROM orders o WHERE o.id = carts.order_id AND o.status = '${PAID_STATUS}')
`;

const sqlList = arr => arr.map(s => `'${s}'`).join(",");

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
    -- Pero "convertido" tiene que estar respaldado por un pago aprobado: si la
    -- orden vinculada quedó pending/rejected, el cliente que vuelve al checkout
    -- es exactamente a quien queremos seguir recuperando.
    status     = CASE WHEN status = 'converted' AND ${HAS_PAID_ORDER}
                      THEN 'converted' ELSE 'active' END,
    updated_at = datetime('now')
  WHERE id = @id
`);

const BY_TOKEN = db.prepare(`${CART_SELECT} WHERE c.token = ?`);
const BY_ID = db.prepare(`${CART_SELECT} WHERE c.id = ?`);

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

  // `status` es SIEMPRE el efectivo (derivado de la orden), nunca la columna
  // cruda: es lo que evita que un dato histórico mal marcado se muestre como
  // venta. La columna se expone aparte como `storedStatus` para diagnóstico.
  const orderStatus = row.order_status || null;
  const status = row.effective_status || row.status;
  const paid = orderStatus === PAID_STATUS;

  return {
    id: row.id,
    token: row.token,
    email: row.email || null,
    name: row.name || null,
    phone: row.phone || null,
    items,
    itemCount: row.item_count,
    subtotal: row.subtotal,
    status,
    storedStatus: row.status,
    consent: !!row.consent,
    source: row.source || null,
    orderId: row.order_id || null,
    // Estado real del pago de la orden vinculada. `null` = ni siquiera se llegó
    // a crear una preferencia.
    orderStatus,
    paid,
    paymentPending: PENDING_STATUSES.includes(orderStatus),
    paymentRejected: orderStatus === "rejected" || orderStatus === "cancelled",
    reminder1hSentAt: row.reminder_1h_sent_at || null,
    reminder24hSentAt: row.reminder_24h_sent_at || null,
    recoveredAt: row.recovered_at || null,
    // Sin pago aprobado no hay fecha de conversión que mostrar, aunque la
    // columna traiga una de cuando el bug la escribía al crear la preferencia.
    convertedAt: paid ? (row.converted_at || null) : null,
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

/**
 * El cliente llegó a crear una orden/preferencia de MP. Eso NO es una compra:
 * es una intención de pago. Guardamos el vínculo para dos cosas — que el panel
 * pueda mostrar el estado real del pago, y que el webhook sepa qué carro cerrar
 * cuando (y solo si) el pago se apruebe.
 *
 * El `status` del carro NO se toca a propósito: mientras la orden no esté
 * approved el carro sigue siendo recuperable y sigue en la cola de
 * recordatorios. `updated_at` tampoco se mueve — es el reloj de abandono que
 * usa dueForReminder(), y moverlo acá pospondría el recordatorio de alguien que
 * justo acaba de abandonar el pago, que es cuando más sentido tiene.
 *
 * No pisa el vínculo si el carro ya tiene una orden PAGADA (el cliente volvió a
 * comprar sobre el mismo token): esa venta no se pierde.
 */
function attachOrder(token, orderId) {
  if (!token || !orderId) return null;
  db.prepare(`
    UPDATE carts SET order_id = @order_id
    WHERE token = @token AND NOT ${HAS_PAID_ORDER}
  `).run({ token: String(token), order_id: String(orderId) });
  return getByToken(token);
}

/**
 * La orden vinculada se PAGÓ: el carro sale de la cola de recordatorios para
 * siempre. Lo llama únicamente el webhook de MP al ver `approved`.
 *
 * Defensa en profundidad: si la orden no está approved en la DB, no marca nada.
 * Un llamador equivocado no puede volver a inventar ventas.
 *
 * Idempotente: un webhook repetido del mismo pago no matchea el WHERE (el carro
 * ya está en 'converted'), así que ni `converted_at` ni `updated_at` se mueven.
 */
function markConverted(token, orderId) {
  if (!token) return null;
  db.prepare(`
    UPDATE carts SET
      status = 'converted',
      order_id = COALESCE(@order_id, order_id),
      converted_at = COALESCE(converted_at, datetime('now')),
      updated_at = datetime('now')
    WHERE token = @token
      AND status != 'converted'
      AND EXISTS (
        SELECT 1 FROM orders o
        WHERE o.id = COALESCE(@order_id, carts.order_id) AND o.status = '${PAID_STATUS}'
      )
  `).run({ token: String(token), order_id: orderId ? String(orderId) : null });
  return getByToken(token);
}

/**
 * Igual que markConverted() pero entrando por la orden, que es lo único que
 * tiene el webhook de MP (llega `external_reference`, no el token del carro).
 * Idempotente por el mismo WHERE. Devuelve cuántos carros cerró.
 */
function markConvertedByOrder(orderId) {
  if (!orderId) return 0;
  return db.prepare(`
    UPDATE carts SET
      status = 'converted',
      converted_at = COALESCE(converted_at, datetime('now')),
      updated_at = datetime('now')
    WHERE order_id = @order_id
      AND status != 'converted'
      AND EXISTS (SELECT 1 FROM orders o WHERE o.id = @order_id AND o.status = '${PAID_STATUS}')
  `).run({ order_id: String(orderId) }).changes;
}

/**
 * REPARACIÓN IDEMPOTENTE de los carros que quedaron marcados como comprados sin
 * una venta detrás — el rastro del bug que marcaba 'converted' al crear la
 * preferencia de MP.
 *
 * NO borra nada. Solo devuelve la columna `status` al estado recuperable que le
 * corresponde según su propia historia (vencido / volvió por el link / activo) y
 * limpia `converted_at`. `order_id` se CONSERVA: es el rastro de que esa persona
 * llegó a intentar pagar, y es lo que le permite al panel mostrar "pago
 * pendiente" o "pago rechazado" en vez de un carro anónimo.
 *
 * `updated_at` NO se toca: es el reloj de abandono de dueForReminder(). Moverlo
 * reprogramaría los recordatorios de todos los carros reparados de una.
 *
 * Idempotente por construcción: después de correr una vez el WHERE no matchea
 * ninguna fila. Se llama al boot y en cada tick del scheduler, así que un
 * deploy repara los datos históricos solo, sin migración ni intervención.
 *
 * Ojo: la lectura ya está normalizada (EFFECTIVE_STATUS), así que el panel
 * muestra lo correcto AUNQUE esta reparación no haya corrido todavía. Esto es
 * la limpieza de la columna, no la garantía.
 */
function repairFalseConversions() {
  const r = db.prepare(`
    UPDATE carts SET
      status = CASE
        WHEN expires_at <= datetime('now') THEN 'expired'
        WHEN recovered_at IS NOT NULL      THEN 'recovered'
        ELSE 'active' END,
      converted_at = NULL
    WHERE status = 'converted' AND NOT ${HAS_PAID_ORDER}
  `).run();
  if (r.changes > 0) {
    console.warn(`[carts] normalizados ${r.changes} carrito(s) marcados como comprados sin pago aprobado`);
  }
  return r.changes;
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
  const extra = kind === "24h" && config.cartReminder1hEnabled ? "AND c.reminder_1h_sent_at IS NOT NULL" : "";

  // El filtro corre sobre el estado EFECTIVO, no sobre la columna: un carro
  // pending/rejected sigue siendo recuperable (es el caso que más vale la pena
  // recordar) y uno con pago aprobado nunca recibe un "dejaste algo en el
  // carro" después de haber comprado. Los refunded/charged_back tampoco: ya
  // pagaron una vez, ese carro no es una venta pendiente.
  const rows = db.prepare(`
    ${CART_SELECT}
    WHERE ${EFFECTIVE_STATUS} IN ('active','recovered')
      AND (o.status IS NULL OR o.status NOT IN (${sqlList(NO_REMIND_STATUSES)}))
      AND c.email IS NOT NULL AND c.email != ''
      AND c.consent = 1
      AND c.item_count > 0
      AND c.${column} IS NULL
      AND c.updated_at <= datetime('now', @offset)
      AND c.expires_at > datetime('now')
      ${extra}
    ORDER BY c.created_at ASC
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

// El filtro `status` corre sobre el estado EFECTIVO: pedir "Compró" en el panel
// tiene que devolver solo pagos aprobados, no lo que diga la columna.
// `payment` filtra por el estado real de la orden vinculada, que es información
// distinta: un carro puede estar activo (recuperable) Y tener un pago pendiente.
function list({ status, payment, q, has_email, from, to, limit = 50, offset = 0 } = {}) {
  const where = [];
  const params = {};
  if (status) { where.push(`${EFFECTIVE_STATUS} = @status`); params.status = String(status); }
  if (payment === "approved") where.push(`o.status = '${PAID_STATUS}'`);
  else if (payment === "pending") where.push(`o.status IN (${sqlList(PENDING_STATUSES)})`);
  else if (payment === "rejected") where.push("o.status IN ('rejected','cancelled')");
  else if (payment === "none") where.push("c.order_id IS NULL");
  if (has_email === "1" || has_email === true) where.push("c.email IS NOT NULL AND c.email != ''");
  if (has_email === "0" || has_email === false) where.push("(c.email IS NULL OR c.email = '')");
  if (q) {
    where.push("(c.email LIKE @q OR c.name LIKE @q OR c.items_json LIKE @q OR c.token = @exact OR c.order_id = @exact)");
    params.q = `%${String(q).trim()}%`;
    params.exact = String(q).trim();
  }
  if (from) { where.push("date(c.created_at) >= @from"); params.from = String(from).slice(0, 10); }
  if (to) { where.push("date(c.created_at) <= @to"); params.to = String(to).slice(0, 10); }
  const clause = where.length ? "WHERE " + where.join(" AND ") : "";

  const lim = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200);
  const off = Math.max(parseInt(offset, 10) || 0, 0);
  const total = db.prepare(`
    SELECT COUNT(*) AS n FROM carts c LEFT JOIN orders o ON o.id = c.order_id ${clause}
  `).get(params).n;
  const rows = db.prepare(`
    ${CART_SELECT} ${clause} ORDER BY c.created_at DESC, c.id DESC LIMIT @limit OFFSET @offset
  `).all({ ...params, limit: lim, offset: off });

  return { carts: rows.map(rowToCart), page: { total, limit: lim, offset: off, hasMore: off + rows.length < total } };
}

/**
 * KPIs de la vista Carritos, todos sobre el estado EFECTIVO.
 *
 * `converted` y `recovered_value` cuentan SOLO pagos aprobados — son los KPIs
 * que el bug inflaba con gente que nunca terminó de pagar. `pending_payment` y
 * `rejected_payment` existen justamente para que ese volumen se vea, pero como
 * lo que es: intentos de pago abiertos, no ventas.
 */
function summary() {
  const row = db.prepare(`
    SELECT
      COUNT(*)                                                                      AS total,
      SUM(CASE WHEN ${EFFECTIVE_STATUS} = 'active'    THEN 1 ELSE 0 END)             AS active,
      SUM(CASE WHEN ${EFFECTIVE_STATUS} = 'recovered' THEN 1 ELSE 0 END)             AS recovered,
      SUM(CASE WHEN ${EFFECTIVE_STATUS} = 'converted' THEN 1 ELSE 0 END)             AS converted,
      SUM(CASE WHEN ${EFFECTIVE_STATUS} = 'expired'   THEN 1 ELSE 0 END)             AS expired,
      SUM(CASE WHEN o.status IN (${sqlList(PENDING_STATUSES)}) THEN 1 ELSE 0 END)    AS pending_payment,
      SUM(CASE WHEN o.status IN ('rejected','cancelled') THEN 1 ELSE 0 END)          AS rejected_payment,
      SUM(CASE WHEN c.email IS NOT NULL AND c.email != '' THEN 1 ELSE 0 END)         AS with_email,
      SUM(CASE WHEN ${EFFECTIVE_STATUS} IN ('active','recovered')
                THEN c.subtotal ELSE 0 END)                                          AS open_value,
      SUM(CASE WHEN o.status = '${PAID_STATUS}' THEN c.subtotal ELSE 0 END)          AS recovered_value
    FROM carts c
    LEFT JOIN orders o ON o.id = c.order_id
  `).get();
  const withEmail = row.with_email || 0;
  return {
    ...row,
    recoveryRate: withEmail > 0 ? Math.round((row.converted / withEmail) * 1000) / 10 : 0,
  };
}

/**
 * Carritos sobre los que todavía se puede hacer algo: vivos según el estado
 * EFECTIVO, con email y consentimiento. Es el badge del sidebar. Incluye a
 * propósito los que tienen un pago pendiente o rechazado — ésos son
 * precisamente los que hay que recuperar.
 */
function countRecoverable() {
  return db.prepare(`
    SELECT COUNT(*) AS n
    FROM carts c
    LEFT JOIN orders o ON o.id = c.order_id
    WHERE ${EFFECTIVE_STATUS} IN ('active','recovered')
      AND (o.status IS NULL OR o.status NOT IN (${sqlList(NO_REMIND_STATUSES)}))
      AND c.consent = 1
      AND c.email IS NOT NULL AND c.email != ''
      AND c.item_count > 0
      AND c.expires_at > datetime('now')
  `).get().n;
}

function remove(id) {
  return db.prepare("DELETE FROM carts WHERE id = ?").run(Number(id)).changes;
}

module.exports = {
  upsert, getByToken, getById, markRecovered,
  attachOrder, markConverted, markConvertedByOrder, repairFalseConversions,
  expireOld, dueForReminder, markReminderSent, resumeUrl,
  list, summary, countRecoverable, remove, sanitizeItems, MAX_ITEMS,
  PAID_STATUS, PENDING_STATUSES, NO_REMIND_STATUSES,
};
