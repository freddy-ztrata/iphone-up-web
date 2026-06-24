const express = require("express");
const rateLimit = require("express-rate-limit");
const users = require("../../lib/users");
const audit = require("../../lib/audit");
const db = require("../../db");

const router = express.Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Demasiados intentos. Reintenta en unos minutos." },
});

const RECORD_ATTEMPT = db.prepare(`
  INSERT INTO login_attempts (ip, email, success) VALUES (?, ?, ?)
`);
const COUNT_RECENT_FAILS = db.prepare(`
  SELECT COUNT(*) AS n FROM login_attempts
  WHERE email = ? AND success = 0 AND created_at > datetime('now', '-30 minutes')
`);

router.post("/login", loginLimiter, (req, res) => {
  const { email, password } = req.body || {};
  const ip = req.ip || "unknown";

  if (!email || !password) {
    return res.status(400).json({ error: "Email y password requeridos" });
  }

  // Lockout por email: 8 fallos en 30 min → bloqueo
  const fails = COUNT_RECENT_FAILS.get(email).n;
  if (fails >= 8) {
    RECORD_ATTEMPT.run(ip, email, 0);
    return res.status(429).json({ error: "Cuenta bloqueada temporalmente. Reintenta en 30 min." });
  }

  const user = users.findByEmail(email);
  if (!user || !user.is_active || !users.verifyPassword(password, user.password_hash)) {
    RECORD_ATTEMPT.run(ip, email, 0);
    return res.status(401).json({ error: "Credenciales inválidas" });
  }

  RECORD_ATTEMPT.run(ip, email, 1);
  users.recordLogin(user.id);

  req.session.userId = user.id;
  req.session.userEmail = user.email;

  audit.log({ user, ip, get: () => req.get("user-agent") }, {
    action: "login", entity_type: "user", entity_id: user.id, after: { email: user.email },
  });

  res.json({
    ok: true,
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
  });
});

router.post("/logout", (req, res) => {
  req.session?.destroy(() => res.json({ ok: true }));
});

router.get("/me", (req, res) => {
  if (!req.session?.userId) return res.status(401).json({ error: "No autenticado" });
  const u = users.findById(req.session.userId);
  if (!u) return res.status(401).json({ error: "Sesión inválida" });
  res.json({ id: u.id, email: u.email, name: u.name, role: u.role });
});

module.exports = router;
