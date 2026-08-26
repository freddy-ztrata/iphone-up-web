// Configuración y observabilidad de emails (/api/admin/emails).
//
// Leer el log requiere sesión (contiene direcciones de clientes, pero es la
// vista que usa el equipo para saber si un aviso salió). Escribir configuración,
// tocar la lista de exclusión y mandar pruebas es solo admin: el remitente y el
// correo interno definen a dónde van los datos de las ventas.

const express = require("express");
const rateLimit = require("express-rate-limit");
const settings = require("../../lib/settings");
const mailer = require("../../lib/mailer");
const resend = require("../../lib/resend");
const scheduler = require("../../lib/email-scheduler");
const templatesLib = require("../../lib/email-templates");
const fixtures = require("../../lib/email-fixtures");
const audit = require("../../lib/audit");
const { requireAdmin } = require("../../middleware/auth");

const router = express.Router();

// Las pruebas pegan contra un proveedor externo: límite bajo. Da para recorrer
// los ~8 templates un par de veces, no para usar el panel como saliente de spam.
const testLimiter = rateLimit({ windowMs: 10 * 60 * 1000, max: 40, standardHeaders: false, legacyHeaders: false });
// El tick manual mueve la cola de verdad: más restrictivo que una prueba.
const schedulerLimiter = rateLimit({ windowMs: 10 * 60 * 1000, max: 10, standardHeaders: false, legacyHeaders: false });

// GET /api/admin/emails/config
// Devuelve la config + el diagnóstico del proveedor. NUNCA la API key.
router.get("/config", (_req, res) => {
  const config = settings.getEmailConfig();
  res.json({
    config,
    provider: {
      name: "resend",
      configured: resend.isConfigured(),
      // Sin API key todo queda en dry-run: se renderiza y se loguea, no sale nada.
      mode: resend.isConfigured() ? "live" : "dry-run",
      webhookSecretConfigured: Boolean(process.env.RESEND_WEBHOOK_SECRET),
    },
    scheduler: scheduler.status(),
    stats: mailer.stats(),
    templates: templatesLib.TEMPLATE_IDS.map(id => ({ id, label: templatesLib.TEMPLATE_LABELS[id] || id })),
    // Lo mismo pero solo lo que tiene fixture: es lo que el panel pinta como
    // botones de prueba. Si algún día un template no se puede probar, acá no
    // aparece y el botón no existe (en vez de fallar al hacer clic).
    testable: fixtures.list(),
    // Lo que todavía falta definir, explícito para el panel.
    pending: {
      replyTo: !config.replyTo,
      internalTo: !config.internalToList.length,
    },
    // Tope de destinatarios internos, para que el panel avise antes de que el
    // PATCH rebote (y no lo tenga hardcodeado por su cuenta).
    limits: { internalTo: settings.INTERNAL_TO_MAX },
  });
});

// PATCH /api/admin/emails/config
router.patch("/config", requireAdmin, (req, res) => {
  const before = settings.getEmailConfig();
  try {
    const after = settings.setEmailConfig(req.body || {});
    audit.log(req, { action: "update", entity_type: "settings", entity_id: "emails", before, after });
    res.json({ config: after });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// GET /api/admin/emails/log?template=&status=&to_email=&limit=&offset=
router.get("/log", (req, res) => {
  try {
    res.json(mailer.listLog(req.query));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ----- Lista de exclusión -----
router.get("/suppressions", (_req, res) => {
  res.json({ suppressions: mailer.listSuppressions() });
});

router.post("/suppressions", requireAdmin, (req, res) => {
  const { email, reason = "manual", note } = req.body || {};
  try {
    const row = mailer.suppress({ email, reason, source: "admin", note });
    audit.log(req, { action: "create", entity_type: "email_suppression", entity_id: row.email, after: row });
    res.status(201).json({ suppression: row });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete("/suppressions/:email", requireAdmin, (req, res) => {
  const email = String(req.params.email || "");
  const result = mailer.unsuppress(email);
  audit.log(req, { action: "delete", entity_type: "email_suppression", entity_id: result.email, before: { email: result.email } });
  res.json({ ok: true, ...result });
});

// Cómo leer el estado del envío en el panel.
const MODES = {
  sent: { mode: "live", label: "Enviado" },
  dry_run: { mode: "dry-run", label: "Dry-run (no salió del servidor)" },
  disabled: { mode: "no-enviado", label: "Emails desactivados en Ajustes" },
  suppressed: { mode: "no-enviado", label: "Destinatario en la lista de exclusión" },
  failed: { mode: "error", label: "Falló" },
};

// POST /api/admin/emails/test  { template?, to? }
//
// Manda CUALQUIER template del registro con datos ficticios (email-fixtures).
// Sin `template` va el de siempre (`test`), para no romper llamadas viejas.
//
// Seguridad:
//   · requireAdmin + rate limit.
//   · `template` se valida contra la whitelist de fixtures. Nada de leer el
//     registro con la clave que venga del body.
//   · Sin `to` se manda al correo del admin logueado — el único destinatario
//     que sabemos que consintió. Si viene otro, se valida como email.
//   · No escribe configuración ni toca órdenes, carritos ni stock: el único
//     rastro es la fila de email_log (con meta.test = true) y el audit log.
router.post("/test", requireAdmin, testLimiter, async (req, res) => {
  const templateId = String(req.body?.template || "test").trim();
  if (!fixtures.isTestable(templateId)) {
    return res.status(400).json({ error: "Template de prueba desconocido" });
  }

  const to = String(req.body?.to || "").trim() || req.user.email;
  if (!settings.isEmail(to)) return res.status(400).json({ error: "Destinatario inválido" });

  // El aviso interno se prueba contra el destinatario de la prueba, NO contra
  // `emails.internalTo`: así se puede verificar aunque esa config esté vacía y
  // sin guardar nada. Por eso el envío pasa por mailer.send() directo y no por
  // mailer.notifyInternal(), que se rendiría si no hay correo interno.
  const data = fixtures.build(templateId, { config: settings.getEmailConfig(), requestedBy: req.user.email });

  const result = await mailer.send({
    template: templateId,
    to,
    force: true,
    subjectPrefix: fixtures.SUBJECT_PREFIX,
    // Sin orderId/cartId: la orden y el carro de la prueba no existen en la DB
    // y colgar la fila del log de un id inventado ensucia las consultas que
    // cruzan email_log con orders/carts.
    idempotencyKey: `test:${templateId}:${to}`,
    data,
  });

  audit.log(req, {
    action: "create", entity_type: "email", entity_id: templateId,
    after: {
      to, template: templateId, test: true,
      ok: result.ok, status: result.status, subject: result.subject || null, reason: result.reason,
    },
  });

  const info = MODES[result.status] || { mode: "error", label: result.status };
  const payload = {
    ...result,
    template: templateId,
    templateLabel: templatesLib.TEMPLATE_LABELS[templateId] || templateId,
    to,
    mode: info.mode,
    modeLabel: info.label,
  };

  // 502 solo cuando el envío falló de verdad. "desactivado" y "excluido" son
  // respuestas legítimas del sistema y el panel las tiene que poder mostrar.
  if (result.status === "failed") {
    return res.status(502).json({ error: result.reason || "No se pudo enviar", result: payload });
  }
  res.json({ ok: result.ok, result: payload });
});

// POST /api/admin/emails/run-scheduler — fuerza un tick (útil para verificar
// la cola sin esperar el intervalo).
router.post("/run-scheduler", requireAdmin, schedulerLimiter, async (req, res) => {
  const result = await scheduler.tick();
  audit.log(req, { action: "update", entity_type: "email", entity_id: "scheduler", after: result });
  res.json({ ok: true, result });
});

module.exports = router;
