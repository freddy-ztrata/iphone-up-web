// Vuelca todos los templates de email a HTML + texto para revisarlos a ojo.
//
//   npm run preview:emails                 → usa https://iphoneup.cl como origen
//   PUBLIC_URL=http://localhost:8080 npm run preview:emails
//
// Abre el index que imprime al final en el navegador. Para ver las fotos hay
// que apuntar PUBLIC_URL a un server levantado (`npm start`): las imágenes son
// absolutas y salen de /api/emails/image.
//
// Aislamiento igual que los verify: DATA_DIR temporal y RESEND_API_KEY vacío.
// Esto NO manda correos — solo renderiza y escribe archivos.

const fs = require("fs");
const os = require("os");
const path = require("path");

const PUBLIC_URL = (process.env.PUBLIC_URL || "https://iphoneup.cl").replace(/\/+$/, "");

// ANTES de requerir nada del server (db.js lee DATA_DIR al cargar).
const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "iphoneup-preview-"));
process.env.DATA_DIR = TMP_DIR;
process.env.RESEND_API_KEY = "";
process.env.EMAIL_SCHEDULER_ENABLED = "false";
process.env.PUBLIC_URL = PUBLIC_URL;
process.env.EMAIL_UNSUBSCRIBE_SECRET = "preview-secret-no-usar-en-produccion";

const db = require("../server/db");
const { seedIfEmpty } = require("./seed-from-datajs");
const templates = require("../server/lib/email-templates");
const emailImages = require("../server/lib/email-images");
const fixtures = require("../server/lib/email-fixtures");
const settings = require("../server/lib/settings");

// Sale al repo (gitignored) y no a un temporal: así se abre de una en el
// navegador y se puede volver a mirar el render anterior después de un cambio.
const OUT_DIR = path.resolve(__dirname, "..", "email-preview");
fs.rmSync(OUT_DIR, { recursive: true, force: true });
fs.mkdirSync(OUT_DIR, { recursive: true });

/**
 * Escribe los derivados PNG que serviría /api/emails/image, para poder mirar la
 * conversión WebP→PNG sin levantar el server. Es exactamente el mismo pipeline
 * que corre en producción.
 */
async function dumpDerivatives(sources) {
  const dir = path.join(OUT_DIR, "img");
  fs.mkdirSync(dir, { recursive: true });
  for (const src of sources) {
    const rel = emailImages.normalizeSource(src, PUBLIC_URL);
    if (!rel) { console.log(`  ! ${src} — fuera de la whitelist`); continue; }
    const out = await emailImages.png(rel, emailImages.DEFAULT_SIZE);
    if (!out) { console.log(`  ! ${src} — no existe el archivo`); continue; }
    const name = rel.replace(/[^A-Za-z0-9._-]/g, "_") + ".png";
    fs.copyFileSync(out.file, path.join(dir, name));
    console.log(`  ${rel} → img/${name} (${fs.statSync(out.file).size} bytes)`);
  }
}

async function main() {
  seedIfEmpty();
  const config = settings.getEmailConfig();
  const rows = [];
  const sources = new Set();

  for (const t of fixtures.list()) {
    const data = fixtures.build(t.id, { config, requestedBy: "preview@iphoneup.cl" });
    for (const it of data.order?.items || data.cart?.items || []) {
      if (it.img) sources.add(it.img);
    }
    const rendered = templates.render(t.id, {
      ...data,
      publicUrl: PUBLIC_URL,
      unsubscribeUrl: t.transactional ? null : `${PUBLIC_URL}/api/emails/unsubscribe?e=demo%40ejemplo.cl&t=demo`,
      config,
      providerLabel: "dry-run (preview)",
    });

    fs.writeFileSync(path.join(OUT_DIR, `${t.id}.html`), rendered.html, "utf8");
    fs.writeFileSync(path.join(OUT_DIR, `${t.id}.txt`), rendered.text, "utf8");

    const kb = (Buffer.byteLength(rendered.html, "utf8") / 1024).toFixed(1);
    rows.push({ id: t.id, label: t.label, subject: rendered.subject, kb });
    console.log(`  ${t.id.padEnd(20)} ${String(kb).padStart(6)} KB  ${rendered.subject}`);
  }

  // Índice con los ocho emails en <iframe>, uno debajo del otro.
  const index = `<!doctype html><html lang="es"><head><meta charset="utf-8">
<title>Preview de emails — iPhone UP</title>
<style>
  body{margin:0;background:#141414;color:#eee;font:14px/1.5 -apple-system,Segoe UI,Roboto,sans-serif;padding:24px}
  h1{font-size:20px;margin:0 0 4px}
  p.sub{color:#999;margin:0 0 24px}
  section{margin:0 0 32px}
  h2{font-size:15px;margin:0 0 2px}
  .meta{color:#8a8a8a;font-size:12px;margin:0 0 10px}
  iframe{width:100%;max-width:680px;height:900px;border:1px solid #333;border-radius:10px;background:#000}
  a{color:#A4E83A}
</style></head><body>
<h1>Preview de emails — iPhone UP</h1>
<p class="sub">Origen: <code>${PUBLIC_URL}</code> · Las fotos solo cargan si ese origen está levantado.</p>
${rows.map(r => `<section>
  <h2>${r.label}</h2>
  <p class="meta"><code>${r.id}</code> · ${r.kb} KB · asunto: ${r.subject.replace(/</g, "&lt;")} · <a href="${r.id}.html">abrir</a> · <a href="${r.id}.txt">texto plano</a></p>
  <iframe src="${r.id}.html" title="${r.label}"></iframe>
</section>`).join("\n")}
</body></html>`;
  fs.writeFileSync(path.join(OUT_DIR, "index.html"), index, "utf8");

  console.log("\nDerivados PNG (lo que sirve /api/emails/image):");
  await dumpDerivatives([...sources, emailImages.LOGO, emailImages.PLACEHOLDER]);

  console.log(`\n${rows.length} templates escritos.`);
  console.log(`\x1b[1mAbrir:\x1b[0m file://${path.join(OUT_DIR, "index.html")}`);
}

main()
  .catch(err => { console.error(err.message); process.exitCode = 1; })
  .finally(() => {
    try { db.close(); } catch {}
    try { fs.rmSync(TMP_DIR, { recursive: true, force: true }); } catch {}
  });
