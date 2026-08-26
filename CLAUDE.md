# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Static landing site for **iPhone UP**, a refurbished iPhone store in Providencia, Santiago, Chile. Sells iPhone 11 → 17 (all variants), runs a "vende tu iPhone" trade-in flow, has a physical store at Padre Mariano 98, Of. 105.

Visual style: **Dark Neon Premium** — pure black background, lime green accent (`#A4E83A`), self-hosted Inter font, glow shadows, neon-wave SVG.

Contact is **Instagram-only** (`@iphoneup.cl`). Phone numbers and WhatsApp buttons were removed site-wide (the displayed number was a placeholder); all contact CTAs now point to Instagram.

## Stack

Frontend: Vanilla HTML + CSS + JS (sin bundler). Backend Node + Express (Node 20+, `fetch` global, SQLite via `better-sqlite3`). El admin "Neon Console" en `/admin` está hecho con Alpine.js 3 self-hosted en `assets/vendor/alpine.min.js` (sin build step, sin CDN).

```
server/index.js              → Express + helmet + sessions + static serving
server/db.js                 → Singleton SQLite + migraciones idempotentes al boot
server/migrations/*.sql      → Schema versionado (001_initial.sql, ...)
server/routes/mercadopago.js → /api/mercadopago/* (Checkout Pro + webhook firmado)
server/routes/chilexpress.js → /api/chilexpress/* (geo + rating, con fallback)
server/routes/orders.js      → /api/orders/:id (consulta pública)
server/routes/emails.js      → /api/cart/* (captura/restauración) + /api/emails/* (baja + webhook Resend)
server/routes/admin/*.js     → /api/admin/* (auth, products, coupons, orders, users, audit, uploads, dashboard, analytics, settings, carts, emails)
server/middleware/auth.js    → requireAuth + requireRole
server/lib/catalog.js        → buildCatalog() y buildDataJs() (genera /data.js desde DB)
server/lib/catalog-extras.js → TESTIMONIALS, STATS, FAQS, TRADEIN_PRICES (aún hardcoded)
server/lib/settings.js       → get/set de la tabla `settings` (config editable del admin: comisión medio de pago, emails)
server/lib/resend.js         → Cliente HTTP de Resend (sin SDK). Dry-run si no hay API key
server/lib/mailer.js         → ÚNICA puerta de salida de emails: settings → exclusiones → idempotencia → render → envío
server/lib/email-templates.js→ Design system + templates HTML/texto (todo dato externo pasa por esc())
server/lib/email-images.js   → Whitelist de rutas + derivados PNG cacheados de las fotos del catálogo
server/lib/email-fixtures.js → Datos ficticios por template + whitelist de lo probable desde el admin
server/lib/email-token.js    → HMAC de los links de baja (unsubscribe)
server/lib/resend-signature.js → verify() de la firma Svix del webhook de Resend
server/lib/email-scheduler.js→ setInterval: vence carros, manda recordatorios y follow-ups
server/lib/carts.js          → Carritos capturados/abandonados (precios re-resueltos contra la DB)
server/lib/users.js          → bcrypt + lookup + bootstrap del primer usuario
server/lib/audit.js          → log de mutaciones (before/after JSON)
server/lib/coupons.js        → validación y aplicación al carro
server/lib/stock.js          → adjust() + commitOrderSale() para webhook MP
server/lib/storage.js        → órdenes en SQLite (refactor desde JSON)
server/lib/backup.js         → snapshot SQLite cada 6h en {DATA_DIR}/backups/
server/lib/mp-signature.js   → verify() HMAC del webhook MP
server/lib/chilexpress.js    → Cliente API Chilexpress
server/lib/shipping-fallback.js → Tarifas fijas por región cuando no hay API key
admin.html / admin.css / admin.js → Single-page admin (Alpine.js 3)
assets/vendor/alpine.min.js  → Alpine self-hosted (44 KB) — NO usar CDN (CSP lo bloquea)
assets/email/                → PNG que usan los emails (logo + placeholder). NO WebP: Outlook no lo lee
scripts/seed-from-datajs.js  → Migración inicial data.js → SQLite (corre al boot si DB vacía)
scripts/build-email-assets.js→ `npm run build:email-assets` — regenera assets/email/*.png desde el logo
scripts/preview-emails.js    → `npm run preview:emails` — vuelca los 8 templates a ./email-preview/
scripts/create-user.js       → CLI: crear/resetear usuario admin
scripts/verify-emails.js     → `npm run verify:emails` — libs de email/carritos en DB temporal + dry-run
scripts/verify-http.js       → `npm run verify:http` — levanta el server real y golpea las rutas nuevas
Dockerfile                   → Node 20 alpine + VOLUME ["/data"]
.env.example                 → Plantilla de credenciales
PAGOS_Y_ENVIOS.md            → Guía MP + Chilexpress
docs/                        → PDF de solicitud de credenciales para cliente
```

### Volumen persistente `/data` (CRÍTICO)

En producción **debe** montarse un volumen Docker en `/data`. Sin él:
- La DB SQLite (`/data/iphoneup.db`) se pierde en cada redeploy
- Los uploads de admin (`/data/uploads/products/*.webp`) desaparecen
- Los backups (`/data/backups/*.db`) no persisten

En local default es `./data` (ver env `DATA_DIR`).

### API endpoints

**Públicos:**
| Método | Ruta                                       | Qué hace                                   |
|--------|--------------------------------------------|--------------------------------------------|
| GET    | `/api/health`                              | Healthcheck + diagnóstico (build SHA, db count) |
| GET    | `/data.js`                                 | Catálogo dinámico desde DB con ETag (reemplaza el archivo físico) |
| GET    | `/api/chilexpress/regions`                 | Regiones de Chile                          |
| GET    | `/api/chilexpress/coverage?regionCode=RM`  | Comunas de una región                      |
| POST   | `/api/chilexpress/quote`                   | Cotiza envío                               |
| POST   | `/api/mercadopago/preference`              | Crea orden + Preference                    |
| POST   | `/api/mercadopago/webhook`                 | Webhook con firma HMAC (descuenta stock al `approved`) |
| GET    | `/api/orders/:id`                          | Detalle de orden (sin datos sensibles)     |
| POST   | `/api/cart/capture`                        | Guarda carro + email del checkout (precios re-resueltos contra la DB) |
| GET    | `/api/cart/:token`                         | Restaura el carro desde el link del email (`?rc=`) |
| GET    | `/api/emails/image?src=&s=`                | Derivado PNG de una foto para los emails. **Whitelist de rutas**, sin auth |
| GET/POST | `/api/emails/unsubscribe`                | Baja con link firmado (GET = página, POST = one-click RFC 8058) |
| POST   | `/api/emails/webhook`                      | Eventos de Resend con firma Svix (rebote duro ⇒ lista de exclusión) |
| GET    | `/uploads/*`                               | Imágenes subidas desde admin (cache inmutable) |

**Admin (`/api/admin/*`, requiere sesión salvo `/auth/*`):**
| Método | Ruta                                       | Qué hace                                   |
|--------|--------------------------------------------|--------------------------------------------|
| POST   | `/api/admin/auth/login`                    | Login (rate-limit 10/15min)                |
| POST   | `/api/admin/auth/logout`                   | Logout                                     |
| GET    | `/api/admin/auth/me`                       | Sesión actual                              |
| GET    | `/api/admin/products`                      | Lista productos + variants con stock       |
| PATCH  | `/api/admin/products/:id`                  | Editar producto (hidden, line, etc.)       |
| PATCH  | `/api/admin/products/variants/:id`         | Editar variant (precio, sku, activo)       |
| POST   | `/api/admin/products/variants/:id/stock`   | Ajuste de stock con motivo                 |
| POST   | `/api/admin/products/variants/bulk-price`  | Ajuste masivo por scope                    |
| CRUD   | `/api/admin/coupons`                       | Cupones                                    |
| GET    | `/api/admin/orders`                        | Lista órdenes con filtros                  |
| GET/POST/PATCH | `/api/admin/users`                 | Gestión de usuarios admin                  |
| GET    | `/api/admin/audit-log`                     | Historial de mutaciones                    |
| POST   | `/api/admin/uploads/image`                 | Sube imagen → WebP en `/data/uploads/`     |
| GET    | `/api/admin/dashboard`                     | KPIs + sparkline + top productos + actividad |
| GET/PATCH | `/api/admin/settings/payment-fee`       | Comisión medio de pago `{ rate, enabled }` (editable/desactivable) |
| GET    | `/api/admin/carts`                         | Carritos abandonados + resumen (KPIs)      |
| GET/DELETE | `/api/admin/carts/:id`                 | Detalle con historial de emails / borrar (DELETE = admin) |
| POST   | `/api/admin/carts/:id/remind`              | Reenvío manual del recordatorio (admin)    |
| GET/PATCH | `/api/admin/emails/config`              | Config de emails + estado del proveedor (PATCH = admin) |
| GET    | `/api/admin/emails/log`                    | Historial de envíos con filtros y paginación |
| GET/POST/DELETE | `/api/admin/emails/suppressions`  | Lista de exclusión (escribir = admin)      |
| POST   | `/api/admin/emails/test`                   | Prueba de CUALQUIER template con datos ficticios (admin). `{template?, to?}`; sin `to` va al admin logueado |
| POST   | `/api/admin/emails/run-scheduler`          | Fuerza un ciclo del scheduler (admin)      |

## Run locally

```bash
npm install
cp .env.example .env   # completar con SESSION_SECRET, ADMIN_BOOTSTRAP_*, MP, Chilexpress
npm start              # http://localhost:8080
# Admin: http://localhost:8080/admin (login con ADMIN_BOOTSTRAP_EMAIL/PASSWORD)
```

Primer boot:
1. Crea `./data/iphoneup.db` y corre migraciones.
2. Si la tabla `products` está vacía, ejecuta el seed desde `data.js`.
3. Si no hay usuarios activos y `ADMIN_BOOTSTRAP_*` están definidos, crea el primer admin.
4. Si existe `server/data/orders.json` legacy, lo migra a SQLite y lo renombra a `.migrated.bak`.

CLI útil: `node scripts/create-user.js <email> <password> [name] [role]` para crear/resetear admins.

**Verificaciones** (no hay test runner ni CI a propósito — son scripts con `node` pelado):

```bash
npm run verify:emails   # libs de email/carritos: migración, templates+XSS, diseño, imágenes, firmas, idempotencia, scheduler
npm run verify:http     # levanta el server real en un puerto alto y golpea rutas, auth, imágenes y webhook
```

Ambos usan un `DATA_DIR` temporal y fuerzan `RESEND_API_KEY=""` ⇒ **no tocan la DB real ni envían un solo correo**. Corrélos antes de pushear cualquier cambio del backend.

Lo que cubren del lado de emails, además del render: que ninguna URL quede relativa, que ningún `<img>` apunte a un `.webp`, que el logo y el placeholder existan y sean PNG de verdad, que los botones lleven el fallback VML, que el HTML entre en el límite de Gmail, que la whitelist de `/api/emails/image` rechace traversal / dominios ajenos / archivos que no son fotos, y que un `item.img` malicioso caiga al placeholder en vez de inyectar un atributo.

## Deploy

Pushing to `main` triggers autodeploy en Dokploy. **Build Type = Dockerfile**. Puerto interno 8080.

**Volumen Docker `/data` (OBLIGATORIO):** sin él la DB y los uploads se pierden en cada redeploy.

**Variables de entorno requeridas:**
- Server: `PORT`, `PUBLIC_URL`, `DATA_DIR=/data`
- Admin: `SESSION_SECRET`, `ADMIN_BOOTSTRAP_EMAIL`, `ADMIN_BOOTSTRAP_PASSWORD`, `USE_DB_CATALOG=true`
- Mercado Pago: `MP_ACCESS_TOKEN`, `MP_PUBLIC_KEY`, `MP_WEBHOOK_SECRET`
- Chilexpress (opcional, sin esto usa fallback): `CHILEXPRESS_API_KEY_RATING`, `CHILEXPRESS_API_KEY_GEO`, `CHILEXPRESS_ORIGIN_COUNTY_CODE`, `CHILEXPRESS_ORIGIN_REGION_CODE`

Ver `PAGOS_Y_ENVIOS.md` para el detalle.

## Architecture

Multiple real HTML pages, no SPA. `product.html` is a *template* that renders different content based on `?id=NN`. The checkout pages depend on the backend; the rest are pure static.

```
index.html               → home (hero, catalog, trade-in, store, testimonials, FAQ, footer)
product.html             → product detail (one template, query-string driven)
checkout.html            → checkout (cart summary + buyer form + shipping + MP)
payment-success.html     → return URL: MP "approved"
payment-failure.html     → return URL: MP "rejected/cancelled"
payment-pending.html     → return URL: MP "pending" (cash/transfer)

data.js     → window.CATALOG, TESTIMONIALS, STATS, FAQS, TRADEIN_PRICES, PAY_FEE,
              fmtCLP, cartStore (sessionStorage shim for cross-page cart)
specs.js    → window.IPHONE_SPECS (per-line Apple specs + per-variant overrides),
              window.getSpecsFor(lineId, variantName) — merges line base with variant extras
app.js      → home page logic (catalog grid, filters, trade-in, FAQ, cart drawer)
product.js  → product page logic (parses ?id=&m=&s=, renders gallery/variants/specs/related)
checkout.js → checkout logic (fetch regions/comunas/quote → POST preference → MP redirect)
checkout.css→ checkout-specific styles (the rest still come from styles.css)
```

**Script load order matters.** `data.js` must load before `app.js` (home), before `specs.js` + `product.js` (product page), and before `checkout.js` (checkout). All cross-file communication happens through `window.*` globals — there are no ES modules.

### Catalog data shape (`window.CATALOG`)

```js
[
  { id: 11, line: "11", year: 2019, img: "assets/iphones/iphone-11.webp",
    models: [
      { name: "iPhone 11", img: "...", storages: [{s:"64GB", p:180000}, ...], sealed: false },
      ...
    ]
  },
  ...
]
```

- `id` is the line number (11..17) and is what `product.html?id=NN` looks up.
- `phone.img` is the line image (used as fallback for variants without `img`).
- Each `model` has its own `img` field — the product page swaps to this when the user picks a variant. Falls back to `phone.img`.
- `sealed: true` shows a SELLADO badge. Currently only iPhone 17 line is sealed.
- `storages` is `[{s, p}]` — `s` is the capacity label, `p` is price in CLP integers.

Prices come from real client posters on Instagram (`@iphoneup.cl`) — they are not estimates. **Don't round or "fix" them**; they reflect the live retail prices.

### Trade-in (`window.TRADEIN_PRICES`)

A two-level object `{ "iPhone Model Name": { "64GB": 80000, "128GB": 90000 } }`. Only the storages with a price for that model are shown in the UI; if a model has no price, it shouldn't be in the dropdown. The displayed price is the **maximum** the store pays, assuming perfect condition + box + accessories — this caveat is part of the UX, not a fine-print disclaimer.

### Specs (`window.IPHONE_SPECS`)

Keyed by line `id` (11..17). Has a `proExtras` sub-object that overrides specific fields (chip, display, cameras, etc.) for Pro / Pro Max / Mini / Plus variants. Always read via `window.getSpecsFor(lineId, variantName)` — it merges line base + variant overrides automatically.

### Cart (`window.cartStore`)

Persists across page navigations via `sessionStorage` under key `iphoneup_cart_v1`. API: `read()`, `write(items)`, `add(item)`, `remove(idx)`, `count()`. Both `app.js` and `product.js` mutate it through this same object. The cart drawer markup is duplicated in both `index.html` and `product.html` — keep them in sync if you add fields.

### Catalog ordering

`visiblePhones()` in [app.js](app.js) returns the catalog **descending by id** (newest first). The filter pills "Todos / Nuevos (15-17) / Clásicos (11-14)" filter before sorting. If you add a new line, just put it in `CATALOG` in any order.

### Product page URL params

`product.html?id=11&m=2&s=1` → line 11, modelIdx 2 (Pro Max), storageIdx 1. Indexes are clipped if out of range. The page `pushUrl()`s on every variant/storage change so URLs are shareable. Linking from a home card should preserve the user's selected variant by passing `m` and `s`.

### Checkout flow

End-to-end (every arrow is one fetch / one navigation):

```
cart drawer ─→ checkout.html
   ▾ on load:   GET  /api/chilexpress/regions   (fill <select region>)
   ▾ on region: GET  /api/chilexpress/coverage  (fill <select county>)
   ▾ on county: POST /api/chilexpress/quote     (show shipping options w/ price)
   ▾ on submit: POST /api/mercadopago/preference (creates order + Preference)
                ↓ redirect to pref.init_point
        ╔══════════════════════════╗
        ║  mercadopago.com.cl pay   ║
        ╚══════════════════════════╝
   ▾ MP redirects to back_urls.{success,failure,pending}?order=ORD-XXX
   ▾ MP fires POST /api/mercadopago/webhook → updateOrderStatus()
payment-success.html ─→ GET /api/orders/:id (renders detail + Instagram CTA)
```

The cart shape `{model, storage, color, price, sealed, phoneId, img}` is **the API contract** between frontend and backend — `server/routes/mercadopago.js` reads exactly these fields when building MP `items` (`phoneId` = id de la línea, `model` = nombre del modelo). El backend además agrega, según config, un ítem de **comisión medio de pago**. Adding a field to cart drawer ≠ free; the backend needs to know what to do with it.

Orders are persisted to `server/data/orders.json` (file-based, gitignored). On the webhook callback, `external_reference` matches the orderId we created — that's how MP's async notification finds the right local order to update.

`auto_return: "approved"` in the Preference means MP only auto-redirects back on approved payments; rejected/pending require the user to click "Return to site" in MP's UI.

## Image pipeline

iPhone images live in `assets/iphones/` (line images) and `assets/iphones/variants/` (per-model). They are served as **WebP** — `data.js` and every `<img>` reference point to `.webp`. The hero is `assets/iphones/iphone-17-pro-max.webp` and the nav logo is `assets/logo-trimmed.webp`. The two logo rasters stay non-WebP **on purpose**: `assets/logo.jpg` (og:image) and `assets/logo-mark.jpg` (favicon), because social scrapers and favicons have spotty WebP support.

When adding an image, replicate the existing prep + conversion, then check the WebP visually with the Read tool before committing:

1. **Source prep (on the PNG)** — sources are scraped from `backonline.cl/cdn/shop/files/...` (full PDP shots) and `pngimg.com/uploads/iphone_11/` (iPhone 11 series). Two transforms: (a) **white-background removal** — corner flood-fill alpha=0 through near-white pixels (`R≥235 AND G≥235 AND B≥235`) + 0.7px Gaussian blur on alpha; (b) **trim to content bbox** with ~2% padding, so every variant fills its `object-fit: contain` box equally (without it, padded variants render visually smaller).
2. **WebP conversion** — `sharp(png).webp({ quality: 82, alphaQuality: 100, effort: 6 })`, then delete the source PNG. Typical result is −90%+ (the full catalog went 8.2 MB → 0.58 MB). `sharp` is **not** a project dependency: install it ad-hoc with `npm install sharp --no-save` for the one-off so it never lands in `package.json` / the Docker build.

## Emails: diseño y convenciones

Los 8 templates de `server/lib/email-templates.js` usan la **misma identidad Dark Neon Premium que el sitio**: fondo negro, tarjeta `#0B0B0B`, acento lima `#A4E83A`, logo real. Antes eran claros/genéricos; el rediseño es de punta a punta.

**El HTML de un email no es el HTML de una página.** Reglas que hay que respetar al tocar cualquier template:

- **Layout con `<table>`**, ancho fijo 600px. Outlook renderiza con el motor de Word: no hay flex, ni grid, ni `position`.
- **Colores sólidos y duplicados**: `bgcolor="#0B0B0B"` como atributo HTML *además* del `style` inline. Outlook ignora `background` en CSS de `<td>`. Nada de degradados de fondo, `rgba()` ni sombras.
- **Todo lo estructural va inline.** El `<style>` del `<head>` solo lleva mejoras progresivas (media queries, overrides de modo oscuro). Un cliente que lo descarte tiene que seguir viendo el email completo.
- **`mso-line-height-rule:exactly`** en cada bloque de texto, o Outlook se come el `line-height`.
- **Botones con fallback VML** (`<v:roundrect>` dentro de `<!--[if mso]>`). El `<a>` con padding y `border-radius` no funciona en Outlook de escritorio. Lo hace `button()`, no lo escribas a mano.
- **`<meta name="color-scheme" content="dark">`** + los overrides `[data-ogsc]`/`[data-ogsb]`: el email ya es oscuro y esos selectores evitan que Gmail/Outlook.com lo re-inviertan.
- **Menos de ~100 KB de HTML.** Gmail recorta arriba de 102 KB y muestra "ver mensaje completo". Hoy el más grande son ~20 KB; `verify:emails` lo chequea.
- **Componentes, no markup suelto**: `layout()`, `chip()`, `button()`, `productCards()`, `totalsBlock()`, `infoBox()`, `dataList()`, `trackingBox()`, `divider()`, `paragraph()`, `note()`. Si necesitás algo nuevo, agregá un componente.
- **Texto plano siempre.** Un email sin alternativa de texto puntúa peor en los filtros de spam.

**Imágenes (esto es lo menos obvio).** Outlook de escritorio **no soporta WebP** y todo el catálogo es WebP, así que ningún `<img>` de un email puede apuntar a un `.webp`:

- Las fotos de producto salen por **`GET /api/emails/image?src=…&s=…`** (`server/lib/email-images.js`), que convierte a PNG cuadrado con `sharp` y cachea el derivado en `{DATA_DIR}/cache/email-images/`. La clave de cache incluye el mtime del original ⇒ si el admin resube la foto, el derivado se regenera solo.
- Ese endpoint es **público y sin sesión** (lo abre el proxy de Gmail). Su defensa es una **whitelist**: cuatro carpetas (`assets/iphones/`, `assets/iphones/variants/`, `assets/email/`, `uploads/products/`), solo extensiones de imagen, nombre de archivo que no arranque con punto. Descarta traversal, backslash, `javascript:`/`data:`/`file:`, protocol-relative y cualquier host que no sea `PUBLIC_URL`. **No relajes `normalizeSource()`** sin agregar los asserts correspondientes.
- Si la fuente no pasa la whitelist o el archivo no existe, se cae al **placeholder** (`assets/email/product-placeholder.png`), nunca a un `<img>` roto.
- El logo (`assets/email/logo.png`) va directo por `express.static`. Los assets de `assets/email/` se sirven con `Cross-Origin-Resource-Policy: cross-origin` porque el default `same-origin` de helmet los bloquearía en un webmail.
- **Todas las URLs de un email son absolutas** y salen de `PUBLIC_URL`. Sin `PUBLIC_URL` no hay imágenes (una ruta relativa dentro de un correo no significa nada).
- Para regenerar los PNG después de cambiar el logo: `npm run build:email-assets`.

**Contacto en los emails: solo Instagram** (`@iphoneup.cl`). Los emails no llevan WhatsApp aunque el sitio sí lo tenga.

**Para verlo antes de mandarlo:**

```bash
npm run preview:emails                                   # → ./email-preview/index.html (gitignored)
PUBLIC_URL=http://localhost:8080 npm run preview:emails  # con el server arriba, para ver las fotos
```

Y desde el panel: Ajustes → Emails → botón de prueba por template (asunto marcado `[PRUEBA]`, datos ficticios).

## CSS architecture

Single ~1500-line `styles.css`. Conventions:

- The first rule is the self-hosted Inter `@font-face` (see **SEO & fonts**).
- CSS custom properties at `:root` for theming (`--accent`, `--bg`, `--max`, etc.).
- All sections use `max-width: var(--max)` (1280px) inner wrapper centered with `margin: 0 auto`.
- The accent color `#A4E83A` is hard-coded in many places (esp. RGBA glow shadows). When changing brand color, do a project-wide replace plus update `--accent`.
- Three responsive breakpoints: `≤1100px`, `≤900px` (mobile burger triggers here), `≤700px` (mobile compaction), `≤380px` (very small phones). The home and product page each have their own block of media queries at the bottom of `styles.css`.
- Logo (`assets/logo-trimmed.webp`) is a **transparent image** — do NOT re-introduce `mix-blend-mode: screen` (was a hack for the original JPG with black bg).

## Maps section

The store map is an `<iframe>` of OpenStreetMap (no API key, no tracking) tinted via CSS `filter: invert(0.92) hue-rotate(180deg) saturate(0.55)` to match the dark theme. Coordinates `-33.4250602, -70.6170597`. The pin is a CSS overlay, not part of the map. Two CTAs underneath: Google Maps (deep-link `?api=1&destination=lat,lon`) and Waze (`?ll=lat,lon&navigate=yes`).

## SEO & fonts

- **Self-hosted Inter** — `assets/fonts/inter-latin.woff2` (variable font, latin subset) loaded via `@font-face` at the top of `styles.css` (`font-weight: 100 900`, `font-display: swap`) + `<link rel="preload">` in every page `<head>`. **Don't re-add the Google Fonts CDN** — it was removed for speed + privacy.
- **`robots.txt` + `sitemap.xml`** at the repo root. The sitemap lists the home + the 7 product lines (`product.html?id=11..17`); update it if lines change.
- **Per-page metadata**:
  - Home (`index.html`): static `<title>`/description/canonical/OG/Twitter + a static `Store` (LocalBusiness) JSON-LD in `<head>` (no `telephone` — phone was removed).
  - Product (`product.html`): ships placeholder meta tags carrying `id`s (`#meta-desc`, `#canonical-url`, `#og-url/-title/-image`, `#tw-*`). `product.js` `updateMeta()` rewrites them per variant on every `renderAll()`, and `updateProductSchema()` upserts a `Product` + `BreadcrumbList` JSON-LD (`#ld-product`). Canonical points to `product.html?id=NN` (drops the `m`/`s` params to dedupe variant combos).
  - `app.js` `injectFaqSchema()` builds a `FAQPage` JSON-LD from `window.FAQS` so FAQ text isn't duplicated in static HTML.
  - OG/canonical/JSON-LD URLs are absolute (`https://iphoneup.cl/...`).
- **Cache headers** — `server/index.js` sets `Cache-Control` per file type: 30 days for images/fonts, `no-cache` (ETag revalidation) for HTML/CSS/JS so `data.js` price edits and deploys appear immediately. Filenames aren't content-hashed → **don't long-cache JS/CSS**.

## Admin "Neon Console"

`/admin` carga `admin.html` que es un SPA single-file con Alpine.js. Misma estética Dark Neon Premium que el público. Login en `/admin/login` (mismo HTML, vista distinta vía `x-show`).

**Capas de admin:**
- **UI**: `admin.html` (markup + Alpine bindings) + `admin.css` (sistema visual) + `admin.js` (estado reactivo + fetch). Alpine se sirve desde `assets/vendor/alpine.min.js` (44 KB, self-hosted) — la CSP de helmet bloquea unpkg/cdnjs, así que **no volver a referenciar Alpine vía CDN**.
- **API**: `server/routes/admin/*.js` montado en `/api/admin`. Middleware `requireAuth` redirige a login si no hay sesión válida.
- **Sesiones**: `express-session` + `better-sqlite3-session-store`. Cookie httpOnly, Secure en prod, SameSite=Lax, 7 días.
- **Audit**: toda mutación llama `audit.log(req, {action, entity_type, entity_id, before, after})`. Vista en Settings → Audit log.
- **Stock**: cualquier cambio pasa por `stock.adjust({variant_id, delta, reason, user_id, note})` que escribe a `variants.stock` y graba en `stock_movements`. El webhook MP llama `stock.commitOrderSale(order)` al `approved`.
- **Catálogo dinámico**: `/data.js` se sirve desde DB con ETag — al cambiar un precio en admin el navegador hace 304 hasta que cambia el hash. Cuando `USE_DB_CATALOG=false`, sirve el archivo físico (fallback de emergencia).

**Vistas del admin** (todas en `admin.html`, switching con `view` state):
1. Dashboard — KPIs en vivo + sparkline + top productos + feed de actividad + **stock crítico accionable** (±1 y kardex sin salir de la vista)
2. Analítica — tiempo real (visitantes activos, refresh cada 12s) + sesiones/ingresos por día + top páginas y referidos
3. Catálogo — 1 fila por modelo; el editor es un drawer con **borrador** (nada se guarda hasta "Guardar cambios" → `PUT /api/admin/products/:id/save`, una sola transacción). Por variante: color, precio, **precio antes (`compare_at_price`)**, costo, margen calculado, stock, SKU y activo. Galería con drag&drop, foto principal y **texto alternativo por imagen**.
4. Stock — pivote capacidad × color por modelo
5. Cupones — cards tipo ticket, CRUD completo (crear y editar usan el mismo formulario)
6. Órdenes — búsqueda + filtros (pago/envío/canal/fechas) + paginación server-side, export CSV, alta manual, y drawer con tabs Detalle / Preparación / Historial
7. Settings — tabs Usuarios / Audit log / Sistema / Emails. En **Emails → Configuración** hay un botón de prueba **por cada template** (`POST /api/admin/emails/test` con `{template}`): usa los fixtures de `server/lib/email-fixtures.js`, marca el asunto con `[PRUEBA]`, no toca órdenes/carritos/stock y por default va al correo del admin logueado. El aviso interno se prueba contra ese destinatario, así que funciona aunque `internalTo` esté vacío. La tab **Sistema** incluye la **Comisión medio de pago** (switch on/off + % editable → `PATCH /api/admin/settings/payment-fee`) y los **precios de recompra** (trade-in editable como JSON).

**Atajos**: `⌘K` command palette (navega, crea, exporta y abre productos/órdenes por nombre), `G+P/O/S/C/D/U` navegación, `Esc` cerrar drawer/palette.

**Badges del sidebar**: `navBadge(id)` en `admin.js` pinta un contador sobre Órdenes (pagadas sin despachar) y Stock (variantes ≤2). Sale del `/api/admin/dashboard` que ya se carga; en 0 no se muestra nada.

**2FA: NO implementado y sin infraestructura.** No hay librería TOTP, ni columna de secreto en `users`, ni flujo de recovery codes. Agregarlo implica una dependencia npm nueva (p.ej. `otplib`) + migración + pantalla de enrolamiento; hoy la defensa del login es bcrypt + rate-limit 10/15min + sesión httpOnly. Si se pide, tratarlo como feature propia, no como ajuste.

**Bootstrap del primer usuario**: si la tabla `users` está vacía al boot y existen `ADMIN_BOOTSTRAP_EMAIL/PASSWORD`, se crea automáticamente. Después se pueden borrar esas env vars; el script `npm run create-user` permite agregar más.

## Things to be careful with

- **`PUT /api/admin/products/:id/save` distingue "key ausente" de "key vacía"** en los campos opcionales de cada variante (`compare_at`, `cost`, `sku`): si la key **no viene**, conserva lo que hay en la DB; si viene como `null`/`""`, lo borra. Por eso el editor manda SIEMPRE las tres keys aunque estén vacías (ver `saveProductDraft()` en `admin.js`). Si agregás otro campo opcional, seguí el mismo patrón — mandarlo como `undefined` desde el front significaba "borralo" y se perdían datos en cada guardado.
- **El resolver de variante para descontar stock es `stock.findVariantForItem()`**, no una query propia: desde la migración 005 el **color** es parte de la identidad de la variante, así que un `WHERE modelo AND storage LIMIT 1` descuenta de un color al azar. (Había un `findVariantId()` así en `catalog.js`; se eliminó por eso.)
- **Don't change the cart shape** without updating `app.js`, `product.js`, `checkout.js` **and** `server/routes/mercadopago.js`. The schema `{model, storage, color, price, sealed, phoneId, img}` is the cross-page + cross-stack contract (`phoneId` = id de la línea, `model` = nombre del modelo — NO los cambies a model_id/slug o se rompen cupones/stock/MP).
- **Comisión medio de pago** (3,5% por default, **editable y desactivable** en admin → Ajustes → Sistema). Se guarda en `settings` (`server/lib/settings.js`), se expone como `window.PAY_FEE = {rate, enabled}` en `/data.js`, y se suma como ítem en la preference (`getPaymentFee()` en `server/routes/mercadopago.js`). Front y back calculan igual (`round(subtotal × rate)`) para que **lo mostrado = lo cobrado**. El desglose aparece en carrito, checkout y MP; si `enabled=false` la línea se oculta y el total = subtotal. Al cambiarla, `/data.js` cambia de ETag y el front la toma al recargar. Para configuración editable nueva, seguí este patrón (settings lib + ruta admin + `window.*` en buildDataJs), no hardcodees.
- **Este repo vive en una carpeta de OneDrive** — la sincronización puede revertir/pisar ediciones locales (síntoma: avisos de "modified on disk", cambios que "desaparecen"). Los deploys leen el archivo local al momento del push (GitHub Git Data API), así que verificá en producción tras pushear; si un cambio no aparece, re-aplicá y re-pusheá.
- **Don't trust prices from data.js if the user gives you new ones** — replace, never adjust algorithmically. The retail and trade-in prices come straight from the client.
- **Don't commit `.env`** — está en `.gitignore`. Las credenciales reales viven solo en Dokploy.
- **Don't add tests, lint configs, or CI** — there's no test runner and adding one would force a build dependency.
- **Address text appears in several places**: meta description, store card title + sub, footer link, Google Maps deep-link href, and the `Store` JSON-LD (`streetAddress`) in `index.html`. Keep them in sync.
- **Los emails no son una página web.** Antes de tocar `email-templates.js` leé la sección **Emails: diseño y convenciones**. Lo que más rompe sin avisar: un `<img>` apuntando a un `.webp` (Outlook lo muestra roto), una URL relativa (no carga en ninguna bandeja), un botón sin fallback VML y relajar la whitelist de `server/lib/email-images.js` — ese endpoint es público y sin sesión. `npm run verify:emails` + `npm run verify:http` chequean las cuatro cosas.
- **WhatsApp SÍ está en el sitio hoy** (`+56 9 8326 5824`): botón flotante en index/product/checkout, CTA en la ficha de producto, link en el footer, deep-link del formulario de recompra en `app.js` y `telephone` en el `Store` JSON-LD de `index.html`. La regla vieja de "solo Instagram / sin teléfono" quedó obsoleta cuando llegó el número real. Si hay que cambiarlo, **son 7 lugares** — grepeá `wa.me` y `telephone` y actualizalos todos juntos. **Los emails son la excepción: van solo con Instagram** (decisión del cliente, no un olvido — no le agregues WhatsApp a `email-templates.js`).
- **Si tocas el backend, valida con `/api/health`** antes de pushear — confirma que las env vars y las dependencias estén OK.
- **No agregar dependencias npm pesadas** — el Dockerfile hace `npm install --omit=dev` cada build. Cada paquete extra es tiempo de deploy. Hoy: `express`, `dotenv`, `mercadopago`, `helmet`, `express-session` + `better-sqlite3(-session-store)`, `bcryptjs`, `multer`, `express-rate-limit`, `cookie-parser` y **`sharp`** (dependencia real: la usa `server/routes/admin/uploads.js` para convertir a WebP en runtime — no la saques). Para conversiones de imágenes **one-shot fuera del server** (preparar assets del repo) seguí usando `npm install sharp --no-save`.
- **MP webhook responde 200 inmediato** (`server/routes/mercadopago.js`) y procesa después — si el procesamiento lanza, MP no reintenta. Si agregas lógica crítica en el webhook (emails, etc.), considera reintentos o cola.
- **El webhook ahora valida firma HMAC** (`server/lib/mp-signature.js`). Si `MP_WEBHOOK_SECRET` no está configurado, el modo es permisivo (acepta todo) — en producción **siempre** configurarlo.
- **Stock se descuenta solo cuando el pago pasa a `approved`** (no en `pending`/`in_process`). La función `stock.commitOrderSale()` es idempotente por `order_id` — múltiples webhooks del mismo pago no descuentan stock varias veces.
- **No edites `data.js` físico** después de migrar a DB — el archivo queda como snapshot de respaldo pero la fuente de verdad es la DB. Edita desde el admin o vía `/api/admin/*`.
- **El bootstrap user solo se crea si NO hay usuarios activos.** Después de tener al menos uno, las env vars `ADMIN_BOOTSTRAP_*` se ignoran. Para resetear, usa `npm run create-user`.
- **Sessions persisten en la misma DB.** Logout invalida la sesión inmediatamente; cambiar `SESSION_SECRET` invalida TODAS las sesiones (forzar logout global).
- **No poner `PRAGMA` en archivos de migración SQL.** El runner las envuelve en `BEGIN/COMMIT` y SQLite rechaza `PRAGMA synchronous` / `journal_mode` dentro de una transacción con `Safety level may not be changed inside a transaction`. Los PRAGMA de conexión se setean en `server/db.js` antes de correr migraciones. Las `.sql` solo deberían tener `CREATE TABLE / CREATE INDEX / INSERT`.
- **CSP de helmet es estricta** (`server/index.js`). Si vas a agregar un script externo (otra CDN, otro pixel de analytics), tenés que agregar el origen a `scriptSrc` / `connectSrc` o el navegador lo bloquea silenciosamente. Síntoma típico: el admin queda en pantalla negra porque Alpine no carga y `x-cloak` nunca se remueve. Siempre que se pueda, preferir self-hostear (ver `assets/vendor/`).
- **El navegador cachea agresivamente HTML/JS del admin** aunque el server envíe `Cache-Control: no-cache`. Después de cada deploy de cambios al frontend del admin, usar Ctrl+Shift+R (refresh duro) o ventana incógnita para verificar. Útil tener DevTools → Network → "Disable cache" durante desarrollo.

## Reference: design source

`design-handoff/iphone-up/` contains the original AI-generated React/JSX prototypes (Proposal A "Dark Neon Premium" was the chosen direction) plus the chat transcripts that explain why decisions were made. Read `design-handoff/iphone-up/README.md` and `design-handoff/iphone-up/chats/chat1.md` if you need historical context. **The prototype is reference, not source** — the live site is the vanilla HTML/CSS/JS in the repo root.
