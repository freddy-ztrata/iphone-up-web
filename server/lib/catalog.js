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
  SELECT id, model_id, storage, color, price, compare_at_price, stock, sku, position
  FROM variants
  WHERE model_id = ? AND is_active = 1
  ORDER BY position ASC, id ASC
`);

// Versiones SIN filtro is_active (para el admin: incluye variantes/modelos inactivos).
const SELECT_ALL_MODELS_FOR_PRODUCT = db.prepare(`
  SELECT id, product_id, name, img, sealed, tagline, position, is_active
  FROM product_models
  WHERE product_id = ?
  ORDER BY position ASC, id ASC
`);
// `cost` solo se lee acá (rama admin). El SELECT público de arriba no lo toca,
// así que el costo de adquisición nunca puede filtrarse a /data.js.
const SELECT_ALL_VARIANTS_FOR_MODEL = db.prepare(`
  SELECT id, model_id, storage, color, price, compare_at_price, cost, stock, sku, position, is_active
  FROM variants
  WHERE model_id = ?
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
  const { includeHidden = false, includeStock = false, includeIds = false, includeInactive = false } = opts;

  const products = SELECT_PRODUCTS.all().filter(p => includeHidden || !p.hidden);

  // Galería de fotos por modelo (tabla images). Una sola consulta agrupada.
  const imagesByModel = new Map();
  for (const im of SELECT_ALL_MODEL_IMAGES.all()) {
    if (!imagesByModel.has(im.owner_id)) imagesByModel.set(im.owner_id, []);
    imagesByModel.get(im.owner_id).push({ id: im.id, url: im.url, alt: im.alt || "", position: im.position });
  }

  return products.map(p => {
    const modelRows = (includeInactive ? SELECT_ALL_MODELS_FOR_PRODUCT : SELECT_MODELS_FOR_PRODUCT).all(p.id);
    const models = modelRows.map(m => {
      const variantRows = (includeInactive ? SELECT_ALL_VARIANTS_FOR_MODEL : SELECT_VARIANTS_FOR_MODEL).all(m.id);
      const variants = variantRows.map(v => {
        const storage = { s: v.storage, p: v.price };
        if (v.color) storage.color = v.color;
        if (v.compare_at_price) storage.compare_at = v.compare_at_price;
        if (includeStock) storage.stock = v.stock;
        if (includeIds) {
          // Campos de gestión: solo para el admin (includeIds no se usa en la
          // rama pública). `cost` es interno — nunca sale en /data.js.
          storage.variant_id = v.id;
          storage.sku = v.sku || "";
          storage.cost = v.cost == null ? null : v.cost;
          // Explícito incluso cuando es null: el editor bindea este campo y
          // necesita distinguir "sin precio antes" de "no vino en la respuesta".
          storage.compare_at = v.compare_at_price == null ? null : v.compare_at_price;
        }
        if (includeInactive) storage.is_active = !!v.is_active;
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
      if (includeInactive) model.is_active = !!m.is_active;
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

// Slug url-safe del modelo dentro de su línea:
//   "iPhone 11 Pro Max" (línea "11") -> "pro-max"; "iPhone 11" -> "base".
function slugify(name, line) {
  let s = String(name || "").toLowerCase().trim();
  const prefix = `iphone ${String(line).toLowerCase()}`;
  if (s.startsWith(prefix)) s = s.slice(prefix.length);
  s = s.trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return s || "base";
}

// Slug GLOBAL url-safe del nombre completo del modelo, para la URL limpia
// /producto/<slug>:  "iPhone 11 Pro Max" -> "iphone-11-pro-max"; "iPhone 15" -> "iphone-15".
function fullSlugify(name) {
  return String(name || "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "producto";
}

/**
 * Catálogo PÚBLICO aplanado: cada MODELO es un producto independiente
 * (iPhone 11, iPhone 11 Pro, iPhone 11 Pro Max → 3 entradas separadas).
 * Las variaciones de cada entrada son capacidad × color (`storages`).
 *
 * IMPORTANTE: conserva `id` = id de la LÍNEA (lo usan el backend para
 * findVariantId/stock, los cupones por scope de línea y specs.js), y agrega
 * `slug` único por modelo dentro de la línea para la URL `?id=<línea>&model=<slug>`.
 * buildCatalog() sigue devolviendo el shape anidado products→models para el admin.
 */
function buildPublicCatalog() {
  const nested = buildCatalog({ includeHidden: true });
  const flat = [];
  const fullSlugSeen = new Set(); // unicidad GLOBAL del slug de URL
  for (const p of nested) {
    const models = Array.isArray(p.models) ? p.models : [];
    const slugSeen = new Set();
    for (const m of models) {
      const storages = Array.isArray(m.storages) ? m.storages : [];
      if (!storages.length) continue; // sin variantes vendibles → no se publica
      let slug = slugify(m.name, p.line);
      if (slugSeen.has(slug)) {
        let i = 2;
        while (slugSeen.has(`${slug}-${i}`)) i++;
        slug = `${slug}-${i}`;
      }
      slugSeen.add(slug);
      let fullSlug = fullSlugify(m.name);
      if (fullSlugSeen.has(fullSlug)) {
        let i = 2;
        while (fullSlugSeen.has(`${fullSlug}-${i}`)) i++;
        fullSlug = `${fullSlug}-${i}`;
      }
      fullSlugSeen.add(fullSlug);
      const entry = {
        id: p.id,
        line: p.line,
        year: p.year,
        lineImg: p.img,
        name: m.name,
        slug,
        fullSlug,
        img: m.img || p.img,
        sealed: !!m.sealed,
        storages,
      };
      if (p.hidden) entry.hidden = true;
      if (m.tagline) entry.tagline = m.tagline;
      if (Array.isArray(m.gallery) && m.gallery.length) entry.gallery = m.gallery;
      flat.push(entry);
    }
  }
  return flat;
}

/**
 * Serializa el catálogo como JavaScript inline para servir como /data.js.
 * Mantiene exactamente la API que el frontend espera: define window.CATALOG.
 * También incluye TESTIMONIALS, STATS, FAQS, TRADEIN_PRICES y cartStore +
 * fmtCLP — todo lo que data.js exporta hoy.
 */
function buildDataJs() {
  // Excluimos del catálogo público los productos sin variantes vendibles (sin
  // modelos o con modelos sin storages) para no romper el render del frontend.
  const catalog = buildPublicCatalog();
  // TRADEIN_PRICES ya es editable desde el admin (tabla `settings`);
  // catalog-extras queda como default de fábrica. TESTIMONIALS/STATS/FAQS
  // siguen hardcodeados — son texto editorial, no operación diaria.
  const extras = require("./catalog-extras");

  // Captura del email del checkout para recordar carros abandonados. Se resuelve
  // acá afuera y no interpolado en el template: el string de abajo está delimitado
  // por backticks, así que cualquier backtick de un comentario (o de un
  // identificador entre acentos graves) lo cortaría y el módulo no cargaría —
  // rompiendo el boot entero del server, no solo /data.js.
  const emailCfg = require("./settings").getEmailConfig();
  const cartCapture = {
    enabled: emailCfg.enabled && emailCfg.captureEnabled,
    expireDays: emailCfg.cartExpireDays,
  };

  const js = `// AUTOGENERADO — fuente de verdad en SQLite. NO EDITAR a mano.
// Generado el ${new Date().toISOString()}
window.CATALOG = ${JSON.stringify(catalog, null, 2)};

window.TESTIMONIALS = ${JSON.stringify(extras.TESTIMONIALS, null, 2)};

window.STATS = ${JSON.stringify(extras.STATS, null, 2)};

window.FAQS = ${JSON.stringify(extras.FAQS, null, 2)};

window.TRADEIN_PRICES = ${JSON.stringify(require("./settings").getTradeinPrices(), null, 2)};

window.PAY_FEE = ${JSON.stringify(require("./settings").getPaymentFee())};

// Captura del email del checkout para recordar carros abandonados.
// "enabled" se apaga desde Ajustes → Emails; el frontend deja de postear en false.
window.CART_CAPTURE = ${JSON.stringify(cartCapture)};

window.fmtCLP = (n) => "$" + n.toLocaleString("es-CL");

window.cartStore = {
  key: "iphoneup_cart_v1",
  read() { try { return JSON.parse(sessionStorage.getItem(this.key) || "[]"); } catch { return []; } },
  write(items) { sessionStorage.setItem(this.key, JSON.stringify(items)); },
  add(item) { const c = this.read(); c.push(item); this.write(c); return c; },
  remove(idx) { const c = this.read(); c.splice(idx, 1); this.write(c); return c; },
  count() { return this.read().length; },
};

// Tracking de visitas para la analítica del admin (solo páginas públicas que cargan data.js).
(function(){
  try {
    var k = "iphoneup_sid", sid = localStorage.getItem(k);
    if (!sid) { sid = Date.now().toString(36) + Math.random().toString(36).slice(2, 8); localStorage.setItem(k, sid); }
    fetch("/api/track", { method: "POST", headers: { "Content-Type": "application/json" }, keepalive: true,
      body: JSON.stringify({ sessionId: sid, path: location.pathname, referrer: document.referrer || "" }) }).catch(function(){});
  } catch (e) {}
})();
`;

  const etag = `W/"${crypto.createHash("sha1").update(js).digest("hex").slice(0, 16)}"`;
  return { body: js, etag };
}

// NOTA: acá vivía findVariantId({phoneId, model, storage}), que resolvía la
// variante ignorando el COLOR y cortaba con LIMIT 1 — desde la migración 005 el
// color es parte de la identidad de la variante, así que descontaba stock de un
// color al azar. El resolver bueno es stock.findVariantForItem() (intenta match
// exacto con color y recién después cae al fallback). No lo reintroduzcas acá.

module.exports = { buildCatalog, buildPublicCatalog, buildDataJs };
