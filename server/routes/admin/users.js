const express = require("express");
const users = require("../../lib/users");
const audit = require("../../lib/audit");

const router = express.Router();

router.get("/", (req, res) => {
  res.json({ users: users.listUsers() });
});

router.post("/", (req, res) => {
  if (req.user.role !== "admin") return res.status(403).json({ error: "Solo admins pueden crear usuarios" });
  const { email, password, name, role } = req.body || {};
  try {
    const u = users.createUser({ email, password, name, role });
    audit.log(req, { action: "create", entity_type: "user", entity_id: u.id, after: { email: u.email, role: u.role } });
    res.status(201).json({ id: u.id, email: u.email, name: u.name, role: u.role });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.patch("/:id", (req, res) => {
  const id = parseInt(req.params.id, 10);
  const before = users.findById(id);
  if (!before) return res.status(404).json({ error: "No existe" });

  // Solo admins pueden editar otros usuarios; cualquier user puede cambiar su propio nombre/password.
  if (req.user.role !== "admin" && req.user.id !== id) {
    return res.status(403).json({ error: "Sin permisos" });
  }

  const { name, role, is_active, password } = req.body || {};
  if (password) users.setPassword(id, password);
  const after = users.updateUser(id, { name, role, is_active });

  audit.log(req, {
    action: "update", entity_type: "user", entity_id: id,
    before: { name: before.name, role: before.role, is_active: Boolean(before.is_active) },
    after: { name: after.name, role: after.role, is_active: Boolean(after.is_active), password_changed: !!password },
  });
  res.json({ id: after.id, email: after.email, name: after.name, role: after.role, is_active: Boolean(after.is_active) });
});

module.exports = router;
