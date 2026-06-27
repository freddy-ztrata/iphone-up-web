// iPhone UP — página de detalle de producto
// Lee ?id=<línea>&model=<slug> y renderiza UN modelo (variaciones = capacidad × color).
// Compatibilidad: links viejos ?id=<línea>&m=<idx> siguen resolviendo al modelo correcto.

const CATALOG = window.CATALOG;
const fmtCLP = window.fmtCLP;

const $ = (sel, root=document) => root.querySelector(sel);
const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));
const el = (tag, attrs={}, children=[]) => {
  const e = document.createElement(tag);
  for (const k in attrs) {
    if (k === "class") e.className = attrs[k];
    else if (k === "style") e.style.cssText = attrs[k];
    else if (k.startsWith("on") && typeof attrs[k] === "function") e.addEventListener(k.slice(2), attrs[k]);
    else if (k === "html") e.innerHTML = attrs[k];
    else e.setAttribute(k, attrs[k]);
  }
  (Array.isArray(children) ? children : [children]).forEach(c => {
    if (c == null || c === false) return;
    e.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
  });
  return e;
};

function parseQuery() {
  const p = new URLSearchParams(window.location.search);
  return {
    id: parseInt(p.get("id"), 10),
    model: p.get("model") || "",
    m: Math.max(0, parseInt(p.get("m"), 10) || 0),
    hasM: p.get("m") !== null,
    cap: p.get("cap") || "",
    col: p.get("col") || "",
  };
}

const state = {
  phone: null,   // la entrada del catálogo = UN modelo
  capSel: "",
  colorSel: "",
};

function init() {
  const q = parseQuery();
  // CATALOG es plano: 1 entrada por modelo. Varias comparten id (la línea).
  const matches = CATALOG.filter(p => p.id === q.id);
  let phone = null;
  if (matches.length) {
    if (q.model) phone = matches.find(e => e.slug === q.model) || null;
    if (!phone && q.hasM) phone = matches[Math.min(q.m, matches.length - 1)]; // compat ?m=
    if (!phone) phone = matches[0];
  }
  if (!phone) {
    $("#product-root").style.display = "none";
    $("#product-error").style.display = "block";
    $("#bc-current").textContent = "No encontrado";
    document.title = "iPhone UP — Modelo no encontrado";
    return;
  }
  state.phone = phone;
  state.capSel = q.cap;
  state.colorSel = q.col;

  renderAll();
  bindGlobalUI();
  renderRelated();
  $("#footer-year").textContent = new Date().getFullYear();
}

function currentModel() {
  return state.phone;
}
// Variantes = capacidad × color. Helpers para el selector 2D.
function modelCaps(model) {
  const out = [];
  (model.storages || []).forEach(v => { if (!out.includes(v.s)) out.push(v.s); });
  return out;
}
function capColors(model, cap) {
  const out = [];
  (model.storages || []).forEach(v => { if (v.s === cap) { const c = v.color || ""; if (!out.includes(c)) out.push(c); } });
  return out;
}
function findVariant(model, cap, color) {
  return (model.storages || []).find(v => v.s === cap && (v.color || "") === (color || "")) || null;
}
function ensureSelection() {
  const model = currentModel();
  const caps = modelCaps(model);
  if (!caps.includes(state.capSel)) state.capSel = caps[0] || "";
  const colors = capColors(model, state.capSel);
  if (!colors.includes(state.colorSel)) state.colorSel = colors[0] || "";
}
function currentVariant() {
  ensureSelection();
  return findVariant(currentModel(), state.capSel, state.colorSel) || (currentModel().storages || [])[0] || { s: "", p: 0 };
}

function renderAll() {
  const phone = state.phone;
  const model = currentModel();
  const variant = currentVariant();

  $("#bc-current").textContent = model.name;
  $("#product-line-label").textContent = `· iPhone ${phone.line} · ${phone.year}`;
  $("#product-title").textContent = model.name;

  // Image — main + gallery thumbnails
  const mainImg = model.img || phone.lineImg;
  $("#product-img").src = mainImg;
  $("#product-img").alt = model.name;
  renderThumbs(model, mainImg);

  // Sealed badge
  $("#product-badge").style.display = model.sealed ? "inline-block" : "none";

  // Condition pill
  $("#product-condition-pill").textContent = model.sealed ? "Sellado en caja" : "Seminuevo A+";
  $("#product-year-pill").textContent = String(phone.year);

  // (sin selector de modelo — cada producto es un único modelo; ocultamos la sección)
  const vWrap = $("#product-variants");
  if (vWrap) {
    vWrap.innerHTML = "";
    vWrap.style.display = "none";
    if (vWrap.previousElementSibling) vWrap.previousElementSibling.style.display = "none";
  }

  // Capacidades (distinct entre variantes activas)
  const sWrap = $("#product-storages");
  sWrap.innerHTML = "";
  const caps = modelCaps(model);
  caps.forEach(cap => {
    const minP = Math.min(...model.storages.filter(v => v.s === cap).map(v => v.p));
    const btn = el("button", {
      class: "storage-pill big" + (cap === state.capSel ? " active" : ""),
      onclick: () => { state.capSel = cap; state.colorSel = ""; ensureSelection(); pushUrl(); renderAll(); },
    }, [
      el("span", { class: "sp-cap" }, cap),
      el("span", { class: "sp-price" }, fmtCLP(minP)),
    ]);
    sWrap.appendChild(btn);
  });

  // Colores disponibles para la capacidad elegida
  const cWrap = $("#product-colors");
  if (cWrap) {
    cWrap.innerHTML = "";
    const colors = capColors(model, state.capSel);
    const showColors = colors.length > 0 && !(colors.length === 1 && colors[0] === "");
    colors.forEach(color => {
      const btn = el("button", {
        class: "color-pill" + (color === state.colorSel ? " active" : ""),
        onclick: () => { state.colorSel = color; pushUrl(); renderAll(); },
      }, color || "Único");
      cWrap.appendChild(btn);
    });
    cWrap.style.display = showColors ? "flex" : "none";
    if (cWrap.previousElementSibling) cWrap.previousElementSibling.style.display = showColors ? "block" : "none";
  }

  // Pricing
  $("#product-price").textContent = fmtCLP(variant.p);

  // Description / tagline from specs
  const specs = window.getSpecsFor(phone.id, model.name) || {};
  $("#product-tagline").textContent = specs.tagline || "";

  // SEO: meta + structured data por producto
  updateMeta(phone, model, variant);
  updateProductSchema(phone, model, variant);

  // Add-to-cart binding
  const addBtn = $("#product-add");
  addBtn.onclick = () => {
    window.cartStore.add({
      model: model.name, storage: variant.s, color: variant.color || "", price: variant.p,
      sealed: model.sealed, phoneId: phone.id, img: model.img || phone.lineImg,
    });
    updateCartBadge();
    openCart();
    renderCart();
    addBtn.textContent = "✓ Agregado al carro";
    setTimeout(() => { addBtn.textContent = "Agregar al carro →"; }, 1800);
  };

  // Specs grid
  renderSpecs(specs);
}

// Render gallery thumbnails (imagen principal + galería subida). Oculto si ≤1 imagen.
function renderThumbs(model, mainImg) {
  const wrap = $("#product-thumbs");
  if (!wrap) return;
  const urls = [];
  if (mainImg) urls.push(mainImg);
  (model.gallery || []).forEach(g => { if (g && g.url && !urls.includes(g.url)) urls.push(g.url); });
  wrap.innerHTML = "";
  if (urls.length < 2) { wrap.style.display = "none"; return; }
  wrap.style.display = "flex";
  urls.forEach(u => {
    const btn = el("button", {
      class: "product-thumb" + (u === mainImg ? " active" : ""),
      type: "button",
      onclick: () => {
        $("#product-img").src = u;
        wrap.querySelectorAll(".product-thumb").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
      },
    }, [el("img", { src: u, alt: model.name, loading: "lazy" })]);
    wrap.appendChild(btn);
  });
}

// ---------- SEO: meta dinámica + structured data por producto ----------
function setMetaAttr(id, attr, val) {
  const e = document.getElementById(id);
  if (e) e.setAttribute(attr, val);
}

function updateMeta(phone, model, storage) {
  const condShort = model.sealed ? "sellado" : "seminuevo";
  const condLong = model.sealed ? "sellado en caja" : "seminuevo A+";
  const vLabel = `${storage.s}${storage.color ? " " + storage.color : ""}`;
  const title = `${model.name} ${vLabel} ${condShort} | iPhone UP`;
  const desc = `${model.name} ${vLabel} ${condLong}, 100% original con garantía de 6 meses. Desde ${fmtCLP(storage.p)}. Tienda física en Providencia, Santiago.`;
  const canonical = `https://iphoneup.cl/product.html?id=${phone.id}&model=${phone.slug}`;
  const img = "https://iphoneup.cl/" + (model.img || phone.lineImg);

  document.title = title;
  setMetaAttr("meta-desc", "content", desc);
  setMetaAttr("canonical-url", "href", canonical);
  setMetaAttr("og-url", "content", canonical);
  setMetaAttr("og-title", "content", title);
  setMetaAttr("og-desc", "content", desc);
  setMetaAttr("og-image", "content", img);
  setMetaAttr("tw-title", "content", title);
  setMetaAttr("tw-desc", "content", desc);
  setMetaAttr("tw-image", "content", img);
}

function updateProductSchema(phone, model, storage) {
  const condition = model.sealed
    ? "https://schema.org/NewCondition"
    : "https://schema.org/RefurbishedCondition";
  const img = "https://iphoneup.cl/" + (model.img || phone.lineImg);
  const vLabel = `${storage.s}${storage.color ? " " + storage.color : ""}`;
  const product = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: `${model.name} ${vLabel}`,
    image: img,
    description: `${model.name} ${vLabel} ${model.sealed ? "sellado en caja" : "seminuevo A+"}, 100% original con garantía de 6 meses.`,
    brand: { "@type": "Brand", name: "Apple" },
    category: "Smartphones",
    itemCondition: condition,
    offers: {
      "@type": "Offer",
      price: storage.p,
      priceCurrency: "CLP",
      itemCondition: condition,
      availability: "https://schema.org/InStock",
      url: `https://iphoneup.cl/product.html?id=${phone.id}&model=${phone.slug}`,
      seller: { "@type": "Organization", name: "iPhone UP" },
    },
  };
  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Inicio", item: "https://iphoneup.cl/" },
      { "@type": "ListItem", position: 2, name: "Catálogo", item: "https://iphoneup.cl/#catalogo" },
      { "@type": "ListItem", position: 3, name: model.name },
    ],
  };
  let s = document.getElementById("ld-product");
  if (!s) {
    s = document.createElement("script");
    s.type = "application/ld+json";
    s.id = "ld-product";
    document.head.appendChild(s);
  }
  s.textContent = JSON.stringify([product, breadcrumb]);
}

function renderSpecs(specs) {
  const grid = $("#specs-grid");
  grid.innerHTML = "";
  const rows = [
    ["Chip",            specs.chip],
    ["Pantalla",        specs.display],
    ["Cámara trasera",  specs.cameras],
    ["Cámara frontal",  specs.front],
    ["Batería",         specs.battery],
    ["Conectividad",    specs.connectivity],
    ["Dimensiones",     specs.dimensions],
    ["Materiales",      specs.materials],
    ["Resistencia",     specs.waterResistance],
    ["Colores",         (specs.colors || []).join(" · ")],
  ];
  rows.forEach(([k, v]) => {
    if (!v) return;
    const row = el("div", { class: "spec-row" }, [
      el("div", { class: "spec-k" }, k),
      el("div", { class: "spec-v" }, v),
    ]);
    grid.appendChild(row);
  });
}

function renderRelated() {
  const grid = $("#related-grid");
  grid.innerHTML = "";
  const id = state.phone.id;
  // Líneas distintas más cercanas (excluye la actual y ocultos/test). CATALOG es por modelo,
  // así que deduplicamos por id de línea para no repetir variantes de la misma línea.
  const seen = new Set();
  const others = CATALOG
    .filter(p => p.id !== id && !p.hidden && Array.isArray(p.storages) && p.storages.length && !seen.has(p.id) && seen.add(p.id))
    .sort((a, b) => Math.abs(a.id - id) - Math.abs(b.id - id))
    .slice(0, 3);
  others.forEach(p => {
    const minPrice = Math.min(...(p.storages || []).map(s => s.p));
    const card = el("a", { class: "related-card", href: `product.html?id=${p.id}&model=${p.slug}` }, [
      el("div", { class: "related-img" }, [
        el("img", { src: p.img || p.lineImg, alt: p.name, loading: "lazy" }),
      ]),
      el("div", { class: "related-line" }, `iPhone ${p.line}`),
      el("div", { class: "related-price" }, `Desde ${fmtCLP(minPrice)}`),
    ]);
    grid.appendChild(card);
  });
}

function pushUrl() {
  const url = new URL(window.location.href);
  url.searchParams.set("id", state.phone.id);
  url.searchParams.set("model", state.phone.slug);
  url.searchParams.delete("m");
  if (state.capSel) url.searchParams.set("cap", state.capSel); else url.searchParams.delete("cap");
  if (state.colorSel) url.searchParams.set("col", state.colorSel); else url.searchParams.delete("col");
  url.searchParams.delete("s");
  window.history.replaceState({}, "", url.toString());
}

// ---------- Cart drawer (shared) ----------
function openCart() {
  $("#cart-overlay").style.display = "block";
}
function closeCart() {
  $("#cart-overlay").style.display = "none";
}
function updateCartBadge() {
  const n = window.cartStore.count();
  const b = $("#cart-count");
  if (n > 0) { b.textContent = n; b.style.display = "inline-block"; }
  else b.style.display = "none";
}
function renderCart() {
  const list = $("#cart-list");
  const total = $("#cart-total");
  const items = window.cartStore.read();
  list.innerHTML = "";
  if (items.length === 0) {
    list.appendChild(el("p", { class: "cart-empty" }, "Tu carro está vacío."));
    total.textContent = fmtCLP(0);
    return;
  }
  items.forEach((v, i) => {
    const item = el("div", { class: "cart-item" }, [
      el("div", { class: "cart-item-name" }, v.model),
      el("div", { class: "cart-item-meta" }, `${v.storage}${v.color ? " · " + v.color : ""} · ${v.sealed ? "Sellado" : "Seminuevo"}`),
      el("div", { class: "cart-item-row" }, [
        el("span", { class: "cart-item-price" }, fmtCLP(v.price)),
        el("button", {
          class: "cart-item-remove",
          onclick: () => { window.cartStore.remove(i); updateCartBadge(); renderCart(); },
          "aria-label": "Quitar",
        }, "✕"),
      ]),
    ]);
    list.appendChild(item);
  });
  total.textContent = fmtCLP(items.reduce((a, v) => a + v.price, 0));
}

function bindGlobalUI() {
  $("#cart-button").addEventListener("click", () => { openCart(); renderCart(); });
  $("#cart-close").addEventListener("click", closeCart);
  $("#cart-overlay").addEventListener("click", e => {
    if (e.target.id === "cart-overlay") closeCart();
  });
  // mobile nav
  const burger = $("#nav-burger");
  const drawer = $("#nav-drawer");
  burger.addEventListener("click", () => drawer.classList.toggle("open"));
  $$("#nav-drawer a").forEach(a => a.addEventListener("click", () => drawer.classList.remove("open")));
  // initial badge
  updateCartBadge();
  renderCart();
}

document.addEventListener("DOMContentLoaded", init);
