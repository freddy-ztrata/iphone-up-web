const express = require("express");
const cx = require("../lib/chilexpress");

const router = express.Router();

// Dimensiones por defecto de un envío de iPhone (caja + protección).
// Por unidad: 18 × 12 × 6 cm aprox, 0.7 kg con embalaje.
const DEFAULT_PKG = { weight: 0.7, length: 18, width: 12, height: 6 };

// Listado de regiones de Chile (Chilexpress).
router.get("/regions", async (_req, res) => {
  try {
    const regions = await cx.listRegions();
    res.json({ regions });
  } catch (err) {
    console.error("[chilexpress] regions error:", err.message);
    res.status(err.status || 500).json({ error: err.message });
  }
});

// Comunas (coverage areas) de una región. Ej: /coverage?regionCode=RM
router.get("/coverage", async (req, res) => {
  const regionCode = String(req.query.regionCode || "").trim();
  if (!regionCode) return res.status(400).json({ error: "regionCode requerido" });
  try {
    const areas = await cx.listCoverageAreas(regionCode);
    res.json({ areas });
  } catch (err) {
    console.error("[chilexpress] coverage error:", err.message);
    res.status(err.status || 500).json({ error: err.message });
  }
});

// Cotización de envío.
// Body: { destinationCountyCode, items: [{ price }], qty? }
// Multiplicamos las dimensiones por cantidad de equipos para simular bulto único.
router.post("/quote", async (req, res) => {
  const { destinationCountyCode, items = [], declaredWorth } = req.body || {};
  if (!destinationCountyCode) return res.status(400).json({ error: "destinationCountyCode requerido" });
  if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ error: "items vacío" });

  const qty = items.length;
  // Para múltiples iPhones, agrandamos el bulto sumando alturas.
  const pkg = {
    weight: +(DEFAULT_PKG.weight * qty).toFixed(2),
    length: DEFAULT_PKG.length,
    width: DEFAULT_PKG.width,
    height: DEFAULT_PKG.height * qty,
  };

  const totalPrice = items.reduce((a, i) => a + (Number(i.price) || 0), 0);
  const worth = declaredWorth ?? totalPrice;

  try {
    const { options } = await cx.quote({
      destinationCountyCode,
      weight: pkg.weight,
      length: pkg.length,
      width: pkg.width,
      height: pkg.height,
      declaredWorth: worth,
    });

    // Normalizamos al formato que consume el frontend.
    const services = options.map(o => ({
      code: o.serviceTypeCode || o.ServiceTypeCode,
      name: o.serviceDescription || o.ServiceDescription || "Chilexpress",
      price: Number(o.serviceValue || o.ServiceValue || 0),
      deliveryTime: o.deliveryEstimatedDate || o.DeliveryEstimatedDate || null,
    })).filter(s => s.price > 0);

    res.json({ services, package: pkg, declaredWorth: worth });
  } catch (err) {
    console.error("[chilexpress] quote error:", err.message);
    res.status(err.status || 500).json({ error: err.message });
  }
});

module.exports = router;
