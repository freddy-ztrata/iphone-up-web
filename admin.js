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
    system: { loading: false, error: "", updatedAt: null, showJson: false },
    payFee: { enabled: true, pct: 3.5, saving: false },
    // Editor visual de recompra. `models` son filas de UI (con `id` para el
    // :key de Alpine y `error` para el mensaje inline); el objeto que espera el
    // backend se arma recién al guardar. `json` es el modo técnico, oculto.
    tradein: {
      models: [], isDefault: true, loading: false, saving: false,
      error: "", showJson: false, json: "", jsonError: "", seq: 1,
    },
    loadingProducts: false,

    // Carritos abandonados
    carts: [],
    cartSummary: null,
    cartQuery: { status: "", payment: "", q: "", has_email: "", from: "", to: "" },
    cartPage: { total: 0, limit: 50, offset: 0, hasMore: false },
    loadingCarts: false,
    cartDrawer: { open: false, loading: false, cart: null, reminding: false },

    // Emails: config + log + supresiones
    // `templates` son los que se pueden probar (los manda /emails/config como
    // `testable`); `testResults` es el historial en pantalla de esta sesión.
    emails: {
      config: null, provider: null, scheduler: null, stats: null, pending: null,
      loading: false, saving: false, testing: false, running: false, testTo: "",
      templates: [], testingId: "", testResults: [],
    },
    // Aviso interno de ventas: campo de etiquetas (chips). Vive fuera de
    // `emails.config` a propósito — `draft` es lo que el usuario está
    // escribiendo y todavía no es un destinatario; recién al confirmarse (Enter,
    // separador, salir del campo) entra a `list`, que es lo que se guarda.
    internalTo: { list: [], draft: "", error: "", max: 10 },

    emailLog: [],
    emailLogQuery: { template: "", status: "", to_email: "" },
    emailLogPage: { total: 0, limit: 50, offset: 0, hasMore: false },
    loadingEmailLog: false,
    suppressions: [],
    suppressionForm: { email: "", reason: "manual", saving: false },

    // Órdenes: filtros + paginación (el server pagina; nunca traemos las 500 de una).
    orderQuery: { q: "", status: "", fulfillment_status: "", channel: "", from: "", to: "" },
    orderPage: { total: 0, limit: 50, offset: 0, hasMore: false },
    loadingOrders: false,

    // Detalle de orden. Es markup Alpine, NO html interpolado: los datos del
    // comprador (nombre, dirección, notas) son texto que escribe un tercero y
    // antes se inyectaban con x-html — cualquier <img onerror> en el checkout
    // se ejecutaba en la sesión del admin.
    orderDrawer: {
      open: false, loading: false, saving: false, tab: "detalle",
      order: null, history: [], historyLoaded: false,
      form: { fulfillment_status: "", tracking_code: "", tracking_carrier: "", admin_notes: "", status: "" },
    },
    manualOrder: null,
    couponEditor: null,
    bulkPrice: { open: false, scope: "all", type: "percent", value: "", preview: null, loading: false, applying: false, lastBatch: null },
    // Ajuste de stock + kardex de la variante (null = cerrado).
    stockModal: null,

    palette: { open: false, query: "", results: [], idx: 0 },
    toasts: [],
    prodEditor: { open: false, draft: null, original: null, saving: false },
    userEditor: { open: false, mode: "create", id: null, email: "", name: "", role: "admin", password: "", is_active: true, saving: false },
    userRoleOpen: false,
    confirmBox: { open: false, message: "", _resolve: null },
    promptBox: { open: false, message: "", value: "", type: "text", _resolve: null },

    // Catálogos de estados — mismos valores que valida el backend
    // (server/routes/admin/orders.js). Si agregás uno allá, agrégalo acá.
    FULFILLMENTS: [
      { id: "unfulfilled", label: "Sin preparar" },
      { id: "preparing",   label: "Preparando" },
      { id: "shipped",     label: "Enviado" },
      { id: "delivered",   label: "Entregado" },
      { id: "cancelled",   label: "Cancelado" },
    ],
    PAY_STATES: [
      { id: "pending",   label: "Pendiente" },
      { id: "approved",  label: "Aprobado" },
      { id: "rejected",  label: "Rechazado" },
      { id: "cancelled", label: "Cancelado" },
      { id: "refunded",  label: "Reembolsado" },
    ],
    CHANNELS: [
      { id: "online",    label: "Web (Mercado Pago)" },
      { id: "store",     label: "Tienda" },
      { id: "instagram", label: "Instagram" },
      { id: "transfer",  label: "Transferencia" },
      { id: "cash",      label: "Efectivo" },
    ],
    PAY_METHODS: [
      { id: "cash",        label: "Efectivo" },
      { id: "transfer",    label: "Transferencia" },
      { id: "card",        label: "Tarjeta / POS" },
      { id: "mercadopago", label: "Mercado Pago" },
      { id: "other",       label: "Otro" },
    ],

    // Estados de carrito — mismos valores que el CHECK de la migración 007.
    // Estado del CARRO. "Compró" es exclusivamente un pago aprobado por el
    // webhook de MP — crear la preferencia o quedar en pending no lo es.
    CART_STATES: [
      { id: "active",    label: "Activo" },
      { id: "recovered", label: "Volvió por el link" },
      { id: "converted", label: "Compró (pago aprobado)" },
      { id: "expired",   label: "Vencido" },
    ],
    // Estado del PAGO de la orden vinculada. Es información distinta del estado
    // del carro: uno con pago pendiente sigue estando activo y recuperable.
    CART_PAYMENTS: [
      { id: "approved", label: "Pago aprobado" },
      { id: "pending",  label: "Pago pendiente" },
      { id: "rejected", label: "Pago rechazado" },
      { id: "none",     label: "Sin intento de pago" },
    ],
    // Estados de email_log (server/migrations/007_emails_carts.sql).
    EMAIL_STATES: [
      { id: "sent",       label: "Enviado" },
      { id: "dry_run",    label: "Dry-run" },
      { id: "queued",     label: "En cola" },
      { id: "failed",     label: "Falló" },
      { id: "suppressed", label: "Excluido" },
      { id: "disabled",   label: "Desactivado" },
    ],
    SUPPRESSION_REASONS: [
      { id: "manual",      label: "Manual" },
      { id: "unsubscribe", label: "Se dio de baja" },
      { id: "bounce",      label: "Rebote" },
      { id: "complaint",   label: "Marcó spam" },
    ],

    nav: [
      { id: "dashboard", label: "Dashboard", icon: "◐" },
      { id: "analytics", label: "Analítica", icon: "📈" },
      { id: "catalog",   label: "Catálogo",  icon: "▦" },
      { id: "stock",     label: "Stock",     icon: "◫" },
      { id: "coupons",   label: "Cupones",   icon: "🎟" },
      { id: "orders",    label: "Órdenes",   icon: "▤" },
      { id: "carts",     label: "Carritos",  icon: "🛒" },
      { id: "settings",  label: "Ajustes",   icon: "⚙" },
    ],

    // ----- Lifecycle -----
    async init() {
      // `sidebarExpanded` significa dos cosas según el ancho: en desktop es
      // "rail de 240px vs 72px" (expandido por default), en ≤720px es "panel
      // off-canvas abierto" (cerrado por default, o taparía la pantalla).
      this.sidebarExpanded = !this.isMobile();
      this.paintLoginWaves();
      await this.fetchMe();
      this.bindKeyboard();
    },

    // Mismo breakpoint que el bloque off-canvas de admin.css. Si cambia allá,
    // cambia acá.
    isMobile() { return window.matchMedia("(max-width: 720px)").matches; },

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
        // Esc cierra la capa más alta que esté abierta (los modales propios
        // resuelven su promesa, así que no pueden cerrarse "a la fuerza").
        if (e.key === "Escape") {
          if (this.confirmBox.open) this.confirmResolve(false);
          else if (this.promptBox.open) this.promptResolve(false);
          else if (this.palette.open) this.palette.open = false;
          else if (this.stockModal) this.stockModal = null;
          else if (this.couponEditor) this.couponEditor = null;
          else if (this.manualOrder) this.manualOrder = null;
          else if (this.bulkPrice.open) this.closeBulkPrice();
          else if (this.userEditor.open) this.userEditor.open = false;
          else if (this.orderDrawer.open) this.closeOrderDrawer();
          else if (this.cartDrawer.open) this.closeCartDrawer();
          else if (this.prodEditor.open) this.closeProductEditor();
          else if (this.sidebarExpanded && this.isMobile()) this.sidebarExpanded = false;
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
          // 'r' de "recuperación" — 'c' ya la usan los cupones.
          const map = { p: "catalog", o: "orders", s: "stock", c: "coupons", d: "dashboard", u: "settings", r: "carts" };
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

    // Rol efectivo. El backend ya devuelve 403 en todo lo sensible; esto es
    // para no MOSTRAR botones que van a fallar (users, audit, settings,
    // eliminar, ajuste masivo, exports con datos del cliente).
    get isAdmin() { return this.session?.role === "admin"; },

    // ----- Navigation -----
    goto(viewId) {
      // En móvil el sidebar tapa el contenido: navegar implica cerrarlo.
      if (this.isMobile()) this.sidebarExpanded = false;
      if (viewId !== "analytics") this.stopRealtime();
      // Un editor no tiene Ajustes: si llega ahí por atajo, lo mandamos al inicio.
      if (viewId === "settings" && !this.isAdmin) viewId = "dashboard";
      this.view = viewId;
      if (viewId === "catalog") this.loadProducts();
      if (viewId === "stock") this.loadProducts();
      if (viewId === "coupons") this.loadCoupons();
      if (viewId === "orders") { this.orderPage.offset = 0; this.loadOrders(); }
      if (viewId === "carts") { this.cartPage.offset = 0; this.loadCarts(); }
      if (viewId === "dashboard") this.loadDashboard();
      if (viewId === "analytics") this.loadAnalytics();
      if (viewId === "settings") { this.loadUsers(); this.loadSystemInfo(); this.loadPaymentFee(); this.loadTradein(); this.loadEmails(); }
    },

    // Vistas visibles según rol (el sidebar itera sobre esto, no sobre `nav`).
    get visibleNav() {
      return this.isAdmin ? this.nav : this.nav.filter(n => n.id !== "settings");
    },

    // Contador rojo en el sidebar: lo que hay que HACER, no lo que hay.
    // Órdenes = pagadas sin despachar (la cola del día). Stock = variantes en
    // 2 unidades o menos. 0 ⇒ no se pinta nada (un badge en 0 es ruido).
    navBadge(id) {
      if (!this.dashboard) return 0;
      if (id === "orders") return Number(this.dashboard.to_fulfill) || 0;
      if (id === "stock") return (this.dashboard.critical_stock || []).length;
      if (id === "carts") return Number(this.dashboard.recoverable_carts) || 0;
      return 0;
    },

    navBadgeTitle(id) {
      if (id === "orders") return "Órdenes pagadas sin despachar";
      if (id === "stock") return "Variantes con stock crítico";
      if (id === "carts") return "Carritos con email capturado sin comprar";
      return "";
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

    // Query string de los filtros de órdenes. Se reusa tal cual para el export
    // CSV, así que lo que ves en pantalla es exactamente lo que se descarga.
    orderQueryString(extra = {}) {
      const p = new URLSearchParams();
      for (const [k, v] of Object.entries(this.orderQuery)) {
        if (v !== "" && v != null) p.set(k, v);
      }
      for (const [k, v] of Object.entries(extra)) p.set(k, v);
      return p.toString();
    },

    async loadOrders({ append = false } = {}) {
      this.loadingOrders = true;
      if (!append) this.orderPage.offset = 0;
      try {
        const qs = this.orderQueryString({ limit: this.orderPage.limit, offset: this.orderPage.offset });
        const data = await this.api("GET", "/orders?" + qs);
        this.orders = append ? [...this.orders, ...data.orders] : data.orders;
        if (data.page) this.orderPage = { ...this.orderPage, ...data.page };
      } catch (err) { this.toast(err.message, "error"); }
      finally { this.loadingOrders = false; }
    },

    async loadMoreOrders() {
      if (!this.orderPage.hasMore || this.loadingOrders) return;
      this.orderPage.offset = this.orders.length;
      await this.loadOrders({ append: true });
    },

    // La búsqueda dispara mientras se tipea: esperamos a que pare para no
    // mandar un request por tecla.
    searchOrdersDebounced() {
      clearTimeout(this._orderSearchTimer);
      this._orderSearchTimer = setTimeout(() => this.loadOrders(), 300);
    },

    resetOrderFilters() {
      this.orderQuery = { q: "", status: "", fulfillment_status: "", channel: "", from: "", to: "" };
      this.loadOrders();
    },

    get orderFiltersActive() {
      return Object.values(this.orderQuery).some(v => v !== "" && v != null);
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
      this.system.loading = true;
      try {
        const r = await fetch("/api/health");
        if (!r.ok) throw new Error("el servidor respondió " + r.status);
        this.systemInfo = await r.json();
        this.system.error = "";
        this.system.updatedAt = new Date();
      } catch (err) {
        // Sin toast: esto se dispara solo al entrar a Ajustes. El error se
        // muestra en la propia tarjeta de estado.
        this.system.error = err.message || "no se pudo conectar";
      } finally {
        this.system.loading = false;
      }
    },

    // ---- Ajustes → Sistema -------------------------------------------------
    // El JSON de /api/health traducido a filas legibles. `state` mapea a las
    // clases de pill (.ok / .warn / .bad) y es lo que resume systemOverall().
    systemServices() {
      const h = this.systemInfo;
      if (!h) return [];
      const env = h.env || {};
      const em = h.emails || {};
      const sch = em.scheduler || {};
      // Si el bloque de emails vino con error, todo lo que cuelga de él es
      // desconocido: se muestra en rojo en vez de mentir un "inactivo".
      const emailsDown = Boolean(em.err);
      const row = (id, label, hint, ok, okLabel, badLabel, badState) => ({
        id, label, hint,
        state: ok ? "ok" : (badState || "warn"),
        pill: ok ? okLabel : badLabel,
      });
      return [
        row("mp", "Mercado Pago", "Procesa los pagos del checkout.",
            !!env.mpConfigured, "conectado", "pendiente", "bad"),
        row("mp-webhook", "Webhook de Mercado Pago", "Confirma el pago y descuenta el stock.",
            !!env.mpWebhookSecretConfigured, "firmado", "sin firma"),
        row("chilexpress", "Chilexpress", "Cotiza el envío en el checkout.",
            !!env.chilexpressConfigured, "conectado", "tarifas de respaldo"),
        row("catalog", "Catálogo", "Origen de los precios que ve el público.",
            !!env.useDbCatalog, "desde la base", "sin catálogo", "bad"),
        row("resend", "Resend", "Proveedor que entrega los correos.",
            !emailsDown && em.provider === "resend",
            "conectado", emailsDown ? "no disponible" : "dry-run", emailsDown ? "bad" : "warn"),
        row("resend-webhook", "Webhook de Resend", "Recibe rebotes y bajas de la lista.",
            !emailsDown && !!em.webhookSecretConfigured,
            "configurado", emailsDown ? "no disponible" : "pendiente", emailsDown ? "bad" : "warn"),
        row("capture", "Captura de carritos", "Guarda el carro y el email del checkout.",
            !emailsDown && !!em.captureEnabled,
            "activa", emailsDown ? "no disponible" : "inactiva", emailsDown ? "bad" : "warn"),
        // `sch.enabled` es el interruptor real (EMAIL_SCHEDULER_ENABLED).
        // `sch.running` es solo el candado del tick en curso — dura milisegundos
        // y no sirve para decir si el scheduler está prendido.
        row("scheduler", "Scheduler de emails", this.schedulerHint(sch),
            !emailsDown && !!sch.enabled,
            "activo", emailsDown ? "no disponible" : "inactivo", emailsDown ? "bad" : "warn"),
      ];
    },

    schedulerHint(sch) {
      const base = sch && sch.intervalMinutes
        ? `Recordatorios automáticos cada ${sch.intervalMinutes} min.`
        : "Recordatorios automáticos de carritos.";
      const at = sch && sch.lastRun && sch.lastRun.at;
      return at ? `${base} Último ciclo ${this.timeAgo(at)}.` : `${base} Sin ciclos aún.`;
    },

    systemOverall() {
      if (this.system.error) {
        return { tone: "bad", label: "Sin conexión", detail: "No se pudo consultar el estado del servidor." };
      }
      if (!this.systemInfo) {
        return { tone: "idle", label: "Consultando…", detail: "Pidiendo el diagnóstico al servidor." };
      }
      const svc = this.systemServices();
      const bad = svc.filter(s => s.state === "bad").length;
      const warn = svc.filter(s => s.state === "warn").length;
      if (bad) return { tone: "bad", label: "Requiere atención", detail: `${bad} ${bad === 1 ? "servicio necesita" : "servicios necesitan"} revisión.` };
      if (warn) return { tone: "warn", label: "Operativo con avisos", detail: `${warn} ${warn === 1 ? "servicio funciona" : "servicios funcionan"} en modo alternativo.` };
      return { tone: "ok", label: "Todo operativo", detail: "Todos los servicios respondieron correctamente." };
    },

    systemMetrics() {
      const h = this.systemInfo;
      if (!h) return [];
      const dbInfo = h.db || {};
      const em = h.emails || {};
      const ord = h.orders || {};
      const num = n => (typeof n === "number" ? n.toLocaleString("es-CL") : "—");
      return [
        { id: "db", label: "Base de datos", value: dbInfo.ok ? "En línea" : "Con fallas", tone: dbInfo.ok ? "ok" : "bad" },
        { id: "products", label: "Productos", value: num(dbInfo.products) },
        { id: "users", label: "Usuarios activos", value: num(dbInfo.users) },
        { id: "orders", label: "Órdenes", value: ord.err ? "—" : num(ord.total) },
        { id: "carts", label: "Carritos", value: em.err ? "—" : num(em.carts) },
      ];
    },

    // JSON para soporte, sin la ruta del archivo de la DB (infra interna).
    // Se pinta con x-text, así que Alpine lo escapa como texto plano.
    systemJson() {
      if (!this.systemInfo) return "";
      try {
        const clone = JSON.parse(JSON.stringify(this.systemInfo));
        if (clone.db) delete clone.db.path;
        return JSON.stringify(clone, null, 2);
      } catch { return ""; }
    },

    systemUpdatedLabel() {
      const d = this.system.updatedAt;
      if (!d) return "—";
      return d.toLocaleString("es-CL", {
        timeZone: "America/Santiago",
        day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
      });
    },

    async loadPaymentFee() {
      try {
        const f = await this.api("GET", "/settings/payment-fee");
        this.payFee.enabled = !!f.enabled;
        this.payFee.pct = Math.round((Number(f.rate) || 0) * 1000) / 10; // fracción → % (0.035 → 3.5)
      } catch (err) { this.toast(err.message, "error"); }
    },
    async savePaymentFee() {
      if (this.payFee.saving) return;
      const pct = Number(this.payFee.pct);
      if (!Number.isFinite(pct) || pct < 0 || pct > 100) { this.toast("Porcentaje inválido (0–100)", "error"); return; }
      this.payFee.saving = true;
      try {
        const f = await this.api("PATCH", "/settings/payment-fee", { rate: pct / 100, enabled: !!this.payFee.enabled });
        this.payFee.enabled = !!f.enabled;
        this.payFee.pct = Math.round((Number(f.rate) || 0) * 1000) / 10;
        this.toast("Comisión guardada ✓", "success");
      } catch (err) {
        this.toast(err.message, "error");
      } finally {
        this.payFee.saving = false;
      }
    },

    // ----- Precios de recompra (trade-in) -----
    // Se editan como JSON crudo a propósito: es un mapa modelo → capacidad →
    // precio con decenas de entradas, y una tabla con inputs sería mucho más
    // lenta de actualizar que pegar el bloque nuevo que manda el cliente.
    async loadTradein() {
      this.tradein.loading = true;
      try {
        const t = await this.api("GET", "/settings/tradein");
        this.tradein.text = JSON.stringify(t.prices, null, 2);
        this.tradein.isDefault = !!t.isDefault;
      } catch (err) { this.toast(err.message, "error"); }
      finally { this.tradein.loading = false; }
    },
    async saveTradein() {
      if (this.tradein.saving) return;
      let parsed;
      try { parsed = JSON.parse(this.tradein.text); }
      catch (err) { this.toast("JSON inválido: " + err.message, "error"); return; }
      this.tradein.saving = true;
      try {
        const t = await this.api("PATCH", "/settings/tradein", { prices: parsed });
        this.tradein.text = JSON.stringify(t.prices, null, 2);
        this.tradein.isDefault = false;
        this.toast("Precios de recompra guardados ✓", "success");
      } catch (err) { this.toast(err.message, "error"); }
      finally { this.tradein.saving = false; }
    },
    async resetTradein() {
      if (!(await this.askConfirm("¿Volver a los precios de recompra de fábrica? Se pierden los valores editados."))) return;
      try {
        const t = await this.api("POST", "/settings/tradein/reset");
        this.tradein.text = JSON.stringify(t.prices, null, 2);
        this.tradein.isDefault = true;
        this.toast("Precios restaurados", "success");
      } catch (err) { this.toast(err.message, "error"); }
    },

    // ----- Carritos abandonados -----
    cartQueryString(extra = {}) {
      const p = new URLSearchParams();
      for (const [k, v] of Object.entries(this.cartQuery)) {
        if (v !== "" && v != null) p.set(k, v);
      }
      for (const [k, v] of Object.entries(extra)) p.set(k, v);
      return p.toString();
    },

    async loadCarts({ append = false } = {}) {
      this.loadingCarts = true;
      if (!append) this.cartPage.offset = 0;
      try {
        const qs = this.cartQueryString({ limit: this.cartPage.limit, offset: this.cartPage.offset });
        const data = await this.api("GET", "/carts?" + qs);
        this.carts = append ? [...this.carts, ...data.carts] : data.carts;
        if (data.page) this.cartPage = { ...this.cartPage, ...data.page };
        if (data.summary) this.cartSummary = data.summary;
      } catch (err) { this.toast(err.message, "error"); }
      finally { this.loadingCarts = false; }
    },

    async loadMoreCarts() {
      if (!this.cartPage.hasMore || this.loadingCarts) return;
      this.cartPage.offset = this.carts.length;
      await this.loadCarts({ append: true });
    },

    searchCartsDebounced() {
      clearTimeout(this._cartSearchTimer);
      this._cartSearchTimer = setTimeout(() => this.loadCarts(), 300);
    },

    resetCartFilters() {
      this.cartQuery = { status: "", payment: "", q: "", has_email: "", from: "", to: "" };
      this.loadCarts();
    },

    get cartFiltersActive() {
      return Object.values(this.cartQuery).some(v => v !== "" && v != null);
    },

    async openCartDetail(id) {
      this.cartDrawer = { open: true, loading: true, cart: null, reminding: false };
      try {
        this.cartDrawer.cart = await this.api("GET", "/carts/" + id);
      } catch (err) {
        this.toast(err.message, "error");
        this.cartDrawer.open = false;
      } finally {
        this.cartDrawer.loading = false;
      }
    },

    closeCartDrawer() { this.cartDrawer.open = false; },

    // Reenvío manual. El backend usa `force`, así que crea una fila nueva de
    // email_log en vez de rebotar contra la idempotencia del envío automático.
    async remindCart(kind) {
      const cart = this.cartDrawer.cart;
      if (!cart || this.cartDrawer.reminding) return;
      if (!(await this.askConfirm(`¿Enviar el recordatorio a ${cart.email}?`))) return;
      this.cartDrawer.reminding = true;
      try {
        const { result } = await this.api("POST", `/carts/${cart.id}/remind`, { kind });
        this.toast(result?.dryRun ? "Enviado en modo dry-run (sin RESEND_API_KEY)" : "Recordatorio enviado ✓", "success");
        await this.openCartDetail(cart.id);
        this.loadCarts();
      } catch (err) { this.toast(err.message, "error"); }
      finally { this.cartDrawer.reminding = false; }
    },

    async deleteCart(id) {
      if (!(await this.askConfirm("¿Borrar este carrito? No se puede deshacer."))) return;
      try {
        await this.api("DELETE", "/carts/" + id);
        this.toast("Carrito borrado", "success");
        this.closeCartDrawer();
        this.loadCarts();
      } catch (err) { this.toast(err.message, "error"); }
    },

    cartStateLabel(id) { return this.CART_STATES.find(s => s.id === id)?.label || id || "—"; },

    // Pill de estado del carrito. El backend ya manda `status` normalizado
    // contra la orden real, así que "Compró" solo aparece con pago aprobado.
    // Los intermedios se muestran como lo que son — un pago que no terminó —
    // para no confundirlos con una venta confirmada.
    cartStatePill(c) {
      if (!c) return { label: "—", cls: "" };
      if (c.status === "converted") return { label: "Compró", cls: "cart-converted" };
      if (c.paymentPending) return { label: "Pago pendiente", cls: "cart-pending" };
      if (c.paymentRejected) return { label: "Pago rechazado", cls: "cart-rejected" };
      return { label: this.cartStateLabel(c.status), cls: "cart-" + c.status };
    },

    // Texto de la orden vinculada en el drawer: sin esto, ver un ORD-… al lado
    // de un carro activo se lee como "compró".
    cartOrderLabel(c) {
      if (!c?.orderId) return null;
      if (c.status === "converted") return "Compra confirmada";
      if (c.paymentPending) return "Pago iniciado, sin confirmar";
      if (c.paymentRejected) return "Pago rechazado o cancelado";
      return "Orden creada, sin pago";
    },

    cartItemsLabel(cart) {
      const items = cart?.items || [];
      if (!items.length) return "—";
      const first = [items[0].model, items[0].storage].filter(Boolean).join(" ");
      return items.length > 1 ? `${first} +${items.length - 1}` : first;
    },

    // ----- Emails -----
    // Sub-pestaña dentro de Ajustes → Emails: 'config' | 'log' | 'suppressions'.
    emailTab: "config",

    // Entra a Ajustes en la pestaña de emails (lo usa el command palette).
    openEmailSettings(subtab = "config") {
      this.goto("settings");
      this.settingsTab = "emails";
      this.setEmailTab(subtab);
    },

    setEmailTab(tab) {
      this.emailTab = tab;
      if (tab === "log") this.loadEmailLog();
      if (tab === "suppressions") this.loadSuppressions();
    },

    async loadEmails() {
      this.emails.loading = true;
      try {
        const data = await this.api("GET", "/emails/config");
        this.emails.config = data.config;
        this.emails.provider = data.provider;
        this.emails.scheduler = data.scheduler;
        this.emails.stats = data.stats;
        this.emails.pending = data.pending;
        this.emails.templates = data.testable || [];
        this.syncInternalToFromConfig(data.config, data.limits);
      } catch (err) { this.toast(err.message, "error"); }
      finally { this.emails.loading = false; }
    },

    // ----- Aviso interno de ventas (campo de chips) -----

    // El backend manda la lista ya normalizada; el split es el fallback para una
    // instalación que todavía responde solo el string separado por comas.
    syncInternalToFromConfig(config, limits) {
      const list = Array.isArray(config?.internalToList)
        ? config.internalToList.slice()
        : this.splitEmails(config?.internalTo);
      this.internalTo.list = list;
      this.internalTo.draft = "";
      this.internalTo.error = "";
      if (Number.isFinite(limits?.internalTo)) this.internalTo.max = limits.internalTo;
    },

    // Coma, punto y coma, salto de línea y tabulador: lo que sale de pegar una
    // columna de planilla o un "Para:" de un cliente de correo.
    splitEmails(raw) {
      return String(raw || "").split(/[,;\n\r\t]+/).map(s => s.trim()).filter(Boolean);
    },

    // "Ventas <ventas@x.cl>" → "ventas@x.cl". Mismo desarmado que el backend.
    cleanEmail(raw) {
      const s = String(raw || "").trim();
      const named = s.match(/^[^<>]*<([^<>]+)>$/);
      return (named ? named[1] : s).trim();
    },

    // Mismo criterio laxo que server/lib/settings.js: atajar errores de tipeo
    // obvios, no pelear con direcciones válidas raras. El server revalida.
    isEmailish(value) {
      const s = String(value || "").trim();
      return s.length <= 254 && /^[^\s@<>",;:]+@[^\s@<>",;:]+\.[^\s@<>",;:]{2,}$/.test(s);
    },

    // Agrega una dirección. Devuelve "" si entró (o si ya estaba) y el motivo
    // del rechazo si no — el que llama decide si mostrarlo.
    pushInternalTo(raw) {
      const mail = this.cleanEmail(raw);
      if (!mail) return "";
      if (!this.isEmailish(mail)) return `"${mail}" no parece un correo`;
      if (this.internalTo.list.some(m => m.toLowerCase() === mail.toLowerCase())) return "";
      if (this.internalTo.list.length >= this.internalTo.max) {
        return `Hasta ${this.internalTo.max} destinatarios`;
      }
      this.internalTo.list.push(mail);
      return "";
    },

    // @input: convierte en chip todo lo que ya venga separado y deja en el
    // campo lo último, que puede seguir escribiéndose. Cubre tipear una coma y
    // también pegar varios de una (pegar dispara `input`, no hace falta @paste).
    onInternalToInput() {
      if (!/[,;\n\r\t]/.test(this.internalTo.draft)) {
        if (this.internalTo.error) this.internalTo.error = "";
        return;
      }
      const parts = this.internalTo.draft.split(/[,;\n\r\t]+/);
      const rest = parts.pop();   // si el pegado terminó en separador, queda ""
      let error = "";
      for (const p of parts) error = this.pushInternalTo(p) || error;
      this.internalTo.draft = rest.trim();
      this.internalTo.error = error;
    },

    /**
     * Confirma lo que quedó escrito (Enter o al salir del campo). Lo que no
     * entra se queda visible en el input para poder corregirlo — no se pierde
     * en silencio. Devuelve true si el campo quedó limpio.
     */
    commitInternalTo() {
      const raw = this.internalTo.draft.trim();
      if (!raw) { this.internalTo.error = ""; return true; }
      let error = "";
      const leftover = [];
      for (const p of this.splitEmails(raw)) {
        const e = this.pushInternalTo(p);
        if (e) { error = error || e; leftover.push(p); }
      }
      this.internalTo.draft = leftover.join(", ");
      this.internalTo.error = error;
      return !error;
    },

    removeInternalTo(i) {
      this.internalTo.list.splice(i, 1);
      this.internalTo.error = "";
    },

    // Backspace con el campo vacío borra el último chip: es la convención de
    // cualquier campo de etiquetas y evita tener que apuntarle a la ×.
    onInternalToBackspace(ev) {
      if (this.internalTo.draft || !this.internalTo.list.length) return;
      ev.preventDefault();
      this.internalTo.list.pop();
      this.internalTo.error = "";
    },

    async saveEmails() {
      if (this.emails.saving || !this.emails.config) return;
      // Lo que quedó escrito sin confirmar cuenta como un destinatario más: si
      // no es válido, se avisa y no se guarda nada (en vez de perderlo).
      if (!this.commitInternalTo()) { this.toast(this.internalTo.error, "error"); return; }
      this.emails.saving = true;
      try {
        const c = this.emails.config;
        const { config } = await this.api("PATCH", "/emails/config", {
          enabled: !!c.enabled,
          from: c.from,
          // "" es un valor válido y significa "borrar / volver al default".
          replyTo: c.replyTo ?? "",
          // Array: lista vacía = avisos internos desactivados.
          internalTo: this.internalTo.list.slice(),
          cartRemindersEnabled: !!c.cartRemindersEnabled,
          cartReminder1hEnabled: !!c.cartReminder1hEnabled,
          cartReminder24hEnabled: !!c.cartReminder24hEnabled,
          cartReminder1hHours: Number(c.cartReminder1hHours),
          cartReminder24hHours: Number(c.cartReminder24hHours),
          cartExpireDays: Number(c.cartExpireDays),
          cartCouponCode: c.cartCouponCode ?? "",
          followupEnabled: !!c.followupEnabled,
          followupDays: Number(c.followupDays),
          captureEnabled: !!c.captureEnabled,
        });
        this.emails.config = config;
        await this.loadEmails();
        this.toast("Configuración de emails guardada ✓", "success");
      } catch (err) { this.toast(err.message, "error"); }
      finally { this.emails.saving = false; }
    },

    // Etiqueta legible de un template probable (cae al id si todavía no cargó).
    templateLabel(id) {
      return this.emails.templates.find(t => t.id === id)?.label || id;
    },

    /**
     * Manda UN template con datos ficticios. Sin argumento va el de siempre
     * ("test"), que es solo el chequeo de conexión con el proveedor.
     * El destinatario por default es la cuenta del admin logueado; el server
     * vuelve a validar todo (whitelist de template y formato del correo).
     */
    async sendTestEmail(template = "test") {
      if (this.emails.testing) return;
      const to = (this.emails.testTo || "").trim() || this.session?.email;
      const label = this.templateLabel(template);
      if (!(await this.askConfirm(`¿Enviar "${label}" con datos de prueba a ${to}?`))) return;
      this.emails.testing = true;
      this.emails.testingId = template;
      try {
        const { result } = await this.api("POST", "/emails/test", {
          template,
          to: this.emails.testTo || undefined,
        });
        this.pushTestResult(result);
        this.toast(result?.dryRun
          ? `${label}: renderizado en dry-run (sin RESEND_API_KEY no se envía nada)`
          : `${label}: ${result?.modeLabel || "enviado"} ✓`,
          result?.mode === "live" || result?.mode === "dry-run" ? "success" : "error");
        if (this.emailTab === "log") this.loadEmailLog();
      } catch (err) {
        // El 502 del server ya trae el motivo; acá solo queda el mensaje.
        this.pushTestResult({ template, templateLabel: label, to, mode: "error", modeLabel: "Falló", subject: err.message });
        this.toast(err.message, "error");
      } finally {
        this.emails.testing = false;
        this.emails.testingId = "";
      }
    },

    // Últimos resultados arriba. El `key` es propio y no el índice: con unshift
    // los índices se corren y Alpine reusaría el nodo equivocado.
    _testResultSeq: 0,
    pushTestResult(result) {
      this.emails.testResults = [
        { key: ++this._testResultSeq, ...result },
        ...this.emails.testResults,
      ].slice(0, 12);
    },

    // Misma paleta que el resto de los estados del panel.
    testModeClass(mode) {
      if (mode === "live") return "state-approved";
      if (mode === "dry-run") return "state-pending";
      return "state-rejected";
    },

    async runEmailScheduler() {
      if (this.emails.running) return;
      this.emails.running = true;
      try {
        const { result } = await this.api("POST", "/emails/run-scheduler");
        this.toast(`Ciclo listo: ${result.reminders1h} + ${result.reminders24h} recordatorios, ${result.followups} follow-ups, ${result.expired} vencidos`, "success");
        await this.loadEmails();
        this.loadEmailLog();
      } catch (err) { this.toast(err.message, "error"); }
      finally { this.emails.running = false; }
    },

    async loadEmailLog({ append = false } = {}) {
      this.loadingEmailLog = true;
      if (!append) this.emailLogPage.offset = 0;
      try {
        const p = new URLSearchParams();
        for (const [k, v] of Object.entries(this.emailLogQuery)) if (v) p.set(k, v);
        p.set("limit", this.emailLogPage.limit);
        p.set("offset", this.emailLogPage.offset);
        const data = await this.api("GET", "/emails/log?" + p.toString());
        this.emailLog = append ? [...this.emailLog, ...data.entries] : data.entries;
        if (data.page) this.emailLogPage = { ...this.emailLogPage, ...data.page };
      } catch (err) { this.toast(err.message, "error"); }
      finally { this.loadingEmailLog = false; }
    },

    async loadMoreEmailLog() {
      if (!this.emailLogPage.hasMore || this.loadingEmailLog) return;
      this.emailLogPage.offset = this.emailLog.length;
      await this.loadEmailLog({ append: true });
    },

    // Mismo criterio que la búsqueda de órdenes: sin debounce, escribir una
    // dirección de correo dispara un request por tecla.
    searchEmailLogDebounced() {
      clearTimeout(this._emailLogSearchTimer);
      this._emailLogSearchTimer = setTimeout(() => this.loadEmailLog(), 300);
    },

    async loadSuppressions() {
      try {
        const { suppressions } = await this.api("GET", "/emails/suppressions");
        this.suppressions = suppressions;
      } catch (err) { this.toast(err.message, "error"); }
    },

    async addSuppression() {
      const f = this.suppressionForm;
      if (f.saving) return;
      if (!f.email.trim()) { this.toast("Falta el email", "error"); return; }
      f.saving = true;
      try {
        await this.api("POST", "/emails/suppressions", { email: f.email.trim(), reason: f.reason });
        this.toast("Agregado a la lista de exclusión", "success");
        f.email = "";
        this.loadSuppressions();
      } catch (err) { this.toast(err.message, "error"); }
      finally { f.saving = false; }
    },

    async removeSuppression(email) {
      if (!(await this.askConfirm(`¿Volver a permitir emails a ${email}?`))) return;
      try {
        await this.api("DELETE", "/emails/suppressions/" + encodeURIComponent(email));
        this.toast("Quitado de la lista", "success");
        this.loadSuppressions();
      } catch (err) { this.toast(err.message, "error"); }
    },

    emailStateLabel(id) { return this.EMAIL_STATES.find(s => s.id === id)?.label || id || "—"; },
    suppressionReasonLabel(id) { return this.SUPPRESSION_REASONS.find(r => r.id === id)?.label || id || "—"; },

    // Pinta el estado del email con la misma paleta que las órdenes:
    // enviado ⇒ verde, falló ⇒ rojo, el resto ⇒ ámbar.
    emailStateClass(status) {
      if (status === "sent" || status === "dry_run") return "state-approved";
      if (status === "failed") return "state-rejected";
      return "state-pending";
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
    async setAnalyticsDays(days) {
      this.analytics.days = days;
      try { this.analytics.overview = await this.api("GET", "/analytics/overview?days=" + days); }
      catch (err) { this.toast(err.message, "error"); }
    },
    analyticsBarH(v) {
      const days = (this.analytics.overview && this.analytics.overview.perDay) || [];
      const max = Math.max(1, ...days.map(d => d.sessions));
      return Math.max(4, Math.round((Number(v) / max) * 100));
    },
    // Las barras de ingresos se escalan contra su propio máximo (no contra el
    // de sesiones): son magnitudes distintas y compartir escala aplastaría una.
    salesBarH(v) {
      const days = (this.analytics.overview && this.analytics.overview.salesPerDay) || [];
      const max = Math.max(1, ...days.map(d => d.revenue));
      return Math.max(4, Math.round((Number(v) / max) * 100));
    },
    // El referrer llega como URL completa; en pantalla solo sirve el dominio.
    referrerLabel(r) {
      if (!r || r === "Directo") return "Directo";
      try { return new URL(r).hostname.replace(/^www\./, ""); } catch { return r; }
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

    // Ajuste de stock + kardex en la misma ventana: cuando alguien corrige una
    // cantidad, lo primero que quiere ver es por qué quedó como quedó.
    openStockModal(storage, label) {
      if (!storage || !storage.variant_id) return;
      this.stockModal = {
        variant_id: storage.variant_id,
        ref: storage,
        label: label || "Variante",
        current: storage.stock,
        target: storage.stock,
        reason: "manual",
        note: "",
        saving: false,
        movements: null,
        loadingLog: false,
      };
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

    // ¿El borrador difiere de lo que se abrió? Se compara contra la copia que
    // guardamos al abrir el editor; las fotos NO cuentan porque se suben al
    // servidor en el momento (no son parte del borrador).
    get prodEditorDirty() {
      const { draft, original } = this.prodEditor;
      if (!draft || !original) return false;
      const strip = p => JSON.stringify(p, (k, v) => (k === "gallery" || k === "_k" ? undefined : v));
      return strip(draft) !== strip(original);
    },

    // Cerrar el editor descartaba los cambios sin avisar. Con un formulario de
    // decenas de campos eso es perder trabajo real, así que preguntamos.
    async closeProductEditor() {
      if (this.prodEditorDirty && !(await this.askConfirm("Tenés cambios sin guardar en este producto. ¿Descartarlos?"))) return;
      this.prodEditor.open = false;
      this.prodEditor.draft = null;
      this.prodEditor.original = null;
    },

    // --- Mutaciones SOLO en el borrador (no tocan el servidor hasta Guardar) ---
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
      model.storages.push({ s: size, color: "", p: sib ? sib.p : 0, stock: 0, cost: sib && sib.cost != null ? sib.cost : "", compare_at: "", sku: "", variant_id: null, is_active: false, _k: Math.random().toString(36).slice(2) });
    },
    addSizeDraft(model) {
      model.storages.push({ s: "Nueva", color: "", p: 0, stock: 0, cost: "", compare_at: "", sku: "", variant_id: null, is_active: false, _k: Math.random().toString(36).slice(2) });
    },
    removeSize(model, size) { model.storages = model.storages.filter(v => v.s !== size); },
    renameSize(model, oldSize, newSize) {
      const ns = (newSize || "").trim();
      if (!ns) return;
      (model.storages || []).forEach(v => { if (v.s === oldSize) v.s = ns; });
    },

    // --- Stock: pivote capacidad × color por modelo ---
    stockCaps(product) {
      const set = new Set();
      (product.models || []).forEach(m => (m.storages || []).forEach(v => set.add(v.s)));
      const toGB = s => { const n = parseFloat(s) || 0; return /tb/i.test(s) ? n * 1024 : n; };
      return [...set].sort((a, b) => toGB(a) - toGB(b));
    },
    stockColors(model) {
      const out = [];
      (model.storages || []).forEach(v => { const c = v.color || ""; if (!out.includes(c)) out.push(c); });
      return out.length ? out : [""];
    },
    stockVariant(model, cap, color) {
      return (model.storages || []).find(v => v.s === cap && (v.color || "") === (color || "")) || null;
    },
    modelShort(model, product) {
      return (model.name || "").replace("iPhone " + product.line, "").trim() || "Base";
    },

    // El endpoint recibe DELTA, no valor absoluto: así el kardex registra el
    // movimiento real ("entraron 3") y no un salto sin explicación.
    async saveStockModal() {
      const m = this.stockModal;
      if (!m || m.saving) return;
      const target = Math.round(Number(m.target));
      if (!Number.isFinite(target) || target < 0) return this.toast("Stock inválido", "error");
      const delta = target - m.current;
      if (delta === 0) { this.stockModal = null; return; }
      m.saving = true;
      try {
        const updated = await this.api("POST", "/products/variants/" + m.variant_id + "/stock", {
          delta, reason: m.reason, note: m.note || null,
        });
        if (m.ref) m.ref.stock = updated.stock;
        this.stockModal = null;
        this.toast(`Stock: ${updated.stock} (${delta > 0 ? "+" : ""}${delta})`, "success");
        this.loadDashboard();
      } catch (err) {
        this.toast(err.message, "error");
        m.saving = false;
      }
    },

    async loadStockLog() {
      const m = this.stockModal;
      if (!m || m.movements) return;
      m.loadingLog = true;
      try {
        const { movements } = await this.api("GET", "/products/variants/" + m.variant_id + "/stock-log?limit=100");
        m.movements = movements;
      } catch (err) { this.toast(err.message, "error"); m.movements = []; }
      finally { m.loadingLog = false; }
    },

    // --- Guardar: manda el borrador COMPLETO en un solo request ---
    // Antes esto disparaba ~15 llamadas sueltas (PATCH producto, DELETE modelo,
    // POST variante, POST stock…). Si una fallaba a mitad, el producto quedaba
    // partido: modelo borrado con sus variantes creadas, precios nuevos con
    // stock viejo. Ahora PUT /products/:id/save lo aplica en una transacción:
    // o queda todo, o no queda nada.
    async saveProductDraft() {
      if (this.prodEditor.saving) return;
      const d = this.prodEditor.draft;
      this.prodEditor.saving = true;
      try {
        await this.api("PUT", "/products/" + d.id + "/save", {
          line: d.line,
          year: d.year,
          img: d.img || "",
          hidden: !!d.hidden,
          models: (d.models || []).map(m => ({
            model_id: m.model_id || null,
            name: m.name,
            img: m.img || "",
            sealed: !!m.sealed,
            storages: (m.storages || []).map(s => ({
              variant_id: s.variant_id || null,
              s: s.s,
              color: s.color || "",
              p: Math.round(Number(s.p)) || 0,
              stock: Math.round(Number(s.stock)) || 0,
              cost: s.cost === "" || s.cost == null ? null : Math.round(Number(s.cost)),
              // Siempre mandamos la key aunque esté vacía: el backend conserva
              // el valor guardado cuando NO viene, así que omitirla haría
              // imposible borrar un "precio antes" desde el editor.
              compare_at: s.compare_at === "" || s.compare_at == null ? null : Math.round(Number(s.compare_at)),
              sku: s.sku || "",
              is_active: !!s.is_active,
            })),
          })),
        });
        this.toast("Cambios guardados ✓", "success");
        await this.loadProducts();
        this.prodEditor.open = false;
      } catch (err) {
        this.toast("Error al guardar: " + err.message, "error");
      } finally {
        this.prodEditor.saving = false;
      }
    },

    // Margen de una variante (precio − costo). Devuelve null si no hay costo
    // cargado: mostrar "0%" ahí haría pensar que se vende sin ganancia.
    variantMargin(st) {
      const price = Number(st.p) || 0;
      const cost = st.cost === "" || st.cost == null ? null : Number(st.cost);
      if (cost == null || !Number.isFinite(cost) || price <= 0) return null;
      return { abs: price - cost, pct: Math.round(((price - cost) / price) * 1000) / 10 };
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

    // El texto alternativo se guarda al vuelo (no espera al "Guardar cambios"
    // del producto) porque la imagen ya vive en el servidor: el borrador solo
    // arrastra la URL. Lo lee product.js para el <img alt> del sitio público,
    // que es lo que leen Google y los lectores de pantalla.
    async saveImageAlt(img, value) {
      const alt = String(value ?? "").trim();
      if (alt === (img.alt || "")) return;
      try {
        await this.api("PATCH", "/uploads/image/" + img.id, { alt });
        img.alt = alt;
        this.toast("Texto alternativo guardado", "success");
      } catch (err) { this.toast(err.message, "error"); }
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
    // Crear y editar usan el MISMO formulario (`couponEditor`): antes crear
    // armaba HTML a mano en el drawer y editar era un toast de "próximamente",
    // así que corregir un cupón obligaba a borrarlo y rehacerlo (perdiendo el
    // contador de usos).
    openCouponEditor(mode, c = null) {
      this.couponEditor = {
        mode,
        id: c ? c.id : null,
        code: c ? c.code : "",
        type: c ? c.type : "percent",
        value: c ? c.value : "",
        min_subtotal: c && c.min_subtotal ? c.min_subtotal : "",
        max_uses: c && c.max_uses != null ? c.max_uses : "",
        starts_at: this.toLocalInput(c && c.starts_at),
        ends_at: this.toLocalInput(c && c.ends_at),
        is_active: c ? !!c.is_active : true,
        used_count: c ? c.used_count : 0,
        typeOpen: false,
        saving: false,
      };
    },

    async saveCoupon() {
      const e = this.couponEditor;
      if (!e || e.saving) return;
      const code = String(e.code || "").trim().toUpperCase();
      if (!code) return this.toast("El código es obligatorio", "error");
      const value = Number(e.value);
      if (!Number.isFinite(value) || value <= 0) return this.toast("El valor debe ser mayor a 0", "error");
      if (e.type === "percent" && value > 100) return this.toast("Un porcentaje no puede superar 100", "error");
      if (e.starts_at && e.ends_at && new Date(e.starts_at) > new Date(e.ends_at)) {
        return this.toast("La fecha de inicio es posterior a la de término", "error");
      }
      const body = {
        code,
        type: e.type,
        value: Math.round(value),
        min_subtotal: e.min_subtotal === "" ? 0 : Math.round(Number(e.min_subtotal)),
        max_uses: e.max_uses === "" ? null : Math.round(Number(e.max_uses)),
        starts_at: e.starts_at || null,
        ends_at: e.ends_at || null,
        is_active: !!e.is_active,
      };
      e.saving = true;
      try {
        if (e.mode === "create") await this.api("POST", "/coupons", body);
        else await this.api("PATCH", "/coupons/" + e.id, body);
        this.toast(e.mode === "create" ? "Cupón creado ✓" : "Cupón actualizado ✓", "success");
        this.couponEditor = null;
        this.loadCoupons();
      } catch (err) {
        this.toast(err.message, "error");
        e.saving = false;
      }
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
      this.orderDrawer.open = true;
      this.orderDrawer.loading = true;
      this.orderDrawer.tab = "detalle";
      this.orderDrawer.order = null;
      this.orderDrawer.history = [];
      this.orderDrawer.historyLoaded = false;
      try {
        const o = await this.api("GET", "/orders/" + id);
        this.orderDrawer.order = o;
        this.orderDrawer.form = {
          fulfillment_status: o.fulfillment_status || "unfulfilled",
          tracking_code: o.tracking_code || "",
          tracking_carrier: o.tracking_carrier || "",
          admin_notes: o.admin_notes || "",
          status: o.status,
        };
      } catch (err) {
        this.toast(err.message, "error");
        this.orderDrawer.open = false;
      } finally {
        this.orderDrawer.loading = false;
      }
    },

    closeOrderDrawer() {
      this.orderDrawer.open = false;
      this.orderDrawer.order = null;
    },

    // Guarda preparación/envío. El estado de PAGO va aparte y solo si sos admin:
    // lo escribe el webhook de Mercado Pago y tocarlo a mano mueve ingresos.
    async saveOrderFulfillment() {
      const d = this.orderDrawer;
      if (!d.order || d.saving) return;
      const body = {
        fulfillment_status: d.form.fulfillment_status,
        tracking_code: d.form.tracking_code || "",
        tracking_carrier: d.form.tracking_carrier || "",
        admin_notes: d.form.admin_notes || "",
      };
      if (this.isAdmin && d.form.status !== d.order.status) body.status = d.form.status;
      d.saving = true;
      try {
        const updated = await this.api("PATCH", "/orders/" + d.order.id, body);
        d.order = { ...d.order, ...updated };
        d.historyLoaded = false;
        this.toast("Orden actualizada ✓", "success");
        // La lista de atrás muestra estado y tracking: refrescamos la fila.
        const row = this.orders.find(o => o.id === d.order.id);
        if (row) {
          row.fulfillment_status = updated.fulfillment_status;
          row.status = updated.status;
          row.tracking_code = updated.tracking_code;
        }
        this.loadDashboard();
      } catch (err) { this.toast(err.message, "error"); }
      finally { d.saving = false; }
    },

    // El historial sale del audit_log — no hay tabla aparte de eventos.
    async loadOrderHistory() {
      const d = this.orderDrawer;
      if (!d.order || d.historyLoaded) return;
      try {
        const { entries } = await this.api("GET", "/orders/" + d.order.id + "/history");
        d.history = entries;
        d.historyLoaded = true;
      } catch (err) { this.toast(err.message, "error"); }
    },

    // Resume un cambio de orden en una línea legible ("Sin preparar → Enviado").
    historySummary(e) {
      if (e.action === "create") return "Creó la orden";
      if (e.action === "delete") return "Eliminó la orden";
      if (e.action === "export") return "Exportó órdenes a CSV";
      const parts = [];
      const b = e.before || {}, a = e.after || {};
      if (b.status !== a.status) parts.push(`Pago: ${this.payStateLabel(b.status)} → ${this.payStateLabel(a.status)}`);
      if (b.fulfillment_status !== a.fulfillment_status) {
        parts.push(`Envío: ${this.fulfillmentLabel(b.fulfillment_status)} → ${this.fulfillmentLabel(a.fulfillment_status)}`);
      }
      if ((b.tracking_code || "") !== (a.tracking_code || "")) parts.push(`Tracking: ${a.tracking_code || "(vacío)"}`);
      if ((b.admin_notes || "") !== (a.admin_notes || "")) parts.push("Actualizó la nota interna");
      return parts.length ? parts.join(" · ") : "Sin cambios visibles";
    },

    get orderIsPickup() {
      const s = this.orderDrawer.order?.shipping;
      return !!s && (s.method === "pickup" || s.serviceCode === "PICKUP");
    },

    // Dirección de despacho en una línea (sucursal Chilexpress o calle+número).
    get orderAddressLine() {
      const a = this.orderDrawer.order?.shipping?.address || {};
      if (this.orderIsPickup) return a.store || "Padre Mariano 98, Of. 105, Providencia";
      const street = [a.street, a.number].filter(Boolean).join(" ").trim();
      const place = [a.county, a.region].filter(Boolean).join(", ");
      return [a.branch || street || "—", place].filter(Boolean).join(" — ");
    },

    whatsappLink(phone) {
      const digits = String(phone || "").replace(/[^0-9]/g, "");
      return digits ? "https://wa.me/" + digits : null;
    },

    async deleteOrder(id) {
      if (!(await this.askConfirm("¿Eliminar esta orden? No se puede deshacer."))) return;
      try {
        await this.api("DELETE", "/orders/" + id);
        this.closeOrderDrawer();
        this.toast("Orden eliminada", "success");
        this.loadOrders();
      } catch (err) { this.toast(err.message, "error"); }
    },

    // ----- Venta manual (tienda / Instagram / transferencia) -----
    // Reusa el mismo shape de items del carro público, pero mandando
    // `variant_id`: el backend resuelve precio y datos del producto contra la
    // DB para que una venta cargada a mano descuente stock igual que una web.
    openManualOrder() {
      if (!this.products.length) this.loadProducts();
      this.manualOrder = {
        items: [],
        search: "",
        buyer: { name: "", email: "", phone: "", rut: "", instagram: "" },
        channel: "store",
        payment_method: "cash",
        status: "approved",
        fulfillment_status: "delivered",
        shipping_cost: "",
        discount: "",
        notes: "",
        channelOpen: false,
        methodOpen: false,
        saving: false,
      };
    },

    // Busca variantes por modelo/capacidad/color/SKU. Solo muestra resultados
    // cuando ya se escribió algo: la lista completa son cientos de variantes.
    get manualSearchResults() {
      const q = (this.manualOrder?.search || "").toLowerCase().trim();
      if (!q) return [];
      const out = [];
      for (const p of this.products) {
        for (const m of (p.models || [])) {
          for (const s of (m.storages || [])) {
            if (!s.variant_id) continue;
            const label = `${m.name} ${s.s}${s.color ? " " + s.color : ""}`;
            if (!label.toLowerCase().includes(q) && !String(s.sku || "").toLowerCase().includes(q)) continue;
            out.push({ variant_id: s.variant_id, label, price: s.p, stock: s.stock, sku: s.sku || "" });
            if (out.length >= 25) return out;
          }
        }
      }
      return out;
    },

    manualAddItem(v) {
      const mo = this.manualOrder;
      const existing = mo.items.find(i => i.variant_id === v.variant_id);
      if (existing) existing.qty += 1;
      else mo.items.push({ variant_id: v.variant_id, label: v.label, price: v.price, list_price: v.price, stock: v.stock, qty: 1 });
      mo.search = "";
    },
    manualRemoveItem(item) {
      this.manualOrder.items = this.manualOrder.items.filter(i => i !== item);
    },
    get manualTotals() {
      const mo = this.manualOrder;
      if (!mo) return { subtotal: 0, shipping: 0, discount: 0, total: 0 };
      const subtotal = mo.items.reduce((a, i) => a + (Number(i.price) || 0) * (Number(i.qty) || 1), 0);
      const shipping = Math.max(0, Math.round(Number(mo.shipping_cost) || 0));
      const discount = Math.max(0, Math.round(Number(mo.discount) || 0));
      return { subtotal, shipping, discount, total: Math.max(0, subtotal + shipping - discount) };
    },
    // Avisa si la venta deja stock negativo (el backend lo corta en 0, pero el
    // aviso evita registrar una venta de algo que no está en la vitrina).
    get manualStockWarnings() {
      if (!this.manualOrder) return [];
      return this.manualOrder.items.filter(i => i.qty > i.stock);
    },

    async saveManualOrder() {
      const mo = this.manualOrder;
      if (!mo || mo.saving) return;
      if (!mo.items.length) return this.toast("Agregá al menos un producto", "error");
      if (mo.status === "approved" && this.manualStockWarnings.length) {
        const labels = this.manualStockWarnings.map(i => i.label).join(", ");
        if (!(await this.askConfirm(`Sin stock suficiente de: ${labels}. ¿Registrar la venta igual? El stock quedará en 0.`))) return;
      }
      mo.saving = true;
      try {
        const created = await this.api("POST", "/orders", {
          items: mo.items.map(i => ({ variant_id: i.variant_id, qty: i.qty, price: Math.round(Number(i.price) || 0) })),
          buyer: mo.buyer,
          channel: mo.channel,
          payment_method: mo.payment_method,
          status: mo.status,
          fulfillment_status: mo.fulfillment_status,
          shipping_cost: this.manualTotals.shipping,
          discount: this.manualTotals.discount,
          notes: mo.notes || null,
        });
        this.manualOrder = null;
        this.toast("Venta registrada: " + created.id, "success");
        if (this.view === "orders") this.loadOrders();
        this.loadDashboard();
        if (this.view === "catalog" || this.view === "stock") this.loadProducts();
      } catch (err) {
        this.toast(err.message, "error");
        mo.saving = false;
      }
    },

    // ----- Exports CSV -----
    // Descarga vía <a download> y no fetch+blob: la respuesta ya viene con
    // Content-Disposition y así la cookie de sesión viaja sola.
    download(path) {
      const a = document.createElement("a");
      a.href = "/api/admin" + path;
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();
    },
    exportOrders() {
      const qs = this.orderQueryString();
      this.download("/orders/export.csv" + (qs ? "?" + qs : ""));
      this.toast("Descargando órdenes…", "info");
    },
    exportInventory() {
      this.download("/products/export.csv");
      this.toast("Descargando inventario…", "info");
    },

    // ----- Ajuste masivo de precios -----
    // Nunca aplica a ciegas: primero un dry-run que devuelve la lista exacta de
    // variantes y sus precios nuevos, y después de aplicar queda el batchId
    // para deshacer (restaura los valores exactos, no la fórmula inversa).
    openBulkPrice() {
      this.bulkPrice = { open: true, scope: "all", type: "percent", value: "", preview: null, loading: false, applying: false, lastBatch: null, scopeOpen: false };
      if (!this.products.length) this.loadProducts();
    },
    closeBulkPrice() { this.bulkPrice.open = false; },

    get bulkScopeOptions() {
      const opts = [{ id: "all", label: "Todo el catálogo" }];
      for (const p of this.products) {
        opts.push({ id: "line:" + p.id, label: `Línea iPhone ${p.line}` });
        for (const m of (p.models || [])) {
          if (m.model_id) opts.push({ id: "model:" + m.model_id, label: `   ${m.name}` });
        }
      }
      return opts;
    },
    bulkScopeLabel(id) {
      return this.bulkScopeOptions.find(o => o.id === id)?.label.trim() || id;
    },

    async previewBulkPrice() {
      const b = this.bulkPrice;
      const value = Number(b.value);
      if (!Number.isFinite(value) || value === 0) return this.toast("Ingresá un valor distinto de 0", "error");
      b.loading = true;
      try {
        b.preview = await this.api("POST", "/products/variants/bulk-price", {
          scope: b.scope, type: b.type, value, dryRun: true,
        });
      } catch (err) { this.toast(err.message, "error"); }
      finally { b.loading = false; }
    },

    async applyBulkPrice() {
      const b = this.bulkPrice;
      if (!b.preview || b.applying) return;
      const verb = b.type === "percent"
        ? `${Number(b.value) > 0 ? "+" : ""}${b.value}%`
        : `${Number(b.value) > 0 ? "+" : ""}${this.fmtCLP(Math.abs(Number(b.value)))}`;
      if (!(await this.askConfirm(`Aplicar ${verb} a ${b.preview.affected} variantes de "${this.bulkScopeLabel(b.scope)}"?`))) return;
      b.applying = true;
      try {
        const r = await this.api("POST", "/products/variants/bulk-price", {
          scope: b.scope, type: b.type, value: Number(b.value),
        });
        b.lastBatch = { id: r.batchId, affected: r.affected };
        b.preview = null;
        b.value = "";
        this.toast(`${r.affected} precios actualizados`, "success");
        await this.loadProducts();
      } catch (err) { this.toast(err.message, "error"); }
      finally { b.applying = false; }
    },

    async undoBulkPrice() {
      const batch = this.bulkPrice.lastBatch;
      if (!batch) return;
      if (!(await this.askConfirm(`¿Revertir el ajuste de ${batch.affected} precios?`))) return;
      try {
        const r = await this.api("POST", "/products/variants/bulk-price/undo", { batchId: batch.id });
        this.bulkPrice.lastBatch = null;
        this.toast(`${r.restored} precios restaurados${r.skipped ? ` (${r.skipped} ya no existen)` : ""}`, "success");
        await this.loadProducts();
      } catch (err) { this.toast(err.message, "error"); }
    },

    // Abre el mismo modal de stock desde el dashboard, con el kardex ya cargado.
    openKardex(row) {
      this.openStockModal({ variant_id: row.variant_id, stock: row.stock }, this.criticalLabel(row));
      this.stockModal.ref = row; // la fila del dashboard también refleja el cambio
      this.loadStockLog();
    },
    kardexReason(r) {
      const map = { manual: "Ajuste manual", sale: "Venta", return: "Devolución", adjust: "Corrección", reserve: "Reserva", release: "Liberación" };
      return map[r] || r;
    },

    // Ajuste rápido desde el panel de stock crítico del dashboard.
    async bumpCriticalStock(row, delta) {
      try {
        const updated = await this.api("POST", "/products/variants/" + row.variant_id + "/stock", {
          delta, reason: "manual", note: "Reposición desde el dashboard",
        });
        row.stock = updated.stock;
        this.toast(`Stock: ${updated.stock}`, "success");
        // Al pasar el umbral la fila deja de ser crítica: recargamos para que
        // salga de la lista (y el badge del sidebar baje) en vez de quedar
        // mostrando una alerta ya resuelta.
        if (updated.stock > 2) this.loadDashboard();
      } catch (err) { this.toast(err.message, "error"); }
    },
    criticalLabel(row) {
      return `${row.model} ${row.storage}${row.color ? " · " + row.color : ""}`;
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
      this.filterPalette();
      this.$nextTick(() => this.$refs.paletteInput?.focus());
    },

    // Todo lo que sale acá EJECUTA algo de verdad. Antes los resultados de
    // producto solo hacían goto('catalog') y el placeholder prometía
    // "subir 5% iphone 15", un lenguaje natural que nunca existió.
    allPaletteItems() {
      const items = this.visibleNav.map(n => ({
        label: "Ir a " + n.label, icon: "→", action: () => this.goto(n.id),
      }));

      items.push(
        { label: "Registrar venta manual", hint: "Tienda, Instagram, transferencia", icon: "＋", action: () => { this.goto("orders"); this.openManualOrder(); } },
        { label: "Nuevo producto", icon: "▦", action: () => { this.goto("catalog"); this.newProduct(); } },
      );
      if (this.isAdmin) {
        items.push(
          { label: "Nuevo cupón", icon: "🎟", action: () => { this.goto("coupons"); this.openCouponEditor("create"); } },
          { label: "Ajuste masivo de precios", hint: "Con vista previa y deshacer", icon: "↗", action: () => { this.goto("catalog"); this.openBulkPrice(); } },
          { label: "Exportar inventario a CSV", icon: "⬇", action: () => this.exportInventory() },
          { label: "Exportar órdenes a CSV", hint: "Respeta los filtros activos", icon: "⬇", action: () => this.exportOrders() },
          { label: "Configurar emails", hint: "Remitente, recordatorios, follow-up", icon: "✉", action: () => this.openEmailSettings() },
          { label: "Ver log de emails", hint: "Qué salió y qué falló", icon: "✉", action: () => this.openEmailSettings("log") },
          { label: "Correr el ciclo de emails ahora", hint: "Sin esperar el intervalo", icon: "↻", action: () => { this.openEmailSettings(); this.runEmailScheduler(); } },
        );
      }
      items.push(
        { label: "Carritos sin comprar", hint: "Con email capturado", icon: "🛒", action: () => { this.cartQuery = { status: "active", payment: "", q: "", has_email: "1", from: "", to: "" }; this.goto("carts"); } },
        { label: "Carritos con pago pendiente", hint: "Empezaron a pagar y no terminaron", icon: "⏳", action: () => { this.cartQuery = { status: "", payment: "pending", q: "", has_email: "", from: "", to: "" }; this.goto("carts"); } },
      );

      // Cada modelo abre su editor; cada orden reciente abre su detalle.
      for (const p of this.products) {
        for (const m of (p.models || [])) {
          const stock = (m.storages || []).reduce((a, s) => a + (Number(s.stock) || 0), 0);
          items.push({
            label: m.name,
            hint: `${this.modelPriceRange(m)} · stock ${stock}`,
            icon: "▦",
            action: () => { this.goto("catalog"); this.openProductEditor(p.id); },
          });
        }
      }
      for (const o of this.orders.slice(0, 40)) {
        items.push({
          label: o.id,
          hint: `${(o.buyer && o.buyer.name) || "Sin nombre"} · ${this.fmtCLP(o.total)}`,
          icon: "▤",
          action: () => { this.goto("orders"); this.openOrderDetail(o.id); },
        });
      }
      return items;
    },

    filterPalette() {
      const q = this.palette.query.toLowerCase().trim();
      const all = this.allPaletteItems();
      this.palette.results = (q
        ? all.filter(r => r.label.toLowerCase().includes(q) || (r.hint || "").toLowerCase().includes(q))
        : all
      ).slice(0, 30);
      this.palette.idx = 0;
    },

    runPalette() {
      const r = this.palette.results[this.palette.idx];
      if (r && r.action) {
        r.action();
        this.palette.open = false;
      }
    },

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

    // La DB guarda "YYYY-MM-DD HH:MM:SS" en UTC. Sin forzar la zona, el
    // navegador del equipo mostraría la hora local de su máquina y no la de la
    // tienda — que es la que importa para "¿a qué hora entró este pedido?".
    toDate(sqlDate) {
      if (!sqlDate) return null;
      const s = String(sqlDate);
      const d = new Date(s.replace(" ", "T") + (/[Zz]|[+-]\d\d:?\d\d$/.test(s) ? "" : "Z"));
      return isNaN(d.getTime()) ? null : d;
    },
    fmtDateTime(sqlDate) {
      const d = this.toDate(sqlDate);
      if (!d) return "—";
      return d.toLocaleString("es-CL", {
        timeZone: "America/Santiago",
        day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
      });
    },
    // SQL datetime → valor para <input type="datetime-local">.
    toLocalInput(sqlDate) {
      const d = this.toDate(sqlDate);
      if (!d) return "";
      const pad = n => String(n).padStart(2, "0");
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    },

    fulfillmentLabel(id) { return this.FULFILLMENTS.find(f => f.id === id)?.label || id || "—"; },
    payStateLabel(id) { return this.PAY_STATES.find(s => s.id === id)?.label || id || "—"; },
    channelLabel(id) { return this.CHANNELS.find(c => c.id === id)?.label || id || "—"; },
    payMethodLabel(id) { return this.PAY_METHODS.find(m => m.id === id)?.label || id || "—"; },

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
