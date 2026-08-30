// Scheduler de emails diferidos. Un setInterval, como backup.js — sin cron ni
// cola externa: el volumen de la tienda son decenas de correos por día, no
// miles, y una dependencia nueva costaría más que lo que resuelve.
//
// Cada tick hace cinco cosas, todas idempotentes:
//   0. Normaliza los carros marcados como comprados sin pago aprobado.
//   1. Vence los carros pasados de fecha (14 días por default).
//   2. Manda el 1er recordatorio de carro abandonado (1h por default).
//   3. Manda el 2do (24h por default).
//   4. Manda el follow-up a N días de la ENTREGA (7 por default).
//
// Un carro con pago APROBADO nunca recibe recordatorios (ya compró); uno con
// pago pendiente o rechazado sí, porque sigue siendo una venta a recuperar. El
// filtro vive en carts.dueForReminder() y corre sobre el estado efectivo.
//
// La idempotencia real vive en dos lugares: las columnas reminder_*_sent_at de
// `carts` y el UNIQUE de email_log.idempotency_key. Si el proceso muere en la
// mitad de un tick, el siguiente retoma sin duplicar.
//
// El tick entero está envuelto en try/catch y cada envío también: un carro con
// datos raros no puede impedir que se procesen los demás.

const db = require("./../db");
const carts = require("./carts");
const mailer = require("./mailer");
const settings = require("./settings");
const couponsLib = require("./coupons");

const INTERVAL_MINUTES = Number(process.env.EMAIL_SCHEDULER_INTERVAL_MINUTES || 10);
// Tope por tick y por tarea. Evita que un backlog (primer deploy con carros
// viejos, scheduler apagado unos días) dispare cientos de emails de golpe.
const BATCH = Number(process.env.EMAIL_SCHEDULER_BATCH || 25);

let timer = null;
let running = false;
let lastRun = null;

/**
 * Cupón a ofrecer en los recordatorios. Por default NO hay (decisión aprobada).
 * Si el admin configuró uno, lo validamos antes de prometerlo: un código
 * vencido o agotado en el email es peor que no ofrecer nada.
 */
function reminderCoupon(cart) {
  const code = settings.getEmailConfig().cartCouponCode;
  if (!code) return null;
  try {
    const check = couponsLib.validate(code, { subtotal: cart.subtotal, items: cart.items });
    return check.ok ? code : null;
  } catch {
    return null;
  }
}

async function sendCartReminder(cart, kind) {
  const template = kind === "1h" ? "cart_reminder_1h" : "cart_reminder_24h";
  const config = settings.getEmailConfig();
  const result = await mailer.sendSafe({
    template,
    to: cart.email,
    cartId: cart.id,
    idempotencyKey: `${template}:cart:${cart.id}`,
    data: {
      cart,
      coupon: reminderCoupon(cart),
      resumeUrl: carts.resumeUrl(cart.token),
      expireDays: config.cartExpireDays,
    },
  });
  // Marcamos como enviado también cuando quedó suprimido/desactivado: la
  // decisión ya se tomó para este carro y reintentar cada 10 minutos solo
  // llenaría el log con las mismas filas.
  if (result.ok || result.skipped || result.status === "suppressed" || result.status === "disabled") {
    carts.markReminderSent(cart.id, kind);
  }
  return result;
}

// Órdenes entregadas hace ≥ N días que todavía no recibieron el follow-up.
// El NOT EXISTS contra email_log es el que hace la consulta idempotente sin
// necesidad de una columna nueva en orders.
const DUE_FOLLOWUPS = db.prepare(`
  SELECT id, buyer_json, items_json, shipping_json, delivered_at
  FROM orders
  WHERE delivered_at IS NOT NULL
    AND delivered_at <= datetime('now', @offset)
    AND fulfillment_status = 'delivered'
    AND NOT EXISTS (
      SELECT 1 FROM email_log
      WHERE email_log.order_id = orders.id AND email_log.template = 'followup_delivered'
    )
  ORDER BY delivered_at ASC
  LIMIT @limit
`);

function safeParse(json, fallback) {
  if (!json) return fallback;
  try { return JSON.parse(json); } catch { return fallback; }
}

async function sendFollowups(config) {
  const rows = DUE_FOLLOWUPS.all({ offset: `-${config.followupDays} days`, limit: BATCH });
  let sent = 0;
  for (const row of rows) {
    const buyer = safeParse(row.buyer_json, {}) || {};
    if (!buyer.email) continue;
    const order = {
      id: row.id,
      buyer,
      items: safeParse(row.items_json, []) || [],
      shipping: safeParse(row.shipping_json, {}) || {},
    };
    const r = await mailer.sendSafe({
      template: "followup_delivered",
      to: buyer.email,
      orderId: row.id,
      idempotencyKey: `followup_delivered:${row.id}`,
      data: { order },
    });
    if (r.ok) sent++;
  }
  return { candidates: rows.length, sent };
}

/** Corre un ciclo completo. Exportado para poder invocarlo desde un script. */
async function tick() {
  if (running) return { skipped: true, reason: "tick anterior en curso" };
  running = true;
  const out = { repaired: 0, expired: 0, reminders1h: 0, reminders24h: 0, followups: 0, errors: [] };

  try {
    const config = settings.getEmailConfig();

    // Antes que nada: devolver a la cola de recuperación los carros que quedaron
    // marcados como comprados sin venta detrás. Idempotente — después del primer
    // tick que los limpia, no matchea nada nunca más.
    try { out.repaired = carts.repairFalseConversions(); }
    catch (err) { out.errors.push(`repair: ${err.message}`); }

    try { out.expired = carts.expireOld(); }
    catch (err) { out.errors.push(`expire: ${err.message}`); }

    if (config.enabled && config.cartRemindersEnabled && config.cartReminder1hEnabled) {
      for (const cart of carts.dueForReminder("1h", BATCH)) {
        try { if ((await sendCartReminder(cart, "1h")).ok) out.reminders1h++; }
        catch (err) { out.errors.push(`cart ${cart.id} 1h: ${err.message}`); }
      }
    }

    if (config.enabled && config.cartRemindersEnabled && config.cartReminder24hEnabled) {
      for (const cart of carts.dueForReminder("24h", BATCH)) {
        try { if ((await sendCartReminder(cart, "24h")).ok) out.reminders24h++; }
        catch (err) { out.errors.push(`cart ${cart.id} 24h: ${err.message}`); }
      }
    }

    if (config.enabled && config.followupEnabled) {
      try { out.followups = (await sendFollowups(config)).sent; }
      catch (err) { out.errors.push(`followups: ${err.message}`); }
    }

    lastRun = { at: new Date().toISOString(), ...out };
    const moved = out.repaired + out.expired + out.reminders1h + out.reminders24h + out.followups;
    if (moved > 0 || out.errors.length) {
      console.log(`[emails] tick: ${out.reminders1h} × 1h, ${out.reminders24h} × 24h, ${out.followups} follow-ups, ${out.expired} vencidos, ${out.repaired} normalizados` +
        (out.errors.length ? ` — ${out.errors.length} error(es)` : ""));
    }
    return out;
  } catch (err) {
    console.error("[emails] tick falló:", err?.message || err);
    out.errors.push(err?.message || String(err));
    lastRun = { at: new Date().toISOString(), ...out };
    return out;
  } finally {
    running = false;
  }
}

function start() {
  if (process.env.EMAIL_SCHEDULER_ENABLED === "false") {
    console.log("[emails] scheduler desactivado (EMAIL_SCHEDULER_ENABLED=false)");
    return;
  }
  if (timer) return;
  // Primer tick a los 60s: el boot ya está haciendo migraciones, seed y backup.
  setTimeout(() => { tick(); }, 60_000);
  timer = setInterval(() => { tick(); }, INTERVAL_MINUTES * 60 * 1000);
  console.log(`[emails] scheduler cada ${INTERVAL_MINUTES}min (lote de ${BATCH})`);
}

function stop() {
  if (timer) { clearInterval(timer); timer = null; }
}

function status() {
  return {
    enabled: process.env.EMAIL_SCHEDULER_ENABLED !== "false",
    running,
    intervalMinutes: INTERVAL_MINUTES,
    batch: BATCH,
    lastRun,
  };
}

module.exports = { start, stop, tick, status };
