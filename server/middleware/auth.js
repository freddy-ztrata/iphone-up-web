// Middlewares de autenticación.
//   requireAuth: 401 si no hay sesión válida; popula req.user.
//   requireRole(role): 403 si el rol no coincide.
//   redirectIfAuthed: usado en la ruta /admin/login para mandar al dashboard si ya está logueado.

const users = require("../lib/users");

function requireAuth(req, res, next) {
  const sess = req.session;
  if (!sess || !sess.userId) {
    return res.status(401).json({ error: "No autenticado" });
  }
  const user = users.findById(sess.userId);
  if (!user || !user.is_active) {
    req.session.destroy(() => {});
    return res.status(401).json({ error: "Sesión inválida" });
  }
  req.user = user;
  next();
}

function requireRole(role) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: "No autenticado" });
    if (req.user.role !== role) return res.status(403).json({ error: "Sin permisos" });
    next();
  };
}

function redirectIfAuthed(req, res, next) {
  if (req.session && req.session.userId) {
    return res.redirect("/admin");
  }
  next();
}

module.exports = { requireAuth, requireRole, redirectIfAuthed };
