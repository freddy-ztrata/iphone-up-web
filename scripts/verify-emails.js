// Verificación end-to-end de emails (Resend) + carritos abandonados.
//
//   npm run verify:emails
//
// Por qué un script y no un test runner: el repo no tiene ninguno y agregarlo
// obligaría a una dependencia de build (ver CLAUDE.md). Esto corre con `node`
// pelado, no necesita red y no toca la DB real.
//
// Aislamiento: DATA_DIR apunta a un directorio temporal que se crea al empezar
// y se borra al terminar, y RESEND_API_KEY se fuerza a vacío ⇒ TODO queda en
// dry-run. Es imposible que esta verificación le mande un correo a alguien.

const fs = require("fs");
const os = require("os");
const path = require("path");

// ---- Aislamiento: ANTES de requerir nada del server (db.js lee DATA_DIR al cargar).
const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "iphoneup-verify-"));
process.env.DATA_DIR = TMP_DIR;
process.env.RESEND_API_KEY = "";              // dry-run obligatorio
process.env.EMAIL_SCHEDULER_ENABLED = "false"; // sin timers de fondo
process.env.PUBLIC_URL = "https://iphoneup.cl";
process.env.EMAIL_UNSUBSCRIBE_SECRET = "secreto-de-prueba-para-verificar";
delete process.env.RESEND_WEBHOOK_SECRET;
delete process.env.EMAIL_FROM;
delete process.env.EMAIL_REPLY_TO;
delete process.env.EMAIL_INTERNAL_TO;
delete process.env.EMAILS_ENABLED;

const crypto = require("crypto");
const db = require("../server/db");
const { seedIfEmpty } = require("./seed-from-datajs");

const settings = require("../server/lib/settings");
const templates = require("../server/lib/email-templates");
const emailToken = require("../server/lib/email-token");
const resendSignature = require("../server/lib/resend-signature");
const resend = require("../server/lib/resend");
const mailer = require("../server/lib/mailer");
const fixtures = require("../server/lib/email-fixtures");
const carts = require("../server/lib/carts");
const scheduler = require("../server/lib/email-scheduler");
const storage = require("../server/lib/storage");

// ---------------------------------------------------------------- harness
let passed = 0;
const failures = [];
let group = "";

function section(name) {
  group = name;
  console.log(`\n\x1b[1m${name}\x1b[0m`);
}

function check(label, fn) {
  try {
    const r = fn();
    if (r === false) throw new Error("devolvió false");
    passed++;
    console.log(`  \x1b[32m✓\x1b[0m ${label}`);
  } catch (err) {
    failures.push(`${group} → ${label}: ${err.message}`);
    console.log(`  \x1b[31m✗\x1b[0m ${label}\n      ${err.message}`);
  }
}

async function checkAsync(label, fn) {
  try {
    const r = await fn();
    if (r === false) throw new Error("devolvió false");
    passed++;
    console.log(`  \x1b[32m✓\x1b[0m ${label}`);
  } catch (err) {
    failures.push(`${group} → ${label}: ${err.message}`);
    console.log(`  \x1b[31m✗\x1b[0m ${label}\n      ${err.message}`);
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || "assert falló");
}
function assertEq(actual, expected, msg) {
  if (actual !== expected) throw new Error(`${msg || "esperaba"} ${JSON.stringify(expected)}, obtuve ${JSON.stringify(actual)}`);
}

// ---------------------------------------------------------------- fixtures
const XSS = '<img src=x onerror="alert(1)">';

function firstVariant() {
  return db.prepare(`
    SELECT v.id, v.storage, v.color, v.price, m.name AS model, p.id AS product_id
    FROM variants v
    JOIN product_models m ON m.id = v.model_id
    JOIN products p ON p.id = m.product_id
    WHERE v.is_active = 1
    ORDER BY v.id ASC LIMIT 1
  `).get();
}

function sampleOrder(v) {
  return {
    id: "ORD-VERIFY-1",
    status: "approved",
    subtotal: v.price,
    total: v.price + 3990,
    buyer: { name: XSS, email: "cliente@ejemplo.cl", phone: "+56 9 1111 1111", rut: "11.111.111-1" },
    shipping: { method: "shipping", cost: 3990, address: { street: "Calle " + XSS, number: "1", county: "Providencia", region: "RM" } },
    items: [{ model: v.model, storage: v.storage, color: v.color || "", price: v.price, sealed: false, phoneId: v.product_id, qty: 1 }],
    tracking_code: "CX" + XSS,
    tracking_carrier: "Chilexpress",
  };
}

function ageCart(cartId, hours) {
  db.prepare("UPDATE carts SET updated_at = datetime('now', ?), created_at = datetime('now', ?) WHERE id = ?")
    .run(`-${hours} hours`, `-${hours} hours`, cartId);
}

function logRows(key) {
  return db.prepare("SELECT * FROM email_log WHERE idempotency_key = ? OR idempotency_key LIKE ?").all(key, `${key}:retry%`);
}

// ---------------------------------------------------------------- run
async function main() {
  console.log(`\x1b[2mDATA_DIR temporal: ${TMP_DIR}\x1b[0m`);
  seedIfEmpty();
  const variant = firstVariant();
  assert(variant, "el seed no dejó ninguna variante activa — no se puede verificar");
  const order = sampleOrder(variant);

  // ==========================================================
  section("Migración 007");
  // ==========================================================
  for (const t of ["carts", "email_log", "email_suppressions", "email_events"]) {
    check(`la tabla ${t} existe`, () => {
      const row = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = ?").get(t);
      assert(row, `falta la tabla ${t}`);
    });
  }
  check("orders.delivered_at existe", () => {
    const cols = db.prepare("PRAGMA table_info(orders)").all().map(c => c.name);
    assert(cols.includes("delivered_at"), "falta la columna delivered_at");
  });
  check("email_log.idempotency_key es UNIQUE", () => {
    const idx = db.prepare("PRAGMA index_list(email_log)").all();
    const unique = idx.filter(i => i.unique === 1).some(i =>
      db.prepare(`PRAGMA index_info(${JSON.stringify(i.name)})`).all().some(c => c.name === "idempotency_key"));
    assert(unique, "idempotency_key no tiene índice único");
  });
  check("carts.token es UNIQUE", () => {
    const idx = db.prepare("PRAGMA index_list(carts)").all();
    const unique = idx.filter(i => i.unique === 1).some(i =>
      db.prepare(`PRAGMA index_info(${JSON.stringify(i.name)})`).all().some(c => c.name === "token"));
    assert(unique, "token no tiene índice único");
  });

  // ==========================================================
  section("Sintaxis del frontend");
  // ==========================================================
  // Los .js del sitio público y del admin no pasan por `require`, así que un
  // error de sintaxis ahí solo se ve en el navegador. `vm.Script` los compila
  // sin ejecutarlos. (El equivalente del lado server lo cubre verify-http.js,
  // que levanta el proceso de verdad.)
  const vm = require("vm");
  for (const f of ["app.js", "product.js", "checkout.js", "admin.js", "specs.js", "data.js"]) {
    check(`${f} compila`, () => {
      const file = path.resolve(__dirname, "..", f);
      if (!fs.existsSync(file)) throw new Error("no existe " + f);
      new vm.Script(fs.readFileSync(file, "utf8"), { filename: f });
    });
  }
  check("admin.html tiene los <template> balanceados", () => {
    const html = fs.readFileSync(path.resolve(__dirname, "..", "admin.html"), "utf8");
    const open = (html.match(/<template[\s>]/g) || []).length;
    const close = (html.match(/<\/template>/g) || []).length;
    assertEq(open, close, "aperturas vs cierres de <template>:");
  });

  // Alpine resuelve x-text/@click contra el objeto de adminApp(). Un método que
  // existe en el markup pero no en admin.js falla en silencio (solo consola del
  // navegador) — justo el tipo de cosa que no se ve hasta que el cliente hace
  // clic. Comparamos las llamadas del markup contra las claves del componente.
  check("todo lo que llama el markup del admin existe en adminApp()", () => {
    const root = path.resolve(__dirname, "..");
    const html = fs.readFileSync(path.join(root, "admin.html"), "utf8");
    const js = fs.readFileSync(path.join(root, "admin.js"), "utf8");

    // Globales del navegador y helpers de prototipo que sí pueden aparecer sueltos.
    const GLOBALS = new Set([
      "Number", "String", "Boolean", "Object", "Array", "Math", "JSON", "Date", "URLSearchParams",
      "parseInt", "parseFloat", "isNaN", "encodeURIComponent", "decodeURIComponent", "alert",
      "confirm", "prompt", "fetch", "setTimeout", "clearTimeout", "$el", "$refs", "$event", "if",
      "for", "return", "typeof", "new", "function", "catch", "switch", "while", "await",
      "in", "of", "delete", "void", "instanceof",
    ]);

    const missing = new Set();
    // Valores de atributos Alpine: x-…, @… y :… (incluye x-text, @click, :class).
    const attrRe = /(?:x-[\w:.-]+|@[\w:.-]+|:[\w:.-]+)\s*=\s*"([^"]*)"/g;
    for (const m of html.matchAll(attrRe)) {
      // Los literales de texto se vacían primero: un `'Sin stock (2)'` haría
      // pasar "stock" por una llamada a función.
      const expr = m[1]
        .replace(/'[^']*'/g, "''")
        .replace(/`[^`]*`/g, "``")
        .replace(/&#39;[^&]*&#39;/g, "''");
      for (const call of expr.matchAll(/(^|[^.\w$'"])([a-zA-Z_$][\w$]*)\s*\(/g)) {
        const name = call[2];
        if (GLOBALS.has(name)) continue;
        // Definición como método shorthand, propiedad, getter o `name = (`.
        const defined = new RegExp(`(^|[\\s,{])(async\\s+)?(get\\s+)?${name}\\s*[(:]`, "m").test(js);
        if (!defined) missing.add(name);
      }
    }
    assert(missing.size === 0, "sin definir en admin.js: " + [...missing].join(", "));
  });

  // ==========================================================
  section("Templates: render y escapado");
  // ==========================================================
  const ctx = {
    order,
    cart: { name: XSS, items: order.items, subtotal: order.subtotal },
    coupon: "PROMO" + XSS,
    resumeUrl: "https://iphoneup.cl/checkout?rc=" + "a".repeat(32),
    expireDays: 14,
    publicUrl: "https://iphoneup.cl",
    unsubscribeUrl: "https://iphoneup.cl/api/emails/unsubscribe?e=a%40b.cl&t=xyz",
    config: { from: "iPhone UP <hola@iphoneup.cl>", replyTo: "", internalTo: "" },
    providerLabel: "dry-run",
  };

  for (const id of templates.TEMPLATE_IDS) {
    check(`${id} renderiza`, () => {
      const r = templates.render(id, ctx);
      assert(r.subject && r.subject.length > 0, "asunto vacío");
      assert(r.html.startsWith("<!doctype html"), "el html no arranca con doctype");
      assert(r.text && r.text.length > 20, "texto plano vacío");
    });
    check(`${id} escapa el payload XSS`, () => {
      const r = templates.render(id, ctx);
      assert(!r.html.includes("onerror=\"alert(1)\""), "el atributo onerror sobrevivió sin escapar");
      assert(!r.html.includes("<img src=x"), "una etiqueta <img> del cliente entró cruda");
    });
  }
  check("el nombre del comprador llega escapado, no borrado", () => {
    const r = templates.render("order_paid", ctx);
    assert(r.html.includes("&lt;img"), "no aparece la versión escapada del nombre");
  });
  check("safeUrl descarta javascript: y data:", () => {
    assertEq(templates.safeUrl("javascript:alert(1)"), "");
    assertEq(templates.safeUrl("data:text/html,<script>"), "");
    assert(templates.safeUrl("https://iphoneup.cl/x").startsWith("https://"));
  });
  check("los no transaccionales llevan link de baja y los transaccionales no", () => {
    const promo = templates.render("cart_reminder_1h", ctx);
    assert(promo.html.includes("/api/emails/unsubscribe"), "al recordatorio le falta el link de baja");
    assertEq(promo.transactional, false);
    const paid = templates.render("order_paid", { ...ctx, unsubscribeUrl: null });
    assertEq(paid.transactional, true);
    assert(!paid.html.includes("/api/emails/unsubscribe"), "la confirmación de pago no debería llevar baja");
  });
  check("el tracking del admin también se escapa", () => {
    const r = templates.render("order_shipped", ctx);
    assert(!r.html.includes("<img src=x"), "el tracking entró crudo");
  });

  // ==========================================================
  section("Token de baja (HMAC)");
  // ==========================================================
  check("firma y verifica la misma dirección", () => {
    const t = emailToken.sign("Cliente@Ejemplo.CL");
    assert(emailToken.verify("cliente@ejemplo.cl", t), "no verificó el token propio");
  });
  check("rechaza el token de otra dirección", () => {
    const t = emailToken.sign("uno@ejemplo.cl");
    assert(!emailToken.verify("otro@ejemplo.cl", t), "aceptó un token ajeno");
  });
  check("rechaza un token manipulado", () => {
    const t = emailToken.sign("uno@ejemplo.cl");
    assert(!emailToken.verify("uno@ejemplo.cl", t.slice(0, -1) + (t.endsWith("a") ? "b" : "a")));
    assert(!emailToken.verify("uno@ejemplo.cl", ""), "aceptó token vacío");
    assert(!emailToken.verify("uno@ejemplo.cl", t + "x"), "aceptó token más largo");
  });
  check("la URL de baja es absoluta y trae e + t", () => {
    const url = emailToken.unsubscribeUrl("uno@ejemplo.cl");
    assert(url.startsWith("https://iphoneup.cl/api/emails/unsubscribe?"), url);
    const q = new URL(url).searchParams;
    assert(emailToken.verify(q.get("e"), q.get("t")), "el token de la URL no verifica");
  });

  // ==========================================================
  section("Webhook de Resend (firma Svix)");
  // ==========================================================
  const WH_SECRET_RAW = crypto.randomBytes(24);
  const WH_SECRET = "whsec_" + WH_SECRET_RAW.toString("base64");

  function svixReq(body, { secret = WH_SECRET, id = "msg_1", ts = Math.floor(Date.now() / 1000), tamper = false } = {}) {
    const raw = Buffer.from(JSON.stringify(body));
    const sig = crypto.createHmac("sha256", Buffer.from(secret.replace(/^whsec_/, ""), "base64"))
      .update(`${id}.${ts}.${raw.toString("utf8")}`)
      .digest("base64");
    return {
      headers: { "svix-id": id, "svix-timestamp": String(ts), "svix-signature": `v1,${tamper ? "AAAA" + sig.slice(4) : sig}` },
      rawBody: raw,
    };
  }

  check("sin secreto configurado es permisivo (instalación a medio armar)", () => {
    delete process.env.RESEND_WEBHOOK_SECRET;
    assert(resendSignature.verify(svixReq({ type: "email.sent" })).ok);
  });
  check("con secreto acepta una firma válida", () => {
    process.env.RESEND_WEBHOOK_SECRET = WH_SECRET;
    const r = resendSignature.verify(svixReq({ type: "email.delivered" }));
    assert(r.ok, r.reason);
  });
  check("rechaza una firma manipulada", () => {
    assert(!resendSignature.verify(svixReq({ type: "email.delivered" }, { tamper: true })).ok);
  });
  check("rechaza si cambia el cuerpo después de firmar", () => {
    const req = svixReq({ type: "email.delivered" });
    req.rawBody = Buffer.from(JSON.stringify({ type: "email.bounced" }));
    assert(!resendSignature.verify(req).ok);
  });
  check("rechaza un timestamp viejo (replay)", () => {
    const r = resendSignature.verify(svixReq({ type: "email.delivered" }, { ts: Math.floor(Date.now() / 1000) - 3600 }));
    assert(!r.ok, "aceptó un evento de hace una hora");
  });
  check("rechaza si faltan las cabeceras", () => {
    assert(!resendSignature.verify({ headers: {}, rawBody: Buffer.from("{}") }).ok);
  });
  check("acepta los alias webhook-*", () => {
    const req = svixReq({ type: "email.opened" }, { id: "msg_alias" });
    const aliased = {
      headers: {
        "webhook-id": req.headers["svix-id"],
        "webhook-timestamp": req.headers["svix-timestamp"],
        "webhook-signature": req.headers["svix-signature"],
      },
      rawBody: req.rawBody,
    };
    assert(resendSignature.verify(aliased).ok);
  });
  delete process.env.RESEND_WEBHOOK_SECRET;

  // ==========================================================
  section("Settings de emails");
  // ==========================================================
  check("los defaults de fábrica son los aprobados", () => {
    const c = settings.getEmailConfig();
    assertEq(c.enabled, true, "enabled");
    assertEq(c.cartCouponCode, "", "el cupón de recuperación arranca vacío");
    assertEq(c.replyTo, "", "reply-to arranca vacío");
    assertEq(c.internalTo, "", "correo interno arranca vacío");
    assertEq(c.cartReminder1hHours, 1);
    assertEq(c.cartReminder24hHours, 24);
    assertEq(c.followupDays, 7);
  });
  check("rechaza un remitente inválido", () => {
    let threw = false;
    try { settings.setEmailConfig({ from: "no-es-un-correo" }); } catch { threw = true; }
    assert(threw, "aceptó un from inválido");
  });
  check("rechaza CR/LF en el remitente (inyección de cabeceras)", () => {
    let threw = false;
    try { settings.setEmailConfig({ from: "a@b.cl\r\nBcc: victima@x.cl" }); } catch { threw = true; }
    assert(threw, "aceptó un from con salto de línea");
  });
  check("rechaza reply-to y correo interno inválidos", () => {
    let a = false, b = false;
    try { settings.setEmailConfig({ replyTo: "arroba-falta" }); } catch { a = true; }
    try { settings.setEmailConfig({ internalTo: "tampoco" }); } catch { b = true; }
    assert(a && b);
  });
  check("rechaza un cupón con formato raro y números fuera de rango", () => {
    let a = false, b = false;
    try { settings.setEmailConfig({ cartCouponCode: "no válido!" }); } catch { a = true; }
    try { settings.setEmailConfig({ followupDays: 9999 }); } catch { b = true; }
    assert(a && b);
  });
  check("acepta valores válidos y vaciar vuelve al default", () => {
    settings.setEmailConfig({ from: "iPhone UP <hola@iphoneup.cl>", replyTo: "hola@iphoneup.cl" });
    assertEq(settings.getEmailConfig().replyTo, "hola@iphoneup.cl");
    settings.setEmailConfig({ replyTo: "" });
    assertEq(settings.getEmailConfig().replyTo, "", "vaciar debería volver al default");
  });

  // ==========================================================
  section("Mailer: dry-run e idempotencia");
  // ==========================================================
  check("sin RESEND_API_KEY el cliente reporta dry-run", () => {
    assertEq(resend.isConfigured(), false);
  });

  await checkAsync("un envío queda como dry_run y deja una fila en el log", async () => {
    const r = await mailer.send({ template: "order_paid", to: "cliente@ejemplo.cl", orderId: order.id, data: { order } });
    assertEq(r.status, "dry_run", "estado");
    assertEq(r.ok, true, "ok");
    assertEq(logRows("order_paid:" + order.id).length, 1, "filas en email_log");
  });

  await checkAsync("el mismo aviso dos veces NO se reenvía", async () => {
    const r = await mailer.send({ template: "order_paid", to: "cliente@ejemplo.cl", orderId: order.id, data: { order } });
    assertEq(r.skipped, true, "debería marcarse como ya enviado");
    assertEq(logRows("order_paid:" + order.id).length, 1, "no debería haber una segunda fila");
  });

  await checkAsync("force sí crea un reenvío nuevo", async () => {
    const r = await mailer.send({ template: "order_paid", to: "cliente@ejemplo.cl", orderId: order.id, force: true, data: { order } });
    assertEq(r.status, "dry_run");
    assertEq(logRows("order_paid:" + order.id).length, 2, "el reenvío manual debería sumar una fila");
  });

  await checkAsync("un destinatario inválido falla sin escribir en el log", async () => {
    const before = db.prepare("SELECT COUNT(*) AS n FROM email_log").get().n;
    const r = await mailer.send({ template: "order_paid", to: "no-es-un-correo", data: { order } });
    assertEq(r.ok, false);
    assertEq(db.prepare("SELECT COUNT(*) AS n FROM email_log").get().n, before, "no debería haber filas nuevas");
  });

  await checkAsync("un template inexistente no explota", async () => {
    const r = await mailer.send({ template: "no_existe", to: "cliente@ejemplo.cl" });
    assertEq(r.ok, false);
    assert(String(r.reason).includes("template desconocido"), r.reason);
  });

  // ---- Lista de exclusión
  await checkAsync("una baja voluntaria bloquea lo promocional pero no la confirmación de pago", async () => {
    mailer.suppress({ email: "baja@ejemplo.cl", reason: "unsubscribe", source: "verify" });
    const promo = await mailer.send({
      template: "cart_reminder_1h", to: "baja@ejemplo.cl", cartId: 999999,
      idempotencyKey: "verify:promo:baja", data: { cart: ctx.cart, resumeUrl: ctx.resumeUrl },
    });
    assertEq(promo.status, "suppressed", "el promocional debería quedar excluido");
    const trans = await mailer.send({
      template: "order_paid", to: "baja@ejemplo.cl",
      idempotencyKey: "verify:trans:baja", data: { order },
    });
    assertEq(trans.status, "dry_run", "el transaccional debería salir igual");
  });

  await checkAsync("un rebote duro bloquea TODO, incluso lo transaccional", async () => {
    mailer.suppress({ email: "rebota@ejemplo.cl", reason: "bounce", source: "verify" });
    const trans = await mailer.send({
      template: "order_paid", to: "rebota@ejemplo.cl",
      idempotencyKey: "verify:trans:rebote", data: { order },
    });
    assertEq(trans.status, "suppressed");
  });

  check("quitar de la lista vuelve a permitir", () => {
    mailer.unsuppress("rebota@ejemplo.cl");
    assertEq(mailer.isSuppressed("rebota@ejemplo.cl", { transactional: true }), null);
  });

  await checkAsync("con los emails apagados no sale nada", async () => {
    settings.setEmailConfig({ enabled: false });
    const r = await mailer.send({
      template: "order_paid", to: "cliente@ejemplo.cl",
      idempotencyKey: "verify:apagado", data: { order },
    });
    assertEq(r.status, "disabled");
    settings.setEmailConfig({ enabled: true });
  });

  check("el log y las estadísticas se leen sin errores", () => {
    const { entries, page } = mailer.listLog({ limit: 10 });
    assert(Array.isArray(entries) && page.total > 0, "el log vino vacío");
    const s = mailer.stats();
    assert(s.total > 0 && typeof s.byStatus === "object");
  });

  // ==========================================================
  section("Carritos: captura segura");
  // ==========================================================
  check("el precio del body se ignora — manda el de la DB", () => {
    const { items, subtotal } = carts.sanitizeItems([{
      model: variant.model, storage: variant.storage, color: variant.color || "",
      phoneId: variant.product_id, price: 1, qty: 1,
    }]);
    assertEq(items.length, 1, "el item debería resolverse");
    assertEq(items[0].price, variant.price, "precio");
    assertEq(subtotal, variant.price, "subtotal");
  });

  check("descarta items que no existen en el catálogo", () => {
    const { items, dropped } = carts.sanitizeItems([
      { model: "iPhone Inventado", storage: "999GB", phoneId: 999, price: 10 },
      "no soy un objeto", null,
    ]);
    assertEq(items.length, 0);
    assertEq(dropped, 3);
  });

  check("la cantidad se acota a 1..10 y el carro a 20 items", () => {
    const { items } = carts.sanitizeItems([{
      model: variant.model, storage: variant.storage, color: variant.color || "",
      phoneId: variant.product_id, price: variant.price, qty: 9999,
    }]);
    assertEq(items[0].qty, 10);
    const many = Array.from({ length: 40 }, () => ({
      model: variant.model, storage: variant.storage, color: variant.color || "",
      phoneId: variant.product_id, price: variant.price, qty: 1,
    }));
    assert(carts.sanitizeItems(many).items.length <= carts.MAX_ITEMS, "no respetó MAX_ITEMS");
  });

  let cartId = null;
  let cartToken = null;
  check("upsert crea el carro con un token impredecible", () => {
    const { cart, created } = carts.upsert({
      email: "carro@ejemplo.cl", name: "Ana", consent: true, source: "checkout",
      items: [{ model: variant.model, storage: variant.storage, color: variant.color || "", phoneId: variant.product_id, price: 1, qty: 1 }],
    });
    assert(created, "debería ser nuevo");
    assert(/^[a-f0-9]{32}$/.test(cart.token), "token con formato inesperado: " + cart.token);
    assertEq(cart.subtotal, variant.price, "el subtotal debería salir de la DB");
    cartId = cart.id;
    cartToken = cart.token;
  });

  check("upsert con el mismo token actualiza en vez de duplicar", () => {
    const before = db.prepare("SELECT COUNT(*) AS n FROM carts").get().n;
    const { cart, created } = carts.upsert({
      token: cartToken, email: "carro@ejemplo.cl", name: "Ana María", consent: true,
      items: [{ model: variant.model, storage: variant.storage, color: variant.color || "", phoneId: variant.product_id, price: 1, qty: 2 }],
    });
    assert(!created, "no debería crear otra fila");
    assertEq(db.prepare("SELECT COUNT(*) AS n FROM carts").get().n, before, "cantidad de carros");
    assertEq(cart.name, "Ana María");
    assertEq(cart.itemCount, 2);
  });

  check("la URL de recuperación apunta al checkout con el token", () => {
    assertEq(carts.resumeUrl(cartToken), `https://iphoneup.cl/checkout?rc=${cartToken}`);
  });

  // ==========================================================
  section("Carritos: cola de recordatorios");
  // ==========================================================
  check("un carro recién tocado NO está en la cola", () => {
    assertEq(carts.dueForReminder("1h").length, 0, "no debería haber nada para recordar todavía");
  });

  check("con 3h sin actividad sí entra a la cola de 1h", () => {
    ageCart(cartId, 3);
    const due = carts.dueForReminder("1h");
    assertEq(due.length, 1, "debería haber exactamente un carro pendiente");
    assertEq(due[0].id, cartId);
  });

  check("sin consentimiento no entra a la cola", () => {
    db.prepare("UPDATE carts SET consent = 0 WHERE id = ?").run(cartId);
    assertEq(carts.dueForReminder("1h").length, 0);
    db.prepare("UPDATE carts SET consent = 1 WHERE id = ?").run(cartId);
  });

  check("sin email tampoco", () => {
    db.prepare("UPDATE carts SET email = NULL WHERE id = ?").run(cartId);
    assertEq(carts.dueForReminder("1h").length, 0);
    db.prepare("UPDATE carts SET email = 'carro@ejemplo.cl' WHERE id = ?").run(cartId);
  });

  check("el de 24h espera a que haya salido el de 1h", () => {
    assertEq(carts.dueForReminder("24h").length, 0, "no debería mandar el segundo antes del primero");
  });

  await checkAsync("el tick manda el 1er recordatorio y lo marca", async () => {
    const out = await scheduler.tick();
    assertEq(out.reminders1h, 1, "recordatorios de 1h enviados");
    const row = db.prepare("SELECT * FROM carts WHERE id = ?").get(cartId);
    assert(row.reminder_1h_sent_at, "no quedó marcado el envío");
    assertEq(logRows(`cart_reminder_1h:cart:${cartId}`).length, 1, "filas en email_log");
  });

  await checkAsync("un segundo tick NO reenvía el mismo recordatorio", async () => {
    const out = await scheduler.tick();
    assertEq(out.reminders1h, 0);
    assertEq(logRows(`cart_reminder_1h:cart:${cartId}`).length, 1);
  });

  await checkAsync("marcar el recordatorio no mueve el reloj de abandono", async () => {
    // El 2do recordatorio se agenda contra la última señal de vida del cliente
    // (updated_at), no contra el envío del primero.
    const row = db.prepare("SELECT updated_at, created_at FROM carts WHERE id = ?").get(cartId);
    const stale = db.prepare("SELECT datetime('now','-2 hours') AS t").get().t;
    assert(row.updated_at <= stale, `updated_at se movió al enviar (${row.updated_at})`);
  });

  await checkAsync("a las 30h sin actividad sale el 2do recordatorio", async () => {
    ageCart(cartId, 30);
    db.prepare("UPDATE carts SET reminder_1h_sent_at = datetime('now','-29 hours') WHERE id = ?").run(cartId);
    const out = await scheduler.tick();
    assertEq(out.reminders24h, 1);
    assert(db.prepare("SELECT reminder_24h_sent_at AS t FROM carts WHERE id = ?").get(cartId).t, "no quedó marcado");
  });

  check("convertir el carro lo saca de la cola para siempre", () => {
    db.prepare("UPDATE carts SET reminder_1h_sent_at = NULL, reminder_24h_sent_at = NULL WHERE id = ?").run(cartId);
    carts.markConverted(cartToken, "ORD-VERIFY-1");
    const c = carts.getByToken(cartToken);
    assertEq(c.status, "converted");
    assertEq(c.orderId, "ORD-VERIFY-1");
    assertEq(carts.dueForReminder("1h").length, 0, "un carro convertido no debería recibir recordatorios");
  });

  check("un carro convertido no vuelve a 'active' si el cliente reabre el checkout", () => {
    carts.upsert({
      token: cartToken, email: "carro@ejemplo.cl", consent: true,
      items: [{ model: variant.model, storage: variant.storage, color: variant.color || "", phoneId: variant.product_id, price: 1, qty: 1 }],
    });
    assertEq(carts.getByToken(cartToken).status, "converted");
  });

  check("expireOld vence los pasados de fecha", () => {
    const { cart } = carts.upsert({
      email: "viejo@ejemplo.cl", consent: true,
      items: [{ model: variant.model, storage: variant.storage, color: variant.color || "", phoneId: variant.product_id, price: 1, qty: 1 }],
    });
    db.prepare("UPDATE carts SET expires_at = datetime('now','-1 day') WHERE id = ?").run(cart.id);
    assert(carts.expireOld() >= 1, "no venció ninguno");
    assertEq(carts.getById(cart.id).status, "expired");
    carts.remove(cart.id);
  });

  check("el resumen del panel calcula la tasa de recuperación", () => {
    const s = carts.summary();
    assert(typeof s.recoveryRate === "number" && s.total >= 1, JSON.stringify(s));
  });

  // ==========================================================
  section("Follow-up post entrega");
  // ==========================================================
  storage.saveOrder({ ...order, id: "ORD-VERIFY-FU", status: "approved" });
  db.prepare(`
    UPDATE orders SET fulfillment_status = 'delivered', delivered_at = datetime('now','-8 days')
    WHERE id = 'ORD-VERIFY-FU'
  `).run();

  await checkAsync("una orden entregada hace 8 días recibe el follow-up", async () => {
    const out = await scheduler.tick();
    assertEq(out.followups, 1, "follow-ups enviados");
    assertEq(logRows("followup_delivered:ORD-VERIFY-FU").length, 1);
  });

  await checkAsync("no se reenvía en el tick siguiente", async () => {
    const out = await scheduler.tick();
    assertEq(out.followups, 0);
    assertEq(logRows("followup_delivered:ORD-VERIFY-FU").length, 1);
  });

  await checkAsync("una entrega de ayer todavía no dispara nada", async () => {
    storage.saveOrder({ ...order, id: "ORD-VERIFY-FU2", status: "approved" });
    db.prepare(`
      UPDATE orders SET fulfillment_status = 'delivered', delivered_at = datetime('now','-1 day')
      WHERE id = 'ORD-VERIFY-FU2'
    `).run();
    const out = await scheduler.tick();
    assertEq(out.followups, 0);
  });

  // ==========================================================
  section("Aviso interno de venta");
  // ==========================================================
  await checkAsync("sin correo interno configurado no se manda nada", async () => {
    settings.setEmailConfig({ internalTo: "" });
    const r = await mailer.notifyInternal(order);
    assertEq(r.skipped, true);
  });
  await checkAsync("con correo interno configurado sí sale", async () => {
    settings.setEmailConfig({ internalTo: "ventas@iphoneup.cl" });
    const r = await mailer.notifyInternal({ ...order, id: "ORD-VERIFY-INT" });
    assertEq(r.status, "dry_run");
    settings.setEmailConfig({ internalTo: "" });
  });
  await checkAsync("una orden nula no manda un aviso vacío", async () => {
    const r = await mailer.notifyInternal(null);
    assertEq(r.skipped, true);
  });

  // ==========================================================
  section("Pruebas de email desde el panel (fixtures)");
  // ==========================================================
  // Lo que garantizamos: que se puedan probar TODOS los templates, que los
  // datos sean inventados, que la prueba no escriba en orders/carts/variants y
  // que el asunto salga marcado.
  check("todos los templates registrados tienen fixture", () => {
    const missing = fixtures.missingFixtures();
    assert(missing.length === 0, "sin datos de prueba: " + missing.join(", "));
    assertEq(fixtures.list().length, templates.TEMPLATE_IDS.length, "cantidad de pruebas expuestas:");
  });

  check("cada prueba viene con etiqueta, grupo y descripción para el panel", () => {
    for (const t of fixtures.list()) {
      assert(t.label && t.label !== t.id, `${t.id} sin etiqueta legible`);
      assert(t.group, `${t.id} sin grupo`);
      assert(t.description, `${t.id} sin descripción`);
    }
  });

  check("la whitelist rechaza lo que no es un template propio", () => {
    for (const bad of ["__proto__", "constructor", "toString", "order_paid ", "", "hasOwnProperty", "nope"]) {
      assertEq(fixtures.isTestable(bad), false, `aceptó ${JSON.stringify(bad)}:`);
    }
  });

  check("los fixtures renderizan completo, sin undefined ni NaN", () => {
    for (const t of fixtures.list()) {
      const data = fixtures.build(t.id, { config: settings.getEmailConfig(), requestedBy: "admin@iphoneup.cl" });
      assert(data, `${t.id} no devolvió datos`);
      const r = templates.render(t.id, {
        ...data,
        publicUrl: "https://iphoneup.cl",
        unsubscribeUrl: t.transactional ? null : "https://iphoneup.cl/api/emails/unsubscribe?e=a%40b.cl&t=xyz",
        config: settings.getEmailConfig(),
        providerLabel: "dry-run",
      });
      assert(r.subject, `${t.id} sin asunto`);
      for (const field of ["subject", "html", "text"]) {
        assert(!/undefined|NaN|\[object Object\]/.test(r[field]), `${t.id}: ${field} tiene un hueco sin dato`);
      }
      assert(!/\$0\b/.test(r.text), `${t.id}: aparece un total en cero`);
    }
  });

  check("los datos del fixture se identifican como prueba", () => {
    const data = fixtures.build("order_paid", {});
    assertEq(data.order.id, fixtures.FAKE_ORDER_ID);
    assert(/prueba/i.test(data.order.buyer.name), "el comprador no dice que es de prueba");
    assert(data.order.buyer.email.endsWith("@example.com"), "el email del fixture no es de un dominio reservado");
    assertEq(data.meta.test, true);
    assertEq(data.order.total, data.order.subtotal + Math.round(data.order.subtotal * 0.035) + 5990);
  });

  await checkAsync("el mailer antepone [PRUEBA] al asunto", async () => {
    const r = await mailer.send({
      template: "order_paid",
      to: "admin.verify@iphoneup.cl",
      force: true,
      subjectPrefix: fixtures.SUBJECT_PREFIX,
      data: fixtures.build("order_paid", {}),
    });
    assertEq(r.status, "dry_run");
    assert(r.subject.startsWith("[PRUEBA] "), "asunto sin marcar: " + r.subject);
    const row = db.prepare("SELECT subject, meta_json FROM email_log WHERE id = ?").get(r.logId);
    assert(row.subject.startsWith("[PRUEBA] "), "el log guardó el asunto sin marcar");
    assertEq(JSON.parse(row.meta_json).test, true);
  });

  await checkAsync("una prueba no toca órdenes, carritos ni stock", async () => {
    const snapshot = () => ({
      orders: db.prepare("SELECT COUNT(*) AS n FROM orders").get().n,
      carts: db.prepare("SELECT COUNT(*) AS n FROM carts").get().n,
      movements: db.prepare("SELECT COUNT(*) AS n FROM stock_movements").get().n,
      stock: db.prepare("SELECT COALESCE(SUM(stock),0) AS n FROM variants").get().n,
    });
    const before = snapshot();
    for (const t of fixtures.list()) {
      await mailer.send({
        template: t.id, to: "admin.verify@iphoneup.cl", force: true,
        subjectPrefix: fixtures.SUBJECT_PREFIX,
        data: fixtures.build(t.id, { config: settings.getEmailConfig() }),
      });
    }
    assertEq(JSON.stringify(snapshot()), JSON.stringify(before), "algo mutó durante las pruebas:");
  });

  await checkAsync("el aviso interno se puede probar con la config vacía", async () => {
    settings.setEmailConfig({ internalTo: "" });
    const r = await mailer.send({
      template: "internal_new_order",
      to: "admin.verify@iphoneup.cl",
      force: true,
      subjectPrefix: fixtures.SUBJECT_PREFIX,
      data: fixtures.build("internal_new_order", {}),
    });
    assertEq(r.status, "dry_run");
    assertEq(settings.getEmailConfig().internalTo, "", "la prueba guardó el destinatario como configuración");
  });

  await checkAsync("dos pruebas seguidas del mismo template no chocan con la idempotencia", async () => {
    const opts = {
      template: "cart_reminder_1h", to: "admin.verify@iphoneup.cl", force: true,
      idempotencyKey: "test:cart_reminder_1h:admin.verify@iphoneup.cl",
      subjectPrefix: fixtures.SUBJECT_PREFIX,
      data: fixtures.build("cart_reminder_1h", { config: settings.getEmailConfig() }),
    };
    const a = await mailer.send(opts);
    const b = await mailer.send(opts);
    assertEq(a.status, "dry_run");
    assertEq(b.status, "dry_run");
    assert(a.logId !== b.logId, "la segunda prueba reusó la fila de la primera");
  });

  // ==========================================================
  section("El scheduler no rompe nada cuando algo falla");
  // ==========================================================
  await checkAsync("un tick con la config apagada no lanza", async () => {
    settings.setEmailConfig({ enabled: false });
    const out = await scheduler.tick();
    assertEq(out.errors.length, 0, "errores: " + out.errors.join(" | "));
    settings.setEmailConfig({ enabled: true });
  });
  await checkAsync("un carro con items corruptos no frena el ciclo", async () => {
    const { cart } = carts.upsert({
      email: "corrupto@ejemplo.cl", consent: true,
      items: [{ model: variant.model, storage: variant.storage, color: variant.color || "", phoneId: variant.product_id, price: 1, qty: 1 }],
    });
    db.prepare("UPDATE carts SET items_json = '{no json' WHERE id = ?").run(cart.id);
    ageCart(cart.id, 5);
    const out = await scheduler.tick();
    assertEq(out.errors.length, 0, "errores: " + out.errors.join(" | "));
  });
}

// ---------------------------------------------------------------- salida
main()
  .catch(err => {
    failures.push(`fatal: ${err.stack || err.message}`);
  })
  .finally(() => {
    console.log("");
    if (failures.length) {
      console.log(`\x1b[31m✗ ${failures.length} verificación(es) fallaron\x1b[0m (${passed} OK)`);
      for (const f of failures) console.log(`  · ${f}`);
    } else {
      console.log(`\x1b[32m✓ ${passed} verificaciones OK\x1b[0m — emails y carritos coherentes (todo en dry-run).`);
    }
    try { db.close(); } catch {}
    try { fs.rmSync(TMP_DIR, { recursive: true, force: true }); } catch {}
    process.exit(failures.length ? 1 : 0);
  });
