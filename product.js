// iPhone UP — página de detalle de producto
// Lee ?id=<line>&m=<modelIdx>&s=<storageIdx> y renderiza la línea completa.

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
    m: Math.max(0, parseInt(p.get("m"), 10) || 0),
    s: Math.max(0, parseInt(p.get("s"), 10) || 0),
  };
}

const state = {
  phone: null,
  modelIdx: 0,
  storageIdx: 0,
};

function init() {
  const q = parseQuery();
  const phone = CATALOG.find(p => p.id === q.id);
  if (!phone) {
    $("#product-root").style.display = "none";
    $("#product-error").style.display = "block";
    $("#bc-current").textContent = "No encontrado";
    document.title = "iPhone UP — Modelo no encontrado";
    return;
  }
  state.phone = phone;
  state.modelIdx = Math.min(q.m, phone.models.length - 1);
  state.storageIdx = q.s; // será clipeada al storage del modelo en render

  document.title = `iPhone UP — iPhone ${phone.line}`;
  renderAll();
  bindGlobalUI();
  renderRelated();
  $("#footer-year").textContent = new Date().getFullYear();
}

function currentModel() {
  return state.phone.models[state.modelIdx];
}
function currentStorage() {
  const m = currentModel();
  state.storageIdx = Math.min(state.storageIdx, m.storages.length - 1);
  return m.storages[state.storageIdx];
}

function renderAll() {
  const phone = state.phone;
  const model = currentModel();
  const storage = currentStorage();

  $("#bc-current").textContent = model.name;
  $("#product-line-label").textContent = `· iPhone ${phone.line} · ${phone.year}`;
  $("#product-title").textContent = model.name;

  // Image — use per-model image if defined, otherwise fall back to line image
  $("#product-img").src = model.img || phone.img;
  $("#product-img").alt = model.name;

  // Sealed badge
  $("#product-badge").style.display = model.sealed ? "inline-block" : "none";

  // Condition pill
  $("#product-condition-pill").textContent = model.sealed ? "Sellado en caja" : "Seminuevo A+";
  $("#product-year-pill").textContent = String(phone.year);

  // Variants
  const vWrap = $("#product-variants");
  vWrap.innerHTML = "";
  phone.models.forEach((m, i) => {
    const label = m.name.replace(`iPhone ${phone.line}`, "").trim() || "Base";
    const btn = el("button", {
      class: "variant-pill" + (i === state.modelIdx ? " active" : ""),
      onclick: () => { state.modelIdx = i; state.storageIdx = 0; pushUrl(); renderAll(); },
    }, label);
    vWrap.appendChild(btn);
  });
  // Hide variants section if only one model
  vWrap.style.display = phone.models.length > 1 ? "flex" : "none";
  vWrap.previousElementSibling.style.display = phone.models.length > 1 ? "block" : "none";

  // Storages
  const sWrap = $("#product-storages");
  sWrap.innerHTML = "";
  model.storages.forEach((v, i) => {
    const btn = el("button", {
      class: "storage-pill big" + (i === state.storageIdx ? " active" : ""),
      onclick: () => { state.storageIdx = i; pushUrl(); renderAll(); },
    }, [
      el("span", { class: "sp-cap" }, v.s),
      el("span", { class: "sp-price" }, fmtCLP(v.p)),
    ]);
    sWrap.appendChild(btn);
  });

  // Pricing
  $("#product-price").textContent = fmtCLP(storage.p);
  $("#product-cuotas").textContent = `o 12x ${fmtCLP(Math.round(storage.p / 12))} sin interés`;

  // Description / tagline from specs
  const specs = window.getSpecsFor(phone.id, model.name) || {};
  $("#product-tagline").textContent = specs.tagline || "";

  // WhatsApp CTA — pre-fills message
  const wa = $("#product-wa");
  const msg = `Hola, me interesa el ${model.name} ${storage.s} (${fmtCLP(storage.p)}). ¿Está disponible?`;
  wa.href = `https://wa.me/56900000000?text=${encodeURIComponent(msg)}`;

  // Add-to-cart binding
  const addBtn = $("#product-add");
  addBtn.onclick = () => {
    window.cartStore.add({
      model: model.name, storage: storage.s, price: storage.p,
      sealed: model.sealed, phoneId: phone.id, img: model.img || phone.img,
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
  // pick the closest 3 lines (above and below)
  const others = CATALOG.filter(p => p.id !== id)
    .sort((a, b) => Math.abs(a.id - id) - Math.abs(b.id - id))
    .slice(0, 3);
  others.forEach(p => {
    const m = p.models[0];
    const minPrice = Math.min(...p.models.flatMap(mm => mm.storages.map(s => s.p)));
    const card = el("a", { class: "related-card", href: `product.html?id=${p.id}` }, [
      el("div", { class: "related-img" }, [
        el("img", { src: p.img, alt: m.name, loading: "lazy" }),
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
  url.searchParams.set("m", state.modelIdx);
  url.searchParams.set("s", state.storageIdx);
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
      el("div", { class: "cart-item-meta" }, `${v.storage} · ${v.sealed ? "Sellado" : "Seminuevo"}`),
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
