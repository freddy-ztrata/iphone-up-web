// Helpers de usuarios: lookup, creación, validación de password.

const bcrypt = require("bcryptjs");
const db = require("../db");

const BCRYPT_COST = 12;

const SELECT_BY_EMAIL = db.prepare("SELECT * FROM users WHERE email = ? COLLATE NOCASE");
const SELECT_BY_ID = db.prepare("SELECT * FROM users WHERE id = ?");
const INSERT = db.prepare(`
  INSERT INTO users (email, password_hash, name, role, is_active)
  VALUES (?, ?, ?, ?, 1)
`);
const UPDATE_PASSWORD = db.prepare(`
  UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?
`);
const UPDATE_LAST_LOGIN = db.prepare(`
  UPDATE users SET last_login_at = datetime('now') WHERE id = ?
`);
const UPDATE_USER = db.prepare(`
  UPDATE users SET name = ?, role = ?, is_active = ?, updated_at = datetime('now') WHERE id = ?
`);
const COUNT_ACTIVE = db.prepare("SELECT COUNT(*) AS n FROM users WHERE is_active = 1");
const LIST_ALL = db.prepare(`
  SELECT id, email, name, role, is_active, last_login_at, created_at, updated_at
  FROM users ORDER BY id ASC
`);

function findByEmail(email) {
  return SELECT_BY_EMAIL.get(email);
}

function findById(id) {
  return SELECT_BY_ID.get(id);
}

function createUser({ email, password, name = "", role = "admin" }) {
  if (!email || !password) throw new Error("email y password son requeridos");
  if (password.length < 8) throw new Error("password mínimo 8 caracteres");
  if (!["admin", "editor"].includes(role)) throw new Error("role inválido");

  const hash = bcrypt.hashSync(password, BCRYPT_COST);
  const result = INSERT.run(email.toLowerCase(), hash, name, role);
  return findById(result.lastInsertRowid);
}

function setPassword(userId, newPassword) {
  if (newPassword.length < 8) throw new Error("password mínimo 8 caracteres");
  const hash = bcrypt.hashSync(newPassword, BCRYPT_COST);
  UPDATE_PASSWORD.run(hash, userId);
}

function updateUser(id, { name, role, is_active }) {
  const u = findById(id);
  if (!u) return null;
  UPDATE_USER.run(
    name ?? u.name,
    role ?? u.role,
    is_active != null ? (is_active ? 1 : 0) : u.is_active,
    id
  );
  return findById(id);
}

function verifyPassword(plain, hash) {
  return bcrypt.compareSync(plain, hash || "");
}

function recordLogin(userId) {
  UPDATE_LAST_LOGIN.run(userId);
}

function listUsers() {
  return LIST_ALL.all().map(u => ({
    ...u,
    is_active: Boolean(u.is_active),
  }));
}

function activeUserCount() {
  return COUNT_ACTIVE.get().n;
}

// Bootstrap: crea el primer admin si no hay usuarios activos y las env vars existen.
function ensureBootstrapUser() {
  if (activeUserCount() > 0) return;
  const email = process.env.ADMIN_BOOTSTRAP_EMAIL;
  const password = process.env.ADMIN_BOOTSTRAP_PASSWORD;
  if (!email || !password) {
    console.warn("[users] No hay usuarios y faltan ADMIN_BOOTSTRAP_EMAIL/PASSWORD — el admin no será accesible.");
    return;
  }
  try {
    const u = createUser({ email, password, name: "Admin", role: "admin" });
    console.log(`[users] bootstrap user creado: ${u.email}`);
  } catch (err) {
    console.error("[users] no se pudo crear bootstrap user:", err.message);
  }
}

ensureBootstrapUser();

module.exports = {
  findByEmail,
  findById,
  createUser,
  setPassword,
  updateUser,
  verifyPassword,
  recordLogin,
  listUsers,
  activeUserCount,
};
