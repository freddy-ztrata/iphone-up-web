// Imágenes para los emails: derivados PNG de los assets del sitio.
//
// POR QUÉ EXISTE
// Las fotos del catálogo son WebP (ver CLAUDE.md → Image pipeline). Outlook de
// escritorio renderiza con el motor de Word, que no soporta WebP: la foto sale
// como un cuadro roto. En vez de duplicar el catálogo entero a PNG en el repo,
// convertimos on-demand y cacheamos el resultado en el volumen persistente.
//
// REGLA DURA DE SEGURIDAD
// El endpoint que usa esta lib es público (los clientes de correo lo abren sin
// sesión) y recibe la ruta por query string. Por eso `normalizeSource()` es una
// WHITELIST, no una blacklist:
//   · solo cuatro carpetas conocidas, solo extensiones de imagen;
//   · el nombre de archivo no puede empezar con punto ni traer barras;
//   · cualquier "..", backslash, NUL, esquema raro (javascript:, data:, file:)
//     o URL de otro host se descarta;
//   · una URL absoluta solo pasa si es de nuestro propio PUBLIC_URL, y se
//     reduce a su ruta relativa antes de volver a validarse.
// Después de eso `resolveFile()` vuelve a chequear, ya en disco, que la ruta
// resuelta cuelgue de la base esperada (defensa en profundidad por si alguna
// regla de arriba se relaja en el futuro).

const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

const ROOT = path.resolve(__dirname, "..", "..");

// DATA_DIR se lee en cada llamada, no al cargar el módulo: los scripts de
// verificación lo apuntan a un temporal y requieren esta lib después.
function dataDir() {
  return process.env.DATA_DIR || path.resolve(ROOT, "data");
}

/** Lado del cuadrado de los derivados. La whitelist también acota el tamaño. */
const SIZES = [96, 136, 200];
const DEFAULT_SIZE = 136;

// Se suma a la clave de cache. Subirlo invalida todos los derivados: hay que
// tocarlo cuando cambian los parámetros del encoder de acá abajo, porque la
// clave solo mira el archivo de origen y si no el volumen sigue sirviendo los
// PNG viejos para siempre.
const CACHE_VERSION = 1;

/** Ruta del placeholder, dentro de la misma whitelist. */
const PLACEHOLDER = "assets/email/product-placeholder.png";
/** Logo del header: va directo por express.static, no pasa por el endpoint. */
const LOGO = "assets/email/logo.png";

// Un segmento no puede arrancar con "." (mata ".." y los ocultos) ni contener
// barras: la traversal necesita una de las dos cosas.
const SEG = "[A-Za-z0-9][A-Za-z0-9._-]*";
const EXT = "(?:webp|png|jpe?g)";

const ALLOWED = [
  { re: new RegExp(`^assets/iphones/${SEG}\\.${EXT}$`, "i"), base: () => ROOT },
  { re: new RegExp(`^assets/iphones/variants/${SEG}\\.${EXT}$`, "i"), base: () => ROOT },
  { re: new RegExp(`^assets/email/${SEG}\\.${EXT}$`, "i"), base: () => ROOT },
  // Las subidas del admin viven en el volumen persistente, no en el repo:
  // "uploads/products/x.webp" resuelve contra DATA_DIR (ver server/index.js).
  { re: new RegExp(`^uploads/products/${SEG}\\.${EXT}$`, "i"), base: () => dataDir() },
];

function ruleFor(rel) {
  return ALLOWED.find(r => r.re.test(rel)) || null;
}

/** Acota el tamaño pedido a la whitelist. Nunca lanza. */
function pickSize(value) {
  const n = parseInt(value, 10);
  return SIZES.includes(n) ? n : DEFAULT_SIZE;
}

/**
 * Convierte lo que venga (ruta del catálogo, upload del admin, URL absoluta
 * propia) en una ruta relativa permitida.
 * @param {string} raw
 * @param {string} [publicBase] origen propio; habilita URLs absolutas nuestras
 * @returns {string|null} ruta relativa validada, o null si no se acepta
 */
function normalizeSource(raw, publicBase) {
  let s = String(raw == null ? "" : raw).trim();
  if (!s) return null;
  // Backslash y NUL nunca aparecen en una ruta nuestra y sí en los intentos de
  // escape (C:\, %00 decodificado por express).
  if (s.includes("\\") || s.includes("\0")) return null;
  if (s.startsWith("//")) return null; // protocol-relative → otro host

  if (/^[a-z][a-z0-9+.-]*:/i.test(s)) {
    // Tiene esquema. Solo http(s), y solo si es nuestro propio origen: un
    // template no puede terminar embebiendo la imagen de un tercero.
    if (!/^https?:\/\//i.test(s)) return null;
    const origin = String(publicBase || "").replace(/\/+$/, "");
    if (!origin) return null;
    const lower = s.toLowerCase();
    if (!lower.startsWith(origin.toLowerCase() + "/")) return null;
    s = s.slice(origin.length + 1);
  }

  s = s.split("?")[0].split("#")[0];
  s = s.replace(/^\/+/, "");
  while (s.startsWith("./")) s = s.slice(2);
  if (!s || s.includes("..")) return null;

  return ruleFor(s) ? s : null;
}

/**
 * Ruta absoluta en disco de una fuente ya normalizada.
 * @returns {string|null} null si no está en la whitelist o el archivo no existe
 */
function resolveFile(rel) {
  const rule = ruleFor(String(rel || ""));
  if (!rule) return null;
  const base = path.resolve(rule.base());
  const abs = path.resolve(base, rel);
  // Segundo cinturón: la ruta resuelta tiene que seguir colgando de la base.
  if (abs !== base && !abs.startsWith(base + path.sep)) return null;
  try {
    return fs.statSync(abs).isFile() ? abs : null;
  } catch {
    return null;
  }
}

function cacheDir() {
  return path.join(dataDir(), "cache", "email-images");
}

/**
 * Derivado PNG cuadrado de una imagen de la whitelist, cacheado en disco.
 * La clave incluye tamaño + mtime del original: si el admin resube la foto,
 * el derivado se regenera solo.
 * @returns {Promise<{file: string, etag: string, cached: boolean}|null>}
 */
async function png(rel, size = DEFAULT_SIZE) {
  const abs = resolveFile(rel);
  if (!abs) return null;
  const side = pickSize(size);

  const stat = fs.statSync(abs);
  const key = crypto.createHash("sha1")
    .update(`v${CACHE_VERSION}|${rel}|${side}|${stat.size}|${Math.round(stat.mtimeMs)}`)
    .digest("hex");
  const out = path.join(cacheDir(), `${key}.png`);
  const etag = `"eimg-${key}"`;

  if (fs.existsSync(out)) return { file: out, etag, cached: true };

  const sharp = require("sharp");
  const buf = await sharp(abs)
    // `contain` sobre fondo transparente: todas las fotos quedan del mismo
    // tamaño exacto, así el <img width/height> del template no miente y el
    // recorte del cliente de correo no deforma nada.
    .resize({ width: side, height: side, fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ compressionLevel: 9 })
    .toBuffer();

  fs.mkdirSync(cacheDir(), { recursive: true });
  // tmp + rename: dos aperturas simultáneas del mismo email no pueden dejar un
  // PNG a medio escribir en la cache.
  const tmp = `${out}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, buf);
  fs.renameSync(tmp, out);
  return { file: out, etag, cached: false };
}

/** URL absoluta del placeholder (imagen que falta o no permitida). */
function placeholderUrl(base) {
  const origin = String(base || "").replace(/\/+$/, "");
  return origin ? `${origin}/${PLACEHOLDER}` : "";
}

/** URL absoluta del logo del header. */
function logoUrl(base) {
  const origin = String(base || "").replace(/\/+$/, "");
  return origin ? `${origin}/${LOGO}` : "";
}

/**
 * URL que va en el `src` de un <img> de producto.
 * Siempre devuelve algo mostrable: si la fuente no pasa la whitelist, cae al
 * placeholder en vez de dejar un <img> roto en la bandeja del cliente.
 * Sin `base` (PUBLIC_URL sin configurar) devuelve "" — no hay forma de armar
 * una URL absoluta y una relativa no sirve dentro de un correo.
 */
function imageUrl(raw, { size = DEFAULT_SIZE, base = "" } = {}) {
  const origin = String(base || "").replace(/\/+$/, "");
  if (!origin) return "";
  const rel = normalizeSource(raw, origin);
  if (!rel) return placeholderUrl(origin);
  return `${origin}/api/emails/image?src=${encodeURIComponent(rel)}&s=${pickSize(size)}`;
}

module.exports = {
  SIZES, DEFAULT_SIZE, PLACEHOLDER, LOGO,
  pickSize, normalizeSource, resolveFile, png,
  imageUrl, placeholderUrl, logoUrl,
};
