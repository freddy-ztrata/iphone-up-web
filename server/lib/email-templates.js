// Templates de email en HTML + texto plano.
//
// REGLA DURA: todo dato que venga de fuera (nombre del comprador, dirección,
// notas del admin, nombre de producto, código de tracking, ruta de una imagen)
// se interpola con esc()/safeUrl() o no se interpola. El nombre lo escribe un
// tercero en el checkout público, así que un `<img src=x onerror=...>` ahí
// termina en la bandeja de otra persona y en el HTML que Resend guarda. Los
// únicos strings que entran crudos son los que arma este archivo.
//
// DISEÑO: "Dark Neon Premium", el mismo del sitio — fondo negro, tarjeta
// #0B0B0B, acento lima #A4E83A, logo real. Lo que un cliente de correo puede
// romper se maneja con capas, no con esperanza:
//
//   · Layout con <table> y ancho fijo 600px. Outlook (motor de Word) no
//     soporta flex ni grid.
//   · Colores SÓLIDOS y duplicados: `bgcolor="…"` como atributo HTML *además*
//     del style inline. Outlook ignora `background` en CSS de <td>.
//   · Nada de degradados de fondo, sombras ni border-radius crítico: donde no
//     se soporta (Outlook), la caja queda cuadrada y se ve igual de bien.
//   · <meta color-scheme dark> + overrides [data-ogsc] para que Gmail/Outlook
//     en modo oscuro no re-inviertan un email que YA es oscuro.
//   · Botones con fallback VML (<v:roundrect>) para Outlook de escritorio.
//   · Todas las imágenes son PNG absolutas: el WebP del catálogo se convierte
//     on-demand en /api/emails/image (ver server/lib/email-images.js).
//   · El <style> del <head> solo lleva mejoras progresivas (media queries,
//     modo oscuro). Un cliente que lo descarte igual ve el email completo,
//     porque todo lo estructural está inline.

const images = require("./email-images");

// ---------- Design tokens ----------
// Sólidos a propósito: cualquier cosa con alpha o degradado tiene un cliente
// donde no se ve. Si cambia la marca, se cambia acá y en styles.css.
const ACCENT = "#A4E83A";
const ACCENT_DEEP = "#7CC020";
const ACCENT_DARK = "#41660F";
const ON_ACCENT = "#0A0A0A";

const BG = "#000000";      // canvas
const CARD = "#0B0B0B";    // tarjeta principal
const PANEL = "#121212";   // cajas internas
const PANEL_DEEP = "#0E0E0E";
const FOOT = "#070707";
const LINE = "#1F1F1F";
const LINE_SOFT = "#181818";

const INK = "#FFFFFF";
const TEXT = "#E4E4E4";
const MUTED = "#9B9B9B";
const DIM = "#6E6E6E";

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const MONO = "'SFMono-Regular',Menlo,Consolas,'Liberation Mono',monospace";
// Outlook ignora line-height si no se lo fuerza con esta regla propietaria.
const LH = "mso-line-height-rule:exactly";

const CARD_WIDTH = 600;
const THUMB = 68;              // lado del <img> de producto, en px de CSS
const THUMB_SRC = 136;         // derivado real (2x) que pide el template

const STORE_ADDRESS = "Padre Mariano 98, Of. 105 — Providencia, Santiago";
const STORE_HOURS = "Lunes a viernes 11:00 — 19:00 · Sábado 11:00 — 15:00";
const INSTAGRAM_URL = "https://www.instagram.com/iphoneup.cl/";
const INSTAGRAM_HANDLE = "@iphoneup.cl";
const WARRANTY_MONTHS = 6;

// ---------- Escapado / formato ----------

/** Escapa para contexto de texto y de atributo (comillas incluidas). */
function esc(value) {
  if (value == null) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * URL segura para href/src. Solo http(s) y rutas del propio sitio; cualquier
 * otro esquema (javascript:, data:, vbscript:) se descarta.
 */
function safeUrl(value, base) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const origin = String(base || process.env.PUBLIC_URL || "").replace(/\/$/, "");
  if (/^https?:\/\//i.test(raw)) return esc(raw);
  // Relativa del sitio ("assets/…", "/uploads/…") → absolutizar.
  if (/^[./]/.test(raw) || /^[a-z0-9_-]+\//i.test(raw)) {
    if (!origin) return "";
    return esc(`${origin}/${raw.replace(/^\.?\//, "")}`);
  }
  return "";
}

function fmtCLP(n) {
  const value = Math.round(Number(n) || 0);
  return "$" + value.toLocaleString("es-CL");
}

function baseUrl(ctx) {
  return String(ctx?.publicUrl || process.env.PUBLIC_URL || "").replace(/\/$/, "");
}

/** Nombre del equipo, sin capacidad ni color. Devuelve texto SIN escapar. */
function itemTitle(item) {
  return String(item?.model || "").trim() || "Producto";
}

/** Capacidad · color. Devuelve texto SIN escapar. */
function itemSpec(item) {
  return [item?.storage, item?.color].filter(Boolean).join(" · ");
}

/** Etiqueta completa de un item. Devuelve texto SIN escapar. */
function itemLabel(item) {
  return [item?.model, item?.storage, item?.color].filter(Boolean).join(" · ") || "Producto";
}

function itemQty(item) {
  return Math.max(1, Math.round(Number(item?.qty) || 1));
}

// =====================================================================
// COMPONENTES
// =====================================================================

/** Línea de acento bajo el header: tres celdas sólidas = degradado sin CSS. */
function neonRule() {
  return `
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse">
          <tr>
            <td width="55%" height="3" bgcolor="${ACCENT}" style="height:3px;line-height:3px;font-size:0;background-color:${ACCENT}">&nbsp;</td>
            <td width="25%" height="3" bgcolor="${ACCENT_DEEP}" style="height:3px;line-height:3px;font-size:0;background-color:${ACCENT_DEEP}">&nbsp;</td>
            <td width="20%" height="3" bgcolor="${ACCENT_DARK}" style="height:3px;line-height:3px;font-size:0;background-color:${ACCENT_DARK}">&nbsp;</td>
          </tr>
        </table>`;
}

/**
 * Chip de estado. `tone`:
 *   solid   → lima con texto negro (lo bueno: pagado, entregado)
 *   outline → borde lima, texto lima (en tránsito, informativo)
 *   ghost   → borde gris, texto apagado (secundario: badges de producto)
 * Sin border-radius crítico: en Outlook queda rectangular y se lee igual.
 */
function chip(label, tone = "solid") {
  const clean = esc(label);
  const skin = tone === "solid"
    ? `background-color:${ACCENT};color:${ON_ACCENT};border:1px solid ${ACCENT}`
    : tone === "outline"
      ? `background-color:${PANEL_DEEP};color:${ACCENT};border:1px solid ${ACCENT_DARK}`
      : `background-color:${PANEL_DEEP};color:${MUTED};border:1px solid ${LINE}`;
  const bg = tone === "solid" ? ACCENT : PANEL_DEEP;
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate"><tr>
            <td bgcolor="${bg}" style="padding:6px 12px;border-radius:999px;${skin};font-family:${FONT};font-size:11px;line-height:12px;${LH};font-weight:700;letter-spacing:0.08em;text-transform:uppercase;white-space:nowrap">${clean}</td>
          </tr></table>`;
}

/**
 * Botón principal. El bloque VML es lo único que ve Outlook de escritorio
 * (border-radius y padding en <a> no le funcionan); el resto de los clientes
 * ven el <a> y saltean el VML por el comentario condicional invertido.
 */
function button(href, label, { tone = "solid" } = {}) {
  const url = safeUrl(href);
  if (!url) return "";
  const text = esc(label);
  const solid = tone === "solid";
  const fill = solid ? ACCENT : PANEL;
  const stroke = solid ? ACCENT : LINE;
  const color = solid ? ON_ACCENT : INK;
  // El ancho del VML es fijo sí o sí: lo estimamos del largo de la etiqueta.
  const vmlWidth = Math.min(400, Math.max(180, String(label || "").length * 9 + 56));
  return `
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:26px 0 6px"><tr><td>
          <!--[if mso]>
          <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${url}" style="height:48px;v-text-anchor:middle;width:${vmlWidth}px;" arcsize="25%" strokecolor="${stroke}" fillcolor="${fill}">
            <w:anchorlock/>
            <center style="color:${color};font-family:Arial,sans-serif;font-size:15px;font-weight:bold;">${text}</center>
          </v:roundrect>
          <![endif]-->
          <!--[if !mso]><!-->
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate"><tr>
            <td align="center" bgcolor="${fill}" style="border-radius:12px;background-color:${fill};border:1px solid ${stroke}">
              <a href="${url}" style="display:inline-block;padding:15px 30px;font-family:${FONT};font-size:15px;line-height:18px;${LH};font-weight:700;color:${color};text-decoration:none;border-radius:12px">${text}</a>
            </td>
          </tr></table>
          <!--<![endif]-->
        </td></tr></table>`;
}

/**
 * Tarjeta de producto: foto + nombre + capacidad/color + badge + precio.
 * Tres columnas fijas que entran en 320px sin apilar, así no hay que confiar
 * en media queries que la mitad de los clientes descarta.
 */
function productCard(item, { showPrice = true, base = "" } = {}) {
  const qty = itemQty(item);
  const price = Math.round(Number(item?.price) || 0) * qty;
  const badge = item?.sealed ? "Sellado" : "Seminuevo A+";
  const spec = itemSpec(item);
  const src = images.imageUrl(item?.img, { size: THUMB_SRC, base });
  const alt = esc(itemLabel(item));

  const photo = src
    ? `<img src="${esc(src)}" width="${THUMB}" height="${THUMB}" alt="${alt}" style="display:block;width:${THUMB}px;height:${THUMB}px;border:0;outline:none;text-decoration:none;-ms-interpolation-mode:bicubic">`
    // Sin PUBLIC_URL no hay URL absoluta posible: mejor un hueco prolijo que un
    // <img> roto con el icono de "imagen no disponible".
    : `<div style="width:${THUMB}px;height:${THUMB}px;line-height:${THUMB}px;${LH};text-align:center;font-family:${FONT};font-size:22px;color:${LINE}">&#9633;</div>`;

  return `
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${PANEL}" style="width:100%;border-collapse:separate;background-color:${PANEL};border:1px solid ${LINE};border-radius:14px;margin:0 0 10px">
            <tr>
              <td width="92" valign="middle" align="center" bgcolor="${PANEL_DEEP}" style="width:92px;padding:12px;background-color:${PANEL_DEEP};border-radius:14px 0 0 14px">${photo}</td>
              <td valign="middle" style="padding:12px 14px;font-family:${FONT}">
                <div style="font-size:15px;line-height:20px;${LH};font-weight:700;color:${INK}">${esc(itemTitle(item))}${qty > 1 ? ` <span style="color:${MUTED};font-weight:400">× ${qty}</span>` : ""}</div>
                ${spec ? `<div style="font-size:13px;line-height:18px;${LH};color:${MUTED};padding-top:2px">${esc(spec)}</div>` : ""}
                <div style="padding-top:7px">${chip(badge, item?.sealed ? "outline" : "ghost")}</div>
              </td>
              ${showPrice ? `<td valign="middle" align="right" style="padding:12px 16px 12px 6px;font-family:${FONT};font-size:15px;line-height:20px;${LH};font-weight:700;color:${INK};white-space:nowrap">${esc(fmtCLP(price))}</td>` : ""}
            </tr>
          </table>`;
}

function productCards(items = [], opts = {}) {
  const list = Array.isArray(items) ? items : [];
  if (!list.length) return "";
  return `
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:6px 0 2px"><tr><td>
${list.map(it => productCard(it, opts)).join("")}
        </td></tr></table>`;
}

/** Bloque de totales. `lines` = [{label, value, strong?, accent?}] */
function totalsBlock(lines = []) {
  const rows = lines.filter(Boolean).map(l => {
    const size = l.strong ? "17px" : "14px";
    const labelColor = l.strong ? INK : MUTED;
    const valueColor = l.strong ? (l.accent === false ? INK : ACCENT) : TEXT;
    const weight = l.strong ? "700" : "400";
    const pad = l.strong ? "14px 0 2px" : "6px 0";
    const border = l.strong ? `border-top:1px solid ${LINE};` : "";
    return `
            <tr>
              <td style="${border}padding:${pad};font-family:${FONT};font-size:${size};line-height:22px;${LH};font-weight:${weight};color:${labelColor}">${esc(l.label)}</td>
              <td align="right" style="${border}padding:${pad};font-family:${FONT};font-size:${size};line-height:22px;${LH};font-weight:${weight};color:${valueColor};white-space:nowrap">${esc(l.value)}</td>
            </tr>`;
  }).join("");
  if (!rows) return "";
  return `
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${PANEL_DEEP}" style="width:100%;border-collapse:separate;background-color:${PANEL_DEEP};border:1px solid ${LINE};border-radius:14px;margin:14px 0 4px">
          <tr><td style="padding:6px 16px 14px">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${rows}
            </table>
          </td></tr>
        </table>`;
}

/**
 * Caja informativa. `tone`:
 *   default → panel gris sobre negro
 *   accent  → barra lima a la izquierda (lo que hay que leer sí o sí)
 */
function infoBox(title, htmlBody, { tone = "default" } = {}) {
  const accent = tone === "accent";
  return `
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:separate;margin:18px 0">
          <tr>
            ${accent ? `<td width="3" bgcolor="${ACCENT}" style="width:3px;background-color:${ACCENT};border-radius:3px 0 0 3px;font-size:0;line-height:0">&nbsp;</td>` : ""}
            <td bgcolor="${PANEL}" style="padding:16px 18px;background-color:${PANEL};border:1px solid ${LINE};${accent ? "border-left:0;border-radius:0 14px 14px 0" : "border-radius:14px"};font-family:${FONT};font-size:14px;line-height:22px;${LH};color:${TEXT}">
              ${title ? `<div style="font-family:${FONT};font-size:11px;line-height:14px;${LH};font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:${accent ? ACCENT : MUTED};padding-bottom:7px">${esc(title)}</div>` : ""}
              ${htmlBody}
            </td>
          </tr>
        </table>`;
}

/** Pares "etiqueta / valor" apilados, para direcciones y datos del comprador. */
function dataList(pairs = []) {
  return pairs.filter(p => p && p.value).map(p => `
              <div style="padding:3px 0">
                <span style="font-family:${FONT};font-size:12px;line-height:18px;${LH};color:${DIM}">${esc(p.label)}</span><br>
                <span style="font-family:${FONT};font-size:14px;line-height:20px;${LH};color:${TEXT}">${esc(p.value)}</span>
              </div>`).join("");
}

/** Caja de seguimiento: el código en mono, grande y copiable. */
function trackingBox(carrier, code) {
  return `
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${PANEL_DEEP}" style="width:100%;border-collapse:separate;background-color:${PANEL_DEEP};border:1px solid ${ACCENT_DARK};border-radius:14px;margin:18px 0">
          <tr><td align="center" style="padding:18px">
            <div style="font-family:${FONT};font-size:11px;line-height:14px;${LH};font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:${ACCENT}">Seguimiento ${esc(carrier || "Chilexpress")}</div>
            <div style="font-family:${MONO};font-size:20px;line-height:28px;${LH};font-weight:700;color:${INK};padding-top:8px;letter-spacing:0.04em;word-break:break-all">${esc(code)}</div>
          </td></tr>
        </table>`;
}

/** Separador fino. El margen va en la tabla: un <td> no tiene margin. */
function divider(space = 20) {
  return `
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:${space}px 0"><tr>
          <td height="1" bgcolor="${LINE_SOFT}" style="height:1px;line-height:1px;font-size:0;background-color:${LINE_SOFT}">&nbsp;</td>
        </tr></table>`;
}

function paragraph(html, { color = TEXT, size = 15, top = 0, bottom = 14 } = {}) {
  return `<p style="margin:${top}px 0 ${bottom}px;font-family:${FONT};font-size:${size}px;line-height:24px;${LH};color:${color}">${html}</p>`;
}

function note(html) {
  return `<p style="margin:16px 0 0;font-family:${FONT};font-size:13px;line-height:20px;${LH};color:${DIM}">${html}</p>`;
}

function instagramLink() {
  return `<a href="${INSTAGRAM_URL}" style="color:${ACCENT};text-decoration:none;font-weight:600">Instagram ${esc(INSTAGRAM_HANDLE)}</a>`;
}

// ---------- Layout ----------

function header(base) {
  const logo = images.logoUrl(base);
  const mark = logo
    ? `<img src="${esc(logo)}" width="150" height="66" alt="iPhone UP" style="display:block;width:150px;height:66px;border:0;outline:none;text-decoration:none;-ms-interpolation-mode:bicubic">`
    // Sin PUBLIC_URL el logo no se puede referenciar: cae a la marca en texto,
    // con el punto lima al lado (misma lectura, cero imágenes).
    : `<span style="font-family:${FONT};font-size:20px;line-height:24px;${LH};font-weight:800;color:${INK};letter-spacing:-0.02em">iPhone&nbsp;UP</span>`;
  return `
        <tr><td bgcolor="${CARD}" style="padding:26px 28px 22px;background-color:${CARD}">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
            <td align="left" valign="middle">${mark}</td>
            <!-- u-tag: en pantallas chicas el logo ya ocupa la fila, la bajada se oculta -->
            <td class="u-tag" align="right" valign="middle" style="font-family:${FONT};font-size:11px;line-height:14px;${LH};font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:${DIM}">iPhone reacondicionados<br>Providencia&nbsp;· Santiago</td>
          </tr></table>
        </td></tr>
        <tr><td>${neonRule()}</td></tr>`;
}

function footer(base, unsubUrl) {
  return `
        <tr><td bgcolor="${FOOT}" style="padding:24px 28px 28px;background-color:${FOOT};border-top:1px solid ${LINE}">
          <div style="font-family:${FONT};font-size:14px;line-height:20px;${LH};font-weight:800;color:${INK};letter-spacing:-0.01em">iPhone UP<span style="color:${ACCENT}">.</span></div>
          <div style="font-family:${FONT};font-size:13px;line-height:20px;${LH};color:${MUTED};padding-top:6px">${esc(STORE_ADDRESS)}</div>
          <div style="font-family:${FONT};font-size:13px;line-height:20px;${LH};color:${DIM}">${esc(STORE_HOURS)}</div>
          <div style="font-family:${FONT};font-size:13px;line-height:20px;${LH};padding-top:10px">${instagramLink()}</div>
          ${unsubUrl ? `
          <div style="font-family:${FONT};font-size:12px;line-height:18px;${LH};color:${DIM};padding-top:16px;border-top:1px solid ${LINE_SOFT};margin-top:16px">
            ¿No querés recibir más estos avisos?
            <a href="${unsubUrl}" style="color:${MUTED};text-decoration:underline">Darse de baja</a>.
            Los correos de una compra concreta se siguen enviando.
          </div>` : ""}
        </td></tr>`;
}

/**
 * Envuelve el cuerpo en el layout base.
 * @param {object} opts
 * @param {string} opts.title            h1 del email
 * @param {string} opts.preheader        texto de vista previa (oculto)
 * @param {string} opts.body             HTML ya escapado por quien lo construyó
 * @param {string} [opts.eyebrow]        etiqueta del chip sobre el título
 * @param {string} [opts.eyebrowTone]    solid | outline | ghost
 * @param {string} [opts.lead]           bajada bajo el título (HTML ya escapado)
 * @param {string} [opts.base]           PUBLIC_URL, para las imágenes absolutas
 * @param {string} [opts.unsubscribeUrl] si viene, se pinta el link de baja
 */
function layout({ title, preheader, body, eyebrow, eyebrowTone = "solid", lead, base = "", unsubscribeUrl }) {
  const unsub = safeUrl(unsubscribeUrl);
  return `<!doctype html>
<html lang="es" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="dark">
<meta name="supported-color-schemes" content="dark">
<title>${esc(title)}</title>
<!--[if mso]>
<xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml>
<style>table,td,div,p,a,h1{font-family:Arial,Helvetica,sans-serif !important}</style>
<![endif]-->
<style>
  :root{color-scheme:dark;supported-color-schemes:dark}
  body,table,td,div,p,a{-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%}
  img{border:0;line-height:100%;outline:none;text-decoration:none}
  a{color:${ACCENT}}
  /* Gmail y Outlook.com en modo oscuro re-tiñen los colores de un email que ya
     es oscuro. Estos selectores los devuelven a la paleta de la marca. */
  [data-ogsc] .u-ink,u+.u-body .u-ink{color:${INK} !important}
  [data-ogsc] .u-text,u+.u-body .u-text{color:${TEXT} !important}
  [data-ogsc] .u-muted,u+.u-body .u-muted{color:${MUTED} !important}
  [data-ogsb] .u-card,u+.u-body .u-card{background-color:${CARD} !important}
  [data-ogsb] .u-bg,u+.u-body .u-bg{background-color:${BG} !important}
  @media only screen and (max-width:620px){
    .u-shell{width:100% !important}
    .u-pad{padding-left:18px !important;padding-right:18px !important}
    .u-h1{font-size:24px !important;line-height:30px !important}
    .u-tag{display:none !important}
  }
</style>
</head>
<body class="u-body" bgcolor="${BG}" style="margin:0;padding:0;background-color:${BG};width:100%">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all">${esc(preheader || "")}</div>
  <!-- espaciador de vista previa: evita que Gmail muestre el inicio del cuerpo -->
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all">&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;</div>
  <table role="presentation" class="u-bg" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${BG}" style="width:100%;background-color:${BG}">
    <tr><td align="center" style="padding:28px 10px 34px">
      <table role="presentation" class="u-shell u-card" width="${CARD_WIDTH}" cellpadding="0" cellspacing="0" border="0" bgcolor="${CARD}" style="width:${CARD_WIDTH}px;max-width:${CARD_WIDTH}px;background-color:${CARD};border:1px solid ${LINE};border-radius:18px;border-collapse:separate;overflow:hidden">
${header(base)}

        <tr><td class="u-pad" bgcolor="${CARD}" style="padding:28px 28px 4px;background-color:${CARD}">
          ${eyebrow ? `<div style="padding-bottom:14px">${chip(eyebrow, eyebrowTone)}</div>` : ""}
          <h1 class="u-h1 u-ink" style="margin:0;font-family:${FONT};font-size:27px;line-height:34px;${LH};font-weight:800;color:${INK};letter-spacing:-0.02em">${esc(title)}</h1>
          ${lead ? `<p class="u-muted" style="margin:12px 0 0;font-family:${FONT};font-size:15px;line-height:24px;${LH};color:${MUTED}">${lead}</p>` : ""}
        </td></tr>

        <tr><td class="u-pad u-text" bgcolor="${CARD}" style="padding:22px 28px 28px;background-color:${CARD};font-family:${FONT};font-size:15px;line-height:24px;${LH};color:${TEXT}">
${body}
        </td></tr>

${footer(base, unsub)}
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ---------- Texto plano ----------
// Se manda siempre: un email sin alternativa de texto puntúa peor en los
// filtros de spam y es lo único que ven algunos lectores accesibles.

function textFooter(unsubUrl) {
  return `\n\n---\niPhone UP · ${STORE_ADDRESS}\n${STORE_HOURS}\nInstagram ${INSTAGRAM_HANDLE} — ${INSTAGRAM_URL}` +
    (unsubUrl ? `\n\nDarse de baja de estos avisos: ${unsubUrl}` : "");
}

function itemsText(items = []) {
  return (Array.isArray(items) ? items : []).map(it => {
    const qty = itemQty(it);
    return `  · ${itemLabel(it)}${qty > 1 ? ` x${qty}` : ""} — ${fmtCLP(Math.round(Number(it?.price) || 0) * qty)}`;
  }).join("\n");
}

function itemsTextNoPrice(items = []) {
  return (Array.isArray(items) ? items : []).map(it => {
    const qty = itemQty(it);
    return `  · ${itemLabel(it)}${qty > 1 ? ` x${qty}` : ""}`;
  }).join("\n");
}

function orderUrl(ctx, order) {
  return `${baseUrl(ctx)}/payment/success?order=${encodeURIComponent(order?.id || "")}`;
}

function greet(name) {
  const first = String(name || "").trim().split(/\s+/)[0];
  return first ? `Hola ${first},` : "Hola,";
}

// ---------- Deducción de datos de entrega ----------
function deliveryInfo(order) {
  const s = order?.shipping || {};
  const addr = s.address || {};
  const isPickup = s.method === "pickup" || s.serviceCode === "PICKUP";
  if (isPickup) {
    return { pickup: true, label: "Retiro en tienda", detail: addr.store || STORE_ADDRESS };
  }
  const parts = [addr.branch, addr.street, addr.number, addr.extra, addr.county, addr.region].filter(Boolean);
  return { pickup: false, label: "Despacho con Chilexpress", detail: parts.join(", ") || "Dirección registrada en tu orden" };
}

// =====================================================================
// TEMPLATES
// =====================================================================
// Cada template expone:
//   transactional  → true = se envía incluso si la persona se dio de baja
//                    (confirmaciones de algo que acaba de hacer/comprar).
//                    false = respeta la baja y lleva link de unsubscribe.
//   subject(ctx) / html(ctx) / text(ctx)
//
// `ctx` trae: { order, cart, buyer, publicUrl, unsubscribeUrl, coupon, config }

const templates = {
  // ---------------- Orden pagada ----------------
  order_paid: {
    transactional: true,
    subject: ctx => `Pago confirmado · orden ${ctx.order?.id || ""}`.trim(),
    html(ctx) {
      const o = ctx.order || {};
      const base = baseUrl(ctx);
      const d = deliveryInfo(o);
      const fee = Math.max(0, Math.round(Number(o.total) || 0) - Math.round(Number(o.subtotal) || 0) - Math.round(Number(o.shipping?.cost) || 0));
      const body = `
          ${paragraph(`${esc(greet(o.buyer?.name))} recibimos tu pago y ya estamos preparando tu pedido. Acá está el detalle.`)}
          ${infoBox(`Orden ${o.id || ""}`, dataList([
            { label: d.label, value: d.detail },
            o.shipping?.name ? { label: "Servicio", value: o.shipping.name } : null,
          ]), { tone: "accent" })}
          ${productCards(o.items, { base })}
          ${totalsBlock([
            { label: "Subtotal", value: fmtCLP(o.subtotal) },
            fee > 0 ? { label: "Comisión medio de pago", value: fmtCLP(fee) } : null,
            { label: "Envío", value: Number(o.shipping?.cost) > 0 ? fmtCLP(o.shipping.cost) : (d.pickup ? "Retiro en tienda" : "Por pagar al recibir") },
            { label: "Total pagado", value: fmtCLP(o.total), strong: true },
          ])}
          ${button(orderUrl(ctx, o), "Ver el estado de mi orden")}
          ${note(`Te avisamos por acá apenas salga de la tienda. Cualquier duda, respondé este correo o escribinos por ${instagramLink()}.`)}`;
      return layout({
        title: "Pago confirmado",
        eyebrow: "Pagado",
        lead: `Tu orden <strong style="color:${INK}">${esc(o.id || "")}</strong> ya está en preparación.`,
        preheader: `Recibimos tu pago — orden ${o.id || ""} en preparación.`,
        base,
        body,
      });
    },
    text(ctx) {
      const o = ctx.order || {};
      const d = deliveryInfo(o);
      return `${greet(o.buyer?.name)} recibimos tu pago. Ya estamos preparando tu pedido.

Orden: ${o.id || ""}
${d.label}: ${d.detail}

TU PEDIDO
${itemsText(o.items)}

Total pagado: ${fmtCLP(o.total)}

Estado de tu orden: ${orderUrl(ctx, o)}${textFooter()}`;
    },
  },

  // ---------------- Enviada ----------------
  order_shipped: {
    transactional: true,
    subject: ctx => `Tu pedido va en camino · orden ${ctx.order?.id || ""}`.trim(),
    html(ctx) {
      const o = ctx.order || {};
      const base = baseUrl(ctx);
      const d = deliveryInfo(o);
      const body = `
          ${paragraph(`${esc(greet(o.buyer?.name))} tu pedido ya salió de la tienda.`)}
          ${o.tracking_code ? trackingBox(o.tracking_carrier, o.tracking_code) : ""}
          ${infoBox(`Orden ${o.id || ""}`, dataList([{ label: d.label, value: d.detail }]), { tone: o.tracking_code ? "default" : "accent" })}
          ${productCards(o.items, { showPrice: false, base })}
          ${paragraph(esc(d.pickup
            ? `Ya podés pasar a retirarlo por ${d.detail}. Llevá tu cédula y el número de orden.`
            : `Va en camino a ${d.detail}.`), { top: 4 })}
          ${button(orderUrl(ctx, o), "Ver mi orden")}`;
      return layout({
        title: "Tu pedido va en camino",
        eyebrow: "En camino",
        eyebrowTone: "outline",
        lead: o.tracking_code
          ? `Seguilo con el código <strong style="color:${ACCENT}">${esc(o.tracking_code)}</strong>.`
          : "Ya salió de la tienda.",
        preheader: o.tracking_code ? `Seguimiento: ${o.tracking_code}` : "Ya salió de la tienda.",
        base,
        body,
      });
    },
    text(ctx) {
      const o = ctx.order || {};
      const d = deliveryInfo(o);
      return `${greet(o.buyer?.name)} tu pedido ya salió de la tienda.

Orden: ${o.id || ""}
${o.tracking_code ? `Seguimiento ${o.tracking_carrier || "Chilexpress"}: ${o.tracking_code}\n` : ""}${d.label}: ${d.detail}

TU PEDIDO
${itemsTextNoPrice(o.items)}

Ver mi orden: ${orderUrl(ctx, o)}${textFooter()}`;
    },
  },

  // ---------------- Entregada ----------------
  order_delivered: {
    transactional: true,
    subject: ctx => `Pedido entregado · orden ${ctx.order?.id || ""}`.trim(),
    html(ctx) {
      const o = ctx.order || {};
      const base = baseUrl(ctx);
      const body = `
          ${paragraph(`${esc(greet(o.buyer?.name))} tu pedido quedó entregado. ¡Gracias por comprar en iPhone UP!`)}
          ${productCards(o.items, { showPrice: false, base })}
          ${infoBox("Tu garantía", `
              ${WARRANTY_MONTHS} meses desde hoy sobre el equipo. Si algo no anda como esperabas, escribinos por ${instagramLink()} o pasá por la tienda.
              <div style="padding-top:10px">${dataList([
                { label: "Tienda", value: STORE_ADDRESS },
                { label: "Horario", value: STORE_HOURS },
              ])}</div>`, { tone: "accent" })}
          ${note(`Guardá este correo: junto con el número de orden <strong style="color:${TEXT}">${esc(o.id || "")}</strong> es tu comprobante.`)}`;
      return layout({
        title: "Pedido entregado",
        eyebrow: "Entregado",
        lead: `Tu iPhone ya está en tus manos. Tenés ${WARRANTY_MONTHS} meses de garantía.`,
        preheader: "Gracias por comprar en iPhone UP.",
        base,
        body,
      });
    },
    text(ctx) {
      const o = ctx.order || {};
      return `${greet(o.buyer?.name)} tu pedido quedó entregado. ¡Gracias por comprar en iPhone UP!

TU PEDIDO
${itemsTextNoPrice(o.items)}

Garantía: ${WARRANTY_MONTHS} meses desde hoy. Escribinos por Instagram ${INSTAGRAM_HANDLE} o pasá por ${STORE_ADDRESS}.
Comprobante: orden ${o.id || ""}${textFooter()}`;
    },
  },

  // ---------------- Recordatorio de carrito 1h ----------------
  cart_reminder_1h: {
    transactional: false,
    subject: ctx => {
      const first = (ctx.cart?.items || [])[0];
      return first ? `¿Seguimos con tu ${itemTitle(first)}?` : "Dejaste algo en tu carro";
    },
    html(ctx) {
      const c = ctx.cart || {};
      const base = baseUrl(ctx);
      const body = `
          ${paragraph(`${esc(greet(c.name))} guardamos tu carro tal como lo dejaste. Podés retomar la compra en un clic.`)}
          ${productCards(c.items, { base })}
          ${totalsBlock([{ label: "Subtotal", value: fmtCLP(c.subtotal), strong: true }])}
          ${ctx.coupon ? infoBox("Tenés un descuento", `
              Usá el código <span style="font-family:${MONO};font-size:15px;font-weight:700;color:${ACCENT}">${esc(ctx.coupon)}</span> al pagar.`, { tone: "accent" }) : ""}
          ${button(ctx.resumeUrl, "Retomar mi compra")}
          ${note(`Guardamos tu carro por ${esc(String(ctx.expireDays || 14))} días. El stock es limitado y no lo reservamos.`)}`;
      return layout({
        title: "Tu carro te espera",
        eyebrow: "Carro guardado",
        eyebrowTone: "outline",
        lead: "Retomá tu compra justo donde la dejaste.",
        preheader: "Tu carro sigue guardado — retomá la compra en un clic.",
        base,
        body,
        unsubscribeUrl: ctx.unsubscribeUrl,
      });
    },
    text(ctx) {
      const c = ctx.cart || {};
      return `${greet(c.name)} guardamos tu carro tal como lo dejaste.

TU CARRO
${itemsText(c.items)}

Subtotal: ${fmtCLP(c.subtotal)}
${ctx.coupon ? `\nDescuento: usá el código ${ctx.coupon} al pagar.\n` : ""}
Retomar mi compra: ${ctx.resumeUrl}

Guardamos tu carro por ${ctx.expireDays || 14} días. El stock es limitado y no lo reservamos.${textFooter(ctx.unsubscribeUrl)}`;
    },
  },

  // ---------------- Recordatorio de carrito 24h ----------------
  cart_reminder_24h: {
    transactional: false,
    subject: () => "Tu carro sigue guardado en iPhone UP",
    html(ctx) {
      const c = ctx.cart || {};
      const base = baseUrl(ctx);
      const body = `
          ${paragraph(`${esc(greet(c.name))} tu carro sigue acá. Si te quedó una duda sobre el equipo, escribinos por ${instagramLink()} y te la respondemos antes de que compres.`)}
          ${productCards(c.items, { base })}
          ${totalsBlock([{ label: "Subtotal", value: fmtCLP(c.subtotal), strong: true }])}
          ${ctx.coupon ? infoBox("Tenés un descuento", `
              Usá el código <span style="font-family:${MONO};font-size:15px;font-weight:700;color:${ACCENT}">${esc(ctx.coupon)}</span> al pagar.`, { tone: "accent" }) : ""}
          ${infoBox("Todos nuestros equipos incluyen", `
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr><td width="18" valign="top" style="font-family:${FONT};font-size:14px;line-height:22px;${LH};color:${ACCENT}">✓</td><td style="font-family:${FONT};font-size:14px;line-height:22px;${LH};color:${TEXT}">Batería sobre 85%</td></tr>
                <tr><td width="18" valign="top" style="font-family:${FONT};font-size:14px;line-height:22px;${LH};color:${ACCENT}">✓</td><td style="font-family:${FONT};font-size:14px;line-height:22px;${LH};color:${TEXT}">Revisión técnica completa</td></tr>
                <tr><td width="18" valign="top" style="font-family:${FONT};font-size:14px;line-height:22px;${LH};color:${ACCENT}">✓</td><td style="font-family:${FONT};font-size:14px;line-height:22px;${LH};color:${TEXT}">${WARRANTY_MONTHS} meses de garantía y factura</td></tr>
                <tr><td width="18" valign="top" style="font-family:${FONT};font-size:14px;line-height:22px;${LH};color:${ACCENT}">✓</td><td style="font-family:${FONT};font-size:14px;line-height:22px;${LH};color:${TEXT}">Podés pasar a verlo antes de pagar</td></tr>
              </table>`)}
          ${button(ctx.resumeUrl, "Terminar mi compra")}
          ${note("Este es el último recordatorio que te enviamos por este carro.")}`;
      return layout({
        title: "¿Te quedó una duda?",
        eyebrow: "Último recordatorio",
        eyebrowTone: "outline",
        lead: "Tu carro sigue guardado. Te ayudamos a decidir.",
        preheader: "Tu carro sigue guardado. Te ayudamos a decidir.",
        base,
        body,
        unsubscribeUrl: ctx.unsubscribeUrl,
      });
    },
    text(ctx) {
      const c = ctx.cart || {};
      return `${greet(c.name)} tu carro sigue acá.

TU CARRO
${itemsText(c.items)}

Subtotal: ${fmtCLP(c.subtotal)}
${ctx.coupon ? `\nDescuento: usá el código ${ctx.coupon} al pagar.\n` : ""}
Todos nuestros equipos incluyen batería sobre 85%, revisión técnica, ${WARRANTY_MONTHS} meses de garantía y factura.

Terminar mi compra: ${ctx.resumeUrl}

Este es el último recordatorio que te enviamos por este carro.${textFooter(ctx.unsubscribeUrl)}`;
    },
  },

  // ---------------- Follow-up post entrega ----------------
  followup_delivered: {
    transactional: false,
    subject: () => "¿Cómo te fue con tu iPhone?",
    html(ctx) {
      const o = ctx.order || {};
      const base = baseUrl(ctx);
      const body = `
          ${paragraph(`${esc(greet(o.buyer?.name))} pasaron unos días desde que recibiste tu pedido. ¿Todo bien con el equipo?`)}
          ${productCards(o.items, { showPrice: false, base })}
          ${infoBox("Si algo no anda", `
              Tenés ${WARRANTY_MONTHS} meses de garantía. Escribinos por ${instagramLink()} o pasá por ${esc(STORE_ADDRESS)} y lo revisamos.`, { tone: "accent" })}
          ${divider()}
          ${paragraph(`<strong style="color:${INK}">Dos cosas que nos ayudan mucho</strong>`, { bottom: 8 })}
          ${paragraph(`<strong style="color:${ACCENT}">1.</strong> Contarle a alguien más. Si conocés a alguien buscando un iPhone, mandale nuestro ${instagramLink()}.`, { size: 14, bottom: 8 })}
          ${paragraph(`<strong style="color:${ACCENT}">2.</strong> ¿Te quedó un equipo viejo dando vueltas? Lo compramos y te lo descontamos de tu próxima compra.`, { size: 14, bottom: 0 })}
          ${button(`${base}/vende-tu-iphone`, "Cotizar mi iPhone usado", { tone: "ghost" })}`;
      return layout({
        title: "¿Cómo te fue con tu iPhone?",
        eyebrow: "Post venta",
        eyebrowTone: "ghost",
        lead: "Contanos si todo salió bien — y qué hacemos con tu equipo viejo.",
        preheader: "Contanos si todo salió bien.",
        base,
        body,
        unsubscribeUrl: ctx.unsubscribeUrl,
      });
    },
    text(ctx) {
      const o = ctx.order || {};
      const base = baseUrl(ctx);
      return `${greet(o.buyer?.name)} pasaron unos días desde que recibiste tu pedido. ¿Todo bien con el equipo?

TU PEDIDO
${itemsTextNoPrice(o.items)}

Si algo no anda: tenés ${WARRANTY_MONTHS} meses de garantía. Escribinos por Instagram ${INSTAGRAM_HANDLE} o pasá por ${STORE_ADDRESS}.

¿Te quedó un equipo viejo? Lo compramos: ${base}/vende-tu-iphone${textFooter(ctx.unsubscribeUrl)}`;
    },
  },

  // ---------------- Aviso interno de venta ----------------
  // Va a `emailsInternalTo` (configurable). Si está vacío no se envía nada.
  internal_new_order: {
    transactional: true,
    subject: ctx => `🟢 Venta ${fmtCLP(ctx.order?.total)} · ${ctx.order?.id || ""}`,
    html(ctx) {
      const o = ctx.order || {};
      const base = baseUrl(ctx);
      const d = deliveryInfo(o);
      const b = o.buyer || {};
      const body = `
          ${infoBox("Comprador", dataList([
            { label: "Nombre", value: b.name || "—" },
            { label: "Email", value: b.email || "—" },
            { label: "Teléfono", value: b.phone || "—" },
            { label: "RUT", value: b.rut || "—" },
            { label: "Instagram", value: b.instagram || "—" },
          ]), { tone: "accent" })}
          ${infoBox("Entrega", dataList([
            { label: d.label, value: d.detail },
            o.shipping?.name ? { label: "Servicio", value: o.shipping.name } : null,
          ]))}
          ${productCards(o.items, { base })}
          ${totalsBlock([
            { label: "Subtotal", value: fmtCLP(o.subtotal) },
            Number(o.shipping?.cost) > 0 ? { label: "Envío", value: fmtCLP(o.shipping.cost) } : null,
            { label: "Total", value: fmtCLP(o.total), strong: true },
          ])}
          ${button(`${base}/admin`, "Abrir el panel")}`;
      return layout({
        title: "Nueva venta pagada",
        eyebrow: "Venta",
        lead: `Orden <strong style="color:${INK}">${esc(o.id || "")}</strong> por <strong style="color:${ACCENT}">${esc(fmtCLP(o.total))}</strong>.`,
        preheader: `${o.id || ""} · ${fmtCLP(o.total)}`,
        base,
        body,
      });
    },
    text(ctx) {
      const o = ctx.order || {};
      const d = deliveryInfo(o);
      const b = o.buyer || {};
      return `Nueva venta pagada.

Orden: ${o.id || ""}
Total: ${fmtCLP(o.total)}
Cliente: ${b.name || "—"} · ${b.email || "—"} · ${b.phone || "—"}
RUT: ${b.rut || "—"} · Instagram: ${b.instagram || "—"}
${d.label}: ${d.detail}

ITEMS
${itemsText(o.items)}

Panel: ${baseUrl(ctx)}/admin${textFooter()}`;
    },
  },

  // ---------------- Prueba desde el admin ----------------
  test: {
    transactional: true,
    subject: () => "Prueba de emails · iPhone UP",
    html(ctx) {
      const base = baseUrl(ctx);
      const body = `
          ${paragraph("Si estás leyendo esto, el envío de emails está funcionando y el diseño llega entero a tu bandeja.")}
          ${infoBox("Configuración activa", dataList([
            { label: "Remitente", value: ctx.config?.from || "—" },
            { label: "Reply-To", value: ctx.config?.replyTo || "(sin configurar)" },
            { label: "Avisos internos", value: ctx.config?.internalTo || "(desactivados)" },
            { label: "Proveedor", value: ctx.providerLabel || "dry-run" },
            { label: "URL pública", value: base || "(sin configurar)" },
          ]), { tone: "accent" })}
          ${infoBox("Qué mirar en esta prueba", `
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr><td width="18" valign="top" style="font-family:${FONT};font-size:14px;line-height:22px;${LH};color:${ACCENT}">✓</td><td style="font-family:${FONT};font-size:14px;line-height:22px;${LH};color:${TEXT}">El logo de arriba se ve (si no, revisá PUBLIC_URL)</td></tr>
                <tr><td width="18" valign="top" style="font-family:${FONT};font-size:14px;line-height:22px;${LH};color:${ACCENT}">✓</td><td style="font-family:${FONT};font-size:14px;line-height:22px;${LH};color:${TEXT}">El fondo es negro y el acento lima</td></tr>
                <tr><td width="18" valign="top" style="font-family:${FONT};font-size:14px;line-height:22px;${LH};color:${ACCENT}">✓</td><td style="font-family:${FONT};font-size:14px;line-height:22px;${LH};color:${TEXT}">El botón de abajo es un rectángulo lima, no un link suelto</td></tr>
              </table>`)}
          ${button(base || INSTAGRAM_URL, "Ir al sitio")}
          ${note("Enviado desde Ajustes → Emails del panel de iPhone UP.")}`;
      return layout({
        title: "Prueba de emails",
        eyebrow: "Sistema",
        lead: "El envío de emails está funcionando.",
        preheader: "El envío de emails está funcionando.",
        base,
        body,
      });
    },
    text(ctx) {
      return `Si estás leyendo esto, el envío de emails está funcionando.

Remitente: ${ctx.config?.from || "—"}
Reply-To: ${ctx.config?.replyTo || "(sin configurar)"}
Avisos internos: ${ctx.config?.internalTo || "(desactivados)"}
Proveedor: ${ctx.providerLabel || "dry-run"}
URL pública: ${baseUrl(ctx) || "(sin configurar)"}${textFooter()}`;
    },
  },
};

/** Nombres de template válidos (los usa el mailer y el panel). */
const TEMPLATE_IDS = Object.keys(templates);

/** Etiquetas legibles para el panel. */
const TEMPLATE_LABELS = {
  order_paid: "Pago confirmado",
  order_shipped: "Pedido enviado",
  order_delivered: "Pedido entregado",
  cart_reminder_1h: "Carro abandonado (1ª)",
  cart_reminder_24h: "Carro abandonado (2ª)",
  followup_delivered: "Follow-up post entrega",
  internal_new_order: "Aviso interno de venta",
  test: "Prueba",
};

function get(id) {
  return templates[id] || null;
}

/**
 * Renderiza un template. Devuelve { subject, html, text, transactional }.
 * Lanza si el template no existe (error de programación, no de datos).
 */
function render(id, ctx = {}) {
  const t = get(id);
  if (!t) throw new Error(`template desconocido: ${id}`);
  return {
    subject: String(t.subject(ctx) || "").slice(0, 200),
    html: t.html(ctx),
    text: t.text(ctx),
    transactional: t.transactional !== false,
  };
}

module.exports = {
  render, get, esc, safeUrl, fmtCLP, TEMPLATE_IDS, TEMPLATE_LABELS,
  ACCENT, BG, CARD, INK, MUTED,
};
