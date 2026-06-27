// Upload de imágenes: multer en memoria + sharp para resize y conversión a WebP.
// Las imágenes se guardan en {DATA_DIR}/uploads/products/<uuid>.webp
// y se sirven via /uploads/products/... (configurado en server/index.js).

const express = require("express");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const multer = require("multer");
const sharp = require("sharp");
const db = require("../../db");
const audit = require("../../lib/audit");

const router = express.Router();

const UPLOAD_DIR = path.join(db.DATA_DIR, "uploads", "products");
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 }, // 8 MB
  fileFilter: (_req, file, cb) => {
    const allowed = ["image/jpeg", "image/png", "image/webp", "image/heic"];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error("Tipo de imagen no permitido"));
  },
});

const INSERT_IMAGE = db.prepare(`
  INSERT INTO images (owner_type, owner_id, url, alt, position)
  VALUES (@owner_type, @owner_id, @url, @alt, @position)
`);
const DELETE_IMAGE = db.prepare("DELETE FROM images WHERE id = ?");
const GET_IMAGE = db.prepare("SELECT * FROM images WHERE id = ?");
const UPDATE_IMAGE = db.prepare(`
  UPDATE images SET alt = COALESCE(@alt, alt), position = COALESCE(@position, position) WHERE id = @id
`);

router.post("/image", upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Sin archivo" });
  const { owner_type, owner_id, alt = "", position = 0 } = req.body || {};
  if (!["product", "model"].includes(owner_type)) {
    return res.status(400).json({ error: "owner_type debe ser 'product' o 'model'" });
  }
  if (!owner_id) return res.status(400).json({ error: "owner_id requerido" });

  const uuid = crypto.randomBytes(8).toString("hex");
  const filename = `${uuid}.webp`;
  const fullPath = path.join(UPLOAD_DIR, filename);
  const publicUrl = `/uploads/products/${filename}`;

  try {
    await sharp(req.file.buffer)
      .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 82, alphaQuality: 100, effort: 6 })
      .toFile(fullPath);

    const r = INSERT_IMAGE.run({
      owner_type, owner_id: Number(owner_id), url: publicUrl, alt, position: Number(position),
    });
    const image = GET_IMAGE.get(r.lastInsertRowid);
    audit.log(req, { action: "create", entity_type: "image", entity_id: image.id, after: { ...image, owner_type, owner_id } });
    res.status(201).json(image);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Actualiza alt / position de una imagen.
router.patch("/image/:id", (req, res) => {
  const id = parseInt(req.params.id, 10);
  const before = GET_IMAGE.get(id);
  if (!before) return res.status(404).json({ error: "No existe" });
  const { alt, position } = req.body || {};
  UPDATE_IMAGE.run({ id, alt: alt ?? null, position: position == null ? null : Number(position) });
  res.json(GET_IMAGE.get(id));
});

// Reordena la galería: recibe { ids: [idEnOrden...] } y fija position por índice.
router.post("/reorder", (req, res) => {
  const { ids } = req.body || {};
  if (!Array.isArray(ids)) return res.status(400).json({ error: "ids debe ser un array" });
  const upd = db.prepare("UPDATE images SET position = ? WHERE id = ?");
  db.transaction(() => { ids.forEach((id, i) => upd.run(i, Number(id))); })();
  res.json({ ok: true });
});

router.delete("/image/:id", (req, res) => {
  const id = parseInt(req.params.id, 10);
  const before = GET_IMAGE.get(id);
  if (!before) return res.status(404).json({ error: "No existe" });

  // Borrar archivo físico (best-effort)
  try {
    const filePath = path.join(db.DATA_DIR, before.url.replace(/^\/+/, "").replace(/^uploads\//, "uploads/"));
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch (err) {
    console.warn("[uploads] no se pudo borrar archivo:", err.message);
  }
  DELETE_IMAGE.run(id);
  audit.log(req, { action: "delete", entity_type: "image", entity_id: id, before });
  res.json({ ok: true });
});

module.exports = router;
