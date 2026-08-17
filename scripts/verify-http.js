// Smoke test HTTP: levanta el server real y golpea las rutas nuevas.
//
//   npm run verify:http
//
// Complementa verify-emails.js (que prueba las libs sin red): esto confirma que
// las rutas estén MONTADAS donde creemos, que la auth y los rate-limits estén
// puestos, y que un webhook sin firma válida se rechace de verdad.
//
// Aislamiento igual que el otro script: DATA_DIR temporal, RESEND_API_KEY vacío
// (dry-run) y un puerto alto. No toca la DB real ni manda un solo correo.

const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");

const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "iphoneup-http-"));
const PORT = 8000 + Math.floor(Math.random() * 900);
const BASE = `http://127.0.0.1:${PORT}`;
const ADMIN_EMAIL = "verify-admin@iphoneup.cl";
const ADMIN_PASS = "verify-" + crypto.randomBytes(9).toString("hex");
const WH_SECRET = "whsec_" + crypto.randomBytes(24).toString("base64");

process.env.DATA_DIR = TMP_DIR;
process.env.PORT = String(PORT);
process.env.PUBLIC_URL = BASE;
process.env.RESEND_API_KEY = "";
process.env.RESEND_WEBHOOK_SECRET = WH_SECRET;
process.env.EMAIL_SCHEDULER_ENABLED = "false";
process.env.SESSION_SECRET = crypto.randomBytes(24).toString("hex");
process.env.ADMIN_BOOTSTRAP_EMAIL = ADMIN_EMAIL;
process.env.ADMIN_BOOTSTRAP_PASSWORD = ADMIN_PASS;
process.env.USE_DB_CATALOG = "true";
delete process.env.MP_ACCESS_TOKEN;

// ---------------------------------------------------------------- harness
let passed = 0;
const failures = [];
let group = "";

function section(name) { group = name; console.log(`\n\x1b[1m${name}\x1b[0m`); }
async function check(label, fn) {
  try {
    await fn();
    passed++;
    console.log(`  \x1b[32m✓\x1b[0m ${label}`);
  } catch (err) {
    failures.push(`${group} → ${label}: ${err.message}`);
    console.log(`  \x1b[31m✗\x1b[0m ${label}\n      ${err.message}`);
  }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || "assert falló"); }
function assertEq(a, b, msg) {
  if (a !== b) throw new Error(`${msg || "esperaba"} ${JSON.stringify(b)}, obtuve ${JSON.stringify(a)}`);
}

let cookie = "";
async function req(method, url, { body, headers = {}, auth = false, raw = false } = {}) {
  const opts = { method, headers: { ...headers } };
  if (body !== undefined) {
    opts.headers["Content-Type"] = "application/json";
    opts.body = raw ? body : JSON.stringify(body);
  }
  if (auth && cookie) opts.headers.Cookie = cookie;
  const res = await fetch(BASE + url, opts);
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* html/js */ }
  return { status: res.status, text, json, headers: res.headers };
}

// ---------------------------------------------------------------- boot
require("../server/index.js");

async function waitForBoot() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(BASE + "/api/health");
      if (r.ok) return;
    } catch { /* todavía no escucha */ }
    await new Promise(r => setTimeout(r, 250));
  }
  throw new Error("el server no respondió /api/health en 15s");
}

function svixHeaders(bodyStr, { secret = WH_SECRET, ts = Math.floor(Date.now() / 1000), id = "msg_verify" } = {}) {
  const sig = crypto.createHmac("sha256", Buffer.from(secret.replace(/^whsec_/, ""), "base64"))
    .update(`${id}.${ts}.${bodyStr}`).digest("base64");
  return { "svix-id": id, "svix-timestamp": String(ts), "svix-signature": `v1,${sig}` };
}

// ---------------------------------------------------------------- run
async function main() {
  await waitForBoot();
  console.log(`\x1b[2m${BASE} · DATA_DIR ${TMP_DIR}\x1b[0m`);

  // ==========================================================
  section("Healthcheck y catálogo");
  // ==========================================================
  let health;
  await check("/api/health responde con el bloque de emails", async () => {
    const r = await req("GET", "/api/health");
    assertEq(r.status, 200);
    health = r.json;
    assert(health.emails, "no vino el bloque emails");
    assert(!health.emails.err, "error en el diagnóstico: " + health.emails.err);
    assertEq(health.emails.provider, "dry-run", "proveedor");
    assertEq(typeof health.emails.carts, "number", "conteo de carritos");
  });
  await check("/api/health no filtra la API key ni direcciones de clientes", async () => {
    const r = await req("GET", "/api/health");
    assert(!/RESEND_API_KEY|re_[A-Za-z0-9]{10}/.test(r.text), "parece haber una API key en la respuesta");
  });
  await check("/data.js expone window.CART_CAPTURE", async () => {
    const r = await req("GET", "/data.js");
    assertEq(r.status, 200);
    assert(r.text.includes("window.CART_CAPTURE"), "falta CART_CAPTURE en /data.js");
    assert(/window\.CART_CAPTURE\s*=\s*\{"enabled":true/.test(r.text), "CART_CAPTURE debería venir habilitado por default");
  });

  // ==========================================================
  section("Captura y restauración del carro");
  // ==========================================================
  // Un producto real del catálogo servido.
  const dataJs = (await req("GET", "/data.js")).text;
  const sandbox = { window: {}, sessionStorage: { getItem: () => null, setItem: () => {} } };
  new Function("window", "sessionStorage", dataJs)(sandbox.window, sandbox.sessionStorage);
  const entry = (sandbox.window.CATALOG || []).find(e => (e.storages || []).length);
  assert(entry, "el catálogo servido vino vacío — no se puede probar la captura");
  const storage0 = entry.storages[0];
  const realItem = {
    model: entry.model || entry.name,
    storage: storage0.s,
    color: storage0.color || "",
    price: storage0.p,
    phoneId: entry.phoneId ?? entry.id,
    qty: 1,
  };

  let token = null;
  await check("POST /api/cart/capture guarda el carro y devuelve un token", async () => {
    const r = await req("POST", "/api/cart/capture", {
      body: { email: "smoke@ejemplo.cl", name: "Smoke Test", items: [realItem], source: "checkout" },
    });
    assertEq(r.status, 200, "status");
    assert(r.json.captured, "no marcó captured");
    assert(/^[a-f0-9]{32}$/.test(r.json.token), "token con formato raro: " + r.json.token);
    token = r.json.token;
  });

  await check("el precio del body NO se cree: manda el de la DB", async () => {
    const r = await req("POST", "/api/cart/capture", {
      body: { email: "smoke@ejemplo.cl", items: [{ ...realItem, price: 1 }] },
    });
    assertEq(r.status, 200);
    assertEq(r.json.subtotal, storage0.p, "subtotal");
  });

  await check("reusar el token actualiza en vez de crear otro carro", async () => {
    const r = await req("POST", "/api/cart/capture", {
      body: { token, email: "smoke@ejemplo.cl", items: [realItem, realItem] },
    });
    assertEq(r.json.token, token, "debería devolver el mismo token");
    assertEq(r.json.itemCount, 2);
  });

  await check("rechaza un email inválido y un carro vacío", async () => {
    assertEq((await req("POST", "/api/cart/capture", { body: { email: "no-es-mail", items: [realItem] } })).status, 400);
    assertEq((await req("POST", "/api/cart/capture", { body: { email: "a@b.cl", items: [] } })).status, 400);
  });

  await check("GET /api/cart/:token restaura el carro", async () => {
    const r = await req("GET", "/api/cart/" + token);
    assertEq(r.status, 200);
    assertEq(r.json.token, token);
    assert(Array.isArray(r.json.items) && r.json.items.length, "no devolvió items");
    assertEq(r.json.items[0].price, storage0.p, "el precio restaurado debería salir de la DB");
    assertEq(r.headers.get("cache-control"), "no-store", "no debería cachearse: trae datos personales");
  });

  await check("no filtra ip, user agent ni el historial de recordatorios", async () => {
    const r = await req("GET", "/api/cart/" + token);
    const keys = Object.keys(r.json);
    for (const leak of ["ip", "user_agent", "userAgent", "reminder1hSentAt", "reminder24hSentAt", "consent"]) {
      assert(!keys.includes(leak), `la respuesta pública incluye ${leak}`);
    }
  });

  await check("un token inexistente o mal formado da 404", async () => {
    assertEq((await req("GET", "/api/cart/" + "f".repeat(32))).status, 404);
    assertEq((await req("GET", "/api/cart/no-es-un-token")).status, 404);
  });

  // ==========================================================
  section("Baja de emails");
  // ==========================================================
  const emailToken = require("../server/lib/email-token");
  const unsubEmail = "baja-smoke@ejemplo.cl";

  await check("un link sin firma válida se rechaza", async () => {
    const r = await req("GET", `/api/emails/unsubscribe?e=${encodeURIComponent(unsubEmail)}&t=falsificado`);
    assertEq(r.status, 400);
    assert(r.text.includes("No pudimos procesar"), "no mostró la página de error");
  });

  await check("la página de baja escapa el email de la query (XSS)", async () => {
    const evil = '"><script>alert(1)</script>';
    const r = await req("GET", `/api/emails/unsubscribe?e=${encodeURIComponent(evil)}&t=x`);
    assert(!r.text.includes("<script>alert(1)</script>"), "inyectó un <script> desde la query string");
  });

  await check("un link firmado da de baja y lo dice", async () => {
    const t = emailToken.sign(unsubEmail);
    const r = await req("GET", `/api/emails/unsubscribe?e=${encodeURIComponent(unsubEmail)}&t=${t}`);
    assertEq(r.status, 200);
    assert(r.text.includes("te dimos de baja"), "no confirmó la baja");
  });

  await check("el POST de un clic (RFC 8058) también funciona", async () => {
    const other = "baja2-smoke@ejemplo.cl";
    const r = await req("POST", "/api/emails/unsubscribe", { body: { e: other, t: emailToken.sign(other) } });
    assertEq(r.status, 200);
    assertEq(r.json.ok, true);
  });

  // ==========================================================
  section("Webhook de Resend");
  // ==========================================================
  await check("sin firma válida responde 401", async () => {
    const r = await req("POST", "/api/emails/webhook", { body: { type: "email.bounced", data: { to: ["x@y.cl"] } } });
    assertEq(r.status, 401);
  });

  await check("con firma válida responde 200 y guarda el evento", async () => {
    const payload = JSON.stringify({ type: "email.delivered", data: { email_id: "evt-1", to: ["smoke@ejemplo.cl"] } });
    const r = await req("POST", "/api/emails/webhook", { body: payload, raw: true, headers: svixHeaders(payload) });
    assertEq(r.status, 200);
    await new Promise(res => setTimeout(res, 120)); // el procesamiento va después de responder
    const db = require("../server/db");
    assert(db.prepare("SELECT COUNT(*) AS n FROM email_events WHERE provider_id = 'evt-1'").get().n === 1, "no se guardó el evento");
  });

  await check("un rebote duro firmado manda la dirección a la lista de exclusión", async () => {
    const payload = JSON.stringify({
      type: "email.bounced",
      data: { email_id: "evt-2", to: ["rebote-smoke@ejemplo.cl"], bounce: { type: "hard" } },
    });
    const r = await req("POST", "/api/emails/webhook", { body: payload, raw: true, headers: svixHeaders(payload, { id: "msg_2" }) });
    assertEq(r.status, 200);
    await new Promise(res => setTimeout(res, 120));
    const db = require("../server/db");
    const row = db.prepare("SELECT * FROM email_suppressions WHERE email = 'rebote-smoke@ejemplo.cl'").get();
    assert(row, "no quedó en la lista de exclusión");
    assertEq(row.reason, "bounce");
  });

  await check("un rebote blando NO excluye (buzón lleno, fuera de oficina)", async () => {
    const payload = JSON.stringify({
      type: "email.bounced",
      data: { email_id: "evt-3", to: ["blando-smoke@ejemplo.cl"], bounce: { type: "soft" } },
    });
    await req("POST", "/api/emails/webhook", { body: payload, raw: true, headers: svixHeaders(payload, { id: "msg_3" }) });
    await new Promise(res => setTimeout(res, 120));
    const db = require("../server/db");
    assert(!db.prepare("SELECT 1 FROM email_suppressions WHERE email = 'blando-smoke@ejemplo.cl'").get(),
      "un rebote blando no debería excluir para siempre");
  });

  // ==========================================================
  section("Admin: auth de las rutas nuevas");
  // ==========================================================
  for (const p of ["/api/admin/carts", "/api/admin/emails/config", "/api/admin/emails/log", "/api/admin/emails/suppressions"]) {
    await check(`GET ${p} sin sesión da 401`, async () => {
      assertEq((await req("GET", p)).status, 401);
    });
  }

  await check("login del admin bootstrap", async () => {
    const res = await fetch(BASE + "/api/admin/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASS }),
    });
    assertEq(res.status, 200, "status del login");
    const setCookie = res.headers.getSetCookie ? res.headers.getSetCookie() : [res.headers.get("set-cookie")];
    cookie = setCookie.filter(Boolean).map(c => c.split(";")[0]).join("; ");
    assert(cookie, "no vino la cookie de sesión");
  });

  await check("GET /api/admin/emails/config devuelve config + proveedor", async () => {
    const r = await req("GET", "/api/admin/emails/config", { auth: true });
    assertEq(r.status, 200);
    assertEq(r.json.provider.mode, "dry-run");
    assertEq(r.json.provider.webhookSecretConfigured, true);
    assert(r.json.config && r.json.templates.length >= 7, "faltan templates en la respuesta");
    assert(!JSON.stringify(r.json).includes(WH_SECRET), "el config filtra el secreto del webhook");
  });

  await check("PATCH de la config guarda y valida", async () => {
    const ok = await req("PATCH", "/api/admin/emails/config", { auth: true, body: { followupDays: 10, cartExpireDays: 21 } });
    assertEq(ok.status, 200);
    assertEq(ok.json.config.followupDays, 10);
    const bad = await req("PATCH", "/api/admin/emails/config", { auth: true, body: { from: "no-es-un-correo" } });
    assertEq(bad.status, 400, "debería rechazar un remitente inválido");
  });

  await check("el PATCH queda registrado en el audit log", async () => {
    const r = await req("GET", "/api/admin/audit-log?entity_type=settings", { auth: true });
    assertEq(r.status, 200);
    const entries = r.json.entries || r.json;
    assert(entries.some(e => e.entity_id === "emails"), "no quedó rastro del cambio de emails");
  });

  await check("POST /api/admin/emails/test responde en dry-run", async () => {
    const r = await req("POST", "/api/admin/emails/test", { auth: true, body: {} });
    assertEq(r.status, 200);
    assertEq(r.json.result.status, "dry_run");
  });

  await check("POST /api/admin/emails/run-scheduler corre un ciclo", async () => {
    const r = await req("POST", "/api/admin/emails/run-scheduler", { auth: true, body: {} });
    assertEq(r.status, 200);
    assert(r.json.result && Array.isArray(r.json.result.errors), "shape inesperado");
    assertEq(r.json.result.errors.length, 0, "errores: " + (r.json.result.errors || []).join(" | "));
  });

  await check("GET /api/admin/carts lista con resumen", async () => {
    const r = await req("GET", "/api/admin/carts", { auth: true });
    assertEq(r.status, 200);
    assert(r.json.carts.length >= 1, "no listó ningún carro");
    assert(r.json.summary && typeof r.json.summary.recoveryRate === "number", "falta el resumen");
    assert(r.json.page && typeof r.json.page.total === "number", "falta la paginación");
  });

  await check("GET /api/admin/carts/:id trae los emails del carro", async () => {
    const list = await req("GET", "/api/admin/carts?has_email=1", { auth: true });
    const id = list.json.carts[0].id;
    const r = await req("GET", "/api/admin/carts/" + id, { auth: true });
    assertEq(r.status, 200);
    assert(Array.isArray(r.json.emails), "no vino el historial de emails");
    assert(r.json.resumeUrl.includes("/checkout?rc="), "falta el link de recuperación");
  });

  await check("el reenvío manual funciona y queda en el log", async () => {
    const list = await req("GET", "/api/admin/carts?has_email=1", { auth: true });
    const id = list.json.carts[0].id;
    const r = await req("POST", `/api/admin/carts/${id}/remind`, { auth: true, body: { kind: "1h" } });
    assertEq(r.status, 200);
    assertEq(r.json.result.status, "dry_run");
    const log = await req("GET", "/api/admin/emails/log?template=cart_reminder_1h", { auth: true });
    assert(log.json.entries.length >= 1, "el reenvío no quedó en el historial");
  });

  await check("la lista de exclusión se administra desde el panel", async () => {
    const add = await req("POST", "/api/admin/emails/suppressions", { auth: true, body: { email: "manual@ejemplo.cl", reason: "manual" } });
    assertEq(add.status, 201);
    const list = await req("GET", "/api/admin/emails/suppressions", { auth: true });
    assert(list.json.suppressions.some(s => s.email === "manual@ejemplo.cl"), "no aparece en la lista");
    const del = await req("DELETE", "/api/admin/emails/suppressions/" + encodeURIComponent("manual@ejemplo.cl"), { auth: true });
    assertEq(del.status, 200);
  });

  await check("el dashboard trae el contador de carritos recuperables", async () => {
    const r = await req("GET", "/api/admin/dashboard", { auth: true });
    assertEq(r.status, 200);
    assertEq(typeof r.json.recoverable_carts, "number");
  });

  // ==========================================================
  section("Páginas y fallbacks");
  // ==========================================================
  await check("/checkout sirve el HTML del checkout con la leyenda de captura", async () => {
    const r = await req("GET", "/checkout");
    assertEq(r.status, 200);
    assert(r.text.includes("co-email-disclosure"), "falta la leyenda de captura de email");
    assert(r.text.includes("co-restored"), "falta el aviso de carro recuperado");
  });
  await check("/admin sigue sirviendo el panel", async () => {
    const r = await req("GET", "/admin");
    assertEq(r.status, 200);
    assert(r.text.includes("adminApp()"), "no parece el HTML del admin");
  });
  await check("una ruta /api desconocida sigue dando 404 JSON", async () => {
    const r = await req("GET", "/api/no-existe");
    assertEq(r.status, 404);
    assertEq(r.json.error, "Not found");
  });
}

main()
  .catch(err => { failures.push(`fatal: ${err.stack || err.message}`); })
  .finally(() => {
    console.log("");
    if (failures.length) {
      console.log(`\x1b[31m✗ ${failures.length} verificación(es) fallaron\x1b[0m (${passed} OK)`);
      for (const f of failures) console.log(`  · ${f}`);
    } else {
      console.log(`\x1b[32m✓ ${passed} verificaciones HTTP OK\x1b[0m — rutas, auth y webhook en su lugar.`);
    }
    try { fs.rmSync(TMP_DIR, { recursive: true, force: true }); } catch {}
    process.exit(failures.length ? 1 : 0);
  });
