const express = require("express");
const db = require("../../db");
const users = require("../../lib/users");
const audit = require("../../lib/audit");
const { requireAdmin } = require("../../middleware/auth");

const router = express.Router();

// Cuántos admins activos quedan además de `exceptId`. Se usa para no permitir
// que el panel se quede sin ningún admin (te dejaría fuera de settings, borrados
// y gestión de usuarios sin forma de volver salvo `npm run create-user`).
function otherActiveAdmins(exceptId) {
  return db.prepare(
    "SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND is_active = 1 AND id != ?"
  ).get(exceptId).n;
}

router.get("/", requireAdmin, (req, res) => {
  res.json({ users: users.listUsers() });
});

router.post("/", requireAdmin, (req, res) => {
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

  if (role != null && !["admin", "editor"].includes(role)) {
    return res.status(400).json({ error: "role inválido: admin | editor" });
  }
  // Un editor puede cambiar su nombre y su password, pero no auto-ascenderse
  // ni reactivarse/desactivarse.
  if (req.user.role !== "admin" && (role != null || is_active != null)) {
    return res.status(403).json({ error: "Solo un admin puede cambiar rol o estado" });
  }
  // No dejar el sistema sin admins activos.
  const losesAdmin = before.role === "admin" && before.is_active &&
    ((role != null && role !== "admin") || is_active === false);
  if (losesAdmin && otherActiveAdmins(id) === 0) {
    return res.status(409).json({ error: "Es el último admin activo: asigná otro admin antes de cambiarlo" });
  }

  if (password) {
    try { users.setPassword(id, password); }
    catch (err) { return res.status(400).json({ error: err.message }); }
  }
  const after = users.updateUser(id, { name, role, is_active });

  audit.log(req, {
    action: "update", entity_type: "user", entity_id: id,
    before: { name: before.name, role: before.role, is_active: Boolean(before.is_active) },
    after: { name: after.name, role: after.role, is_active: Boolean(after.is_active), password_changed: !!password },
  });
  res.json({ id: after.id, email: after.email, name: after.name, role: after.role, is_active: Boolean(after.is_active) });
});

module.exports = router;
