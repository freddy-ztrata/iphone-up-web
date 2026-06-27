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
    sidebarExpanded: true,
    settingsTab: "users",

    products: [],
    coupons: [],
    orders: [],
    users: [],
    audit: [],
    dashboard: null,
    analytics: { realtime: null, overview: null, days: 30 },
    systemInfo: null,
    loadingProducts: false,
    orderFilter: "",

    drawer: { open: false, title: "", html: "" },
    palette: { open: false, query: "", results: [], idx: 0 },
    toasts: [],
    bulkPriceOpen: false,
    prodEditor: { open: false, draft: null, original: null, saving: false },
    userEditor: { open: false, mode: "create", id: null, email: "", name: "", role: "admin", password: "", is_active: true, saving: false },
    userRoleOpen: false,
    confirmBox: { open: false, message: "", _resolve: null },
    promptBox: { open: false, message: "", value: "", type: "text", _resolve: null },

    nav: [
      { id: "dashboard", label: "Dashboard", icon: "◐" },
      { id: "analytics", label: "Analítica", icon: "📈" },
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
      if (viewId !== "analytics") this.stopRealtime();
      this.view = viewId;
      if (viewId === "catalog") this.loadProducts();
      if (viewId === "stock") this.loadProducts();
      if (viewId === "coupons") this.loadCoupons();
      if (viewId === "orders") this.loadOrders();
      if (viewId === "dashboard") this.loadDashboard();
      if (viewId === "analytics") this.loadAnalytics();
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

    // ----- Analítica -----
    async loadAnalytics() {
      this.loadRealtime();
      try { this.analytics.overview = await this.api("GET", "/analytics/overview?days=" + this.analytics.days); } catch (e) {}
      this.startRealtime();
    },
    async loadRealtime() {
      try { this.analytics.realtime = await this.api("GET", "/analytics/realtime"); } catch (e) {}
    },
    startRealtime() {
      this.stopRealtime();
      this._rtTimer = setInterval(() => {
        if (this.view === "analytics") this.loadRealtime();
        else this.stopRealtime();
      }, 12000);
    },
    stopRealtime() { if (this._rtTimer) { clearInterval(this._rtTimer); this._rtTimer = null; } },
    analyticsBarH(v) {
      const days = (this.analytics.overview && this.analytics.overview.perDay) || [];
      const max = Math.max(1, ...days.map(d => d.sessions));
      return Math.max(4, Math.round((Number(v) / max) * 100));
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
      const val = await this.askPrompt(`Stock actual: ${storage.stock}. Ingresa el nuevo stock:`, { defaultValue: String(storage.stock), type: "number" });
      if (val == null || val === "") return;
      await this.setStockValue(storage, val);
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

    // ----- Productos: crear + editor con GUARDADO EXPLÍCITO (estilo Shopify) -----
    async newProduct() {
      const maxLine = Math.max(0, ...this.products.map(p => parseInt(p.line, 10) || 0));
      try {
        const created = await this.api("POST", "/products", { line: String(maxLine + 1), year: new Date().getFullYear() });
        if (!Array.isArray(created.models)) created.models = [];
        this.products.unshift(created);
        this.openProductEditor(created.id);
        this.toast("Producto creado — agrega modelos/variantes y dale Guardar", "success");
      } catch (err) { this.toast(err.message, "error"); }
    },

    // Abre el editor con una COPIA (borrador). Nada se guarda hasta "Guardar cambios".
    openProductEditor(productId) {
      const p = this.products.find(x => x.id === productId);
      if (!p) return;
      const clone = JSON.parse(JSON.stringify(p));
      if (!Array.isArray(clone.models)) clone.models = [];
      this.prodEditor.original = JSON.parse(JSON.stringify(clone));
      this.prodEditor.draft = clone;
      this.prodEditor.saving = false;
      this.prodEditor.open = true;
    },

    // --- Mutaciones SOLO en el borrador (no tocan el servidor hasta Guardar) ---
    addVariantDraft(model) {
      const last = model.storages[model.storages.length - 1];
      model.storages.push({ s: "128GB", color: "", p: last ? last.p : 0, stock: 0, variant_id: null, is_active: false });
    },
    removeVariantDraft(model, st) {
      model.storages = model.storages.filter(x => x !== st);
    },
    addModelDraft() {
      this.prodEditor.draft.models.push({ model_id: null, name: "Nuevo modelo", img: this.prodEditor.draft.img || "", sealed: false, storages: [], gallery: [] });
    },
    removeModelDraft(model) {
      this.prodEditor.draft.models = this.prodEditor.draft.models.filter(m => m !== model);
    },

    // --- Resumen por modelo (para la tabla de catálogo, 1 fila por modelo) ---
    modelVariantSummary(model) {
      const caps = new Set((model.storages || []).map(v => v.s)).size;
      const cols = new Set((model.storages || []).map(v => v.color || "").filter(Boolean)).size;
      return `${caps} cap · ${cols} color${cols === 1 ? "" : "es"}`;
    },
    modelPriceRange(model) {
      const ps = (model.storages || []).map(v => Number(v.p)).filter(n => n > 0);
      if (!ps.length) return "—";
      const mn = Math.min(...ps), mx = Math.max(...ps);
      return mn === mx ? this.fmtCLP(mn) : this.fmtCLP(mn) + " – " + this.fmtCLP(mx);
    },
    modelStockTotal(model) { return (model.storages || []).reduce((a, v) => a + (Number(v.stock) || 0), 0); },
    modelActiveCount(model) { return (model.storages || []).filter(v => v.is_active).length; },

    // --- Agrupado capacidad → color (para el editor) ---
    modelSizes(model) {
      const out = [];
      (model.storages || []).forEach(v => { if (!out.includes(v.s)) out.push(v.s); });
      return out;
    },
    colorsOfSize(model, size) { return (model.storages || []).filter(v => v.s === size); },
    addColorToSize(model, size) {
      const sib = (model.storages || []).find(v => v.s === size);
      model.storages.push({ s: size, color: "", p: sib ? sib.p : 0, stock: 0, variant_id: null, is_active: false, _k: Math.random().toString(36).slice(2) });
    },
    addSizeDraft(model) {
      model.storages.push({ s: "Nueva", color: "", p: 0, stock: 0, variant_id: null, is_active: false, _k: Math.random().toString(36).slice(2) });
    },
    removeSize(model, size) { model.storages = model.storages.filter(v => v.s !== size); },
    renameSize(model, oldSize, newSize) {
      const ns = (newSize || "").trim();
      if (!ns) return;
      (model.storages || []).forEach(v => { if (v.s === oldSize) v.s = ns; });
    },

    // Stock absoluto → delta (usado por el editor rápido de la tabla).
    async setStockValue(st, newVal) {
      const target = Math.round(Number(newVal));
      if (isNaN(target) || target < 0) { this.toast("Stock inválido", "error"); return; }
      const delta = target - st.stock;
      if (delta === 0) return;
      try {
        const updated = await this.api("POST", "/products/variants/" + st.variant_id + "/stock", { delta, reason: "manual", note: "Editor" });
        st.stock = updated.stock;
        this.toast("Stock: " + updated.stock, "success");
      } catch (err) { this.toast(err.message, "error"); }
    },

    // --- Guardar: aplica el borrador (crea/actualiza/elimina) en una sola tanda ---
    async saveProductDraft() {
      if (this.prodEditor.saving) return;
      const d = this.prodEditor.draft, orig = this.prodEditor.original;
      this.prodEditor.saving = true;
      try {
        await this.api("PATCH", "/products/" + d.id, { line: d.line, year: d.year, hero_img: d.img || "", hidden: !!d.hidden });

        // Modelos eliminados (estaban en original, ya no en el borrador)
        const draftModelIds = new Set(d.models.filter(m => m.model_id).map(m => m.model_id));
        for (const om of (orig.models || [])) {
          if (om.model_id && !draftModelIds.has(om.model_id)) await this.api("DELETE", "/products/models/" + om.model_id);
        }

        // Modelos: crear (sin id) o actualizar; luego sus variantes
        for (const m of d.models) {
          let modelId = m.model_id;
          if (!modelId) {
            const created = await this.api("POST", "/products/" + d.id + "/models", { name: m.name, img: m.img || "", sealed: !!m.sealed });
            modelId = created.id;
          } else {
            await this.api("PATCH", "/products/models/" + modelId, { name: m.name, img: m.img || "", sealed: !!m.sealed });
          }
          const om = (orig.models || []).find(x => x.model_id === modelId);
          const origVars = (om && om.storages) || [];
          const draftVarIds = new Set(m.storages.filter(s => s.variant_id).map(s => s.variant_id));
          for (const ov of origVars) {
            if (ov.variant_id && !draftVarIds.has(ov.variant_id)) await this.api("DELETE", "/products/variants/" + ov.variant_id);
          }
          for (const s of m.storages) {
            if (!s.variant_id) {
              await this.api("POST", "/products/models/" + modelId + "/variants", { storage: s.s, color: s.color || "", price: Math.round(Number(s.p)) || 0, stock: Math.round(Number(s.stock)) || 0, is_active: !!s.is_active });
            } else {
              await this.api("PATCH", "/products/variants/" + s.variant_id, { storage: s.s, color: s.color || "", price: Math.round(Number(s.p)) || 0, is_active: !!s.is_active });
              const ov = origVars.find(x => x.variant_id === s.variant_id);
              const origStock = ov ? Number(ov.stock) : 0;
              const newStock = Number(s.stock) || 0;
              if (newStock !== origStock) {
                await this.api("POST", "/products/variants/" + s.variant_id + "/stock", { delta: newStock - origStock, reason: "manual", note: "Editor" });
              }
            }
          }
        }
        this.toast("Cambios guardados ✓", "success");
        await this.loadProducts();
        this.prodEditor.open = false;
      } catch (err) {
        this.toast("Error al guardar: " + err.message, "error");
      } finally {
        this.prodEditor.saving = false;
      }
    },

    async deleteProduct() {
      const p = this.prodEditor.draft;
      if (!(await this.askConfirm(`¿Eliminar TODO el producto (línea ${p.line}) con sus modelos y variantes? No se puede deshacer.`))) return;
      try {
        await this.api("DELETE", "/products/" + p.id);
        this.products = this.products.filter(x => x.id !== p.id);
        this.prodEditor.open = false;
        this.prodEditor.draft = null;
        this.toast("Producto eliminado", "success");
      } catch (err) { this.toast(err.message, "error"); }
    },

    // ----- Galería de fotos (estilo Shopify) -----
    async uploadModelImages(model, fileList) {
      const files = Array.from(fileList || []).filter(f => f && f.type && f.type.startsWith("image/"));
      if (!files.length) return;
      if (!model.model_id) { this.toast("Guarda el producto antes de subir fotos a un modelo nuevo", "info"); return; }
      if (!Array.isArray(model.gallery)) model.gallery = [];
      let ok = 0;
      for (const file of files) {
        const fd = new FormData();
        fd.append("file", file);
        fd.append("owner_type", "model");
        fd.append("owner_id", model.model_id);
        fd.append("position", String(model.gallery.length));
        try {
          const r = await fetch("/api/admin/uploads/image", { method: "POST", credentials: "include", body: fd });
          const data = await r.json().catch(() => ({}));
          if (!r.ok) throw new Error(data.error || "Error al subir");
          model.gallery.push({ id: data.id, url: data.url, alt: data.alt || "", position: data.position });
          if (!model.img) model.img = data.url; // imagen principal en el borrador; se persiste al Guardar
          ok++;
        } catch (err) { this.toast(err.message, "error"); }
      }
      if (ok) this.toast(ok > 1 ? `${ok} fotos subidas` : "Foto subida", "success");
    },

    async uploadProductHero(product, fileList) {
      const file = Array.from(fileList || [])[0];
      if (!file || !file.type || !file.type.startsWith("image/")) return;
      const fd = new FormData();
      fd.append("file", file);
      fd.append("owner_type", "product");
      fd.append("owner_id", product.id);
      try {
        const r = await fetch("/api/admin/uploads/image", { method: "POST", credentials: "include", body: fd });
        const data = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(data.error || "Error al subir");
        product.img = data.url; // en el borrador; se persiste al Guardar
        this.toast("Imagen subida", "success");
      } catch (err) { this.toast(err.message, "error"); }
    },

    setModelMainImage(model, url) {
      model.img = url; // en el borrador; se persiste al Guardar
    },

    async deleteModelImage(model, img) {
      if (!(await this.askConfirm("¿Eliminar esta foto?"))) return;
      try {
        await this.api("DELETE", "/uploads/image/" + img.id);
        model.gallery = model.gallery.filter(g => g.id !== img.id);
        this.toast("Foto eliminada", "success");
      } catch (err) { this.toast(err.message, "error"); }
    },

    galleryDragStart(model, index) { this._galleryDrag = { modelId: model.model_id, index }; },
    async galleryDrop(model, targetIndex) {
      const d = this._galleryDrag;
      this._galleryDrag = null;
      if (!d || d.modelId !== model.model_id || d.index == null || d.index === targetIndex) return;
      const arr = model.gallery;
      if (targetIndex < 0 || targetIndex >= arr.length) return;
      const [moved] = arr.splice(d.index, 1);
      arr.splice(targetIndex, 0, moved);
      try { await this.api("POST", "/uploads/reorder", { ids: arr.map(g => g.id) }); }
      catch (err) { this.toast(err.message, "error"); }
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
      if (!(await this.askConfirm(`¿Eliminar cupón ${c.code}?`))) return;
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
            <span>${i.model} ${i.storage || ""}${i.color ? " · " + i.color : ""}</span><span class="ac-mono">${this.fmtCLP(i.price)}</span>
          </div>`
        ).join("");
        this.drawer.title = "Orden " + o.id;
        this.drawer.html = `
          <div style="margin-bottom:16px">
            <span class="ac-state-pill state-${o.status}">${o.status}</span>
          </div>
          <h3 style="font-size:13px;color:var(--text-mute);text-transform:uppercase;letter-spacing:.08em;margin:16px 0 8px">Cliente</h3>
          <p style="margin:0;font-size:14px">${o.buyer?.name || "—"}<br/><span style="color:var(--text-dim)">${o.buyer?.email || ""}</span><br/><span style="color:var(--text-dim)">${o.buyer?.phone || ""}</span>${o.buyer?.rut ? '<br/><span style="color:var(--text-dim)">RUT: ' + o.buyer.rut + '</span>' : ''}${o.buyer?.instagram ? '<br/><span style="color:var(--text-dim)">IG: ' + o.buyer.instagram + '</span>' : ''}${o.buyer?.color ? '<br/><span style="color:var(--text-dim)">Color: ' + o.buyer.color + '</span>' : ''}</p>
          <h3 style="font-size:13px;color:var(--text-mute);text-transform:uppercase;letter-spacing:.08em;margin:16px 0 8px">${(o.shipping?.method === 'pickup' || o.shipping?.serviceCode === 'PICKUP') ? 'Retiro en tienda' : 'Envío'}</h3>
          <p style="margin:0;font-size:14px">${(o.shipping?.method === 'pickup' || o.shipping?.serviceCode === 'PICKUP') ? '🏬 ' + (o.shipping?.address?.store || 'Padre Mariano 98, Of. 105, Providencia') : ('Sucursal Chilexpress: ' + (o.shipping?.address?.branch || ((o.shipping?.address?.street || '') + ' ' + (o.shipping?.address?.number || '')).trim() || '—') + ' — ' + (o.shipping?.address?.county || '') + ', ' + (o.shipping?.address?.region || ''))}</p>
          <h3 style="font-size:13px;color:var(--text-mute);text-transform:uppercase;letter-spacing:.08em;margin:16px 0 8px">Items</h3>
          ${items}
          <div style="display:flex;justify-content:space-between;padding:8px 0;color:var(--text-dim)"><span>Envío</span><span class="ac-mono">${(o.shipping?.method === 'pickup' || o.shipping?.serviceCode === 'PICKUP') ? 'Retiro en tienda' : (Number(o.shipping_cost) > 0 ? this.fmtCLP(o.shipping_cost) : 'Por pagar')}</span></div>
          <div style="display:flex;justify-content:space-between;padding:8px 0;font-weight:800;font-size:18px;color:var(--accent)"><span>Total</span><span class="ac-mono">${this.fmtCLP(o.total)}</span></div>
          ${o.buyer?.phone ? `<a href="https://wa.me/${o.buyer.phone.replace(/[^0-9]/g, '')}" target="_blank" class="ac-btn-ghost" style="display:block;text-align:center;margin-top:18px;text-decoration:none">Contactar por WhatsApp</a>` : ""}
          <button class="ac-btn-danger" style="width:100%;margin-top:10px" onclick="window.__admin.deleteOrder('${o.id}')">Eliminar orden</button>
        `;
        window.__admin = this;
        this.drawer.open = true;
      } catch (err) { this.toast(err.message, "error"); }
    },

    async deleteOrder(id) {
      if (!(await this.askConfirm("¿Eliminar esta orden? No se puede deshacer."))) return;
      try {
        await this.api("DELETE", "/orders/" + id);
        this.drawer.open = false;
        this.toast("Orden eliminada", "success");
        this.loadOrders();
      } catch (err) { this.toast(err.message, "error"); }
    },

    // ----- Usuarios: crear / editar -----
    openUserEditor(mode, user = null) {
      if (mode === "edit" && user) {
        this.userEditor = { open: true, mode: "edit", id: user.id, email: user.email, name: user.name || "", role: user.role || "admin", password: "", is_active: !!user.is_active, saving: false };
      } else {
        this.userEditor = { open: true, mode: "create", id: null, email: "", name: "", role: "admin", password: "", is_active: true, saving: false };
      }
    },

    async saveUser() {
      const e = this.userEditor;
      if (e.saving) return;
      if (e.mode === "create" && !/\S+@\S+\.\S+/.test(e.email)) return this.toast("Email inválido", "error");
      if (e.mode === "create" && (!e.password || e.password.length < 8)) return this.toast("Contraseña: mínimo 8 caracteres", "error");
      if (e.password && e.password.length < 8) return this.toast("Contraseña: mínimo 8 caracteres", "error");
      e.saving = true;
      try {
        if (e.mode === "create") {
          await this.api("POST", "/users", { email: e.email.trim(), name: e.name.trim(), role: e.role, password: e.password });
          this.toast("Usuario creado", "success");
        } else {
          const body = { name: e.name.trim(), role: e.role, is_active: e.is_active };
          if (e.password) body.password = e.password;
          await this.api("PATCH", "/users/" + e.id, body);
          this.toast("Usuario actualizado", "success");
        }
        this.userEditor.open = false;
        this.loadUsers();
      } catch (err) {
        this.toast(err.message, "error");
      } finally {
        this.userEditor.saving = false;
      }
    },

    // ----- Command palette -----
    openPalette() {
      if (!this.session) return;     // defensa extra: nunca abrir sin login
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

    // ----- Confirm / Prompt propios (sin popups nativos) -----
    askConfirm(message) {
      return new Promise(resolve => { this.confirmBox = { open: true, message, _resolve: resolve }; });
    },
    confirmResolve(val) {
      const r = this.confirmBox._resolve;
      this.confirmBox = { open: false, message: "", _resolve: null };
      if (r) r(val);
    },
    askPrompt(message, opts = {}) {
      return new Promise(resolve => {
        this.promptBox = { open: true, message, value: opts.defaultValue || "", type: opts.type || "text", _resolve: resolve };
        this.$nextTick(() => this.$refs.promptInput && this.$refs.promptInput.focus());
      });
    },
    promptResolve(ok) {
      const r = this.promptBox._resolve;
      const val = ok ? this.promptBox.value : null;
      this.promptBox = { open: false, message: "", value: "", type: "text", _resolve: null };
      if (r) r(val);
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
