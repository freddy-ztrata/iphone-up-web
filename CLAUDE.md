# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Static landing site for **iPhone UP**, a refurbished iPhone store in Providencia, Santiago, Chile. Sells iPhone 11 → 17 (all variants), runs a "vende tu iPhone" trade-in flow, has a physical store at Padre Mariano 98, Of. 105.

Visual style: **Dark Neon Premium** — pure black background, lime green accent (`#A4E83A`), self-hosted Inter font, glow shadows, neon-wave SVG.

Contact is **Instagram-only** (`@iphoneup.cl`). Phone numbers and WhatsApp buttons were removed site-wide (the displayed number was a placeholder); all contact CTAs now point to Instagram.

## Stack

Frontend: Vanilla HTML + CSS + JS (sin bundler). Backend mínimo: Node + Express (Node 20+, usa `fetch` global) en `server/` que sirve los estáticos del repo y expone `/api/*` para Mercado Pago (Checkout Pro) y Chilexpress (cotizador + geo).

```
server/index.js           → Express app + static serving (raíz del repo)
server/routes/*.js        → /api/mercadopago, /api/chilexpress, /api/orders
server/lib/chilexpress.js → Cliente API Chilexpress (Geo + Rating)
server/lib/storage.js     → Persistencia JSON de órdenes (server/data/orders.json)
Dockerfile                → Node 20 alpine, expone 8080
.env.example              → Plantilla de credenciales
PAGOS_Y_ENVIOS.md         → Guía interna: qué pedir al cliente, cómo configurar Dokploy
docs/                     → Documento PDF + HTML para enviar al cliente con la solicitud
```

### API endpoints

| Método | Ruta                                       | Qué hace                                   |
|--------|--------------------------------------------|--------------------------------------------|
| GET    | `/api/health`                              | Healthcheck + diagnóstico de credenciales  |
| GET    | `/api/chilexpress/regions`                 | Regiones de Chile                          |
| GET    | `/api/chilexpress/coverage?regionCode=RM`  | Comunas de una región                      |
| POST   | `/api/chilexpress/quote`                   | Cotiza envío `{destinationCountyCode, items}` |
| POST   | `/api/mercadopago/preference`              | Crea orden + Preference (Checkout Pro)     |
| POST   | `/api/mercadopago/webhook`                 | Webhook de notificaciones MP               |
| GET    | `/api/orders/:id`                          | Detalle de orden (sin datos sensibles)     |

## Run locally

```bash
npm install
cp .env.example .env   # completar con credenciales de sandbox MP + Chilexpress
npm start              # http://localhost:8080
```

`python -m http.server` ya no alcanza — el frontend depende de los endpoints `/api/*`.

## Deploy

Pushing to `main` triggers autodeploy en Dokploy. **Build Type = Dockerfile** (antes era Static). Puerto interno 8080. Variables de entorno requeridas: `PORT`, `PUBLIC_URL`, `MP_ACCESS_TOKEN`, `MP_PUBLIC_KEY`, `CHILEXPRESS_API_KEY_RATING`, `CHILEXPRESS_API_KEY_GEO`, `CHILEXPRESS_ORIGIN_COUNTY_CODE`, `CHILEXPRESS_ORIGIN_REGION_CODE`. Ver `PAGOS_Y_ENVIOS.md` para el detalle.

## Architecture

Multiple real HTML pages, no SPA. `product.html` is a *template* that renders different content based on `?id=NN`. The checkout pages depend on the backend; the rest are pure static.

```
index.html               → home (hero, catalog, trade-in, store, testimonials, FAQ, footer)
product.html             → product detail (one template, query-string driven)
checkout.html            → checkout (cart summary + buyer form + shipping + MP)
payment-success.html     → return URL: MP "approved"
payment-failure.html     → return URL: MP "rejected/cancelled"
payment-pending.html     → return URL: MP "pending" (cash/transfer)

data.js     → window.CATALOG, TESTIMONIALS, STATS, FAQS, TRADEIN_PRICES,
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

The cart shape `{model, storage, price, sealed, phoneId, img}` is **the API contract** between frontend and backend — `server/routes/mercadopago.js` reads exactly these fields when building MP `items`. Adding a field to cart drawer ≠ free; the backend needs to know what to do with it.

Orders are persisted to `server/data/orders.json` (file-based, gitignored). On the webhook callback, `external_reference` matches the orderId we created — that's how MP's async notification finds the right local order to update.

`auto_return: "approved"` in the Preference means MP only auto-redirects back on approved payments; rejected/pending require the user to click "Return to site" in MP's UI.

## Image pipeline

iPhone images live in `assets/iphones/` (line images) and `assets/iphones/variants/` (per-model). They are served as **WebP** — `data.js` and every `<img>` reference point to `.webp`. The hero is `assets/iphones/iphone-17-pro-max.webp` and the nav logo is `assets/logo-trimmed.webp`. The two logo rasters stay non-WebP **on purpose**: `assets/logo.jpg` (og:image) and `assets/logo-mark.jpg` (favicon), because social scrapers and favicons have spotty WebP support.

When adding an image, replicate the existing prep + conversion, then check the WebP visually with the Read tool before committing:

1. **Source prep (on the PNG)** — sources are scraped from `backonline.cl/cdn/shop/files/...` (full PDP shots) and `pngimg.com/uploads/iphone_11/` (iPhone 11 series). Two transforms: (a) **white-background removal** — corner flood-fill alpha=0 through near-white pixels (`R≥235 AND G≥235 AND B≥235`) + 0.7px Gaussian blur on alpha; (b) **trim to content bbox** with ~2% padding, so every variant fills its `object-fit: contain` box equally (without it, padded variants render visually smaller).
2. **WebP conversion** — `sharp(png).webp({ quality: 82, alphaQuality: 100, effort: 6 })`, then delete the source PNG. Typical result is −90%+ (the full catalog went 8.2 MB → 0.58 MB). `sharp` is **not** a project dependency: install it ad-hoc with `npm install sharp --no-save` for the one-off so it never lands in `package.json` / the Docker build.

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

## Things to be careful with

- **Don't change the cart shape** without updating `app.js`, `product.js`, `checkout.js` **and** `server/routes/mercadopago.js`. The schema `{model, storage, price, sealed, phoneId, img}` is the cross-page + cross-stack contract.
- **Don't trust prices from data.js if the user gives you new ones** — replace, never adjust algorithmically. The retail and trade-in prices come straight from the client.
- **Don't commit `.env`** — está en `.gitignore`. Las credenciales reales viven solo en Dokploy.
- **Don't add tests, lint configs, or CI** — there's no test runner and adding one would force a build dependency.
- **Address text appears in several places**: meta description, store card title + sub, footer link, Google Maps deep-link href, and the `Store` JSON-LD (`streetAddress`) in `index.html`. Keep them in sync.
- **Don't re-introduce phone numbers or WhatsApp buttons** unless asked — they were removed on purpose (the number was a placeholder); contact is Instagram `@iphoneup.cl`. If a real number arrives, also add `telephone` to the `Store` JSON-LD.
- **Si tocas el backend, valida con `/api/health`** antes de pushear — confirma que las env vars y las dependencias estén OK.
- **No agregar dependencias npm pesadas** — el Dockerfile hace `npm install --omit=dev` cada build. Cada paquete extra es tiempo de deploy. Hoy: `express`, `dotenv`, `mercadopago` (+ `node-fetch` declarado pero **sin usar** — el código usa el `fetch` global de Node 20). Para convertir imágenes usa `sharp` con `--no-save`, nunca como dependencia del repo.
- **MP webhook responde 200 inmediato** (`server/routes/mercadopago.js`) y procesa después — si el procesamiento lanza, MP no reintenta. Si agregas lógica crítica en el webhook (emails, etc.), considera reintentos o cola.

## Reference: design source

`design-handoff/iphone-up/` contains the original AI-generated React/JSX prototypes (Proposal A "Dark Neon Premium" was the chosen direction) plus the chat transcripts that explain why decisions were made. Read `design-handoff/iphone-up/README.md` and `design-handoff/iphone-up/chats/chat1.md` if you need historical context. **The prototype is reference, not source** — the live site is the vanilla HTML/CSS/JS in the repo root.
