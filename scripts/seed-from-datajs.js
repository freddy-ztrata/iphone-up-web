// scripts/seed-from-datajs.js
// Carga el catálogo desde data.js (window.CATALOG) e inserta en SQLite.
// Idempotente: solo siembra si la tabla `products` está vacía. Para forzar:
//   FORCE_RESEED=true node scripts/seed-from-datajs.js
//
// Se ejecuta automáticamente al boot del server (server/index.js) y también
// puede correrse a mano: `npm run seed`.

require("dotenv").config();
const fs = require("fs");
const path = require("path");
const db = require("../server/db");

function loadCatalogFromDataJs() {
  // Cargamos data.js eval-style. Es un archivo trusted del repo.
  const file = path.resolve(__dirname, "..", "data.js");
  if (!fs.existsSync(file)) {
    throw new Error(`No se encontró data.js en ${file}`);
  }
  const code = fs.readFileSync(file, "utf-8");
  // Creamos un sandbox "window" para que las asignaciones funcionen.
  const sandbox = { window: {}, sessionStorage: { getItem: () => null, setItem: () => {} } };
  const fn = new Function("window", "sessionStorage", code + "\nreturn window;");
  fn(sandbox.window, sandbox.sessionStorage);
  return sandbox.window.CATALOG || [];
}

function seedIfEmpty() {
  const force = process.env.FORCE_RESEED === "true";
  const existing = db.prepare("SELECT COUNT(*) AS n FROM products").get().n;

  if (existing > 0 && !force) {
    console.log(`[seed] DB ya tiene ${existing} productos. Skip (usa FORCE_RESEED=true para forzar).`);
    return { skipped: true, count: existing };
  }

  if (force && existing > 0) {
    console.log("[seed] FORCE_RESEED activo. Borrando catálogo previo...");
    db.exec("DELETE FROM variants; DELETE FROM product_models; DELETE FROM products;");
  }

  const catalog = loadCatalogFromDataJs();
  console.log(`[seed] cargando ${catalog.length} productos desde data.js...`);

  const insertProduct = db.prepare(`
    INSERT INTO products (id, line, year, hero_img, hidden, position)
    VALUES (@id, @line, @year, @hero_img, @hidden, @position)
  `);
  const insertModel = db.prepare(`
    INSERT INTO product_models (product_id, name, img, sealed, position)
    VALUES (@product_id, @name, @img, @sealed, @position)
  `);
  const insertVariant = db.prepare(`
    INSERT INTO variants (model_id, storage, price, stock, position)
    VALUES (@model_id, @storage, @price, @stock, @position)
  `);

  const tx = db.transaction(() => {
    catalog.forEach((p, prodIdx) => {
      insertProduct.run({
        id: p.id,
        line: String(p.line),
        year: p.year || null,
        hero_img: p.img || null,
        hidden: p.hidden ? 1 : 0,
        // Usamos -p.id para que los nuevos (con id alto) queden arriba (orden desc del frontend)
        position: -p.id,
      });

      (p.models || []).forEach((m, modelIdx) => {
        const modelInfo = insertModel.run({
          product_id: p.id,
          name: m.name,
          img: m.img || null,
          sealed: m.sealed ? 1 : 0,
          position: modelIdx,
        });

        (m.storages || []).forEach((s, sIdx) => {
          insertVariant.run({
            model_id: modelInfo.lastInsertRowid,
            storage: s.s,
            price: s.p,
            // Stock inicial: 0 si es el TEST product, 10 para todos los demás
            // (el cliente lo ajusta en su primera sesión de admin).
            stock: p.id === 0 ? 99 : 10,
            position: sIdx,
          });
        });
      });
    });
  });

  tx();

  const counts = {
    products: db.prepare("SELECT COUNT(*) AS n FROM products").get().n,
    models: db.prepare("SELECT COUNT(*) AS n FROM product_models").get().n,
    variants: db.prepare("SELECT COUNT(*) AS n FROM variants").get().n,
  };
  console.log("[seed] listo:", counts);
  return { skipped: false, ...counts };
}

// Si se ejecuta directamente (no requerido como módulo):
if (require.main === module) {
  try {
    seedIfEmpty();
    process.exit(0);
  } catch (err) {
    console.error("[seed] error:", err);
    process.exit(1);
  }
}

module.exports = { seedIfEmpty };
