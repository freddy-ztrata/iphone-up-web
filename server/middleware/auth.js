// Middlewares de autenticación.
//   requireAuth: 401 si no hay sesión válida; popula req.user.
//   requireRole(role): 403 si el rol no coincide.
//   requireAdmin: atajo de requireRole('admin') — se usa en todo lo destructivo,
//                 la configuración y cualquier vista con datos personales.
//   redirectIfAuthed: usado en la ruta /admin/login para mandar al dashboard si ya está logueado.
//
// Reparto de permisos (ver server/routes/admin/*):
//   editor → catálogo, stock, fulfillment de órdenes. Nada destructivo.
//   admin  → todo lo anterior + DELETE, ajuste masivo de precios, cupones,
//            usuarios, settings, audit log y exports con datos del cliente.

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
    if (req.user.role !== role) {
      return res.status(403).json({ error: `Requiere rol ${role}. Tu cuenta es ${req.user.role}.` });
    }
    next();
  };
}

const requireAdmin = requireRole("admin");

function redirectIfAuthed(req, res, next) {
  if (req.session && req.session.userId) {
    return res.redirect("/admin");
  }
  next();
}

module.exports = { requireAuth, requireRole, requireAdmin, redirectIfAuthed };
