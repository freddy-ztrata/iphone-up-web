// iPhone UP — Admin "Neon Console"
// Vanilla Alpine.js + fetch. Sin build step.

function adminApp() {
  return {
    // ----- State -----
    session: null,
    loginForm: { email: "", password: "" },
    loginError: "",
    loggingIn: false,

    view: "dashboard",
    sidebarExpanded: false,
    settingsTab: "users",

    products: [],
    coupons: [],
    orders: [],
    users: [],
    audit: [],
    dashboard: null,
    systemInfo: null,
    loadingProducts: false,
    orderFilter: "",

    drawer: { open: false, title: "", html: "" },
    palette: { open: false, query: "", results: [], idx: 0 },
    toasts: [],
    bulkPriceOpen: false,

    nav: [
      { id: "dashboard", label: "Dashboard", icon: "◐" },
      { id: "catalog",   label: "Catálogo",  icon: "▦" },
      { id: "stock",     label: "Stock",     icon: "◫" },
      { id: "coupons",   label: "Cupones",   icon: "🎟" },
      { id: "orders",    label: "Órdenes",   icon: "▤" },
      { id: "settings",  label: "Ajustes",   icon: "⚙" },
    ],

    // ----- Lifecycle -----
    async init() {
      this.paintLoginWaves();
      await this.fetchMe();
      this.bindKeyboard();
    },

    paintLoginWaves() {
      const g = document.getElementById("wave-paths-login");
      if (!g) return;
      const NS = "http://www.w3.org/2000/svg";
      for (let i = 0; i < 24; i++) {
        const p = document.createElementNS(NS, "path");
        p.setAttribute("d", `M -100 ${100 + i * 30} Q 300 ${50 + i * 25}, 600 ${200 + i * 28} T 1300 ${150 + i * 30}`);
        p.setAttribute("stroke", i % 3 === 0 ? "url(#aw)" : "rgba(255,255,255,0.08)");
        p.setAttribute("stroke-width", i % 5 === 0 ? "1.2" : "0.6");
        p.setAttribute("fill", "none");
        g.appendChild(p);
      }
    },

    bindKeyboard() {
      window.addEventListener("keydown", (e) => {
        // Esc siempre funciona (para cerrar palette/drawer)
        if (e.key === "Escape") {
          if (this.palette.open) this.palette.open = false;
          else if (this.drawer.open) this.closeDrawer();
          return;
        }

        // El resto de atajos solo cuando hay sesión y no estamos tipeando en un input.
        if (!this.session) return;
        const tag = (e.target?.tagName || "").toLowerCase();
        if (tag === "input" || tag === "textarea" || tag === "select") return;

        // ⌘K / Ctrl+K → command palette
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
          e.preventDefault();
          this.openPalette();
          return;
        }
        // G + letra → navegación
        if (e.key.toLowerCase() === "g" && !e.metaKey && !e.ctrlKey) {
          this._gPressed = true;
          setTimeout(() => { this._gPressed = false; }, 800);
          return;
        }
        if (this._gPressed) {
          const map = { p: "catalog", o: "orders", s: "stock", c: "coupons", d: "dashboard", u: "settings" };
          const target = map[e.key.toLowerCase()];
          if (target) { this.goto(target); this._gPressed = false; }
        }
      });
    },

    // ----- Auth -----
    async fetchMe() {
      try {
        const r = await fetch("/api/admin/auth/me", { credentials: "include" });
        if (r.ok) {
          this.session = await r.json();
          this.loadDashboard();
        }
      } catch {}
    },

    async login() {
      this.loginError = "";
      this.loggingIn = true;
      try {
        const r = await fetch("/api/admin/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(this.loginForm),
        });
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || "Error");
        this.session = data.user;
        this.toast("¡Bienvenido!", "success");
        this.loadDashboard();
      } catch (err) {
        this.loginError = err.message;
      } finally {
        this.loggingIn = false;
      }
    },

    async logout() {
      await fetch("/api/admin/auth/logout", { method: "POST", credentials: "include" });
      this.session = null;
    },

    // ----- Navigation -----
    goto(viewId) {
      this.view = viewId;
      if (viewId === "catalog") this.loadProducts();
      if (viewId === "stock") this.loadProducts();
      if (viewId === "coupons") this.loadCoupons();
      if (viewId === "orders") this.loadOrders();
      if (viewId === "dashboard") this.loadDashboard();
      if (viewId === "settings") { this.loadUsers(); this.loadSystemInfo(); }
    },

    // ----- Data loaders -----
    async api(method, path, body) {
      const opts = {
        method,
        credentials: "include",
        headers: body ? { "Content-Type": "application/json" } : {},
      };
      if (body) opts.body = JSON.stringify(body);
      const r = await fetch("/api/admin" + path, opts);
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
      return data;
    },

    async loadProducts() {
      this.loadingProducts = true;
      try {
        const { products } = await this.api("GET", "/products");
        this.products = products;
      } catch (err) {
        this.toast(err.message, "error");
      } finally {
        this.loadingProducts = false;
      }
    },

    async loadCoupons() {
      try {
        const { coupons } = await this.api("GET", "/coupons");
        this.coupons = coupons;
      } catch (err) { this.toast(err.message, "error"); }
    },

    async loadOrders() {
      try {
        const q = this.orderFilter ? "?status=" + this.orderFilter : "";
        const { orders } = await this.api("GET", "/orders" + q);
        this.orders = orders;
      } catch (err) { this.toast(err.message, "error"); }
    },

    async loadUsers() {
      try {
        const { users } = await this.api("GET", "/users");
        this.users = users;
      } catch (err) { this.toast(err.message, "error"); }
    },

    async loadAudit() {
      try {
        const { entries } = await this.api("GET", "/audit-log");
        this.audit = entries;
      } catch (err) { this.toast(err.message, "error"); }
    },

    async loadDashboard() {
      try {
        this.dashboard = await this.api("GET", "/dashboard");
      } catch (err) { /* silent */ }
    },

    async loadSystemInfo() {
      try {
        const r = await fetch("/api/health");
        this.systemInfo = await r.json();
      } catch {}
    },

    // ----- Mutations -----
    async updateVariantPrice(variantId, newPriceStr, storage) {
      const newPrice = parseInt(newPriceStr, 10);
      if (!variantId || !newPrice || newPrice === storage.p) return;
      const before = storage.p;
      try {
        await this.api("PATCH", "/products/variants/" + variantId, { price: newPrice });
        storage.p = newPrice;
        this.toast(`Precio actualizado a ${this.fmtCLP(newPrice)}`, "success", () => {
          this.api("PATCH", "/products/variants/" + variantId, { price: before });
          storage.p = before;
          this.toast("Precio restaurado", "info");
        });
      } catch (err) {
        this.toast(err.message, "error");
      }
    },

    async toggleHidden(product) {
      const newHidden = !product.hidden;
      try {
        await this.api("PATCH", "/products/" + product.id, { hidden: newHidden });
        product.hidden = newHidden;
        this.toast(newHidden ? "Producto ocultado" : "Producto visible", "success");
      } catch (err) {
        this.toast(err.message, "error");
      }
    },

    async openStockPopover(storage) {
      const delta = prompt(
        `Stock actual: ${storage.stock}\n\n¿Cuánto ajustar?\n(+5 para agregar, -2 para restar)\nMotivo después del / opcional: "+5 / ingreso nuevo lote"`
      );
      if (!delta) return;
      const [deltaStr, ...noteParts] = delta.split("/");
      const deltaNum = parseInt(deltaStr.trim(), 10);
      if (isNaN(deltaNum)) return this.toast("Delta inválido", "error");
      const note = noteParts.join("/").trim() || null;
      try {
        const updated = await this.api("POST", "/products/variants/" + storage.variant_id + "/stock", {
          delta: deltaNum, reason: "manual", note,
        });
        storage.stock = updated.stock;
        this.toast(`Stock ahora: ${updated.stock}`, "success");
      } catch (err) {
        this.toast(err.message, "error");
      }
    },

    openProductDetail(productId) {
      const p = this.products.find(p => p.id === productId);
      if (!p) return;
      this.drawer.title = "iPhone " + p.line;
      this.drawer.html = `
        <p style="color:var(--text-dim)">${p.models.length} modelos · ${p.models.reduce((a, m) => a + m.storages.length, 0)} variantes</p>
        <p style="margin-top:16px;color:var(--text-dim);font-size:13px">Para editar precio, vuelve a la tabla y haz click directo en el valor. Próximamente: edición avanzada acá.</p>
      `;
      this.drawer.open = true;
    },

    newProduct() {
      this.toast("Próximamente: crear producto desde admin (por ahora editar data.js)", "info");
    },

    // ----- Cupones -----
    newCoupon() {
      this.drawer.title = "Nuevo cupón";
      this.drawer.html = `
        <form onsubmit="event.preventDefault(); window.__admin.createCouponSubmit(this);">
          <label><span style="font-size:11px;color:var(--text-mute);text-transform:uppercase;letter-spacing:.08em">Código</span>
            <input name="code" required placeholder="BLACKFRIDAY30" style="text-transform:uppercase" />
          </label>
          <label><span style="font-size:11px;color:var(--text-mute);text-transform:uppercase;letter-spacing:.08em">Tipo</span>
            <select name="type">
              <option value="percent">Porcentaje (%)</option>
              <option value="fixed">Monto fijo ($)</option>
            </select>
          </label>
          <label><span style="font-size:11px;color:var(--text-mute);text-transform:uppercase;letter-spacing:.08em">Valor</span>
            <input name="value" type="number" required min="1" placeholder="30" />
          </label>
          <label><span style="font-size:11px;color:var(--text-mute);text-transform:uppercase;letter-spacing:.08em">Subtotal mínimo (opcional)</span>
            <input name="min_subtotal" type="number" min="0" placeholder="0" />
          </label>
          <label><span style="font-size:11px;color:var(--text-mute);text-transform:uppercase;letter-spacing:.08em">Tope de usos (opcional)</span>
            <input name="max_uses" type="number" min="1" placeholder="100" />
          </label>
          <label><span style="font-size:11px;color:var(--text-mute);text-transform:uppercase;letter-spacing:.08em">Vigente desde (opcional)</span>
            <input name="starts_at" type="datetime-local" />
          </label>
          <label><span style="font-size:11px;color:var(--text-mute);text-transform:uppercase;letter-spacing:.08em">Vigente hasta (opcional)</span>
            <input name="ends_at" type="datetime-local" />
          </label>
          <button type="submit" class="ac-btn-primary" style="width:100%;margin-top:8px">Crear cupón</button>
        </form>
      `;
      this.drawer.open = true;
      window.__admin = this;
    },

    async createCouponSubmit(form) {
      const fd = new FormData(form);
      const body = {
        code: fd.get("code"),
        type: fd.get("type"),
        value: Number(fd.get("value")),
        min_subtotal: fd.get("min_subtotal") ? Number(fd.get("min_subtotal")) : 0,
        max_uses: fd.get("max_uses") ? Number(fd.get("max_uses")) : null,
        starts_at: fd.get("starts_at") || null,
        ends_at: fd.get("ends_at") || null,
      };
      try {
        await this.api("POST", "/coupons", body);
        this.toast("Cupón creado", "success");
        this.closeDrawer();
        this.loadCoupons();
      } catch (err) {
        this.toast(err.message, "error");
      }
    },

    editCoupon(c) {
      // Reuso newCoupon UI con prefill (simplificado por ahora)
      this.toast("Edición de cupón: próximamente. Por ahora, eliminar y crear de nuevo.", "info");
    },

    async toggleCoupon(c) {
      try {
        await this.api("PATCH", "/coupons/" + c.id, { is_active: !c.is_active });
        c.is_active = !c.is_active;
        this.toast(c.is_active ? "Cupón activado" : "Cupón pausado", "success");
      } catch (err) { this.toast(err.message, "error"); }
    },

    async deleteCoupon(c) {
      if (!confirm(`¿Eliminar cupón ${c.code}?`)) return;
      try {
        await this.api("DELETE", "/coupons/" + c.id);
        this.coupons = this.coupons.filter(x => x.id !== c.id);
        this.toast("Cupón eliminado", "success");
      } catch (err) { this.toast(err.message, "error"); }
    },

    isCouponExpired(c) {
      if (c.ends_at && new Date(c.ends_at) < new Date()) return true;
      if (c.max_uses != null && c.used_count >= c.max_uses) return true;
      return false;
    },

    couponValidityLabel(c) {
      const now = new Date();
      if (c.starts_at && new Date(c.starts_at) > now) return "Comienza " + new Date(c.starts_at).toLocaleDateString("es-CL");
      if (c.ends_at) return "Hasta " + new Date(c.ends_at).toLocaleDateString("es-CL");
      return "Sin vencimiento";
    },

    // ----- Órdenes -----
    async openOrderDetail(id) {
      try {
        const o = await this.api("GET", "/orders/" + id);
        const items = (o.items || []).map(i =>
          `<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border)">
            <span>${i.model} ${i.storage || ""}</span><span class="ac-mono">${this.fmtCLP(i.price)}</span>
          </div>`
        ).join("");
        this.drawer.title = "Orden " + o.id;
        this.drawer.html = `
          <div style="margin-bottom:16px">
            <span class="ac-state-pill state-${o.status}">${o.status}</span>
          </div>
          <h3 style="font-size:13px;color:var(--text-mute);text-transform:uppercase;letter-spacing:.08em;margin:16px 0 8px">Cliente</h3>
          <p style="margin:0;font-size:14px">${o.buyer?.name || "—"}<br/><span style="color:var(--text-dim)">${o.buyer?.email || ""}</span><br/><span style="color:var(--text-dim)">${o.buyer?.phone || ""}</span></p>
          <h3 style="font-size:13px;color:var(--text-mute);text-transform:uppercase;letter-spacing:.08em;margin:16px 0 8px">Envío</h3>
          <p style="margin:0;font-size:14px">${o.shipping?.address?.street || ""} ${o.shipping?.address?.number || ""}, ${o.shipping?.address?.county || ""}, ${o.shipping?.address?.region || ""}</p>
          <h3 style="font-size:13px;color:var(--text-mute);text-transform:uppercase;letter-spacing:.08em;margin:16px 0 8px">Items</h3>
          ${items}
          <div style="display:flex;justify-content:space-between;padding:8px 0;color:var(--text-dim)"><span>Envío</span><span class="ac-mono">${this.fmtCLP(o.shipping_cost || 0)}</span></div>
          <div style="display:flex;justify-content:space-between;padding:8px 0;font-weight:800;font-size:18px;color:var(--accent)"><span>Total</span><span class="ac-mono">${this.fmtCLP(o.total)}</span></div>
          ${o.buyer?.phone ? `<a href="https://wa.me/${o.buyer.phone.replace(/[^0-9]/g, '')}" target="_blank" class="ac-btn-ghost" style="display:block;text-align:center;margin-top:18px;text-decoration:none">Contactar por WhatsApp</a>` : ""}
        `;
        this.drawer.open = true;
      } catch (err) { this.toast(err.message, "error"); }
    },

    // ----- Users -----
    newUser() {
      const email = prompt("Email del nuevo usuario:");
      if (!email) return;
      const password = prompt("Contraseña (mínimo 8 caracteres):");
      if (!password) return;
      const name = prompt("Nombre:") || "";
      this.api("POST", "/users", { email, password, name, role: "admin" })
        .then(() => { this.toast("Usuario creado", "success"); this.loadUsers(); })
        .catch(err => this.toast(err.message, "error"));
    },

    editUser(u) {
      const action = confirm(`Usuario: ${u.email}\nAceptar = resetear contraseña\nCancelar = ${u.is_active ? 'desactivar' : 'activar'}`);
      if (action) {
        const pw = prompt("Nueva contraseña (mínimo 8):");
        if (pw) this.api("PATCH", "/users/" + u.id, { password: pw })
          .then(() => this.toast("Contraseña reseteada", "success"))
          .catch(err => this.toast(err.message, "error"));
      } else {
        this.api("PATCH", "/users/" + u.id, { is_active: !u.is_active })
          .then(() => { u.is_active = !u.is_active; this.toast("Usuario actualizado", "success"); })
          .catch(err => this.toast(err.message, "error"));
      }
    },

    // ----- Command palette -----
    openPalette() {
      this.palette.open = true;
      this.palette.query = "";
      this.palette.results = this.allPaletteItems();
      this.palette.idx = 0;
      this.$nextTick(() => this.$refs.paletteInput?.focus());
    },

    allPaletteItems() {
      const nav = this.nav.map(n => ({ label: "Ir a " + n.label, icon: "→", action: () => this.goto(n.id) }));
      const products = this.products.flatMap(p => p.models.flatMap(m => m.storages.map(s => ({
        label: `${m.name} ${s.s} — ${this.fmtCLP(s.p)}`,
        hint: `Stock: ${s.stock}`,
        icon: "▦",
        action: () => { this.goto("catalog"); }
      }))));
      return [...nav, ...products].slice(0, 50);
    },

    filterPalette() {
      const q = this.palette.query.toLowerCase().trim();
      if (!q) { this.palette.results = this.allPaletteItems(); return; }
      this.palette.results = this.allPaletteItems().filter(r =>
        r.label.toLowerCase().includes(q) || (r.hint || "").toLowerCase().includes(q)
      ).slice(0, 20);
      this.palette.idx = 0;
    },

    runPalette() {
      const r = this.palette.results[this.palette.idx];
      if (r && r.action) {
        r.action();
        this.palette.open = false;
      }
    },

    // ----- Drawer -----
    closeDrawer() { this.drawer.open = false; },

    // ----- Toasts -----
    toast(msg, kind = "info", undo = null) {
      const id = Math.random().toString(36).slice(2);
      this.toasts.push({ id, msg, kind, undo });
      setTimeout(() => this.removeToast(id), undo ? 6000 : 4000);
    },
    removeToast(id) {
      this.toasts = this.toasts.filter(t => t.id !== id);
    },

    // ----- Utils -----
    fmtCLP(n) {
      if (n == null || isNaN(n)) return "—";
      return "$" + Number(n).toLocaleString("es-CL");
    },
    timeAgo(iso) {
      if (!iso) return "";
      const d = new Date(iso.replace(" ", "T") + (iso.endsWith("Z") ? "" : "Z"));
      const sec = Math.floor((Date.now() - d.getTime()) / 1000);
      if (sec < 60) return "hace " + sec + "s";
      if (sec < 3600) return "hace " + Math.floor(sec/60) + " min";
      if (sec < 86400) return "hace " + Math.floor(sec/3600) + " h";
      return "hace " + Math.floor(sec/86400) + " días";
    },
    todayLabel() {
      const d = new Date();
      const days = ["domingo","lunes","martes","miércoles","jueves","viernes","sábado"];
      const months = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
      return `Hoy es ${days[d.getDay()]} ${d.getDate()} de ${months[d.getMonth()]} · ${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
    },
    greeting() {
      const h = new Date().getHours();
      if (h < 12) return "Buenos días";
      if (h < 19) return "Buenas tardes";
      return "Buenas noches";
    },
    greetingEmoji() {
      const h = new Date().getHours();
      if (h < 12) return "☕";
      if (h < 19) return "👋";
      return "🌙";
    },
    visibleVariantCount() {
      return this.products.reduce((a, p) => a + p.models.reduce((b, m) => b + m.storages.length, 0), 0);
    },
    describeActivity(ev) {
      const actions = { create: "creó", update: "editó", delete: "eliminó", login: "inició sesión",
                        stock_adjust: "ajustó stock de", bulk_price: "hizo ajuste masivo de precio en", reorder: "reordenó" };
      return ` ${actions[ev.action] || ev.action} ${ev.entity_type}${ev.entity_id ? " #" + ev.entity_id : ""}`;
    },

    // sparkline
    get sparkPoints() {
      if (!this.dashboard?.sparkline?.length) return "0,40 200,40";
      const pts = this.dashboard.sparkline;
      const max = Math.max(...pts.map(p => p.total), 1);
      const w = 200, h = 50, pad = 4;
      return pts.map((p, i) => {
        const x = pad + (i / Math.max(pts.length - 1, 1)) * (w - pad*2);
        const y = h - pad - (p.total / max) * (h - pad*2);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      }).join(" ");
    },
  };
}
