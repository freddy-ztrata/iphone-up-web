#!/usr/bin/env node
// Crear o resetear un usuario admin desde la línea de comandos.
//
// Uso:
//   node scripts/create-user.js <email> <password> [name] [role]
//
// Ejemplo:
//   node scripts/create-user.js freddy@digitals.cl super-secreta "Freddy" admin

require("dotenv").config();
const users = require("../server/lib/users");

const [, , email, password, name = "", role = "admin"] = process.argv;

if (!email || !password) {
  console.error("Uso: node scripts/create-user.js <email> <password> [name] [role]");
  process.exit(1);
}

try {
  const existing = users.findByEmail(email);
  if (existing) {
    users.setPassword(existing.id, password);
    users.updateUser(existing.id, { name, role, is_active: true });
    console.log(`✅ Usuario ${email} actualizado (password reseteado).`);
  } else {
    const u = users.createUser({ email, password, name, role });
    console.log(`✅ Usuario ${u.email} creado (rol: ${u.role}, id: ${u.id}).`);
  }
  process.exit(0);
} catch (err) {
  console.error("❌", err.message);
  process.exit(1);
}
