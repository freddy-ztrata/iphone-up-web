// Verificación de la firma del webhook de Resend.
//
// Resend usa Svix (svix.com) para firmar sus webhooks. El esquema:
//   headers: svix-id, svix-timestamp, svix-signature
//            (Svix también acepta los alias webhook-id / -timestamp / -signature)
//   secret:  "whsec_<base64>"  → la clave son los BYTES del base64, no el string
//   firma:   base64( HMAC-SHA256( clave, `${svix-id}.${svix-timestamp}.${rawBody}` ) )
//   header:  "v1,<firma> v1,<otra>"  → puede traer varias (rotación de secreto)
//
// Se verifica sobre el CUERPO CRUDO: si se re-serializara el JSON parseado, el
// orden de las keys o el espaciado cambiarían y la firma nunca calzaría. El
// crudo lo captura el `verify` de express.json en server/index.js.
//
// Sin RESEND_WEBHOOK_SECRET el modo es PERMISIVO (acepta todo) igual que el
// webhook de Mercado Pago, para no bloquear una instalación a medio configurar.
// En producción hay que setearlo: sin firma, cualquiera puede postear "bounce"
// para el email de un cliente y meterlo en la lista de exclusión.

const crypto = require("crypto");

const TOLERANCE_SECONDS = 5 * 60;

function header(req, name) {
  return req.headers[`svix-${name}`] || req.headers[`webhook-${name}`] || "";
}

/**
 * @param {import('express').Request} req  necesita req.rawBody (Buffer o string)
 * @returns {{ok: boolean, reason: string}}
 */
function verify(req) {
  const secret = (process.env.RESEND_WEBHOOK_SECRET || "").trim();
  if (!secret) return { ok: true, reason: "no-secret-configured" };

  const id = String(header(req, "id"));
  const timestamp = String(header(req, "timestamp"));
  const signature = String(header(req, "signature"));

  if (!id || !timestamp || !signature) return { ok: false, reason: "missing-signature-headers" };

  // Ventana temporal: sin esto, una firma capturada sirve para siempre (replay).
  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return { ok: false, reason: "bad-timestamp" };
  const skew = Math.abs(Math.floor(Date.now() / 1000) - ts);
  if (skew > TOLERANCE_SECONDS) return { ok: false, reason: `timestamp-out-of-tolerance (${skew}s)` };

  const raw = req.rawBody;
  if (!raw) return { ok: false, reason: "missing-raw-body" };
  const bodyStr = Buffer.isBuffer(raw) ? raw.toString("utf8") : String(raw);

  let key;
  try {
    key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  } catch {
    return { ok: false, reason: "bad-secret" };
  }
  if (!key.length) return { ok: false, reason: "bad-secret" };

  const expected = crypto.createHmac("sha256", key)
    .update(`${id}.${timestamp}.${bodyStr}`)
    .digest();

  // El header puede traer varias firmas separadas por espacio (rotación).
  for (const part of signature.split(" ")) {
    const [version, value] = part.split(",");
    if (version !== "v1" || !value) continue;
    let given;
    try { given = Buffer.from(value, "base64"); } catch { continue; }
    if (given.length !== expected.length) continue;
    if (crypto.timingSafeEqual(expected, given)) return { ok: true, reason: "valid" };
  }

  return { ok: false, reason: "mismatch" };
}

module.exports = { verify };
