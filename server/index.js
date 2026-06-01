// iPhone UP — backend Express
// Sirve los archivos estáticos del sitio + APIs de pago y envío.

require("dotenv").config();
const path = require("path");
const express = require("express");

const mercadopagoRouter = require("./routes/mercadopago");
const chilexpressRouter = require("./routes/chilexpress");
const ordersRouter = require("./routes/orders");

const app = express();
const PORT = process.env.PORT || 8080;
const PUBLIC_URL = process.env.PUBLIC_URL || `http://localhost:${PORT}`;

app.use(express.json({ limit: "1mb" }));
app.disable("x-powered-by");

// Healthcheck
app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    env: {
      mpConfigured: Boolean(process.env.MP_ACCESS_TOKEN && process.env.MP_ACCESS_TOKEN.startsWith("APP_USR-")),
      chilexpressConfigured: Boolean(process.env.CHILEXPRESS_API_KEY_RATING),
      publicUrl: PUBLIC_URL,
    },
  });
});

// APIs
app.use("/api/mercadopago", mercadopagoRouter);
app.use("/api/chilexpress", chilexpressRouter);
app.use("/api/orders", ordersRouter);

// Static site (root of repo)
const ROOT = path.resolve(__dirname, "..");
app.use(express.static(ROOT, { extensions: ["html"] }));

// SPA-style fallbacks: rutas conocidas
app.get("/checkout", (_req, res) => res.sendFile(path.join(ROOT, "checkout.html")));
app.get("/payment/success", (_req, res) => res.sendFile(path.join(ROOT, "payment-success.html")));
app.get("/payment/failure", (_req, res) => res.sendFile(path.join(ROOT, "payment-failure.html")));
app.get("/payment/pending", (_req, res) => res.sendFile(path.join(ROOT, "payment-pending.html")));

// 404 para rutas API desconocidas
app.use("/api", (_req, res) => res.status(404).json({ error: "Not found" }));

app.listen(PORT, () => {
  console.log(`iPhone UP server listening on ${PUBLIC_URL} (port ${PORT})`);
  if (!process.env.MP_ACCESS_TOKEN) console.warn("⚠️  MP_ACCESS_TOKEN no configurado — los pagos fallarán");
  if (!process.env.CHILEXPRESS_API_KEY_RATING) console.warn("⚠️  CHILEXPRESS_API_KEY_RATING no configurado — el cotizador fallará");
});
