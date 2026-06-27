// Checkout — iPhone UP
// Flujo:
//   1. Carga items desde cartStore (sessionStorage).
//   2. Pide regiones a /api/chilexpress/regions y las llena en el <select>.
//   3. Al elegir región, pide comunas a /api/chilexpress/coverage.
//   4. Al elegir comuna, registra el destino. El envío es "por pagar" (costo 0):
//      no se cotiza precio, el cliente paga el despacho al recibir.
//   5. Valida form + comuna seleccionada → POST /api/mercadopago/preference.
//   6. Redirige a init_point (Mercado Pago Checkout Pro).

const $ = sel => document.querySelector(sel);
const fmt = window.fmtCLP || (n => "$" + Number(n).toLocaleString("es-CL"));

const state = {
  items: [],
  regions: [],
  selectedRegion: null,
  selectedCounty: null,
  shipServices: [],
  selectedShip: null,
  submitting: false,
};

function getItems() {
  return (window.cartStore && window.cartStore.read()) || [];
}

function calcSubtotal() {
  return state.items.reduce((a, i) => a + (Number(i.price) || 0), 0);
}

function calcTotal() {
  // El envío es "por pagar" — no se cobra en la web, así que el total es el subtotal.
  return calcSubtotal();
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
  $("#co-ship-cost").textContent = state.selectedShip ? "Por pagar" : "—";
  $("#co-total").textContent = fmt(calcTotal());
}

function renderShipping() {
  const root = $("#co-shipping");
  root.classList.remove("loading");

  if (!state.selectedCounty) {
    root.innerHTML = `<p class="co-hint">Selecciona tu región y comuna para registrar la dirección de despacho.</p>`;
    return;
  }

  const countyName = $("#co-county").selectedOptions[0]?.textContent || "tu comuna";
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
  const ok =
    form.name.value.trim() &&
    /\S+@\S+\.\S+/.test(form.email.value) &&
    form.phone.value.trim() &&
    state.selectedRegion &&
    state.selectedCounty &&
    form.street.value.trim() &&
    form.number.value.trim() &&
    state.selectedShip &&
    !state.submitting;
  $("#co-submit").disabled = !ok;
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

// ---------- Carga de regiones ----------
async function loadRegions() {
  const sel = $("#co-region");
  try {
    const { regions } = await apiGet("/api/chilexpress/regions");
    state.regions = regions || [];
    sel.innerHTML = '<option value="">Selecciona una región</option>';
    state.regions.forEach(r => {
      const opt = document.createElement("option");
      opt.value = r.regionCode || r.RegionCode;
      opt.textContent = r.regionName || r.RegionName;
      opt.dataset.id = r.regionId || r.RegionId || "";
      sel.appendChild(opt);
    });
  } catch (err) {
    console.error(err);
    sel.innerHTML = `<option value="">Error: ${err.message}</option>`;
  }
}

async function loadCounties(regionCode) {
  const sel = $("#co-county");
  sel.disabled = true;
  sel.innerHTML = '<option value="">Cargando comunas…</option>';
  try {
    const { areas } = await apiGet(`/api/chilexpress/coverage?regionCode=${encodeURIComponent(regionCode)}`);
    sel.innerHTML = '<option value="">Selecciona comuna</option>';
    (areas || []).forEach(a => {
      const opt = document.createElement("option");
      opt.value = a.countyCode || a.CountyCode;
      opt.textContent = a.countyName || a.CountyName;
      sel.appendChild(opt);
    });
    sel.disabled = false;
  } catch (err) {
    console.error(err);
    sel.innerHTML = `<option value="">Error: ${err.message}</option>`;
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
  };

  const regionOpt = $("#co-region").selectedOptions[0];
  const countyOpt = $("#co-county").selectedOptions[0];

  const shipping = {
    name: state.selectedShip.name,
    cost: state.selectedShip.price,
    serviceCode: state.selectedShip.code,
    address: {
      region: regionOpt?.textContent || "",
      regionCode: regionOpt?.value || "",
      county: countyOpt?.textContent || "",
      countyCode: countyOpt?.value || "",
      street: form.street.value.trim(),
      number: form.number.value.trim(),
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
    });
    // Guardar el orderId para que la página de retorno pueda consultarlo.
    sessionStorage.setItem("iphoneup_last_order", orderId);
    // Limpiar carro — el pago se está procesando.
    window.cartStore.write([]);
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

// ---------- Init ----------
function init() {
  state.items = getItems();
  if (state.items.length === 0) {
    $("#checkout-grid").style.display = "none";
    $("#checkout-empty").style.display = "block";
    return;
  }

  renderItems();
  renderTotals();
  loadRegions();

  const form = $("#checkout-form");
  form.addEventListener("input", updateSubmitEnabled);
  form.addEventListener("change", updateSubmitEnabled);
  form.addEventListener("submit", onSubmit);

  $("#co-region").addEventListener("change", e => {
    state.selectedRegion = e.target.value;
    state.selectedCounty = null;
    state.selectedShip = null;
    state.shipServices = [];
    renderShipping();
    renderTotals();
    if (state.selectedRegion) loadCounties(state.selectedRegion);
    updateSubmitEnabled();
  });
  $("#co-county").addEventListener("change", e => {
    state.selectedCounty = e.target.value;
    if (state.selectedCounty) {
      setPorPagarShipping();
    } else {
      state.selectedShip = null;
      renderShipping();
      renderTotals();
      updateSubmitEnabled();
    }
  });
}

document.addEventListener("DOMContentLoaded", init);
