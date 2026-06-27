// iPhone UP — backend Express + admin "Neon Console"
// Sirve los archivos estáticos del sitio + APIs de pago/envío + admin panel.

require("dotenv").config();
const path = require("path");
const fs = require("fs");
const express = require("express");
const helmet = require("helmet");
const session = require("express-session");
const cookieParser = require("cookie-parser");
const rateLimit = require("express-rate-limit");
const SqliteStore = require("better-sqlite3-session-store")(session);

// Inicialización en orden: DB primero (corre migraciones), después seed.
const db = require("./db");
require("./lib/users"); // bootstrap del primer usuario admin
const { seedIfEmpty } = require("../scripts/seed-from-datajs");
const backup = require("./lib/backup");

// Seed inicial del catálogo (solo si la tabla products está vacía)
try { seedIfEmpty(); } catch (err) { console.error("[boot] seed failed:", err.message); }

// Genera variantes capacidad × color (colores reales de Apple, desactivadas). Idempotente.
try { require("./lib/color-seed").seedColorsIfNeeded(); } catch (err) { console.error("[boot] color seed failed:", err.message); }

// Producto de prueba ($500, activo) para testear el flujo de compra. Idempotente (una vez).
try { require("./lib/test-product").ensureTestProduct(); } catch (err) { console.error("[boot] test product failed:", err.message); }

// Routers
const mercadopagoRouter = require("./routes/mercadopago");
const chilexpressRouter = require("./routes/chilexpress");
const ordersRouter = require("./routes/orders");
const adminRouter = require("./routes/admin");
const { buildDataJs, buildPublicCatalog } = require("./lib/catalog");

const app = express();
const PORT = process.env.PORT || 8080;
const PUBLIC_URL = process.env.PUBLIC_URL || `http://localhost:${PORT}`;
const IS_PROD = process.env.NODE_ENV === "production";

app.set("trust proxy", 1); // detrás de Traefik en Dokploy
app.disable("x-powered-by");

// ---------- Seguridad ----------
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      // Permitir inline JS/CSS del sitio actual (que no usa bundler)
      scriptSrc: ["'self'", "'unsafe-inline'", "https://sdk.mercadopago.com", "https://www.googletagmanager.com", "https://www.google-analytics.com"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "data:", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https:", "blob:"],
      connectSrc: ["'self'", "https://api.mercadopago.com", "https://www.google-analytics.com", "https://api.chilexpress.cl"],
      frameSrc: ["'self'", "https://www.mercadopago.cl", "https://www.openstreetmap.org"],
      objectSrc: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false, // permite el iframe de OpenStreetMap
}));

app.use(cookieParser());
app.use(express.json({ limit: "1mb" }));

// Sessions (admin)
app.use(session({
  store: new SqliteStore({
    client: db,
    expired: { clear: true, intervalMs: 15 * 60 * 1000 },
  }),
  secret: process.env.SESSION_SECRET || "INSEGURO_cambiame_en_dot_env",
  resave: false,
  saveUninitialized: false,
  proxy: true, // confía en X-Forwarded-Proto (Traefik) para decidir cookies secure
  cookie: {
    httpOnly: true,
    secure: IS_PROD,
    sameSite: "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 días
  },
}));

// ---------- Healthcheck ----------
let BUILD_SHA = "unknown";
try { BUILD_SHA = fs.readFileSync(path.join(__dirname, "..", ".git-sha"), "utf-8").trim() || "unknown"; } catch {}

app.get("/api/health", (_req, res) => {
  const chilexpressConfigured = Boolean(process.env.CHILEXPRESS_API_KEY_RATING);
  const productCount = db.prepare("SELECT COUNT(*) AS n FROM products").get().n;
  const userCount = db.prepare("SELECT COUNT(*) AS n FROM users WHERE is_active = 1").get().n;
  // Conteo de órdenes (sin PII) para monitoreo.
  let orders = {};
  try { orders.total = db.prepare("SELECT COUNT(*) AS n FROM orders").get().n; } catch (e) { orders.err = e.message; }
  res.json({
    ok: true,
    build: BUILD_SHA,
    env: {
      mpConfigured: Boolean(process.env.MP_ACCESS_TOKEN && process.env.MP_ACCESS_TOKEN.startsWith("APP_USR-")),
      mpWebhookSecretConfigured: Boolean(process.env.MP_WEBHOOK_SECRET),
      chilexpressConfigured,
      shippingMode: chilexpressConfigured ? "chilexpress" : "fallback-rates",
      useDbCatalog: process.env.USE_DB_CATALOG !== "false",
      publicUrl: PUBLIC_URL,
    },
    db: { ok: true, products: productCount, users: userCount, path: db.DB_PATH },
    orders,
  });
});

// ---------- Ruta dinámica /data.js (catálogo desde DB) ----------
// Cache local en memoria invalidado cuando algo del catálogo cambia.
// Por ahora regeneramos en cada request (es barato: <5ms para 7 productos)
// pero el ETag hace que el navegador haga 304 si no cambió.
const USE_DB_CATALOG = process.env.USE_DB_CATALOG !== "false";

// Fallback shape-válido (catálogo vacío) cuando el catálogo de la DB no está
// disponible. OJO: NO servimos el data.js físico — ese archivo es la fuente del
// SEED y mantiene el shape ANIDADO (products→models[]), incompatible con el
// frontend público que ahora espera 1 entrada por modelo (plano). Servir vacío
// degrada con gracia (no rompe el JS) y conserva cartStore/fmtCLP para que el
// checkout siga operando.
const EMPTY_CATALOG_JS = [
  "window.CATALOG=[];",
  "window.TESTIMONIALS=[];window.STATS=[];window.FAQS=[];window.TRADEIN_PRICES={};",
  'window.fmtCLP=function(n){return "$"+Number(n).toLocaleString("es-CL");};',
  'window.cartStore={key:"iphoneup_cart_v1",read(){try{return JSON.parse(sessionStorage.getItem(this.key)||"[]")}catch(e){return[]}},write(i){sessionStorage.setItem(this.key,JSON.stringify(i))},add(i){var c=this.read();c.push(i);this.write(c);return c},remove(x){var c=this.read();c.splice(x,1);this.write(c);return c},count(){return this.read().length}};',
].join("\n");

function sendEmptyCatalog(res) {
  res.setHeader("Content-Type", "application/javascript; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache");
  res.send(EMPTY_CATALOG_JS);
}

app.get("/data.js", (req, res) => {
  if (!USE_DB_CATALOG) {
    console.warn("[/data.js] USE_DB_CATALOG=false — sirviendo catálogo vacío (el data.js físico es solo seed, shape incompatible)");
    return sendEmptyCatalog(res);
  }
  try {
    const { body, etag } = buildDataJs();
    res.setHeader("Content-Type", "application/javascript; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("ETag", etag);
    if (req.headers["if-none-match"] === etag) return res.status(304).end();
    res.send(body);
  } catch (err) {
    console.error("[/data.js] error:", err.message);
    sendEmptyCatalog(res);
  }
});

// ---------- APIs ----------
app.use("/api/mercadopago", mercadopagoRouter);
app.use("/api/chilexpress", chilexpressRouter);
app.use("/api/orders", ordersRouter);
app.use("/api/admin", adminRouter);

// ---------- Tracking de visitas (analítica del admin) ----------
const trackLimiter = rateLimit({ windowMs: 60 * 1000, max: 120, standardHeaders: false, legacyHeaders: false });
const INSERT_VISIT = db.prepare(`INSERT INTO visits (session_id, path, referrer, user_agent, ip) VALUES (?, ?, ?, ?, ?)`);
app.post("/api/track", trackLimiter, (req, res) => {
  try {
    const { sessionId, path: p, referrer } = req.body || {};
    if (sessionId) {
      INSERT_VISIT.run(
        String(sessionId).slice(0, 64),
        String(p || "").slice(0, 300),
        String(referrer || "").slice(0, 300),
        (req.get("user-agent") || "").slice(0, 300),
        req.ip || null
      );
    }
  } catch (e) { /* nunca romper la respuesta por tracking */ }
  res.status(204).end();
});

// ---------- Admin UI ----------
const ROOT = path.resolve(__dirname, "..");

// Alpine.js (admin) evalúa sus expresiones (x-show, x-data, etc.) con el
// constructor Function, que la CSP global bloquea al no incluir 'unsafe-eval'.
// Sin él Alpine arranca pero no aplica ningún x-show: el login y el command
// palette se renderizan a la vez y el palette tapa el formulario de acceso.
// Servimos SOLO el HTML del admin con una CSP propia que permite eval,
// manteniendo el sitio público estricto.
const adminPageCsp = helmet.contentSecurityPolicy({
  directives: {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
    styleSrc: ["'self'", "'unsafe-inline'"],
    fontSrc: ["'self'", "data:"],
    imgSrc: ["'self'", "data:", "https:", "blob:"],
    connectSrc: ["'self'"],
    objectSrc: ["'none'"],
  },
});

const sendAdmin = (_req, res) => res.sendFile(path.join(ROOT, "admin.html"));
app.get(["/admin", "/admin/", "/admin.html"], adminPageCsp, sendAdmin);
app.get("/admin/login", adminPageCsp, sendAdmin);

// ---------- Uploads (volumen persistente) ----------
app.use("/uploads", express.static(path.join(db.DATA_DIR, "uploads"), {
  setHeaders(res) {
    // URLs content-addressed: cache fuerte e inmutable.
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
  },
}));

// ---------- URLs limpias de producto + sitemap dinámico ----------
// /producto/<fullSlug> sirve product.html; product.js resuelve el modelo por su fullSlug.
// La analítica registra el pathname → cada producto aparece distinto en "páginas más vistas".
app.get("/producto/:slug", (_req, res) => res.sendFile(path.join(ROOT, "product.html")));

// Sitemap generado desde el catálogo (1 URL por modelo). Se actualiza solo al activar productos.
app.get("/sitemap.xml", (_req, res) => {
  try {
    const base = PUBLIC_URL.replace(/\/$/, "");
    const today = new Date().toISOString().slice(0, 10);
    const locs = [`${base}/`];
    for (const e of buildPublicCatalog()) {
      if (e.hidden) continue;
      locs.push(`${base}/producto/${e.fullSlug}`);
    }
    const body = `<?xml version="1.0" encoding="UTF-8"?>\n` +
      `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
      locs.map(u => `  <url><loc>${u}</loc><lastmod>${today}</lastmod></url>`).join("\n") +
      `\n</urlset>\n`;
    res.setHeader("Content-Type", "application/xml; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache");
    res.send(body);
  } catch (err) {
    console.error("[/sitemap.xml] error:", err.message);
    res.sendFile(path.join(ROOT, "sitemap.xml"));
  }
});

// ---------- Static site ----------
app.use(
  express.static(ROOT, {
    extensions: ["html"],
    etag: true,
    lastModified: true,
    setHeaders(res, filePath) {
      if (/\.(?:webp|jpe?g|png|svg|ico|woff2?)$/i.test(filePath)) {
        res.setHeader("Cache-Control", "public, max-age=2592000"); // 30 días
      } else {
        res.setHeader("Cache-Control", "no-cache");
      }
    },
  })
);

// SPA-style fallbacks
app.get("/checkout", (_req, res) => res.sendFile(path.join(ROOT, "checkout.html")));
app.get("/payment/success", (_req, res) => res.sendFile(path.join(ROOT, "payment-success.html")));
app.get("/payment/failure", (_req, res) => res.sendFile(path.join(ROOT, "payment-failure.html")));
app.get("/payment/pending", (_req, res) => res.sendFile(path.join(ROOT, "payment-pending.html")));

// 404 para rutas API desconocidas
app.use("/api", (_req, res) => res.status(404).json({ error: "Not found" }));

// ---------- Backups en background ----------
backup.start();

app.listen(PORT, () => {
  console.log(`iPhone UP server listening on ${PUBLIC_URL} (port ${PORT}) — build ${BUILD_SHA}`);
  console.log(`[boot] USE_DB_CATALOG=${USE_DB_CATALOG}`);
  if (!process.env.MP_ACCESS_TOKEN) console.warn("⚠️  MP_ACCESS_TOKEN no configurado — los pagos fallarán");
  if (!process.env.MP_WEBHOOK_SECRET) console.warn("⚠️  MP_WEBHOOK_SECRET no configurado — webhook sin firma (inseguro)");
  if (!process.env.SESSION_SECRET) console.warn("⚠️  SESSION_SECRET no configurado — admin usa secret inseguro");
  if (!process.env.CHILEXPRESS_API_KEY_RATING) console.log("ℹ️  Sin Chilexpress API — usando tarifas fallback por región");
});
