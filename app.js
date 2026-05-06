// iPhone UP — lógica de la home. Datos en data.js, specs en specs.js.

const CATALOG     = window.CATALOG;
const TESTIMONIALS = window.TESTIMONIALS;
const STATS       = window.STATS;
const FAQS        = window.FAQS;
const fmtCLP      = window.fmtCLP;

// ---------- State ----------
const state = {
  filter: "all",          // all | new | classic
  cards: {},              // perPhone: { modelIdx, storageIdx }
  cart: window.cartStore.read(),
  cartOpen: false,
  tradeStep: 0,
  tradeModel: "iPhone 13 Pro",
  tradeStorage: "256GB",
  tradeCondition: "Bueno",
  faqOpen: 0,
};

// ---------- Helpers ----------
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

// ---------- Rendering: Catalog ----------
function visiblePhones() {
  let list;
  if (state.filter === "new")          list = CATALOG.filter(p => p.id >= 15);
  else if (state.filter === "classic") list = CATALOG.filter(p => p.id < 15);
  else                                 list = CATALOG;
  return [...list].sort((a, b) => b.id - a.id);
}

function renderCatalog() {
  const root = $("#catalog-grid");
  root.innerHTML = "";
  visiblePhones().forEach(phone => root.appendChild(renderPhoneCard(phone)));
}

function getCardState(phoneId) {
  if (!state.cards[phoneId]) state.cards[phoneId] = { modelIdx: 0, storageIdx: 0 };
  return state.cards[phoneId];
}

function renderPhoneCard(phone) {
  const cs = getCardState(phone.id);
  const models = phone.models;
  const model = models[Math.min(cs.modelIdx, models.length - 1)] || phone.models[0];
  const storage = model.storages[Math.min(cs.storageIdx, model.storages.length - 1)] || model.storages[0];

  const wrap = el("article", { class: "phone-card" });
  const inner = el("div", { class: "phone-card-inner" });

  // glow blob
  inner.appendChild(el("div", { class: "phone-card-glow" }));

  // image (with Sellado badge if applicable) — clickable; reflects selected variant
  const imgWrap = el("a", { class: "phone-img", href: `product.html?id=${phone.id}&m=${cs.modelIdx}&s=${cs.storageIdx}`, "aria-label": `Ver detalle de ${model.name}` });
  if (model.sealed) {
    imgWrap.appendChild(el("span", { class: "sealed-badge" }, "SELLADO"));
  }
  imgWrap.appendChild(el("img", { src: model.img || phone.img, alt: model.name, loading: "lazy" }));
  inner.appendChild(imgWrap);

  // title (clickable)
  const titleLink = el("a", {
    class: "phone-title-link",
    href: `product.html?id=${phone.id}&m=${cs.modelIdx}&s=${cs.storageIdx}`,
  });
  titleLink.appendChild(el("h3", { class: "phone-title" }, model.name));
  inner.appendChild(titleLink);
  inner.appendChild(el("div", { class: "phone-meta" },
    `${phone.year} · ${model.sealed ? "Sellado en caja" : "Seminuevo A+"}`
  ));

  // model selector (only if multiple)
  if (models.length > 1) {
    const ms = el("div", { class: "model-selector" });
    models.forEach((m, i) => {
      const label = m.name.replace(`iPhone ${phone.line}`, "").trim() || "Base";
      const btn = el("button", {
        class: "model-pill" + (i === cs.modelIdx ? " active" : ""),
        onclick: () => { cs.modelIdx = i; cs.storageIdx = 0; renderCatalog(); },
      }, label);
      ms.appendChild(btn);
    });
    inner.appendChild(ms);
  }

  // storage selector
  const ss = el("div", { class: "storage-selector" });
  model.storages.forEach((v, i) => {
    const btn = el("button", {
      class: "storage-pill" + (i === cs.storageIdx ? " active" : ""),
      onclick: () => { cs.storageIdx = i; renderCatalog(); },
    }, v.s);
    ss.appendChild(btn);
  });
  inner.appendChild(ss);

  // price row
  const priceRow = el("div", { class: "price-row" });
  const priceLeft = el("div");
  priceLeft.appendChild(el("div", { class: "price-label" }, "Desde"));
  priceLeft.appendChild(el("div", { class: "price-value" }, fmtCLP(storage.p)));
  const priceRight = el("div", { class: "price-cuotas" }, `o 12x\n${fmtCLP(Math.round(storage.p / 12))}`);
  priceRight.style.whiteSpace = "pre-line";
  priceRow.appendChild(priceLeft);
  priceRow.appendChild(priceRight);
  inner.appendChild(priceRow);

  // CTAs row: Ver detalle + Agregar
  const ctaRow = el("div", { class: "card-cta-row" });
  const detailLink = el("a", {
    class: "btn-detail",
    href: `product.html?id=${phone.id}&m=${cs.modelIdx}&s=${cs.storageIdx}`,
  }, "Ver detalle →");
  const addBtn = el("button", {
    class: "btn-add",
    onclick: () => addToCart({ model: model.name, storage: storage.s, price: storage.p, sealed: model.sealed, phoneId: phone.id, img: model.img || phone.img }),
  }, "Agregar");
  ctaRow.appendChild(detailLink);
  ctaRow.appendChild(addBtn);
  inner.appendChild(ctaRow);

  wrap.appendChild(inner);
  return wrap;
}

// ---------- Cart ----------
function addToCart(v) {
  state.cart = window.cartStore.add(v);
  state.cartOpen = true;
  renderCart();
  updateCartBadge();
}
function removeFromCart(i) {
  state.cart = window.cartStore.remove(i);
  renderCart();
  updateCartBadge();
}
function updateCartBadge() {
  const b = $("#cart-count");
  if (state.cart.length > 0) {
    b.textContent = state.cart.length;
    b.style.display = "inline-block";
  } else {
    b.style.display = "none";
  }
}
function renderCart() {
  const overlay = $("#cart-overlay");
  overlay.style.display = state.cartOpen ? "block" : "none";
  const list = $("#cart-list");
  const total = $("#cart-total");
  list.innerHTML = "";
  if (state.cart.length === 0) {
    list.appendChild(el("p", { class: "cart-empty" }, "Tu carro está vacío."));
    total.textContent = fmtCLP(0);
    return;
  }
  state.cart.forEach((v, i) => {
    const item = el("div", { class: "cart-item" }, [
      el("div", { class: "cart-item-name" }, v.model),
      el("div", { class: "cart-item-meta" }, `${v.storage} · ${v.sealed ? "Sellado" : "Seminuevo"}`),
      el("div", { class: "cart-item-row" }, [
        el("span", { class: "cart-item-price" }, fmtCLP(v.price)),
        el("button", { class: "cart-item-remove", onclick: () => removeFromCart(i), "aria-label": "Quitar" }, "✕"),
      ]),
    ]);
    list.appendChild(item);
  });
  total.textContent = fmtCLP(state.cart.reduce((a, v) => a + v.price, 0));
}

// ---------- Trade-in ----------
function tradeEstimate() {
  const base = {
    "iPhone 11": 90000, "iPhone 11 Pro": 130000,
    "iPhone 12": 140000, "iPhone 12 Pro": 180000,
    "iPhone 13": 200000, "iPhone 13 Pro": 270000,
    "iPhone 14": 240000, "iPhone 14 Pro": 330000,
    "iPhone 15": 320000, "iPhone 15 Pro": 420000,
    "iPhone 16": 400000, "iPhone 16 Pro": 520000,
  };
  const stMul = { "64GB": 1, "128GB": 1.05, "256GB": 1.12, "512GB": 1.2 };
  const cMul = { "Excelente": 1.1, "Bueno": 1, "Regular": 0.8 };
  return Math.round((base[state.tradeModel] || 200000) * (stMul[state.tradeStorage] || 1) * (cMul[state.tradeCondition] || 1));
}

function renderTrade() {
  const root = $("#trade-step");
  root.innerHTML = "";
  // progress
  const prog = $("#trade-progress");
  prog.innerHTML = "";
  for (let i = 0; i < 3; i++) {
    prog.appendChild(el("div", { class: "trade-bar" + (i <= state.tradeStep ? " on" : "") }));
  }
  $("#trade-step-label").textContent = `Paso ${state.tradeStep + 1} de 3`;

  if (state.tradeStep === 0) {
    root.appendChild(el("h3", { class: "trade-h" }, "¿Qué iPhone tienes?"));
    const sel = el("select", { class: "trade-select", onchange: e => state.tradeModel = e.target.value });
    ["iPhone 11","iPhone 11 Pro","iPhone 12","iPhone 12 Pro","iPhone 13","iPhone 13 Pro","iPhone 14","iPhone 14 Pro","iPhone 15","iPhone 15 Pro","iPhone 16","iPhone 16 Pro"].forEach(m => {
      const o = el("option", { value: m }, m);
      if (m === state.tradeModel) o.selected = true;
      sel.appendChild(o);
    });
    root.appendChild(sel);
  } else if (state.tradeStep === 1) {
    root.appendChild(el("h3", { class: "trade-h" }, "Capacidad y condición"));
    const sg = el("div", { class: "trade-grid-4" });
    ["64GB","128GB","256GB","512GB"].forEach(s => {
      sg.appendChild(el("button", {
        class: "trade-pill" + (state.tradeStorage === s ? " active" : ""),
        onclick: () => { state.tradeStorage = s; renderTrade(); },
      }, s));
    });
    root.appendChild(sg);
    const cg = el("div", { class: "trade-grid-3" });
    ["Excelente","Bueno","Regular"].forEach(c => {
      cg.appendChild(el("button", {
        class: "trade-pill" + (state.tradeCondition === c ? " active" : ""),
        onclick: () => { state.tradeCondition = c; renderTrade(); },
      }, c));
    });
    root.appendChild(cg);
  } else {
    const wrap = el("div", { class: "trade-result" });
    wrap.appendChild(el("div", { class: "trade-result-label" }, "Tu iPhone vale hasta"));
    wrap.appendChild(el("div", { class: "trade-result-value" }, fmtCLP(tradeEstimate())));
    wrap.appendChild(el("div", { class: "trade-result-meta" }, `${state.tradeModel} · ${state.tradeStorage} · ${state.tradeCondition}`));
    wrap.appendChild(el("p", { class: "trade-result-note" }, "Estimación referencial. El valor final se confirma en tienda tras revisión técnica."));
    root.appendChild(wrap);
  }

  $("#trade-back").style.visibility = state.tradeStep > 0 ? "visible" : "hidden";
  $("#trade-next").textContent = state.tradeStep === 2 ? "AGENDAR EVALUACIÓN" : "CONTINUAR →";
}

// ---------- FAQ ----------
function renderFAQ() {
  const root = $("#faq-list");
  root.innerHTML = "";
  FAQS.forEach((f, i) => {
    const isOpen = state.faqOpen === i;
    const item = el("div", { class: "faq-item" + (isOpen ? " open" : "") });
    const btn = el("button", {
      class: "faq-q",
      onclick: () => { state.faqOpen = isOpen ? -1 : i; renderFAQ(); },
    }, [
      el("span", {}, f.q),
      el("span", { class: "faq-toggle" }, "+"),
    ]);
    item.appendChild(btn);
    if (isOpen) item.appendChild(el("div", { class: "faq-a" }, f.a));
    root.appendChild(item);
  });
}

// ---------- Testimonials & Stats ----------
function renderStats() {
  const root = $("#hero-stats");
  root.innerHTML = "";
  STATS.forEach(s => {
    const d = el("div", { class: "stat" }, [
      el("div", { class: "stat-n" }, s.n),
      el("div", { class: "stat-l" }, s.l),
    ]);
    root.appendChild(d);
  });
}
function renderTestimonials() {
  const root = $("#testi-grid");
  root.innerHTML = "";
  TESTIMONIALS.forEach(t => {
    const c = el("div", { class: "testi-card" }, [
      el("div", { class: "testi-stars" }, "★".repeat(t.rating)),
      el("p", { class: "testi-text" }, `"${t.text}"`),
      el("div", { class: "testi-author" }, [
        el("div", { class: "testi-name" }, t.name),
        el("div", { class: "testi-role" }, t.role),
      ]),
    ]);
    root.appendChild(c);
  });
}

// ---------- Filters ----------
function bindFilters() {
  $$("#catalog-filters .filter-pill").forEach(b => {
    b.addEventListener("click", () => {
      state.filter = b.dataset.filter;
      $$("#catalog-filters .filter-pill").forEach(x => x.classList.toggle("active", x === b));
      renderCatalog();
    });
  });
}

// ---------- Cart bindings ----------
function bindCart() {
  $("#cart-button").addEventListener("click", () => { state.cartOpen = true; renderCart(); });
  $("#cart-overlay").addEventListener("click", e => {
    if (e.target.id === "cart-overlay") { state.cartOpen = false; renderCart(); }
  });
  $("#cart-close").addEventListener("click", () => { state.cartOpen = false; renderCart(); });
}

// ---------- Trade bindings ----------
function bindTrade() {
  $("#trade-back").addEventListener("click", () => { state.tradeStep = Math.max(0, state.tradeStep - 1); renderTrade(); });
  $("#trade-next").addEventListener("click", () => { state.tradeStep = Math.min(2, state.tradeStep + 1); renderTrade(); });
}

// ---------- Mobile nav ----------
function bindNav() {
  const burger = $("#nav-burger");
  const drawer = $("#nav-drawer");
  burger.addEventListener("click", () => drawer.classList.toggle("open"));
  $$("#nav-drawer a").forEach(a => a.addEventListener("click", () => drawer.classList.remove("open")));
}

// ---------- Init ----------
document.addEventListener("DOMContentLoaded", () => {
  renderStats();
  renderCatalog();
  bindFilters();
  bindCart();
  bindTrade();
  renderTrade();
  renderFAQ();
  renderTestimonials();
  bindNav();
  updateCartBadge();
  // Year in footer
  $("#footer-year").textContent = new Date().getFullYear();
});
