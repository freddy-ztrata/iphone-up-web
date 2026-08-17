// Firma HMAC de los links de baja (unsubscribe) de los emails.
//
// Por qué firmados: si el link fuera /unsubscribe?email=..., cualquiera podría
// dar de baja el correo de un cliente ajeno (o barrer una lista entera) con un
// GET. El token ata la dirección a un secreto del servidor, así que el link
// solo funciona para la dirección a la que se envió.
//
// El secreto sale de EMAIL_UNSUBSCRIBE_SECRET y, si no está, de SESSION_SECRET.
// Consecuencia documentada: rotar SESSION_SECRET invalida los links de baja de
// los emails ya enviados (igual que invalida las sesiones del admin).

const crypto = require("crypto");

function secret() {
  return process.env.EMAIL_UNSUBSCRIBE_SECRET
    || process.env.SESSION_SECRET
    || "INSEGURO_cambiame_en_dot_env";
}

function normalize(email) {
  return String(email || "").trim().toLowerCase();
}

/** Token base64url del email. 32 chars: suficiente contra fuerza bruta. */
function sign(email) {
  return crypto.createHmac("sha256", secret())
    .update(`unsubscribe:${normalize(email)}`)
    .digest("base64url")
    .slice(0, 32);
}

/** Comparación en tiempo constante (evita distinguir tokens por timing). */
function verify(email, token) {
  const expected = sign(email);
  const given = String(token || "");
  if (given.length !== expected.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(given));
  } catch {
    return false;
  }
}

/** URL absoluta de baja para pegar en el footer del email. */
function unsubscribeUrl(email, publicUrl) {
  const base = String(publicUrl || process.env.PUBLIC_URL || "http://localhost:8080").replace(/\/$/, "");
  return `${base}/api/emails/unsubscribe?e=${encodeURIComponent(normalize(email))}&t=${sign(email)}`;
}

module.exports = { sign, verify, unsubscribeUrl, normalize };
