-- 005 — Color por variante. Ahora una variante = capacidad × color.
-- La columna es nullable; el seed de colores (server/lib/color-seed.js) la rellena.
ALTER TABLE variants ADD COLUMN color TEXT;
CREATE INDEX IF NOT EXISTS idx_variants_color ON variants(model_id, storage, color);
