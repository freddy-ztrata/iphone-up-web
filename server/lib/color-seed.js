// Genera las variantes capacidad × color (con los colores reales de Apple por
// modelo) UNA sola vez. No es destructivo: a las variantes existentes les asigna
// el primer color y las desactiva; agrega el resto de colores como variantes
// nuevas, todas DESACTIVADAS. El admin activa las que tenga en stock.
//
// Idempotente: si ya existe alguna variante con color, no hace nada.

const db = require("./db");

const COLORMAP = {
  "11_base": ["Negro", "Blanco", "Rojo", "Amarillo", "Verde", "Morado"],
  "11_pro":  ["Verde Noche", "Gris Espacial", "Plata", "Oro"],
  "12_base": ["Negro", "Blanco", "Rojo", "Verde", "Azul", "Morado"],
  "12_pro":  ["Grafito", "Plata", "Oro", "Azul Pacífico"],
  "13_base": ["Medianoche", "Blanco Estrella", "Rojo", "Rosa", "Verde", "Azul"],
  "13_pro":  ["Grafito", "Plata", "Oro", "Azul Sierra", "Verde Alpino"],
  "14_base": ["Medianoche", "Blanco Estrella", "Rojo", "Azul", "Morado", "Amarillo"],
  "14_pro":  ["Negro Espacial", "Plata", "Oro", "Morado Intenso"],
  "15_base": ["Negro", "Azul", "Verde", "Amarillo", "Rosa"],
  "15_pro":  ["Titanio Natural", "Titanio Azul", "Titanio Blanco", "Titanio Negro"],
  "16_base": ["Negro", "Blanco", "Rosa", "Verde Azulado", "Ultramar"],
  "16_pro":  ["Titanio Desierto", "Titanio Natural", "Titanio Blanco", "Titanio Negro"],
  "17_base": ["Negro", "Blanco", "Azul", "Verde", "Lavanda"],
  "17_pro":  ["Titanio Natural", "Titanio Azul", "Titanio Negro", "Titanio Blanco"],
  "default_base": ["Negro", "Blanco", "Azul"],
  "default_pro":  ["Grafito", "Plata", "Oro"],
};

function colorsFor(name) {
  const isPro = /pro/i.test(name);
  const m = String(name || "").match(/iphone\s*(\d+)/i);
  const line = m ? m[1] : null;
  const key = line ? `${line}_${isPro ? "pro" : "base"}` : null;
  return COLORMAP[key] || COLORMAP[isPro ? "default_pro" : "default_base"];
}

function seedColorsIfNeeded() {
  const hasColor = db.prepare("SELECT COUNT(*) AS n FROM variants WHERE color IS NOT NULL AND color != ''").get().n;
  if (hasColor > 0) return { skipped: true };

  const models = db.prepare("SELECT id, name FROM product_models").all();
  const updateExisting = db.prepare("UPDATE variants SET color = ?, is_active = 0 WHERE id = ?");
  const insertVariant = db.prepare(
    "INSERT INTO variants (model_id, storage, color, price, stock, position, is_active) VALUES (?, ?, ?, ?, 0, ?, 0)"
  );

  let created = 0;
  const tx = db.transaction(() => {
    for (const mdl of models) {
      const colors = colorsFor(mdl.name);
      if (!colors || !colors.length) continue;
      const vars = db.prepare(
        "SELECT id, storage, price, position FROM variants WHERE model_id = ? AND (color IS NULL OR color = '')"
      ).all(mdl.id);
      for (const v of vars) {
        updateExisting.run(colors[0], v.id); // variante existente → primer color, desactivada
        for (let ci = 1; ci < colors.length; ci++) {
          insertVariant.run(mdl.id, v.storage, colors[ci], v.price, (v.position || 0) * 100 + ci);
          created++;
        }
      }
    }
  });
  tx();
  console.log(`[color-seed] generadas variantes de color (creadas ${created}, todas desactivadas)`);
  return { skipped: false, created };
}

module.exports = { seedColorsIfNeeded, colorsFor };
