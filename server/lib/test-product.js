// Crea (una sola vez) un producto de PRUEBA visible con una variante activa de
// $500 para testear el proceso de compra de punta a punta. Idempotente vía un
// flag en settings: si lo borras desde el admin, NO se vuelve a crear.

const db = require("../db");

function ensureTestProduct() {
  const flag = db.prepare("SELECT value FROM settings WHERE key = 'test_product_v1'").get();
  if (flag) return { skipped: true };

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT OR IGNORE INTO products (id, line, year, hero_img, hidden, position)
      VALUES (999, 'PRUEBA', ?, 'assets/iphones/iphone-14.webp', 0, -999)
    `).run(new Date().getFullYear());

    const m = db.prepare(`
      INSERT INTO product_models (product_id, name, img, sealed, position)
      VALUES (999, 'iPhone Prueba (test $500)', 'assets/iphones/iphone-14.webp', 0, 0)
    `).run();

    db.prepare(`
      INSERT INTO variants (model_id, storage, color, price, stock, position, is_active)
      VALUES (?, 'Prueba', '', 500, 99, 0, 1)
    `).run(m.lastInsertRowid);

    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('test_product_v1', 'done')").run();
  });
  tx();
  console.log("[test-product] producto de prueba ($500) creado");
  return { created: true };
}

module.exports = { ensureTestProduct };
