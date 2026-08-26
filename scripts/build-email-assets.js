// Genera los PNG que usan los emails, desde los assets del sitio.
//
//   node scripts/build-email-assets.js
//
// Por qué PNG y no el .webp que ya está en el repo: Outlook de escritorio
// renderiza con el motor de Word y no soporta WebP — la imagen sale como un
// cuadro roto. Los emails, entonces, solo referencian PNG.
//
// Se corre a mano cuando cambia el logo. Usa `sharp`, que ya es dependencia
// real del server (server/routes/admin/uploads.js).

const path = require("path");
const fs = require("fs");
const sharp = require("sharp");

const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, "assets", "email");

// Ancho de render del logo: se muestra a 150px en el header ⇒ 2x para pantallas
// retina. Más que esto solo suma bytes que el cliente descarga en cada apertura.
const LOGO_WIDTH = 300;

// Lado del placeholder de producto. Tiene que coincidir con el tamaño de los
// derivados que sirve /api/emails/image (ver server/lib/email-images.js).
const PLACEHOLDER_SIDE = 136;

const PLACEHOLDER_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="${PLACEHOLDER_SIDE}" height="${PLACEHOLDER_SIDE}" viewBox="0 0 136 136">
  <rect x="0" y="0" width="136" height="136" rx="18" fill="#0F0F0F"/>
  <rect x="0.75" y="0.75" width="134.5" height="134.5" rx="17.25" fill="none" stroke="#242424" stroke-width="1.5"/>
  <rect x="46" y="30" width="44" height="76" rx="10" fill="none" stroke="#3A3A3A" stroke-width="2.5"/>
  <rect x="58" y="35" width="20" height="4" rx="2" fill="#3A3A3A"/>
  <circle cx="68" cy="98" r="3.5" fill="#A4E83A"/>
</svg>`;

async function main() {
  fs.mkdirSync(OUT, { recursive: true });

  const logoSrc = path.join(ROOT, "assets", "logo-trimmed.webp");
  const meta = await sharp(logoSrc).metadata();
  console.log(`origen: assets/logo-trimmed.webp — ${meta.width}×${meta.height}, alpha: ${meta.hasAlpha}`);

  const logo = await sharp(logoSrc)
    .resize({ width: LOGO_WIDTH })
    .png({ compressionLevel: 9, effort: 10 })
    .toFile(path.join(OUT, "logo.png"));
  console.log(`  → assets/email/logo.png ${logo.width}×${logo.height} (${logo.size} bytes)`);

  const ph = await sharp(Buffer.from(PLACEHOLDER_SVG))
    .png({ compressionLevel: 9, effort: 10 })
    .toFile(path.join(OUT, "product-placeholder.png"));
  console.log(`  → assets/email/product-placeholder.png ${ph.width}×${ph.height} (${ph.size} bytes)`);
}

main().catch(err => { console.error(err.message); process.exit(1); });
