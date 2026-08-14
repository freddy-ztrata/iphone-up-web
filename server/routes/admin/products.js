// CRUD de productos, modelos y variants (precio + stock + estado).
//
// La forma de los datos respeta el shape histórico de `window.CATALOG` para
// que el catalog.js builder funcione sin transformaciones extra.

const express = require("express");
const db = require("../../db");
const audit = require("../../lib/audit");
const stock = require("../../lib/stock");
const { buildCatalog } = require("../../lib/catalog");
const { requireAdmin } = require("../../middleware/auth");

const router = express.Router();

// =========================================================
// PRODUCTOS
// =========================================================
const SEL_PRODUCT = db.prepare("SELECT * FROM products WHERE id = ?");
const SEL_PRODUCT_FULL = (id) => buildCatalog({ includeHidden: true, includeStock: true, includeIds: true, includeInactive: true })
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
  const list = buildCatalog({ includeHidden: true, includeStock: true, includeIds: true, includeInactive: true });
  res.json({ products: list });
});

// `:id(\\d+)` y no `:id` a secas: los ids de producto son siempre numéricos, y
// sin la restricción esta ruta se traga cualquier segmento suelto — incluido
// `/export.csv`, que se registra más abajo y devolvía 404 "No existe".
router.get("/:id(\\d+)", (req, res) => {
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

router.delete("/:id", requireAdmin, (req, res) => {
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

router.delete("/models/:modelId", requireAdmin, (req, res) => {
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
  INSERT INTO variants (model_id, storage, color, price, compare_at_price, cost, stock, sku, position, is_active)
  VALUES (@model_id, @storage, @color, @price, @compare_at_price, @cost, @stock, @sku, @position, @is_active)
`);
// compare_at_price / cost / sku usan @x en vez de COALESCE(@x, col) a propósito:
// son campos opcionales que el editor tiene que poder VACIAR. Con COALESCE,
// mandar null significaría "no tocar" y nunca se podrían borrar. Los callers
// resuelven el valor previo cuando la key no viene en el body (ver PATCH).
const UPDATE_VARIANT = db.prepare(`
  UPDATE variants SET
    storage = COALESCE(@storage, storage),
    color = COALESCE(@color, color),
    price = COALESCE(@price, price),
    compare_at_price = @compare_at_price,
    cost = @cost,
    sku = @sku,
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
  const { storage, color, price, compare_at_price, cost, stock: initialStock, sku, is_active } = req.body || {};
  if (!storage || price == null) return res.status(400).json({ error: "storage y price requeridos" });
  const position = COUNT_VARIANTS_OF.get(model_id).n;
  const r = INSERT_VARIANT.run({
    model_id, storage, color: color || null, price: Math.round(price),
    compare_at_price: compare_at_price ? Math.round(Number(compare_at_price)) : null,
    cost: cost == null || cost === "" ? null : Math.round(Number(cost)),
    stock: initialStock || 0, sku: sku || null, position, is_active: is_active ? 1 : 0,
  });
  const variant = SEL_VARIANT.get(r.lastInsertRowid);
  audit.log(req, { action: "create", entity_type: "variant", entity_id: variant.id, after: variant });
  res.status(201).json(variant);
});

router.patch("/variants/:variantId", (req, res) => {
  const id = parseInt(req.params.variantId, 10);
  const before = SEL_VARIANT.get(id);
  if (!before) return res.status(404).json({ error: "No existe" });
  const body = req.body || {};
  const { storage, color, price, position, is_active } = body;
  // Campos vaciables: si la key NO viene en el body, conservamos el valor
  // actual; si viene como null/"" el usuario la está limpiando a propósito.
  const optional = (key, cast) => {
    if (!(key in body)) return before[key];
    const v = body[key];
    if (v == null || v === "") return null;
    return cast ? cast(v) : v;
  };
  UPDATE_VARIANT.run({
    id, storage: storage ?? null,
    color: color ?? null,
    price: price == null ? null : Math.round(price),
    compare_at_price: optional("compare_at_price", v => Math.round(Number(v))),
    cost: optional("cost", v => Math.round(Number(v))),
    sku: optional("sku", v => String(v).trim()),
    position: position ?? null,
    is_active: is_active == null ? null : (is_active ? 1 : 0),
  });
  const after = SEL_VARIANT.get(id);
  audit.log(req, { action: "update", entity_type: "variant", entity_id: id, before, after });
  res.json(after);
});

router.delete("/variants/:variantId", requireAdmin, (req, res) => {
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

// =========================================================
// AJUSTE MASIVO DE PRECIO — preview (dry-run) + aplicar + deshacer
// =========================================================
// Es la operación más destructiva del panel (puede reescribir todo el catálogo
// de una), así que: solo admin, siempre con preview antes, y con undo real.
// El "undo" no recalcula la fórmula inversa — un -10% después de un +10% NO
// devuelve el precio original por el redondeo. Restauramos los valores exactos
// que quedaron guardados en el audit_log de la tanda.

const UPD_PRICE = db.prepare("UPDATE variants SET price = ?, updated_at = datetime('now') WHERE id = ?");

// Detalle legible de cada variante afectada (para que el preview no sea solo IDs).
const VARIANT_LABELS = db.prepare(`
  SELECT v.id, v.price, v.storage, v.color, m.name AS model, p.line
  FROM variants v
  JOIN product_models m ON m.id = v.model_id
  JOIN products p ON p.id = m.product_id
  WHERE v.id IN (SELECT value FROM json_each(?))
`);

function resolveScope(scope) {
  if (scope === "all") return ALL_VARIANTS.all();
  if (scope.startsWith("line:")) {
    const id = parseInt(scope.slice(5), 10);
    if (!Number.isInteger(id)) return null;
    return ALL_VARIANTS_OF_LINE.all(id);
  }
  if (scope.startsWith("model:")) {
    const id = parseInt(scope.slice(6), 10);
    if (!Number.isInteger(id)) return null;
    return db.prepare("SELECT id, price FROM variants WHERE model_id = ?").all(id);
  }
  return null;
}

function computeChanges(targets, type, val) {
  return targets.map(v => ({
    id: v.id,
    from: v.price,
    to: type === "percent"
      ? Math.max(0, Math.round(v.price * (1 + val / 100)))
      : Math.max(0, v.price + Math.round(val)),
  }));
}

// Enriquece los cambios con nombre de modelo/capacidad/color para el preview.
function describeChanges(changes) {
  if (!changes.length) return changes;
  const rows = VARIANT_LABELS.all(JSON.stringify(changes.map(c => c.id)));
  const byId = new Map(rows.map(r => [r.id, r]));
  return changes.map(c => {
    const r = byId.get(c.id);
    return {
      ...c,
      label: r ? `${r.model} ${r.storage}${r.color ? " · " + r.color : ""}` : `Variante #${c.id}`,
      line: r ? r.line : null,
    };
  });
}

router.post("/variants/bulk-price", requireAdmin, (req, res) => {
  const { scope = "all", type = "percent", value, dryRun = false } = req.body || {};
  if (value == null || isNaN(Number(value))) {
    return res.status(400).json({ error: "value numérico requerido" });
  }
  if (!["percent", "fixed"].includes(type)) {
    return res.status(400).json({ error: "type inválido: percent | fixed" });
  }
  const val = Number(value);

  const targets = resolveScope(String(scope));
  if (!targets) return res.status(400).json({ error: "scope inválido: all | line:<id> | model:<id>" });

  const changes = computeChanges(targets, type, val);

  // Preview: no toca la DB ni deja rastro en audit.
  if (dryRun) {
    return res.json({ ok: true, dryRun: true, affected: changes.length, changes: describeChanges(changes) });
  }

  db.transaction(() => {
    for (const c of changes) UPD_PRICE.run(c.to, c.id);
  })();

  // El id del audit es el "batch id" con el que se puede deshacer.
  const batchId = audit.log(req, {
    action: "bulk_price",
    entity_type: "variant",
    entity_id: null,
    after: { scope, type, value: val, affected: changes.length, changes },
  });

  res.json({ ok: true, affected: changes.length, changes: describeChanges(changes), batchId });
});

// Deshacer una tanda: restaura los precios exactos previos guardados en audit.
router.post("/variants/bulk-price/undo", requireAdmin, (req, res) => {
  const { batchId } = req.body || {};
  const entry = batchId == null ? null : audit.getEntry(Number(batchId));
  if (!entry || entry.action !== "bulk_price") {
    return res.status(404).json({ error: "No existe esa tanda de ajuste masivo" });
  }
  if (entry.after?.undone_by) {
    return res.status(409).json({ error: "Esa tanda ya fue deshecha" });
  }
  const changes = Array.isArray(entry.after?.changes) ? entry.after.changes : [];
  if (!changes.length) return res.status(400).json({ error: "La tanda no tiene cambios que restaurar" });

  // Solo restauramos las variantes que siguen existiendo (alguna pudo borrarse).
  const existing = new Set(
    db.prepare("SELECT id FROM variants WHERE id IN (SELECT value FROM json_each(?))")
      .all(JSON.stringify(changes.map(c => c.id))).map(r => r.id)
  );
  const restorable = changes.filter(c => existing.has(c.id));

  db.transaction(() => {
    for (const c of restorable) UPD_PRICE.run(c.from, c.id);
  })();

  const undoId = audit.log(req, {
    action: "bulk_price_undo",
    entity_type: "variant",
    entity_id: null,
    before: { batchId: Number(batchId), changes },
    after: { restored: restorable.length, skipped: changes.length - restorable.length },
  });

  // Marca la tanda original como deshecha para que no se pueda revertir dos veces.
  db.prepare("UPDATE audit_log SET after_json = ? WHERE id = ?")
    .run(JSON.stringify({ ...entry.after, undone_by: undoId }), Number(batchId));

  res.json({ ok: true, restored: restorable.length, skipped: changes.length - restorable.length });
});

// =========================================================
// GUARDADO ATÓMICO DEL PRODUCTO COMPLETO (item 11)
// =========================================================
// El editor del panel hacía ~15 requests sueltos por "Guardar cambios"
// (PATCH producto, DELETE modelos, POST/PATCH variantes, POST stock...). Si una
// fallaba a mitad de camino, el producto quedaba en un estado intermedio: el
// modelo borrado pero sus variantes creadas, o precios nuevos con stock viejo.
// Acá recibimos el borrador completo y lo aplicamos en UNA transacción: o queda
// todo, o no queda nada.
//
// Las rutas granulares siguen existiendo (no rompemos ninguna API); esta es la
// que usa el editor.
router.put("/:id/save", (req, res) => {
  const id = parseInt(req.params.id, 10);
  const before = SEL_PRODUCT_FULL(id);
  if (!before) return res.status(404).json({ error: "No existe" });

  const draft = req.body || {};
  const models = Array.isArray(draft.models) ? draft.models : [];

  // Borrar modelos/variantes es destructivo: si el borrador elimina algo, hace
  // falta ser admin. Un editor puede editar y agregar, no eliminar.
  const draftModelIds = new Set(models.filter(m => m.model_id).map(m => Number(m.model_id)));
  const removedModels = (before.models || []).filter(m => m.model_id && !draftModelIds.has(Number(m.model_id)));
  const draftVariantIds = new Set(
    models.flatMap(m => (m.storages || []).filter(s => s.variant_id).map(s => Number(s.variant_id)))
  );
  const removedVariants = (before.models || []).flatMap(m =>
    (m.storages || []).filter(s => s.variant_id && !draftVariantIds.has(Number(s.variant_id)))
  );
  if ((removedModels.length || removedVariants.length) && req.user.role !== "admin") {
    return res.status(403).json({
      error: `Eliminar modelos o variantes requiere rol admin (este guardado borraría ${removedModels.length} modelo(s) y ${removedVariants.length} variante(s))`,
    });
  }

  const stockOps = [];
  try {
    db.transaction(() => {
      UPDATE_PRODUCT.run({
        id,
        line: draft.line ?? null,
        year: draft.year ?? null,
        hero_img: draft.img ?? null,
        hidden: draft.hidden == null ? null : (draft.hidden ? 1 : 0),
        position: draft.position ?? null,
      });

      for (const m of removedModels) DELETE_MODEL.run(m.model_id);
      for (const v of removedVariants) DELETE_VARIANT.run(v.variant_id);

      models.forEach((m, mIdx) => {
        let modelId = m.model_id ? Number(m.model_id) : null;
        if (!modelId) {
          const r = INSERT_MODEL.run({
            product_id: id,
            name: m.name || "Nuevo modelo",
            img: m.img || null,
            sealed: m.sealed ? 1 : 0,
            tagline: m.tagline || null,
            position: mIdx,
          });
          modelId = Number(r.lastInsertRowid);
        } else {
          UPDATE_MODEL.run({
            id: modelId,
            name: m.name ?? null,
            img: m.img ?? null,
            sealed: m.sealed == null ? null : (m.sealed ? 1 : 0),
            tagline: m.tagline ?? null,
            position: mIdx,
            is_active: m.is_active == null ? null : (m.is_active ? 1 : 0),
          });
        }

        const origModel = (before.models || []).find(x => Number(x.model_id) === modelId);
        (m.storages || []).forEach((s, sIdx) => {
          const price = Math.max(0, Math.round(Number(s.p) || 0));
          const targetStock = Math.max(0, Math.round(Number(s.stock) || 0));
          const origVar = s.variant_id
            ? (origModel?.storages || []).find(x => Number(x.variant_id) === Number(s.variant_id))
            : null;

          // Campos opcionales (compare_at / cost / sku) sobre una variante que
          // ya existe:
          //   key ausente  → conservar lo que hay en la DB (el borrador no lo
          //                  conoce; asumir null borraba datos en cada guardado)
          //   null o ""    → el usuario lo está limpiando a propósito
          // En una variante nueva no hay valor previo, así que ausente = vacío.
          const optional = (key, draftValue, cast) => {
            const raw = draftValue === undefined ? (origVar ? origVar[key] : null) : draftValue;
            // "" incluye el sku vacío que buildCatalog devuelve como "" y no como
            // NULL: guardarlo tal cual chocaría con el UNIQUE de variants.sku
            // apenas hubiera dos variantes sin código.
            if (raw == null || raw === "") return null;
            return cast(raw);
          };
          const compareAt = optional("compare_at", s.compare_at, v => Math.round(Number(v)));
          const cost = optional("cost", s.cost, v => Math.round(Number(v)));
          const sku = optional("sku", s.sku, v => String(v).trim() || null);

          if (!s.variant_id) {
            const r = INSERT_VARIANT.run({
              model_id: modelId,
              storage: s.s || "—",
              color: s.color || null,
              price,
              compare_at_price: compareAt,
              cost,
              stock: 0, // el stock inicial entra como movimiento, para que quede en el kardex
              sku,
              position: sIdx,
              is_active: s.is_active ? 1 : 0,
            });
            if (targetStock > 0) {
              stockOps.push({ variant_id: Number(r.lastInsertRowid), delta: targetStock, note: "Alta desde el editor" });
            }
          } else {
            const variantId = Number(s.variant_id);
            UPDATE_VARIANT.run({
              id: variantId,
              storage: s.s ?? null,
              color: s.color ?? null,
              price,
              compare_at_price: compareAt,
              cost,
              sku,
              position: sIdx,
              is_active: s.is_active == null ? null : (s.is_active ? 1 : 0),
            });
            const origStock = origVar ? Number(origVar.stock) || 0 : 0;
            if (targetStock !== origStock) {
              stockOps.push({ variant_id: variantId, delta: targetStock - origStock, note: "Ajuste desde el editor" });
            }
          }
        });
      });

      // Todo movimiento de stock pasa por stock.adjust para que quede el kardex.
      for (const op of stockOps) {
        stock.adjust({ variant_id: op.variant_id, delta: op.delta, reason: "manual", user_id: req.user?.id, note: op.note });
      }
    })();
  } catch (err) {
    return res.status(400).json({ error: "No se guardó nada: " + err.message });
  }

  const after = SEL_PRODUCT_FULL(id);
  audit.log(req, {
    action: "update", entity_type: "product", entity_id: id,
    before, after: { ...after, _summary: {
      removedModels: removedModels.length,
      removedVariants: removedVariants.length,
      stockMovements: stockOps.length,
    } },
  });
  res.json(after);
});

// =========================================================
// EXPORT CSV DE INVENTARIO (item 13)
// =========================================================
// Incluye `cost` y margen ⇒ información comercial sensible ⇒ solo admin.
router.get("/export.csv", requireAdmin, (req, res) => {
  const rows = db.prepare(`
    SELECT p.id AS product_id, p.line, p.year, p.hidden,
           m.id AS model_id, m.name AS model, m.sealed,
           v.id AS variant_id, v.storage, v.color, v.sku,
           v.price, v.compare_at_price, v.cost, v.stock, v.is_active
    FROM variants v
    JOIN product_models m ON m.id = v.model_id
    JOIN products p ON p.id = m.product_id
    ORDER BY p.id DESC, m.position ASC, v.position ASC
  `).all();

  const header = [
    "variant_id", "linea", "anio", "modelo", "sellado", "capacidad", "color", "sku",
    "precio", "precio_antes", "costo", "margen", "margen_pct", "stock", "valor_stock",
    "variante_activa", "producto_oculto",
  ];
  const lines = [header.join(",")];
  for (const r of rows) {
    const margin = r.cost == null ? "" : r.price - r.cost;
    const marginPct = r.cost == null || r.price === 0 ? "" : Math.round(((r.price - r.cost) / r.price) * 1000) / 10;
    lines.push([
      r.variant_id, r.line, r.year || "", r.model, r.sealed ? "si" : "no",
      r.storage, r.color || "", r.sku || "",
      r.price, r.compare_at_price || "", r.cost == null ? "" : r.cost, margin, marginPct,
      r.stock, r.price * r.stock,
      r.is_active ? "si" : "no", r.hidden ? "si" : "no",
    ].map(csvCell).join(","));
  }

  audit.log(req, { action: "export", entity_type: "variant", entity_id: null, after: { rows: rows.length } });

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="inventario-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send("﻿" + lines.join("\r\n") + "\r\n");
});

// Escapa una celda CSV; neutraliza fórmulas para que Excel no las ejecute.
function csvCell(v) {
  let s = v == null ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  if (/[",\r\n]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
  return s;
}

module.exports = router;
