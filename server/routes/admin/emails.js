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
const audit = require("../../lib/audit");
const { requireAdmin } = require("../../middleware/auth");

const router = express.Router();

// Las pruebas y el tick manual pegan contra un proveedor externo: límite bajo.
const testLimiter = rateLimit({ windowMs: 10 * 60 * 1000, max: 10, standardHeaders: false, legacyHeaders: false });

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
    // Lo que todavía falta definir, explícito para el panel.
    pending: {
      replyTo: !config.replyTo,
      internalTo: !config.internalTo,
    },
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

// POST /api/admin/emails/test  { to? }
// Sin `to` se manda al correo del admin logueado: es el único destinatario que
// sabemos con certeza que consintió recibirlo.
router.post("/test", requireAdmin, testLimiter, async (req, res) => {
  const to = String(req.body?.to || "").trim() || req.user.email;
  if (!settings.isEmail(to)) return res.status(400).json({ error: "Destinatario inválido" });

  const result = await mailer.send({
    template: "test",
    to,
    force: true,
    data: {},
  });

  audit.log(req, {
    action: "create", entity_type: "email", entity_id: "test",
    after: { to, ok: result.ok, status: result.status, reason: result.reason },
  });

  if (!result.ok && result.status !== "dry_run") {
    return res.status(502).json({ error: result.reason || "No se pudo enviar", result });
  }
  res.json({ ok: true, result });
});

// POST /api/admin/emails/run-scheduler — fuerza un tick (útil para verificar
// la cola sin esperar el intervalo).
router.post("/run-scheduler", requireAdmin, testLimiter, async (req, res) => {
  const result = await scheduler.tick();
  audit.log(req, { action: "update", entity_type: "email", entity_id: "scheduler", after: result });
  res.json({ ok: true, result });
});

module.exports = router;
