// Validación de firma del webhook de Mercado Pago.
// Doc: https://www.mercadopago.cl/developers/es/docs/your-integrations/notifications/webhooks#editor_4
//
// MP envía `x-signature: ts=1700000000,v1=<hmac>` y `x-request-id`.
// El HMAC SHA-256 se calcula sobre el template:
//   id:<data.id>;request-id:<x-request-id>;ts:<ts>;
// con la clave secreta del webhook (MP_WEBHOOK_SECRET).

const crypto = require("crypto");

function parseSignatureHeader(header) {
  if (!header) return {};
  const out = {};
  for (const part of String(header).split(",")) {
    const [k, v] = part.trim().split("=");
    if (k && v) out[k.trim()] = v.trim();
  }
  return out; // { ts, v1 }
}

/**
 * Valida la firma. Devuelve true si es válida o si no hay secret configurado
 * (modo permisivo) — en producción setea MP_WEBHOOK_SECRET para activarlo.
 */
function verify(req) {
  const secret = process.env.MP_WEBHOOK_SECRET;
  if (!secret) return { ok: true, reason: "no-secret-configured" };

  const sig = parseSignatureHeader(req.headers["x-signature"]);
  const requestId = req.headers["x-request-id"];
  const dataId = req.query["data.id"] || req.body?.data?.id;

  if (!sig.ts || !sig.v1) return { ok: false, reason: "missing-signature-header" };
  if (!dataId) return { ok: false, reason: "missing-data-id" };

  const template = `id:${dataId};request-id:${requestId || ""};ts:${sig.ts};`;
  const expected = crypto.createHmac("sha256", secret).update(template).digest("hex");

  const ok = crypto.timingSafeEqual(
    Buffer.from(expected, "hex"),
    Buffer.from(sig.v1, "hex")
  );
  return { ok, reason: ok ? "valid" : "mismatch" };
}

module.exports = { verify, parseSignatureHeader };
