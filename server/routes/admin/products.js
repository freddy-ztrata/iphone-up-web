// CRUD de productos, modelos y variants (precio + stock + estado).
//
// La forma de los datos respeta el shape histórico de `window.CATALOG` para
// que el catalog.js builder funcione sin transformaciones extra.

const express = require("express");
const db = require("../../db");
const audit = require("../../lib/audit");
const stock = require("../../lib/stock");
const { buildCatalog } = require("../../lib/catalog");

const router = express.Router();

// =========================================================
// PRODUCTOS
// =========================================================
const SEL_PRODUCT = db.prepare("SELECT * FROM products WHERE id = ?");
const SEL_PRODUCT_FULL = (id) => buildCatalog({ includeHidden: true, includeStock: true, includeIds: true })
  .find(p => p.id === id);

const INSERT_PRODUCT = db.prepare(`
  INSERT INTO products (id, line, year, hero_img, hidden, position)
  VALUES (@id, @line, @year, @hero_img, @hidden, @position)
`);
const UPDATE_PRODUCT = db.prepare(`
  UPDATE products SET
    line = COALESCE(@line, line),
    year = COALESCE(@year, year),
    hero_img = COALESCE(@hero_img, hero_img),
    hidden = COALESCE(@hidden, hidden),
    position = COALESCE(@position, position),
    updated_at = datetime('now')
  WHERE id = @id
`);
const DELETE_PRODUCT = db.prepare("DELETE FROM products WHERE id = ?");
const NEXT_PRODUCT_ID = db.prepare("SELECT COALESCE(MAX(id), 0) + 1 AS next FROM products");

router.get("/", (req, res) => {
  const list = buildCatalog({ includeHidden: true, includeStock: true, includeIds: true });
  res.json({ products: list });
});

router.get("/:id", (req, res) => {
  const id = parseInt(req.params.id, 10);
  const product = SEL_PRODUCT_FULL(id);
  if (!product) return res.status(404).json({ error: "No existe" });
  res.json(product);
});

router.post("/", (req, res) => {
  const { id, line, year, hero_img, hidden } = req.body || {};
  if (!line) return res.status(400).json({ error: "line es requerido" });
  const pid = id != null ? Number(id) : NEXT_PRODUCT_ID.get().next;
  try {
    INSERT_PRODUCT.run({
      id: pid,
      line: String(line),
      year: year || null,
      hero_img: hero_img || null,
      hidden: hidden ? 1 : 0,
      position: -pid,
    });
    const after = SEL_PRODUCT_FULL(pid);
    audit.log(req, { action: "create", entity_type: "product", entity_id: pid, after });
    res.status(201).json(after);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.patch("/:id", (req, res) => {
  const id = parseInt(req.params.id, 10);
  const before = SEL_PRODUCT_FULL(id);
  if (!before) return res.status(404).json({ error: "No existe" });

  const { line, year, hero_img, hidden, position } = req.body || {};
  UPDATE_PRODUCT.run({
    id,
    line: line ?? null,
    year: year ?? null,
    hero_img: hero_img ?? null,
    hidden: hidden == null ? null : (hidden ? 1 : 0),
    position: position ?? null,
  });
  const after = SEL_PRODUCT_FULL(id);
  audit.log(req, { action: "update", entity_type: "product", entity_id: id, before, after });
  res.json(after);
});

router.delete("/:id", (req, res) => {
  const id = parseInt(req.params.id, 10);
  const before = SEL_PRODUCT_FULL(id);
  if (!before) return res.status(404).json({ error: "No existe" });
  DELETE_PRODUCT.run(id);
  audit.log(req, { action: "delete", entity_type: "product", entity_id: id, before });
  res.json({ ok: true });
});

router.post("/reorder", (req, res) => {
  const { order } = req.body || {};
  if (!Array.isArray(order)) return res.status(400).json({ error: "order debe ser array de IDs" });
  const upd = db.prepare("UPDATE products SET position = ? WHERE id = ?");
  db.transaction(() => {
    order.forEach((id, idx) => upd.run(idx, id));
  })();
  audit.log(req, { action: "reorder", entity_type: "product", entity_id: null, after: order });
  res.json({ ok: true });
});

// =========================================================
// MODELOS de un producto
// =========================================================
const SEL_MODEL = db.prepare("SELECT * FROM product_models WHERE id = ?");
const INSERT_MODEL = db.prepare(`
  INSERT INTO product_models (product_id, name, img, sealed, tagline, position)
  VALUES (@product_id, @name, @img, @sealed, @tagline, @position)
`);
const UPDATE_MODEL = db.prepare(`
  UPDATE product_models SET
    name = COALESCE(@name, name),
    img = COALESCE(@img, img),
    sealed = COALESCE(@sealed, sealed),
    tagline = COALESCE(@tagline, tagline),
    position = COALESCE(@position, position),
    is_active = COALESCE(@is_active, is_active),
    updated_at = datetime('now')
  WHERE id = @id
`);
const DELETE_MODEL = db.prepare("DELETE FROM product_models WHERE id = ?");
const COUNT_MODELS_OF = db.prepare("SELECT COUNT(*) AS n FROM product_models WHERE product_id = ?");

router.post("/:id/models", (req, res) => {
  const product_id = parseInt(req.params.id, 10);
  const { name, img, sealed, tagline } = req.body || {};
  if (!name) return res.status(400).json({ error: "name requerido" });
  const position = COUNT_MODELS_OF.get(product_id).n;
  const r = INSERT_MODEL.run({
    product_id, name, img: img || null, sealed: sealed ? 1 : 0, tagline: tagline || null, position,
  });
  const model = SEL_MODEL.get(r.lastInsertRowid);
  audit.log(req, { action: "create", entity_type: "model", entity_id: model.id, after: model });
  res.status(201).json(model);
});

router.patch("/models/:modelId", (req, res) => {
  const id = parseInt(req.params.modelId, 10);
  const before = SEL_MODEL.get(id);
  if (!before) return res.status(404).json({ error: "No existe" });
  const { name, img, sealed, tagline, position, is_active } = req.body || {};
  UPDATE_MODEL.run({
    id, name: name ?? null, img: img ?? null,
    sealed: sealed == null ? null : (sealed ? 1 : 0),
    tagline: tagline ?? null, position: position ?? null,
    is_active: is_active == null ? null : (is_active ? 1 : 0),
  });
  const after = SEL_MODEL.get(id);
  audit.log(req, { action: "update", entity_type: "model", entity_id: id, before, after });
  res.json(after);
});

router.delete("/models/:modelId", (req, res) => {
  const id = parseInt(req.params.modelId, 10);
  const before = SEL_MODEL.get(id);
  if (!before) return res.status(404).json({ error: "No existe" });
  DELETE_MODEL.run(id);
  audit.log(req, { action: "delete", entity_type: "model", entity_id: id, before });
  res.json({ ok: true });
});

// =========================================================
// VARIANTS (storage + precio + stock)
// =========================================================
const SEL_VARIANT = db.prepare("SELECT * FROM variants WHERE id = ?");
const INSERT_VARIANT = db.prepare(`
  INSERT INTO variants (model_id, storage, price, compare_at_price, stock, sku, position)
  VALUES (@model_id, @storage, @price, @compare_at_price, @stock, @sku, @position)
`);
const UPDATE_VARIANT = db.prepare(`
  UPDATE variants SET
    storage = COALESCE(@storage, storage),
    price = COALESCE(@price, price),
    compare_at_price = COALESCE(@compare_at_price, compare_at_price),
    sku = COALESCE(@sku, sku),
    position = COALESCE(@position, position),
    is_active = COALESCE(@is_active, is_active),
    updated_at = datetime('now')
  WHERE id = @id
`);
const DELETE_VARIANT = db.prepare("DELETE FROM variants WHERE id = ?");
const COUNT_VARIANTS_OF = db.prepare("SELECT COUNT(*) AS n FROM variants WHERE model_id = ?");
const ALL_VARIANTS_OF_LINE = db.prepare(`
  SELECT v.id, v.price
  FROM variants v
  JOIN product_models m ON m.id = v.model_id
  WHERE m.product_id = ?
`);
const ALL_VARIANTS = db.prepare("SELECT id, price FROM variants");

router.post("/models/:modelId/variants", (req, res) => {
  const model_id = parseInt(req.params.modelId, 10);
  const { storage, price, compare_at_price, stock: initialStock, sku } = req.body || {};
  if (!storage || price == null) return res.status(400).json({ error: "storage y price requeridos" });
  const position = COUNT_VARIANTS_OF.get(model_id).n;
  const r = INSERT_VARIANT.run({
    model_id, storage, price: Math.round(price), compare_at_price: compare_at_price || null,
    stock: initialStock || 0, sku: sku || null, position,
  });
  const variant = SEL_VARIANT.get(r.lastInsertRowid);
  audit.log(req, { action: "create", entity_type: "variant", entity_id: variant.id, after: variant });
  res.status(201).json(variant);
});

router.patch("/variants/:variantId", (req, res) => {
  const id = parseInt(req.params.variantId, 10);
  const before = SEL_VARIANT.get(id);
  if (!before) return res.status(404).json({ error: "No existe" });
  const { storage, price, compare_at_price, sku, position, is_active } = req.body || {};
  UPDATE_VARIANT.run({
    id, storage: storage ?? null,
    price: price == null ? null : Math.round(price),
    compare_at_price: compare_at_price ?? null,
    sku: sku ?? null, position: position ?? null,
    is_active: is_active == null ? null : (is_active ? 1 : 0),
  });
  const after = SEL_VARIANT.get(id);
  audit.log(req, { action: "update", entity_type: "variant", entity_id: id, before, after });
  res.json(after);
});

router.delete("/variants/:variantId", (req, res) => {
  const id = parseInt(req.params.variantId, 10);
  const before = SEL_VARIANT.get(id);
  if (!before) return res.status(404).json({ error: "No existe" });
  DELETE_VARIANT.run(id);
  audit.log(req, { action: "delete", entity_type: "variant", entity_id: id, before });
  res.json({ ok: true });
});

// Ajuste de stock con motivo
router.post("/variants/:variantId/stock", (req, res) => {
  const id = parseInt(req.params.variantId, 10);
  const before = SEL_VARIANT.get(id);
  if (!before) return res.status(404).json({ error: "No existe" });
  const { delta, reason = "manual", note } = req.body || {};
  if (delta == null || !Number.isInteger(Number(delta))) {
    return res.status(400).json({ error: "delta entero requerido" });
  }
  const after = stock.adjust({
    variant_id: id,
    delta: Number(delta),
    reason,
    user_id: req.user?.id,
    note,
  });
  audit.log(req, {
    action: "stock_adjust",
    entity_type: "variant",
    entity_id: id,
    before: { stock: before.stock },
    after: { stock: after.stock, delta: Number(delta), reason, note: note || null },
  });
  res.json(after);
});

// Historial de movimientos de stock
router.get("/variants/:variantId/stock-log", (req, res) => {
  const id = parseInt(req.params.variantId, 10);
  res.json({ movements: stock.listMovements(id, req.query.limit) });
});

// Ajuste masivo de precio
router.post("/variants/bulk-price", (req, res) => {
  const { scope = "all", type = "percent", value } = req.body || {};
  if (value == null || isNaN(Number(value))) {
    return res.status(400).json({ error: "value numérico requerido" });
  }
  const val = Number(value);

  let targets;
  if (scope === "all") targets = ALL_VARIANTS.all();
  else if (scope.startsWith("line:")) {
    targets = ALL_VARIANTS_OF_LINE.all(parseInt(scope.slice(5), 10));
  } else {
    return res.status(400).json({ error: "scope inválido" });
  }

  const upd = db.prepare("UPDATE variants SET price = ?, updated_at = datetime('now') WHERE id = ?");
  const changes = [];
  db.transaction(() => {
    for (const v of targets) {
      const newPrice = type === "percent"
        ? Math.round(v.price * (1 + val / 100))
        : Math.max(0, v.price + Math.round(val));
      upd.run(newPrice, v.id);
      changes.push({ id: v.id, from: v.price, to: newPrice });
    }
  })();

  audit.log(req, {
    action: "bulk_price",
    entity_type: "variant",
    entity_id: null,
    after: { scope, type, value: val, affected: changes.length, changes },
  });

  res.json({ ok: true, affected: changes.length, changes });
});

module.exports = router;
