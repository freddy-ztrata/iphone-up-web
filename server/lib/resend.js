// Cliente HTTP de Resend con `fetch` nativo (Node 20). Sin SDK a propósito:
// la API que usamos es UN endpoint (POST /emails) y el paquete `resend` traería
// dependencias transitivas a un Dockerfile que hace `npm install` en cada build.
//
// Contrato: send() NUNCA lanza. Devuelve siempre un objeto describiendo qué
// pasó, porque quien llama está en un camino crítico (webhook de Mercado Pago,
// cambio de fulfillment) donde una excepción de email no puede tumbar la venta.
//
// Modo DRY-RUN: sin RESEND_API_KEY no se hace ninguna llamada de red. Se
// renderiza, se loguea un resumen y se devuelve { ok: true, dryRun: true }. Es
// el modo por default en local y el que corre el script de verificación, así
// que nunca sale un correo a un destinatario real sin configurar la key a mano.

const crypto = require("crypto");

const API_URL = "https://api.resend.com/emails";
const TIMEOUT_MS = Number(process.env.RESEND_TIMEOUT_MS || 10000);
// Un solo reintento: los envíos van dentro de un tick del scheduler o de un
// webhook ya respondido. Insistir más solo alarga el proceso; el email_log
// queda en `failed` y el admin puede reintentar a mano.
const MAX_ATTEMPTS = 2;

function apiKey() {
  return (process.env.RESEND_API_KEY || "").trim();
}

function isConfigured() {
  return apiKey().length > 0;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Envía un email por Resend.
 *
 * @param {object} msg
 * @param {string}   msg.from             "Nombre <correo@dominio>"
 * @param {string}   msg.to               destinatario
 * @param {string}   msg.subject
 * @param {string}   msg.html
 * @param {string}   [msg.text]
 * @param {string}   [msg.replyTo]        se omite la cabecera si viene vacío
 * @param {object}   [msg.headers]        cabeceras extra (List-Unsubscribe, …)
 * @param {string[]} [msg.tags]           etiquetas para el panel de Resend
 * @param {string}   [msg.idempotencyKey] cabecera Idempotency-Key de Resend
 * @returns {Promise<{ok:boolean, id:string|null, dryRun:boolean, status:number|null, error:string|null}>}
 */
async function send(msg = {}) {
  const key = apiKey();
  const to = String(msg.to || "").trim();
  const subject = String(msg.subject || "").trim();

  if (!to) return { ok: false, id: null, dryRun: false, status: null, error: "destinatario vacío" };
  if (!subject) return { ok: false, id: null, dryRun: false, status: null, error: "asunto vacío" };

  // ----- Dry-run -----
  if (!key) {
    // Id determinístico para que el log sea reproducible entre corridas del
    // script de verificación (nada de Date.now() acá).
    const digest = crypto.createHash("sha1")
      .update(`${to}|${subject}|${msg.idempotencyKey || ""}`)
      .digest("hex").slice(0, 16);
    console.log(`[resend:dry-run] → ${to} · "${subject}" (sin RESEND_API_KEY, no se envió nada)`);
    return { ok: true, id: `dry_${digest}`, dryRun: true, status: null, error: null };
  }

  const body = {
    from: msg.from,
    to: [to],
    subject,
    html: msg.html,
  };
  if (msg.text) body.text = msg.text;
  if (msg.replyTo) body.reply_to = msg.replyTo;
  if (msg.headers && Object.keys(msg.headers).length) body.headers = msg.headers;
  if (Array.isArray(msg.tags) && msg.tags.length) {
    // Resend solo acepta [A-Za-z0-9_-] en name/value de los tags.
    body.tags = msg.tags
      .map(t => String(t).replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 60))
      .filter(Boolean)
      .map(value => ({ name: "template", value }));
  }

  const headers = {
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  };
  if (msg.idempotencyKey) headers["Idempotency-Key"] = String(msg.idempotencyKey).slice(0, 256);

  let lastError = "error desconocido";
  let lastStatus = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(API_URL, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      lastStatus = res.status;
      const payload = await res.json().catch(() => ({}));

      if (res.ok) {
        return { ok: true, id: payload.id || null, dryRun: false, status: res.status, error: null };
      }

      lastError = payload?.message || payload?.error?.message || `HTTP ${res.status}`;

      // 4xx (salvo 429) es culpa nuestra: dominio sin verificar, from inválido,
      // destinatario rechazado. Reintentar manda el mismo request y falla igual.
      if (res.status !== 429 && res.status < 500) break;
    } catch (err) {
      lastError = err?.name === "TimeoutError" ? `timeout tras ${TIMEOUT_MS}ms` : (err?.message || String(err));
    }

    if (attempt < MAX_ATTEMPTS) await sleep(500 * attempt);
  }

  return { ok: false, id: null, dryRun: false, status: lastStatus, error: String(lastError).slice(0, 500) };
}

module.exports = { send, isConfigured, API_URL };
