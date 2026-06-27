// Lee productos/modelos/variants desde la DB y los serializa al mismo formato
// que el `window.CATALOG` original. Así el frontend público no necesita cambiar
// nada — solo el origen de los datos.

const crypto = require("crypto");
const db = require("../db");

const SELECT_PRODUCTS = db.prepare(`
  SELECT id, line, year, hero_img, hidden, position
  FROM products
  ORDER BY position ASC, id ASC
`);

const SELECT_MODELS_FOR_PRODUCT = db.prepare(`
  SELECT id, product_id, name, img, sealed, tagline, position
  FROM product_models
  WHERE product_id = ? AND is_active = 1
  ORDER BY position ASC, id ASC
`);

const SELECT_VARIANTS_FOR_MODEL = db.prepare(`
  SELECT id, model_id, storage, price, compare_at_price, stock, sku, position
  FROM variants
  WHERE model_id = ? AND is_active = 1
  ORDER BY position ASC, id ASC
`);

const SELECT_ALL_MODEL_IMAGES = db.prepare(`
  SELECT owner_id, id, url, alt, position
  FROM images
  WHERE owner_type = 'model'
  ORDER BY owner_id ASC, position ASC, id ASC
`);

/**
 * Construye el array de catálogo en el shape histórico de data.js:
 *   [{ id, line, year, img, hidden, models: [{ name, img, sealed, storages: [{s,p}] }] }]
 *
 * @param {object} [opts]
 * @param {boolean} [opts.includeHidden=false]   incluir productos con hidden=1
 * @param {boolean} [opts.includeStock=false]    incluir `stock` por storage (admin)
 * @param {boolean} [opts.includeIds=false]      incluir IDs internos (admin)
 */
function buildCatalog(opts = {}) {
  const { includeHidden = false, includeStock = false, includeIds = false } = opts;

  const products = SELECT_PRODUCTS.all().filter(p => includeHidden || !p.hidden);

  // Galería de fotos por modelo (tabla images). Una sola consulta agrupada.
  const imagesByModel = new Map();
  for (const im of SELECT_ALL_MODEL_IMAGES.all()) {
    if (!imagesByModel.has(im.owner_id)) imagesByModel.set(im.owner_id, []);
    imagesByModel.get(im.owner_id).push({ id: im.id, url: im.url, alt: im.alt || "", position: im.position });
  }

  return products.map(p => {
    const models = SELECT_MODELS_FOR_PRODUCT.all(p.id).map(m => {
      const variants = SELECT_VARIANTS_FOR_MODEL.all(m.id).map(v => {
        const storage = { s: v.storage, p: v.price };
        if (v.compare_at_price) storage.compare_at = v.compare_at_price;
        if (includeStock) storage.stock = v.stock;
        if (includeIds) storage.variant_id = v.id;
        return storage;
      });

      const model = {
        name: m.name,
        img: m.img || p.hero_img,
        storages: variants,
        sealed: Boolean(m.sealed),
      };
      if (m.tagline) model.tagline = m.tagline;
      if (includeIds) model.model_id = m.id;
      model.gallery = imagesByModel.get(m.id) || [];
      return model;
    });

    const out = {
      id: p.id,
      line: p.line,
      year: p.year,
      img: p.hero_img,
      models,
    };
    if (p.hidden) out.hidden = true;
    return out;
  });
}

/**
 * Serializa el catálogo como JavaScript inline para servir como /data.js.
 * Mantiene exactamente la API que el frontend espera: define window.CATALOG.
 * También incluye TESTIMONIALS, STATS, FAQS, TRADEIN_PRICES y cartStore +
 * fmtCLP — todo lo que data.js exporta hoy.
 */
function buildDataJs() {
  const catalog = buildCatalog({ includeHidden: true });
  // TESTIMONIALS/STATS/FAQS/TRADEIN_PRICES siguen "duras" por ahora — están en
  // settings y pueden editarse desde admin más adelante. Para el MVP las
  // dejamos hardcoded acá para no romper el frontend.
  const extras = require("./catalog-extras");

  const js = `// AUTOGENERADO — fuente de verdad en SQLite. NO EDITAR a mano.
// Generado el ${new Date().toISOString()}
window.CATALOG = ${JSON.stringify(catalog, null, 2)};

window.TESTIMONIALS = ${JSON.stringify(extras.TESTIMONIALS, null, 2)};

window.STATS = ${JSON.stringify(extras.STATS, null, 2)};

window.FAQS = ${JSON.stringify(extras.FAQS, null, 2)};

window.TRADEIN_PRICES = ${JSON.stringify(extras.TRADEIN_PRICES, null, 2)};

window.fmtCLP = (n) => "$" + n.toLocaleString("es-CL");

window.cartStore = {
  key: "iphoneup_cart_v1",
  read() { try { return JSON.parse(sessionStorage.getItem(this.key) || "[]"); } catch { return []; } },
  write(items) { sessionStorage.setItem(this.key, JSON.stringify(items)); },
  add(item) { const c = this.read(); c.push(item); this.write(c); return c; },
  remove(idx) { const c = this.read(); c.splice(idx, 1); this.write(c); return c; },
  count() { return this.read().length; },
};
`;

  const etag = `W/"${crypto.createHash("sha1").update(js).digest("hex").slice(0, 16)}"`;
  return { body: js, etag };
}

// Resuelve el variant_id a partir de {phoneId, model, storage} — útil para
// descontar stock cuando MP confirma un pago.
function findVariantId({ phoneId, model, storage }) {
  const row = db.prepare(`
    SELECT v.id
    FROM variants v
    JOIN product_models m ON m.id = v.model_id
    JOIN products p ON p.id = m.product_id
    WHERE p.id = ? AND m.name = ? AND v.storage = ?
    LIMIT 1
  `).get(phoneId, model, storage);
  return row ? row.id : null;
}

module.exports = { buildCatalog, buildDataJs, findVariantId };
