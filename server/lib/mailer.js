// Mailer: la única puerta de salida de emails del sistema.
//
// Responsabilidades, en orden de ejecución:
//   1. ¿Están los emails activos? (settings.emails_enabled)
//   2. ¿El destinatario es válido y no está en la lista de exclusión?
//   3. ¿Ya mandamos este mismo email? (idempotency_key UNIQUE en email_log)
//   4. Renderizar el template
//   5. Hablar con Resend (o dry-run si no hay API key)
//   6. Cerrar la fila de email_log con el resultado
//
// INVARIANTE: send() NUNCA lanza. Devuelve un objeto con lo que pasó. Los
// llamadores viven en el webhook de Mercado Pago y en el PATCH de fulfillment:
// una excepción acá no puede impedir que se descuente stock ni que se responda
// 200 a MP. Aun así, todo llamador envuelve en try/catch (defensa en capas).

const db = require("../db");
const resend = require("./resend");
const templates = require("./email-templates");
const settings = require("./settings");
const emailToken = require("./email-token");

// `INSERT OR IGNORE` + `changes` es el candado de idempotencia: si otra
// ejecución (tick del scheduler, webhook repetido de MP) ya reservó la key, el
// insert no hace nada y `changes` vuelve 0. Chequear-y-después-insertar tendría
// una ventana de carrera; esto es atómico en SQLite.
const CLAIM = db.prepare(`
  INSERT OR IGNORE INTO email_log (idempotency_key, template, to_email, subject, status, order_id, cart_id, meta_json)
  VALUES (@idempotency_key, @template, @to_email, @subject, 'queued', @order_id, @cart_id, @meta_json)
`);

const FINISH = db.prepare(`
  UPDATE email_log SET
    status      = @status,
    subject     = COALESCE(@subject, subject),
    provider    = @provider,
    provider_id = @provider_id,
    error       = @error,
    updated_at  = datetime('now')
  WHERE idempotency_key = @idempotency_key
`);

const GET_BY_KEY = db.prepare("SELECT * FROM email_log WHERE idempotency_key = ?");
const FIND_SUPPRESSION = db.prepare("SELECT * FROM email_suppressions WHERE email = ? COLLATE NOCASE");
const UPSERT_SUPPRESSION = db.prepare(`
  INSERT INTO email_suppressions (email, reason, source, note)
  VALUES (@email, @reason, @source, @note)
  ON CONFLICT(email) DO UPDATE SET
    reason = excluded.reason,
    source = excluded.source,
    note   = COALESCE(excluded.note, email_suppressions.note)
`);
const DELETE_SUPPRESSION = db.prepare("DELETE FROM email_suppressions WHERE email = ? COLLATE NOCASE");

function publicUrl() {
  return (process.env.PUBLIC_URL || "http://localhost:8080").replace(/\/$/, "");
}

// ----- Lista de exclusión -----

// 'bounce' / 'complaint' bloquean TODO: insistirle a un buzón que rebota o que
// nos marcó como spam degrada la reputación del dominio y termina mandando al
// spam los correos de todos los demás.
// 'unsubscribe' / 'manual' bloquean solo lo no transaccional: la confirmación
// del pago que la persona acaba de hacer se manda igual.
const HARD_REASONS = new Set(["bounce", "complaint"]);

function isSuppressed(email, { transactional = false } = {}) {
  const row = FIND_SUPPRESSION.get(String(email || "").trim());
  if (!row) return null;
  if (transactional && !HARD_REASONS.has(row.reason)) return null;
  return row;
}

function suppress({ email, reason = "manual", source = null, note = null }) {
  const clean = emailToken.normalize(email);
  if (!settings.isEmail(clean)) throw new Error("Email inválido");
  UPSERT_SUPPRESSION.run({ email: clean, reason, source, note });
  return FIND_SUPPRESSION.get(clean);
}

function unsuppress(email) {
  const clean = emailToken.normalize(email);
  DELETE_SUPPRESSION.run(clean);
  return { email: clean, removed: true };
}

function listSuppressions(limit = 500) {
  return db.prepare(`
    SELECT * FROM email_suppressions ORDER BY created_at DESC LIMIT ?
  `).all(Math.min(Math.max(parseInt(limit, 10) || 500, 1), 2000));
}

// ----- Log -----

function listLog({ template, status, to_email, order_id, cart_id, limit = 100, offset = 0 } = {}) {
  const where = [];
  const params = {};
  if (template) { where.push("template = @template"); params.template = String(template); }
  if (status) { where.push("status = @status"); params.status = String(status); }
  if (to_email) { where.push("to_email LIKE @to_email"); params.to_email = `%${String(to_email).trim()}%`; }
  if (order_id) { where.push("order_id = @order_id"); params.order_id = String(order_id); }
  if (cart_id) { where.push("cart_id = @cart_id"); params.cart_id = Number(cart_id); }
  const clause = where.length ? "WHERE " + where.join(" AND ") : "";

  const lim = Math.min(Math.max(parseInt(limit, 10) || 100, 1), 500);
  const off = Math.max(parseInt(offset, 10) || 0, 0);
  const total = db.prepare(`SELECT COUNT(*) AS n FROM email_log ${clause}`).get(params).n;
  const rows = db.prepare(`
    SELECT id, idempotency_key, template, to_email, subject, status, provider, provider_id,
           error, order_id, cart_id, delivered_at, opened_at, clicked_at, bounced_at,
           complained_at, created_at, updated_at
    FROM email_log ${clause}
    ORDER BY created_at DESC, id DESC
    LIMIT @limit OFFSET @offset
  `).all({ ...params, limit: lim, offset: off });

  return { entries: rows, page: { total, limit: lim, offset: off, hasMore: off + rows.length < total } };
}

function stats() {
  const byStatus = db.prepare(`
    SELECT status, COUNT(*) AS n FROM email_log GROUP BY status
  `).all().reduce((acc, r) => { acc[r.status] = r.n; return acc; }, {});
  const last7 = db.prepare(`
    SELECT COUNT(*) AS n FROM email_log WHERE created_at >= datetime('now','-7 days')
  `).get().n;
  const failed7 = db.prepare(`
    SELECT COUNT(*) AS n FROM email_log WHERE status = 'failed' AND created_at >= datetime('now','-7 days')
  `).get().n;
  return {
    byStatus,
    total: Object.values(byStatus).reduce((a, b) => a + b, 0),
    last7,
    failed7,
    suppressions: db.prepare("SELECT COUNT(*) AS n FROM email_suppressions").get().n,
  };
}

// ----- Envío -----

/**
 * @param {object} params
 * @param {string} params.template        id de email-templates
 * @param {string} params.to              destinatario
 * @param {object} [params.data]          ctx extra para el template (order, cart, coupon, …)
 * @param {string} [params.orderId]
 * @param {number} [params.cartId]
 * @param {string} [params.idempotencyKey] default: template + orderId/cartId/to
 * @param {boolean} [params.force]        ignora la key ya usada (reenvío manual del admin)
 * @param {string} [params.subjectPrefix] se antepone al asunto renderizado
 *                                        (las pruebas del panel mandan "[PRUEBA] ")
 * @returns {Promise<object>} { ok, status, skipped?, reason?, logId?, providerId?, dryRun? }
 */
async function send(params = {}) {
  const {
    template: templateId,
    to,
    data = {},
    orderId = null,
    cartId = null,
    force = false,
    subjectPrefix = "",
  } = params;

  try {
    const tpl = templates.get(templateId);
    if (!tpl) return { ok: false, status: "failed", reason: `template desconocido: ${templateId}` };

    const recipient = emailToken.normalize(to);
    if (!settings.isEmail(recipient)) {
      return { ok: false, status: "failed", reason: "destinatario inválido" };
    }

    const config = settings.getEmailConfig();
    const transactional = tpl.transactional !== false;

    // Clave de idempotencia. `force` le agrega un sufijo para que un reenvío
    // manual del admin cree una fila nueva en vez de rebotar contra la vieja.
    // El sufijo usa el conteo de filas previas, no un timestamp: así el script
    // de verificación es determinístico.
    let idempotencyKey = params.idempotencyKey
      || [templateId, orderId || (cartId != null ? `cart:${cartId}` : recipient)].join(":");
    if (force) {
      const n = db.prepare(
        "SELECT COUNT(*) AS n FROM email_log WHERE idempotency_key = ? OR idempotency_key LIKE ?"
      ).get(idempotencyKey, `${idempotencyKey}:retry%`).n;
      idempotencyKey = `${idempotencyKey}:retry${n}`;
    }

    const meta = { transactional, ...(data.meta || {}) };

    // ---- Apagado general ----
    if (!config.enabled) {
      claimAndFinish(idempotencyKey, {
        template: templateId, to_email: recipient, subject: null,
        order_id: orderId, cart_id: cartId, meta_json: JSON.stringify(meta),
      }, { status: "disabled", provider: null, provider_id: null, error: "emails desactivados en Ajustes" });
      return { ok: false, status: "disabled", skipped: true, reason: "emails desactivados en Ajustes" };
    }

    // ---- Lista de exclusión ----
    const suppression = isSuppressed(recipient, { transactional });
    if (suppression) {
      claimAndFinish(idempotencyKey, {
        template: templateId, to_email: recipient, subject: null,
        order_id: orderId, cart_id: cartId, meta_json: JSON.stringify(meta),
      }, { status: "suppressed", provider: null, provider_id: null, error: `en lista de exclusión (${suppression.reason})` });
      return { ok: false, status: "suppressed", skipped: true, reason: `en lista de exclusión (${suppression.reason})` };
    }

    // ---- Idempotencia ----
    const claimed = CLAIM.run({
      idempotency_key: idempotencyKey,
      template: templateId,
      to_email: recipient,
      subject: null,
      order_id: orderId,
      cart_id: cartId,
      meta_json: JSON.stringify(meta),
    });
    if (claimed.changes === 0) {
      const existing = GET_BY_KEY.get(idempotencyKey);
      // Una fila en 'queued' es de un intento que murió a mitad de camino
      // (proceso reiniciado). La dejamos reintentar; el resto no.
      if (existing && existing.status !== "queued") {
        return { ok: existing.status === "sent" || existing.status === "dry_run", status: existing.status, skipped: true, reason: "ya enviado", logId: existing.id };
      }
    }

    // ---- Render ----
    const unsubscribeUrl = transactional ? null : emailToken.unsubscribeUrl(recipient, publicUrl());
    let rendered;
    try {
      rendered = templates.render(templateId, {
        ...data,
        publicUrl: publicUrl(),
        unsubscribeUrl,
        config: { from: config.from, replyTo: config.replyTo, internalTo: config.internalTo },
        providerLabel: resend.isConfigured() ? "Resend" : "dry-run (sin RESEND_API_KEY)",
      });
    } catch (err) {
      FINISH.run({ idempotency_key: idempotencyKey, status: "failed", subject: null, provider: null, provider_id: null, error: `render: ${err.message}`.slice(0, 500) });
      console.error(`[mailer] render ${templateId} falló:`, err.message);
      return { ok: false, status: "failed", reason: `render: ${err.message}` };
    }

    // El prefijo va acá y no dentro del template: los templates son los mismos
    // que ve el cliente y no tienen que saber que existe un modo prueba.
    const subject = `${subjectPrefix}${rendered.subject}`.slice(0, 200);

    // RFC 8058: List-Unsubscribe + -Post permite el botón nativo de "dar de
    // baja" de Gmail/Apple Mail. Solo en lo no transaccional.
    const headers = {};
    if (unsubscribeUrl) {
      headers["List-Unsubscribe"] = `<${unsubscribeUrl}>`;
      headers["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click";
    }

    // ---- Envío ----
    const result = await resend.send({
      from: config.from,
      to: recipient,
      subject,
      html: rendered.html,
      text: rendered.text,
      replyTo: config.replyTo || undefined,
      headers,
      tags: [templateId],
      idempotencyKey,
    });

    const status = result.ok ? (result.dryRun ? "dry_run" : "sent") : "failed";
    FINISH.run({
      idempotency_key: idempotencyKey,
      status,
      subject,
      provider: result.dryRun ? "dry-run" : "resend",
      provider_id: result.id || null,
      error: result.error || null,
    });

    if (!result.ok) console.error(`[mailer] ${templateId} → ${recipient} falló: ${result.error}`);

    const row = GET_BY_KEY.get(idempotencyKey);
    return {
      ok: result.ok,
      status,
      dryRun: !!result.dryRun,
      providerId: result.id || null,
      reason: result.error || null,
      logId: row?.id || null,
      subject,
    };
  } catch (err) {
    // Red de seguridad final: pase lo que pase, no propagamos.
    console.error("[mailer] error inesperado:", err?.message || err);
    return { ok: false, status: "failed", reason: err?.message || String(err) };
  }
}

// Reserva la fila y la cierra en un solo paso (casos que no llegan al proveedor).
function claimAndFinish(idempotencyKey, claim, finish) {
  try {
    CLAIM.run({ idempotency_key: idempotencyKey, ...claim });
    FINISH.run({ idempotency_key: idempotencyKey, subject: null, ...finish });
  } catch (err) {
    console.error("[mailer] no se pudo registrar el intento:", err.message);
  }
}

/**
 * Igual que send() pero pensado para caminos críticos: loguea y descarta.
 * Devuelve una promesa que nunca rechaza. Usar donde el resultado no cambia
 * el flujo (webhook de MP, PATCH de fulfillment).
 */
function sendSafe(params) {
  return send(params).catch(err => {
    console.error("[mailer] sendSafe:", err?.message || err);
    return { ok: false, status: "failed", reason: err?.message || String(err) };
  });
}

/**
 * Aviso interno de venta nueva. No hace nada si no hay dirección configurada.
 *
 * Puede haber más de un destinatario: se manda un email POR persona en vez de
 * uno solo con varios `to`. Así cada envío tiene su fila en el historial y su
 * propia idempotencia, un rebote de uno no arrastra al resto, y nadie ve las
 * direcciones internas de los demás. La key ya incluía la dirección, así que
 * una instalación con un solo destinatario no reenvía nada al actualizar.
 */
function notifyInternal(order) {
  // Sin orden no hay nada que avisar. Sin este guard, un `getOrder()` que
  // devolvió null mandaría un correo vacío con la key "…:undefined:…", que
  // además bloquearía por idempotencia el aviso de la siguiente venta rota.
  if (!order?.id) return Promise.resolve({ ok: false, skipped: true, reason: "sin orden" });
  const config = settings.getEmailConfig();
  const recipients = config.internalToList || [];
  if (!recipients.length) return Promise.resolve({ ok: false, skipped: true, reason: "sin correo interno configurado" });
  const sends = recipients.map(to => sendSafe({
    template: "internal_new_order",
    to,
    data: { order },
    orderId: order.id,
    idempotencyKey: `internal_new_order:${order.id}:${to}`,
  }));
  return Promise.all(sends).then(results => (
    // Con un solo destinatario devuelve el resultado tal cual (es lo que ya
    // leía quien llamaba); con varios, el resumen del lote.
    results.length === 1
      ? results[0]
      : {
          ok: results.some(r => r.ok),
          recipients: recipients.length,
          sent: results.filter(r => r.ok).length,
          results,
        }
  ));
}

module.exports = {
  send, sendSafe, notifyInternal,
  isSuppressed, suppress, unsuppress, listSuppressions,
  listLog, stats,
  HARD_REASONS,
};
