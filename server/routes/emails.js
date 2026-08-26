// Rutas públicas de emails y carritos:
//
//   POST /api/cart/capture           guarda el carro + email del checkout
//   GET  /api/cart/:token            restaura un carro desde el link del email
//   GET  /api/emails/image           derivado PNG de una foto del catálogo
//   GET  /api/emails/unsubscribe     baja (link firmado del footer)
//   POST /api/emails/unsubscribe     baja en un clic (RFC 8058, botón de Gmail)
//   POST /api/emails/webhook         eventos de Resend (firma Svix)
//
// Todo lo público acá está rate-limitado: la captura escribe en la DB y la
// restauración devuelve datos de un carro. Sin límite, un script podría llenar
// la tabla `carts` o barrer tokens a fuerza bruta.

const express = require("express");
const rateLimit = require("express-rate-limit");
const db = require("../db");
const carts = require("../lib/carts");
const mailer = require("../lib/mailer");
const settings = require("../lib/settings");
const emailToken = require("../lib/email-token");
const emailImages = require("../lib/email-images");
const resendSignature = require("../lib/resend-signature");

const router = express.Router();

// 20 capturas por IP cada 10 min: alcanza de sobra para alguien corrigiendo su
// email o cambiando el carro varias veces, y corta el scripteo.
const captureLimiter = rateLimit({ windowMs: 10 * 60 * 1000, max: 20, standardHeaders: false, legacyHeaders: false });
// La restauración es un GET con token de 32 hex; el límite es anti-barrido.
const restoreLimiter = rateLimit({ windowMs: 10 * 60 * 1000, max: 60, standardHeaders: false, legacyHeaders: false });
const unsubLimiter = rateLimit({ windowMs: 10 * 60 * 1000, max: 30, standardHeaders: false, legacyHeaders: false });
const webhookLimiter = rateLimit({ windowMs: 60 * 1000, max: 300, standardHeaders: false, legacyHeaders: false });
// Las imágenes las pide el proxy del cliente de correo (Gmail baja todas las de
// un email de una): límite alto, pero límite al fin — cada miss convierte.
const imageLimiter = rateLimit({ windowMs: 60 * 1000, max: 240, standardHeaders: false, legacyHeaders: false });

// =====================================================================
// CAPTURA DEL CARRO
// =====================================================================
// Body: { token?, email?, name?, phone?, items: [...], consent?, source? }
// Respuesta: { token, itemCount, subtotal }
//
// `token` se devuelve siempre para que el frontend lo guarde en sessionStorage
// y las capturas siguientes actualicen la misma fila en vez de crear una nueva
// por cada tecla del campo email.
router.post("/cart/capture", captureLimiter, (req, res) => {
  try {
    const config = settings.getEmailConfig();
    if (!config.captureEnabled) return res.status(202).json({ captured: false, reason: "captura desactivada" });

    const { token, email, name, phone, items, consent, source } = req.body || {};

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "items requerido" });
    }
    // Sin email no hay nada que recordar: no creamos la fila.
    if (email != null && String(email).trim() !== "" && !settings.isEmail(email)) {
      return res.status(400).json({ error: "email inválido" });
    }

    const { cart, dropped } = carts.upsert({
      token: typeof token === "string" && /^[a-f0-9]{32}$/.test(token) ? token : undefined,
      email,
      name,
      phone,
      items,
      consent: consent !== false, // la leyenda es visible en el checkout ⇒ opt-in por aviso
      source: typeof source === "string" ? source : "checkout",
      ip: req.ip,
      userAgent: req.get("user-agent"),
    });

    if (!cart) return res.status(400).json({ error: "no se pudo guardar el carro" });

    res.json({
      captured: true,
      token: cart.token,
      itemCount: cart.itemCount,
      subtotal: cart.subtotal,
      dropped,
    });
  } catch (err) {
    console.error("[cart/capture]", err.message);
    res.status(500).json({ error: "No se pudo guardar el carro" });
  }
});

// =====================================================================
// RESTAURAR EL CARRO
// =====================================================================
// Devuelve SOLO lo necesario para rearmar el carro y prellenar el checkout.
// El email va incluido a propósito: el token viajó dentro de un correo enviado
// a esa misma dirección, así que quien tiene el token ya conoce el dato.
// NO devolvemos ip, user_agent, ni el histórico de recordatorios.
router.get("/cart/:token", restoreLimiter, (req, res) => {
  const token = String(req.params.token || "");
  if (!/^[a-f0-9]{32}$/.test(token)) return res.status(404).json({ error: "Carro no encontrado" });

  const cart = carts.getByToken(token);
  if (!cart) return res.status(404).json({ error: "Carro no encontrado" });
  if (cart.status === "expired" || new Date(cart.expiresAt.replace(" ", "T") + "Z") <= new Date()) {
    return res.status(410).json({ error: "Este carro venció", expired: true });
  }
  if (cart.status === "converted") {
    return res.status(409).json({ error: "Este carro ya terminó en una compra", converted: true });
  }

  carts.markRecovered(token);

  res.setHeader("Cache-Control", "no-store");
  res.json({
    token: cart.token,
    email: cart.email,
    name: cart.name,
    // `available` y `variant_id` viajan para que el checkout pueda avisar si
    // algo se agotó; el shape del carro en sí no cambia.
    items: cart.items,
    itemCount: cart.itemCount,
    subtotal: cart.subtotal,
  });
});

// =====================================================================
// IMÁGENES DE LOS EMAILS
// =====================================================================
// GET /api/emails/image?src=assets/iphones/variants/14-pro.webp&s=136
//
// Devuelve un PNG cuadrado. Existe porque el catálogo es WebP y Outlook de
// escritorio no lo soporta (ver server/lib/email-images.js para el detalle).
//
// Es público a propósito: quien abre el correo no tiene sesión, y Gmail ni
// siquiera pide la imagen desde el navegador del cliente sino desde su proxy.
// Por eso la defensa NO es la autenticación sino la whitelist de rutas:
// `normalizeSource()` acepta cuatro carpetas conocidas y nada más — ni URLs de
// otros dominios, ni traversal, ni esquemas raros.
function sendImage(res, out) {
  res.setHeader("Content-Type", "image/png");
  // 30 días, igual que las imágenes del sitio en express.static. Sin
  // `immutable`: la URL es la ruta del original, no un hash, así que si alguien
  // reemplaza `assets/iphones/iphone-13.webp` en un deploy la revalidación por
  // ETag tiene que poder correr. Los uploads del admin no tienen ese problema
  // (cada uno estrena un nombre UUID).
  res.setHeader("Cache-Control", "public, max-age=2592000");
  // El default de helmet es same-origin, que rompería la carga directa desde un
  // webmail. La imagen es pública y no lleva ningún dato del cliente.
  res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
  res.setHeader("ETag", out.etag);
  res.sendFile(out.file);
}

router.get("/emails/image", imageLimiter, async (req, res) => {
  const base = (process.env.PUBLIC_URL || "").replace(/\/+$/, "");
  const rel = emailImages.normalizeSource(req.query.src, base);
  const size = emailImages.pickSize(req.query.s);

  // Fuera de la whitelist ⇒ 400 y nada más. Los templates nunca generan una
  // URL así; si llegó una, alguien está probando el endpoint a mano.
  if (!rel) return res.status(400).json({ error: "imagen no permitida" });

  try {
    let out = await emailImages.png(rel, size);
    if (!out) {
      // Ruta válida pero el archivo ya no está (foto borrada del admin).
      // Mejor el placeholder que un ícono de imagen rota en la bandeja.
      out = await emailImages.png(emailImages.PLACEHOLDER, size);
      if (!out) return res.status(404).json({ error: "imagen no encontrada" });
    }
    if (req.headers["if-none-match"] === out.etag) {
      res.setHeader("ETag", out.etag);
      return res.status(304).end();
    }
    sendImage(res, out);
  } catch (err) {
    console.error("[emails/image]", err.message);
    res.status(500).json({ error: "No se pudo generar la imagen" });
  }
});

// =====================================================================
// BAJA (UNSUBSCRIBE)
// =====================================================================
function doUnsubscribe(req) {
  const email = String(req.query.e || req.body?.e || "").trim();
  const token = String(req.query.t || req.body?.t || "").trim();
  if (!email || !token) return { ok: false, reason: "Link incompleto" };
  if (!settings.isEmail(email)) return { ok: false, reason: "Link inválido" };
  if (!emailToken.verify(email, token)) return { ok: false, reason: "Link inválido o vencido" };
  try {
    mailer.suppress({ email, reason: "unsubscribe", source: "link" });
    return { ok: true, email: emailToken.normalize(email) };
  } catch (err) {
    return { ok: false, reason: err.message };
  }
}

// Página HTML mínima con la estética del sitio. Todo el texto es literal o
// escapado — el email viene de la query string.
function unsubPage(result) {
  const esc = require("../lib/email-templates").esc;
  const title = result.ok ? "Listo, te dimos de baja" : "No pudimos procesar el link";
  const body = result.ok
    ? `<p>No vamos a enviar más recordatorios de carro ni seguimientos a <strong>${esc(result.email)}</strong>.</p>
       <p class="muted">Los correos de una compra concreta (confirmación de pago, despacho, entrega) se siguen enviando: son parte del servicio.</p>`
    : `<p>${esc(result.reason || "Link inválido")}.</p>
       <p class="muted">Si querés dar de baja tu correo, escribinos por Instagram y lo hacemos a mano.</p>`;
  return `<!doctype html>
<html lang="es"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>${esc(title)} — iPhone UP</title>
<style>
  body{margin:0;background:#000;color:#f2f2f2;font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;
       display:flex;min-height:100vh;align-items:center;justify-content:center;padding:24px}
  .card{max-width:520px;background:#0d0d0d;border:1px solid #1f1f1f;border-radius:18px;padding:32px}
  h1{margin:0 0 14px;font-size:22px;line-height:1.3}
  p{margin:0 0 12px;line-height:1.6;font-size:15px}
  .muted{color:#8a8a8a;font-size:13px}
  .dot{display:inline-block;width:8px;height:8px;border-radius:50%;background:#A4E83A;margin-left:6px;vertical-align:middle}
  a.cta{display:inline-block;margin-top:16px;padding:12px 22px;border-radius:10px;background:#A4E83A;color:#0b0b0b;
        font-weight:700;text-decoration:none;font-size:14px}
</style>
</head><body>
  <div class="card">
    <p class="muted" style="letter-spacing:.12em;text-transform:uppercase;font-size:11px">iPhone UP<span class="dot"></span></p>
    <h1>${esc(title)}</h1>
    ${body}
    <a class="cta" href="/">Volver al sitio</a>
  </div>
</body></html>`;
}

router.get("/emails/unsubscribe", unsubLimiter, (req, res) => {
  const result = doUnsubscribe(req);
  res.status(result.ok ? 200 : 400).type("html").send(unsubPage(result));
});

// RFC 8058: el cliente de correo hace POST sin interacción del usuario.
// Tiene que responder 200 rápido y sin cuerpo relevante.
router.post("/emails/unsubscribe", unsubLimiter, (req, res) => {
  const result = doUnsubscribe(req);
  res.status(result.ok ? 200 : 400).json({ ok: result.ok });
});

// =====================================================================
// WEBHOOK DE RESEND
// =====================================================================
// Eventos: email.sent, email.delivered, email.delivery_delayed, email.opened,
//          email.clicked, email.bounced, email.complained
//
// Un rebote duro o una queja de spam mandan la dirección a la lista de
// exclusión: seguir escribiéndole quema la reputación del dominio para todos.
const UPDATE_LOG_EVENT = {
  "email.delivered":  "delivered_at",
  "email.opened":     "opened_at",
  "email.clicked":    "clicked_at",
  "email.bounced":    "bounced_at",
  "email.complained": "complained_at",
};

const INSERT_EVENT = db.prepare(`
  INSERT INTO email_events (provider_id, type, to_email, payload_json)
  VALUES (@provider_id, @type, @to_email, @payload_json)
`);

router.post("/emails/webhook", webhookLimiter, (req, res) => {
  const sig = resendSignature.verify(req);
  if (!sig.ok) {
    console.warn("[resend webhook] firma inválida:", sig.reason);
    return res.status(401).json({ error: "invalid signature" });
  }

  // Responder primero: si el procesamiento tarda o lanza, Resend no reintenta
  // eternamente y nosotros ya guardamos el evento crudo.
  res.status(200).json({ ok: true });

  try {
    const type = String(req.body?.type || "");
    const data = req.body?.data || {};
    const providerId = data.email_id || data.id || null;
    const to = Array.isArray(data.to) ? data.to[0] : data.to;

    INSERT_EVENT.run({
      provider_id: providerId ? String(providerId).slice(0, 100) : null,
      type: type.slice(0, 60) || "unknown",
      to_email: to ? String(to).slice(0, 254) : null,
      // Tope de tamaño: el payload lo controla un tercero.
      payload_json: JSON.stringify(req.body || {}).slice(0, 20000),
    });

    const column = UPDATE_LOG_EVENT[type];
    if (column && providerId) {
      // COALESCE: solo el primer evento de cada tipo escribe la fecha. Las
      // aperturas repetidas no deben mover el timestamp original.
      db.prepare(`
        UPDATE email_log SET ${column} = COALESCE(${column}, datetime('now')), updated_at = datetime('now')
        WHERE provider_id = ?
      `).run(String(providerId));
    }

    if ((type === "email.bounced" || type === "email.complained") && to && settings.isEmail(to)) {
      const reason = type === "email.bounced" ? "bounce" : "complaint";
      // Los rebotes blandos (buzón lleno, fuera de oficina) no ameritan
      // exclusión permanente: solo suprimimos los duros/indeterminados.
      const bounceType = String(data.bounce?.type || data.bounce_type || "").toLowerCase();
      if (reason === "complaint" || bounceType !== "soft") {
        try {
          mailer.suppress({ email: to, reason, source: "resend-webhook", note: type });
          console.log(`[resend webhook] ${to} a lista de exclusión (${reason})`);
        } catch (err) {
          console.error("[resend webhook] no se pudo suprimir:", err.message);
        }
      }
    }
  } catch (err) {
    console.error("[resend webhook] error procesando evento:", err?.message || err);
  }
});

// Resend hace GET al configurar el endpoint.
router.get("/emails/webhook", (_req, res) => res.status(200).json({ ok: true }));

module.exports = router;
