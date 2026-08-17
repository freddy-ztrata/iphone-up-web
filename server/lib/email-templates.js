// Templates de email en HTML + texto plano.
//
// REGLA DURA: todo dato que venga de fuera (nombre del comprador, dirección,
// notas del admin, nombre de producto, código de tracking) se interpola con
// esc() o no se interpola. El nombre lo escribe un tercero en el checkout
// público, así que un `<img src=x onerror=...>` ahí termina en la bandeja de
// otra persona y en el HTML que Resend guarda. Los únicos strings que entran
// crudos son los que arma este archivo.
//
// Diseño: fondo claro, texto casi negro, acento lima (#A4E83A) en botones y
// detalles. Deliberadamente NO es el dark neon del sitio: los clientes de
// correo recortan estilos, muchos fuerzan su propio tema y un fondo negro con
// texto lima queda ilegible en la mitad de ellos (y castiga la entregabilidad).
// Layout con <table> y max-width 600px porque Outlook sigue sin soportar flex.

const ACCENT = "#A4E83A";
const INK = "#111111";
const MUTED = "#6B7280";
const BORDER = "#E5E7EB";
const CANVAS = "#F4F5F2";

const STORE_ADDRESS = "Padre Mariano 98, Of. 105 — Providencia, Santiago";
const INSTAGRAM_URL = "https://www.instagram.com/iphoneup.cl/";
const INSTAGRAM_HANDLE = "@iphoneup.cl";
const WHATSAPP_URL = "https://wa.me/56983265824";

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
 * otro esquema (javascript:, data:, vbscript:) se descarta. Aplica a las
 * imágenes de producto, que salen de la DB pero las sube un humano.
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

/** Etiqueta legible de un item del carro/orden. Devuelve texto SIN escapar. */
function itemLabel(item) {
  return [item?.model, item?.storage, item?.color].filter(Boolean).join(" · ") || "Producto";
}

// ---------- Layout ----------

function button(href, label) {
  const url = safeUrl(href);
  if (!url) return "";
  return `
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0">
          <tr><td align="center" bgcolor="${ACCENT}" style="border-radius:10px">
            <a href="${url}" style="display:inline-block;padding:14px 28px;font-family:Helvetica,Arial,sans-serif;font-size:15px;font-weight:700;color:${INK};text-decoration:none;border-radius:10px">${esc(label)}</a>
          </td></tr>
        </table>`;
}

/** Tabla de items con precio. `items` es el shape del carro. */
function itemsTable(items = [], { showPrice = true } = {}) {
  const rows = (Array.isArray(items) ? items : []).map(it => {
    const qty = Math.max(1, Math.round(Number(it?.qty) || 1));
    const price = Math.round(Number(it?.price) || 0) * qty;
    const badge = it?.sealed ? "Sellado" : "Seminuevo A+";
    return `
          <tr>
            <td style="padding:12px 0;border-bottom:1px solid ${BORDER};font-family:Helvetica,Arial,sans-serif;font-size:14px;color:${INK}">
              <strong>${esc(itemLabel(it))}</strong>${qty > 1 ? ` <span style="color:${MUTED}">× ${qty}</span>` : ""}
              <div style="font-size:12px;color:${MUTED};margin-top:3px">${esc(badge)}</div>
            </td>
            ${showPrice ? `<td align="right" style="padding:12px 0;border-bottom:1px solid ${BORDER};font-family:Helvetica,Arial,sans-serif;font-size:14px;color:${INK};white-space:nowrap">${esc(fmtCLP(price))}</td>` : ""}
          </tr>`;
  }).join("");
  if (!rows) return "";
  return `
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 4px">${rows}
        </table>`;
}

function totalsBlock(lines = []) {
  const rows = lines.filter(Boolean).map(l => `
          <tr>
            <td style="padding:5px 0;font-family:Helvetica,Arial,sans-serif;font-size:${l.strong ? "16px" : "14px"};color:${l.strong ? INK : MUTED};${l.strong ? "font-weight:700;padding-top:12px" : ""}">${esc(l.label)}</td>
            <td align="right" style="padding:5px 0;font-family:Helvetica,Arial,sans-serif;font-size:${l.strong ? "16px" : "14px"};color:${INK};${l.strong ? "font-weight:700;padding-top:12px" : ""};white-space:nowrap">${esc(l.value)}</td>
          </tr>`).join("");
  return `
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:2px solid ${INK};margin-top:4px">${rows}
        </table>`;
}

function infoBox(title, htmlBody) {
  return `
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${CANVAS};border-radius:12px;margin:20px 0">
          <tr><td style="padding:16px 18px;font-family:Helvetica,Arial,sans-serif;font-size:14px;color:${INK};line-height:1.55">
            <strong style="display:block;margin-bottom:6px">${esc(title)}</strong>
            ${htmlBody}
          </td></tr>
        </table>`;
}

/**
 * Envuelve el cuerpo en el layout base.
 * @param {object} opts
 * @param {string} opts.title       h1 del email
 * @param {string} opts.preheader   texto de vista previa (oculto en el cuerpo)
 * @param {string} opts.body        HTML ya escapado por quien lo construyó
 * @param {string} [opts.unsubscribeUrl] si viene, se pinta el link de baja
 */
function layout({ title, preheader, body, unsubscribeUrl }) {
  const unsub = safeUrl(unsubscribeUrl);
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light only">
<title>${esc(title)}</title>
</head>
<body style="margin:0;padding:0;background:${CANVAS};-webkit-text-size-adjust:100%">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(preheader || "")}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${CANVAS};padding:24px 12px">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background:#FFFFFF;border-radius:16px;overflow:hidden">

        <tr><td style="background:${INK};padding:20px 28px">
          <span style="font-family:Helvetica,Arial,sans-serif;font-size:18px;font-weight:800;color:#FFFFFF;letter-spacing:-0.02em">iPhone&nbsp;UP</span>
          <span style="display:inline-block;width:8px;height:8px;background:${ACCENT};border-radius:50%;margin-left:6px;vertical-align:middle"></span>
        </td></tr>

        <tr><td style="padding:28px 28px 8px">
          <h1 style="margin:0 0 12px;font-family:Helvetica,Arial,sans-serif;font-size:22px;line-height:1.3;font-weight:800;color:${INK}">${esc(title)}</h1>
        </td></tr>

        <tr><td style="padding:0 28px 24px;font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:${INK}">
${body}
        </td></tr>

        <tr><td style="padding:20px 28px 26px;border-top:1px solid ${BORDER};font-family:Helvetica,Arial,sans-serif;font-size:12px;line-height:1.6;color:${MUTED}">
          <strong style="color:${INK}">iPhone UP</strong> · ${esc(STORE_ADDRESS)}<br>
          <a href="${INSTAGRAM_URL}" style="color:${MUTED}">Instagram ${esc(INSTAGRAM_HANDLE)}</a> ·
          <a href="${WHATSAPP_URL}" style="color:${MUTED}">WhatsApp</a>
          ${unsub ? `<br><br><a href="${unsub}" style="color:${MUTED};text-decoration:underline">No quiero recibir más estos correos</a>` : ""}
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// Texto plano: mismo contenido, sin HTML. Se manda siempre — un email sin
// alternativa de texto puntúa peor en los filtros de spam.
function textFooter(unsubUrl) {
  return `\n---\niPhone UP · ${STORE_ADDRESS}\nInstagram ${INSTAGRAM_HANDLE} · ${WHATSAPP_URL}` +
    (unsubUrl ? `\nDarse de baja de estos avisos: ${unsubUrl}` : "");
}

function itemsText(items = []) {
  return (Array.isArray(items) ? items : []).map(it => {
    const qty = Math.max(1, Math.round(Number(it?.qty) || 1));
    return `  · ${itemLabel(it)}${qty > 1 ? ` x${qty}` : ""} — ${fmtCLP(Math.round(Number(it?.price) || 0) * qty)}`;
  }).join("\n");
}

function orderUrl(ctx, order) {
  const base = String(ctx.publicUrl || "").replace(/\/$/, "");
  return `${base}/payment/success?order=${encodeURIComponent(order?.id || "")}`;
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
  const parts = [addr.branch, addr.street, addr.number, addr.county, addr.region].filter(Boolean);
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
      const d = deliveryInfo(o);
      const fee = Math.max(0, Math.round(Number(o.total) || 0) - Math.round(Number(o.subtotal) || 0) - Math.round(Number(o.shipping?.cost) || 0));
      const body = `
          <p style="margin:0 0 14px">${esc(greet(o.buyer?.name))} recibimos tu pago. Ya estamos preparando tu pedido.</p>
          ${infoBox(`Orden ${o.id || ""}`, `<span style="color:${MUTED}">${esc(d.label)}</span><br>${esc(d.detail)}`)}
          ${itemsTable(o.items)}
          ${totalsBlock([
            { label: "Subtotal", value: fmtCLP(o.subtotal) },
            fee > 0 ? { label: "Comisión medio de pago", value: fmtCLP(fee) } : null,
            { label: "Envío", value: Number(o.shipping?.cost) > 0 ? fmtCLP(o.shipping.cost) : (d.pickup ? "Retiro en tienda" : "Por pagar al recibir") },
            { label: "Total pagado", value: fmtCLP(o.total), strong: true },
          ])}
          ${button(orderUrl(ctx, o), "Ver el estado de mi orden")}
          <p style="margin:0;color:${MUTED};font-size:13px">Te avisamos por acá cuando salga de la tienda. Cualquier duda, respondé este correo o escribinos por Instagram.</p>`;
      return layout({ title: "Pago confirmado ✅", preheader: `Tu orden ${o.id || ""} ya está en preparación.`, body });
    },
    text(ctx) {
      const o = ctx.order || {};
      const d = deliveryInfo(o);
      return `${greet(o.buyer?.name)} recibimos tu pago. Ya estamos preparando tu pedido.

Orden: ${o.id || ""}
${d.label}: ${d.detail}

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
      const d = deliveryInfo(o);
      const tracking = o.tracking_code ? `
            <span style="color:${MUTED}">Seguimiento ${esc(o.tracking_carrier || "Chilexpress")}</span><br>
            <strong style="font-family:Menlo,Consolas,monospace;font-size:15px">${esc(o.tracking_code)}</strong>` : "";
      const body = `
          <p style="margin:0 0 14px">${esc(greet(o.buyer?.name))} tu pedido ya salió de la tienda.</p>
          ${tracking ? infoBox(`Orden ${o.id || ""}`, tracking) : infoBox(`Orden ${o.id || ""}`, `<span style="color:${MUTED}">${esc(d.label)}</span><br>${esc(d.detail)}`)}
          ${itemsTable(o.items, { showPrice: false })}
          <p style="margin:16px 0 0">${esc(d.pickup
            ? "Ya podés pasar a retirarlo por " + d.detail + ". Llevá tu cédula y el número de orden."
            : "Va a " + d.detail + ". El costo del despacho se paga al recibir.")}</p>
          ${button(orderUrl(ctx, o), "Ver mi orden")}`;
      return layout({ title: "Tu pedido va en camino 🚚", preheader: o.tracking_code ? `Seguimiento: ${o.tracking_code}` : "Ya salió de la tienda.", body });
    },
    text(ctx) {
      const o = ctx.order || {};
      const d = deliveryInfo(o);
      return `${greet(o.buyer?.name)} tu pedido ya salió de la tienda.

Orden: ${o.id || ""}
${o.tracking_code ? `Seguimiento ${o.tracking_carrier || "Chilexpress"}: ${o.tracking_code}\n` : ""}${d.label}: ${d.detail}

${itemsText(o.items)}

Ver mi orden: ${orderUrl(ctx, o)}${textFooter()}`;
    },
  },

  // ---------------- Entregada ----------------
  order_delivered: {
    transactional: true,
    subject: ctx => `Pedido entregado · orden ${ctx.order?.id || ""}`.trim(),
    html(ctx) {
      const o = ctx.order || {};
      const body = `
          <p style="margin:0 0 14px">${esc(greet(o.buyer?.name))} tu pedido quedó entregado. ¡Gracias por comprar en iPhone UP!</p>
          ${itemsTable(o.items, { showPrice: false })}
          ${infoBox("Tu garantía", `6 meses desde hoy sobre el equipo. Si algo no anda como esperabas, escribinos por Instagram (${esc(INSTAGRAM_HANDLE)}) o pasá por la tienda: ${esc(STORE_ADDRESS)}.`)}
          <p style="margin:0;color:${MUTED};font-size:13px">Guardá este correo: junto con el número de orden ${esc(o.id || "")} es tu comprobante.</p>`;
      return layout({ title: "Pedido entregado 🎉", preheader: "Gracias por comprar en iPhone UP.", body });
    },
    text(ctx) {
      const o = ctx.order || {};
      return `${greet(o.buyer?.name)} tu pedido quedó entregado. ¡Gracias por comprar en iPhone UP!

${itemsText(o.items)}

Garantía: 6 meses desde hoy. Escribinos por Instagram ${INSTAGRAM_HANDLE} o pasá por ${STORE_ADDRESS}.
Comprobante: orden ${o.id || ""}${textFooter()}`;
    },
  },

  // ---------------- Recordatorio de carrito 1h ----------------
  cart_reminder_1h: {
    transactional: false,
    subject: ctx => {
      const first = (ctx.cart?.items || [])[0];
      return first ? `¿Seguimos con tu ${itemLabel(first).split(" · ")[0]}?` : "Dejaste algo en tu carro";
    },
    html(ctx) {
      const c = ctx.cart || {};
      const body = `
          <p style="margin:0 0 14px">${esc(greet(c.name))} guardamos tu carro tal como lo dejaste. Podés retomar la compra en un clic.</p>
          ${itemsTable(c.items)}
          ${totalsBlock([{ label: "Subtotal", value: fmtCLP(c.subtotal), strong: true }])}
          ${ctx.coupon ? infoBox("Tenés un descuento", `Usá el código <strong style="font-family:Menlo,Consolas,monospace">${esc(ctx.coupon)}</strong> al pagar.`) : ""}
          ${button(ctx.resumeUrl, "Retomar mi compra")}
          <p style="margin:0;color:${MUTED};font-size:13px">Guardamos tu carro por ${esc(String(ctx.expireDays || 14))} días. El stock es limitado y no lo reservamos.</p>`;
      return layout({
        title: "Tu carro te espera",
        preheader: "Retomá tu compra donde la dejaste.",
        body,
        unsubscribeUrl: ctx.unsubscribeUrl,
      });
    },
    text(ctx) {
      const c = ctx.cart || {};
      return `${greet(c.name)} guardamos tu carro tal como lo dejaste.

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
      const body = `
          <p style="margin:0 0 14px">${esc(greet(c.name))} tu carro sigue acá. Si tenías dudas sobre el equipo, te las respondemos por Instagram o WhatsApp antes de que compres.</p>
          ${itemsTable(c.items)}
          ${totalsBlock([{ label: "Subtotal", value: fmtCLP(c.subtotal), strong: true }])}
          ${ctx.coupon ? infoBox("Tenés un descuento", `Usá el código <strong style="font-family:Menlo,Consolas,monospace">${esc(ctx.coupon)}</strong> al pagar.`) : ""}
          ${infoBox("Todos nuestros equipos incluyen", "Batería sobre 85%, revisión técnica completa, 6 meses de garantía y factura. Podés pasar a verlo antes de pagar.")}
          ${button(ctx.resumeUrl, "Terminar mi compra")}
          <p style="margin:0;color:${MUTED};font-size:13px">Este es el último recordatorio que te enviamos por este carro.</p>`;
      return layout({
        title: "¿Te quedó una duda?",
        preheader: "Tu carro sigue guardado. Te ayudamos a decidir.",
        body,
        unsubscribeUrl: ctx.unsubscribeUrl,
      });
    },
    text(ctx) {
      const c = ctx.cart || {};
      return `${greet(c.name)} tu carro sigue acá.

${itemsText(c.items)}

Subtotal: ${fmtCLP(c.subtotal)}
${ctx.coupon ? `\nDescuento: usá el código ${ctx.coupon} al pagar.\n` : ""}
Todos nuestros equipos incluyen batería sobre 85%, revisión técnica, 6 meses de garantía y factura.

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
      const body = `
          <p style="margin:0 0 14px">${esc(greet(o.buyer?.name))} pasaron unos días desde que recibiste tu pedido. ¿Todo bien con el equipo?</p>
          ${itemsTable(o.items, { showPrice: false })}
          ${infoBox("Si algo no anda", `Tenés ${esc(String(6))} meses de garantía. Escribinos por Instagram (${esc(INSTAGRAM_HANDLE)}) o pasá por ${esc(STORE_ADDRESS)} y lo revisamos.`)}
          <p style="margin:0 0 6px"><strong>Dos cosas que nos ayudan mucho:</strong></p>
          <p style="margin:0 0 6px">1. Contarle a alguien más. Si conocés a alguien buscando iPhone, mandale nuestro Instagram.</p>
          <p style="margin:0 0 14px">2. ¿Te quedó un equipo viejo dando vueltas? Lo compramos y te lo descontamos de tu próxima compra.</p>
          ${button(`${String(ctx.publicUrl || "").replace(/\/$/, "")}/vende-tu-iphone`, "Cotizar mi iPhone usado")}`;
      return layout({
        title: "¿Cómo te fue con tu iPhone?",
        preheader: "Contanos si todo salió bien.",
        body,
        unsubscribeUrl: ctx.unsubscribeUrl,
      });
    },
    text(ctx) {
      const o = ctx.order || {};
      const base = String(ctx.publicUrl || "").replace(/\/$/, "");
      return `${greet(o.buyer?.name)} pasaron unos días desde que recibiste tu pedido. ¿Todo bien con el equipo?

${itemsText(o.items)}

Si algo no anda: tenés 6 meses de garantía. Escribinos por Instagram ${INSTAGRAM_HANDLE} o pasá por ${STORE_ADDRESS}.

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
      const d = deliveryInfo(o);
      const b = o.buyer || {};
      const base = String(ctx.publicUrl || "").replace(/\/$/, "");
      const body = `
          ${infoBox(`Orden ${o.id || ""} — ${fmtCLP(o.total)}`, `
            <span style="color:${MUTED}">Cliente</span> ${esc(b.name || "—")}<br>
            <span style="color:${MUTED}">Email</span> ${esc(b.email || "—")}<br>
            <span style="color:${MUTED}">Teléfono</span> ${esc(b.phone || "—")}<br>
            <span style="color:${MUTED}">RUT</span> ${esc(b.rut || "—")}<br>
            <span style="color:${MUTED}">Instagram</span> ${esc(b.instagram || "—")}<br>
            <span style="color:${MUTED}">${esc(d.label)}</span> ${esc(d.detail)}`)}
          ${itemsTable(o.items)}
          ${totalsBlock([{ label: "Total", value: fmtCLP(o.total), strong: true }])}
          ${button(`${base}/admin`, "Abrir el panel")}`;
      return layout({ title: "Nueva venta pagada", preheader: `${o.id || ""} · ${fmtCLP(o.total)}`, body });
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

${itemsText(o.items)}

Panel: ${String(ctx.publicUrl || "").replace(/\/$/, "")}/admin${textFooter()}`;
    },
  },

  // ---------------- Prueba desde el admin ----------------
  test: {
    transactional: true,
    subject: () => "Prueba de emails · iPhone UP",
    html(ctx) {
      const body = `
          <p style="margin:0 0 14px">Si estás leyendo esto, el envío de emails está funcionando.</p>
          ${infoBox("Configuración activa", `
            <span style="color:${MUTED}">Remitente</span> ${esc(ctx.config?.from || "")}<br>
            <span style="color:${MUTED}">Reply-To</span> ${esc(ctx.config?.replyTo || "(sin configurar)")}<br>
            <span style="color:${MUTED}">Avisos internos</span> ${esc(ctx.config?.internalTo || "(desactivados)")}<br>
            <span style="color:${MUTED}">Proveedor</span> ${esc(ctx.providerLabel || "dry-run")}`)}
          <p style="margin:0;color:${MUTED};font-size:13px">Enviado desde Ajustes → Emails del panel de iPhone UP.</p>`;
      return layout({ title: "Prueba de emails ✅", preheader: "El envío de emails está funcionando.", body });
    },
    text(ctx) {
      return `Si estás leyendo esto, el envío de emails está funcionando.

Remitente: ${ctx.config?.from || ""}
Reply-To: ${ctx.config?.replyTo || "(sin configurar)"}
Avisos internos: ${ctx.config?.internalTo || "(desactivados)"}
Proveedor: ${ctx.providerLabel || "dry-run"}${textFooter()}`;
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

module.exports = { render, get, esc, safeUrl, fmtCLP, TEMPLATE_IDS, TEMPLATE_LABELS, ACCENT };
