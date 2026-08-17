// Checkout — iPhone UP
// Flujo:
//   1. Carga items desde cartStore (sessionStorage).
//   2. Pide regiones a /api/chilexpress/regions y las llena en el dropdown propio.
//   3. Al elegir región, pide comunas a /api/chilexpress/coverage.
//   4. Al elegir comuna, registra el destino. El envío es "por pagar" (costo 0):
//      no se cotiza precio, el cliente paga el despacho al recibir.
//   5. Valida form + comuna seleccionada → POST /api/mercadopago/preference.
//   6. Redirige a init_point (Mercado Pago Checkout Pro).
//
// Los selectores de región/comuna son dropdowns propios (no <select> nativo) para
// que se vean con la estética del sitio y sean legibles en el tema oscuro.

const $ = sel => document.querySelector(sel);
const fmt = window.fmtCLP || (n => "$" + Number(n).toLocaleString("es-CL"));

// Comisión del medio de pago — configurable/desactivable desde el admin (window.PAY_FEE).
const PAY_FEE = window.PAY_FEE || { rate: 0.035, enabled: true };
const fmtPct = (r) => (r * 100).toLocaleString("es-CL", { maximumFractionDigits: 2 }) + "%";

// Captura del carro para recordatorios — se apaga desde el admin.
const CART_CAPTURE = window.CART_CAPTURE || { enabled: false, expireDays: 14 };
const CART_TOKEN_KEY = "iphoneup_cart_token";

const state = {
  items: [],
  regions: [],
  selectedRegion: null,
  selectedRegionLabel: "",
  selectedCounty: null,
  selectedCountyLabel: "",
  selectedShip: null,
  deliveryMethod: "shipping", // "shipping" (despacho) | "pickup" (retiro en tienda)
  submitting: false,
  cartToken: null,
};

let regionDD = null;
let countyDD = null;

function getItems() {
  return (window.cartStore && window.cartStore.read()) || [];
}

function calcSubtotal() {
  return state.items.reduce((a, i) => a + (Number(i.price) || 0), 0);
}

function calcCommission() {
  return PAY_FEE.enabled ? Math.round(calcSubtotal() * PAY_FEE.rate) : 0;
}

function calcTotal() {
  // Envío "por pagar" (no se cobra en la web) + comisión del medio de pago (3,5%).
  return calcSubtotal() + calcCommission();
}

// ---------- Render ----------
function renderItems() {
  const root = $("#co-items");
  root.innerHTML = "";
  state.items.forEach(it => {
    const row = document.createElement("div");
    row.className = "co-item";
    row.innerHTML = `
      <img src="${it.img || "assets/iphones/iphone-14.webp"}" alt="${it.model || "iPhone"}" loading="lazy" />
      <div>
        <div class="co-item-name">${it.model}</div>
        <div class="co-item-meta">${it.storage || ""}${it.sealed ? " · Sellado" : " · Seminuevo"}</div>
      </div>
      <div class="co-item-price">${fmt(it.price)}</div>
    `;
    root.appendChild(row);
  });
}

function renderTotals() {
  $("#co-subtotal").textContent = fmt(calcSubtotal());
  const feeRow = $("#co-commission-row"); if (feeRow) feeRow.style.display = PAY_FEE.enabled ? "" : "none";
  const feePct = $("#co-fee-pct"); if (feePct) feePct.textContent = fmtPct(PAY_FEE.rate);
  const comm = $("#co-commission");
  if (comm) comm.textContent = fmt(calcCommission());
  $("#co-ship-cost").textContent = !state.selectedShip ? "—" : (state.selectedShip.code === "PICKUP" ? "Retiro en tienda" : "Por pagar");
  $("#co-total").textContent = fmt(calcTotal());
}

function renderShipping() {
  const root = $("#co-shipping");
  root.classList.remove("loading");

  if (state.deliveryMethod === "pickup") {
    root.innerHTML = `
      <div class="co-ship-porpagar">
        <span class="co-ship-tag">Retiro</span>
        <div class="co-ship-info">
          <div class="co-ship-name">Retiro en tienda — sin costo</div>
          <div class="co-ship-meta">Retiras en Padre Mariano 98, Of. 105, Providencia. Te avisamos por Instagram (@iphoneup.cl) cuando esté listo.</div>
        </div>
      </div>`;
    return;
  }

  if (!state.selectedCounty) {
    root.innerHTML = `<p class="co-hint">Selecciona tu región y comuna para registrar la dirección de despacho.</p>`;
    return;
  }

  const countyName = state.selectedCountyLabel || "tu comuna";
  root.innerHTML = `
    <div class="co-ship-porpagar">
      <span class="co-ship-tag">Por pagar</span>
      <div class="co-ship-info">
        <div class="co-ship-name">Envío por pagar con Chilexpress</div>
        <div class="co-ship-meta">Despachamos a ${countyName}. El costo del envío lo pagas directamente al recibir tu pedido — no se cobra en esta compra.</div>
      </div>
    </div>`;
}

function updateSubmitEnabled() {
  const form = $("#checkout-form");
  const rutLen = form.rut.value.replace(/[^0-9kK]/gi, "").length;
  const phoneDigits = (form.phone.value.match(/\d/g) || []).length;
  // Todos los campos obligatorios (la "Referencia" del despacho queda opcional).
  let ok =
    form.name.value.trim() &&
    /\S+@\S+\.\S+/.test(form.email.value) &&
    phoneDigits >= 11 &&
    rutLen >= 7 &&
    form.instagram.value.trim() &&
    state.selectedShip &&
    !state.submitting;
  if (state.deliveryMethod === "shipping") {
    ok = ok &&
      state.selectedRegion &&
      state.selectedCounty &&
      form.branch.value.trim();
  }
  $("#co-submit").disabled = !ok;
}

// ---------- Dropdown propio (reemplaza <select> nativo) ----------
function createDropdown(rootId, opts = {}) {
  const { placeholder = "Selecciona…", disabled = false, onChange } = opts;
  const root = $("#" + rootId);
  root.classList.add("co-dd");
  root.innerHTML = `
    <button type="button" class="co-dd-btn" aria-haspopup="listbox" aria-expanded="false"${disabled ? " disabled" : ""}>
      <span class="co-dd-label co-dd-placeholder"></span>
      <svg class="co-dd-caret" width="12" height="8" viewBox="0 0 12 8" aria-hidden="true"><path d="M6 8 0 0h12z" fill="currentColor"/></svg>
    </button>
    <div class="co-dd-list" role="listbox" hidden></div>
  `;
  const btn = root.querySelector(".co-dd-btn");
  const labelEl = root.querySelector(".co-dd-label");
  const listEl = root.querySelector(".co-dd-list");

  function open() {
    if (btn.disabled) return;
    listEl.hidden = false;
    root.classList.add("open");
    btn.setAttribute("aria-expanded", "true");
  }
  function close() {
    listEl.hidden = true;
    root.classList.remove("open");
    btn.setAttribute("aria-expanded", "false");
  }
  btn.addEventListener("click", () => { listEl.hidden ? open() : close(); });
  document.addEventListener("click", (e) => { if (!root.contains(e.target)) close(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });

  const api = {
    value: "",
    label: "",
    setItems(items) {
      listEl.innerHTML = "";
      if (!items.length) { listEl.innerHTML = `<div class="co-dd-empty">Sin resultados</div>`; return; }
      items.forEach(it => {
        const opt = document.createElement("div");
        opt.className = "co-dd-opt";
        opt.setAttribute("role", "option");
        opt.textContent = it.label;
        opt.addEventListener("click", () => {
          api.value = it.value;
          api.label = it.label;
          labelEl.textContent = it.label;
          labelEl.classList.remove("co-dd-placeholder");
          close();
          if (onChange) onChange(it.value, it.label);
        });
        listEl.appendChild(opt);
      });
    },
    reset(ph) {
      api.value = "";
      api.label = "";
      labelEl.textContent = ph || placeholder;
      labelEl.classList.add("co-dd-placeholder");
      listEl.innerHTML = "";
      close();
    },
    setDisabled(d) { btn.disabled = !!d; if (d) close(); },
    setMessage(msg) { listEl.innerHTML = `<div class="co-dd-empty">${msg}</div>`; },
  };
  api.reset(placeholder);
  return api;
}

// ---------- API helpers ----------
async function apiGet(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `HTTP ${r.status}`);
  return r.json();
}
async function apiPost(url, body) {
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `HTTP ${r.status}`);
  return r.json();
}

// ---------- Captura del carro (recordatorios de carro abandonado) ----------
// Se dispara al escribir el email, con debounce: sin esto habría un POST por
// tecla. Es best-effort puro — si falla, el checkout sigue funcionando igual.
let captureTimer = null;

function readCartToken() {
  try { return sessionStorage.getItem(CART_TOKEN_KEY) || null; } catch { return null; }
}
function writeCartToken(token) {
  state.cartToken = token;
  try { sessionStorage.setItem(CART_TOKEN_KEY, token); } catch {}
}

async function captureCart() {
  if (!CART_CAPTURE.enabled || !state.items.length) return;
  const form = $("#checkout-form");
  if (!form) return;
  const email = form.email.value.trim();
  // Sin un email con forma de email no hay a quién escribirle.
  if (!/\S+@\S+\.\S+/.test(email)) return;

  try {
    const body = {
      token: state.cartToken || undefined,
      email,
      name: form.name.value.trim() || undefined,
      phone: form.phone.value.trim() || undefined,
      items: state.items,
      source: "checkout",
    };
    const r = await fetch("/api/cart/capture", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!r.ok) return;
    const data = await r.json();
    if (data.token) writeCartToken(data.token);
  } catch {
    // Silencioso a propósito: es telemetría de recuperación, no parte del pago.
  }
}

function scheduleCapture() {
  clearTimeout(captureTimer);
  captureTimer = setTimeout(captureCart, 1200);
}

// Restaura el carro desde el link de un email (?rc=<token>). Devuelve true si
// pudo reponer items, para que init() no muestre la pantalla de "carro vacío".
async function restoreCartFromLink() {
  const token = new URLSearchParams(location.search).get("rc");
  if (!token || !/^[a-f0-9]{32}$/.test(token)) return false;

  const banner = $("#co-restored");
  try {
    const r = await fetch(`/api/cart/${encodeURIComponent(token)}`);
    const data = await r.json().catch(() => ({}));

    if (!r.ok) {
      if (banner) {
        banner.style.display = "";
        banner.textContent = data.expired
          ? "Ese carro venció, pero el catálogo sigue acá. Armá el tuyo de nuevo y te ayudamos con cualquier duda."
          : data.converted
            ? "Ese carro ya terminó en una compra. Si necesitás algo más, escribinos."
            : "No pudimos recuperar ese carro. Armalo de nuevo y seguimos.";
      }
      return false;
    }

    if (Array.isArray(data.items) && data.items.length) {
      // Reescribimos el carro con lo que devolvió el server: los precios de ahí
      // salen de la DB, no del sessionStorage viejo del cliente.
      window.cartStore.write(data.items);
      state.items = data.items;
      writeCartToken(token);
      if (banner) {
        banner.style.display = "";
        banner.textContent = "Recuperamos tu carro. Revisá los precios y terminá cuando quieras.";
      }
      // Prellenamos lo que ya nos había dado.
      requestAnimationFrame(() => {
        const form = $("#checkout-form");
        if (!form) return;
        if (data.email && !form.email.value) form.email.value = data.email;
        if (data.name && !form.name.value) form.name.value = data.name;
        updateSubmitEnabled();
      });
      return true;
    }
  } catch {
    // Sin conexión / respuesta rara: seguimos con el carro local.
  }
  return false;
}

// ---------- Carga de regiones / comunas ----------
async function loadRegions() {
  regionDD.setMessage("Cargando…");
  try {
    const { regions } = await apiGet("/api/chilexpress/regions");
    state.regions = regions || [];
    regionDD.setItems(state.regions.map(r => ({
      value: r.regionCode || r.RegionCode,
      label: r.regionName || r.RegionName,
    })));
  } catch (err) {
    console.error(err);
    regionDD.setMessage("Error: " + err.message);
  }
}

async function loadCounties(regionCode) {
  countyDD.setDisabled(false);
  countyDD.setMessage("Cargando comunas…");
  try {
    const { areas } = await apiGet(`/api/chilexpress/coverage?regionCode=${encodeURIComponent(regionCode)}`);
    countyDD.setItems((areas || []).map(a => ({
      value: a.countyCode || a.CountyCode,
      label: a.countyName || a.CountyName,
    })));
  } catch (err) {
    console.error(err);
    countyDD.setMessage("Error: " + err.message);
  }
}

// Envío "por pagar": no se cotiza precio. Registramos la comuna como destino y
// dejamos el envío seleccionado con costo 0 — el cliente paga el despacho al recibir.
function setPorPagarShipping() {
  state.selectedShip = { code: "POR_PAGAR", name: "Envío por pagar (Chilexpress)", price: 0 };
  renderShipping();
  renderTotals();
  updateSubmitEnabled();
}

// Cambia entre "Despacho a domicilio" y "Retiro en tienda".
function setDeliveryMethod(method) {
  state.deliveryMethod = method;
  const isPickup = method === "pickup";
  $("#co-shipping-fields").style.display = isPickup ? "none" : "";
  $("#co-pickup-info").style.display = isPickup ? "" : "none";
  $("#co-method-shipping").classList.toggle("active", !isPickup);
  $("#co-method-pickup").classList.toggle("active", isPickup);

  if (isPickup) {
    state.selectedShip = { code: "PICKUP", name: "Retiro en tienda", price: 0 };
  } else {
    // Volver a despacho: el envío depende de si ya hay comuna elegida.
    state.selectedShip = state.selectedCounty
      ? { code: "POR_PAGAR", name: "Envío por pagar (Chilexpress)", price: 0 }
      : null;
  }
  renderShipping();
  renderTotals();
  updateSubmitEnabled();
}

// ---------- Submit ----------
async function onSubmit(e) {
  e.preventDefault();
  if (state.submitting) return;

  const form = e.target;
  const buyer = {
    name: form.name.value.trim(),
    rut: form.rut.value.trim(),
    email: form.email.value.trim(),
    phone: form.phone.value.trim(),
    instagram: form.instagram.value.trim(),
  };

  const isPickup = state.deliveryMethod === "pickup";
  const shipping = isPickup ? {
    name: "Retiro en tienda",
    cost: 0,
    serviceCode: "PICKUP",
    method: "pickup",
    address: { store: "Padre Mariano 98, Of. 105, Providencia, Santiago" },
  } : {
    name: state.selectedShip.name,
    cost: state.selectedShip.price,
    serviceCode: state.selectedShip.code,
    method: "shipping",
    address: {
      region: state.selectedRegionLabel || "",
      regionCode: state.selectedRegion || "",
      county: state.selectedCountyLabel || "",
      countyCode: state.selectedCounty || "",
      branch: form.branch.value.trim(),
      extra: form.extra.value.trim(),
    },
  };

  state.submitting = true;
  updateSubmitEnabled();
  $("#co-submit").textContent = "Creando orden…";
  $("#co-error").textContent = "";

  try {
    const { initPoint, sandboxInitPoint, orderId } = await apiPost("/api/mercadopago/preference", {
      items: state.items,
      shipping,
      buyer,
      // Cierra el carro capturado: deja de estar en la cola de recordatorios.
      cartToken: state.cartToken || undefined,
    });
    // Guardar el orderId para que la página de retorno pueda consultarlo.
    sessionStorage.setItem("iphoneup_last_order", orderId);
    // Limpiar carro — el pago se está procesando.
    window.cartStore.write([]);
    try { sessionStorage.removeItem(CART_TOKEN_KEY); } catch {}
    const url = initPoint || sandboxInitPoint;
    if (!url) throw new Error("Mercado Pago no devolvió URL de pago");
    window.location.href = url;
  } catch (err) {
    console.error(err);
    state.submitting = false;
    $("#co-submit").textContent = "Pagar con Mercado Pago →";
    $("#co-error").textContent = "No fue posible crear la orden: " + err.message;
    updateSubmitEnabled();
  }
}

// ---------- Formateo de RUT y teléfono ----------
function formatRut(v) {
  let clean = (v || "").replace(/[^0-9kK]/g, "").toUpperCase();
  if (clean.length === 0) return "";
  if (clean.length === 1) return clean;
  const dv = clean.slice(-1);
  const body = clean.slice(0, -1).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return body + "-" + dv;
}
function formatPhone(v) {
  let d = (v || "").replace(/\D/g, "");
  if (d.startsWith("56")) d = d.slice(2);
  d = d.slice(0, 9);
  if (!d) return "";
  let out = "+56 " + d[0];
  if (d.length > 1) out += " " + d.slice(1, 5);
  if (d.length > 5) out += " " + d.slice(5, 9);
  return out;
}

// ---------- Init ----------
async function init() {
  state.items = getItems();
  state.cartToken = readCartToken();

  // El link del email puede reponer un carro vacío, así que esto va ANTES del
  // chequeo de "carro vacío".
  await restoreCartFromLink();
  if (!state.items.length) state.items = getItems();

  if (CART_CAPTURE.enabled === false) {
    const d = $("#co-email-disclosure");
    if (d) d.style.display = "none";
  }

  if (state.items.length === 0) {
    $("#checkout-grid").style.display = "none";
    $("#checkout-empty").style.display = "block";
    return;
  }

  renderItems();
  renderTotals();

  regionDD = createDropdown("co-region", {
    placeholder: "Selecciona una región",
    onChange: (value, label) => {
      state.selectedRegion = value;
      state.selectedRegionLabel = label;
      state.selectedCounty = null;
      state.selectedCountyLabel = "";
      state.selectedShip = null;
      countyDD.reset("Selecciona comuna");
      countyDD.setDisabled(!value);
      renderShipping();
      renderTotals();
      if (value) loadCounties(value);
      updateSubmitEnabled();
    },
  });

  countyDD = createDropdown("co-county", {
    placeholder: "Selecciona primero una región",
    disabled: true,
    onChange: (value, label) => {
      state.selectedCounty = value;
      state.selectedCountyLabel = label;
      if (value) {
        setPorPagarShipping();
      } else {
        state.selectedShip = null;
        renderShipping();
        renderTotals();
        updateSubmitEnabled();
      }
    },
  });

  loadRegions();

  const form = $("#checkout-form");
  form.addEventListener("input", updateSubmitEnabled);
  form.addEventListener("change", updateSubmitEnabled);
  form.addEventListener("submit", onSubmit);

  // Auto-formato de RUT y teléfono mientras se escribe.
  form.rut.addEventListener("input", () => { form.rut.value = formatRut(form.rut.value); });
  form.phone.addEventListener("input", () => { form.phone.value = formatPhone(form.phone.value); });

  // Captura del carro: al terminar de escribir el email y al salir del campo.
  form.email.addEventListener("input", scheduleCapture);
  form.email.addEventListener("blur", captureCart);
  form.name.addEventListener("blur", captureCart);

  $("#co-method-shipping").addEventListener("click", () => setDeliveryMethod("shipping"));
  $("#co-method-pickup").addEventListener("click", () => setDeliveryMethod("pickup"));
  setDeliveryMethod("shipping");
}

document.addEventListener("DOMContentLoaded", init);
