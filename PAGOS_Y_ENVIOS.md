# Pagos (Mercado Pago) + Envíos (Chilexpress)

Esta guía resume **qué pedirle al cliente**, **qué cambia en Dokploy** y **cómo probar**
la integración de pagos y envíos del sitio.

---

## 1. Credenciales que debes pedirle al cliente

### A) Mercado Pago (Chile)

El cliente debe:

1. Entrar a [https://www.mercadopago.cl/developers/panel/app](https://www.mercadopago.cl/developers/panel/app)
   con su cuenta de Mercado Pago Chile (la que cobra a sus clientes).
2. Crear una aplicación (botón "Crear aplicación") con:
   - Tipo de integración: **Pagos online** → **Checkout Pro**.
3. Una vez creada, en la sección "Credenciales de producción" copiarte:

   | Variable de entorno  | Qué es                          | Formato                                     |
   |----------------------|----------------------------------|---------------------------------------------|
   | `MP_ACCESS_TOKEN`    | Access Token de producción       | `APP_USR-XXXXXXXX-XXXXXX-...` (largo)       |
   | `MP_PUBLIC_KEY`      | Public Key de producción         | `APP_USR-xxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`  |

4. Configurar el **webhook** (notificación de pagos) en el panel:
   - URL: `https://iphoneup.cl/api/mercadopago/webhook`
   - Eventos: marcar **"Pagos"**.

> **Importante:** el `Access Token` es **secreto** y nunca debe aparecer en el frontend.
> Vive solo en el backend, como variable de entorno en Dokploy.

> Para **sandbox/testing**, MP entrega un par de credenciales `TEST-...`. Usar las mismas
> variables pero con esos valores en un entorno aparte si quieres probar antes.

### B) Chilexpress

El cliente debe:

1. Tener cuenta empresa con Chilexpress (convenio comercial activo).
2. Entrar a [https://developers.chilexpress.cl/](https://developers.chilexpress.cl/) y registrarse
   (puede ser el mismo correo del cliente; queda asociado al convenio).
3. Suscribirse a estos dos productos del portal (suelen estar gratis para sandbox):
   - **Cotizador (Rating)** — para calcular precios de envío
   - **Geo Referencia** — para listar regiones y comunas

4. Una vez suscrito, en "Mi cuenta → Subscriptions" entregarte la
   **Primary key** de cada producto:

   | Variable de entorno              | Qué es                                          |
   |----------------------------------|-------------------------------------------------|
   | `CHILEXPRESS_API_KEY_RATING`     | Subscription Key del producto Cotizador         |
   | `CHILEXPRESS_API_KEY_GEO`        | Subscription Key del producto Geo Referencia    |

5. Confirmar la **comuna y región de origen** del despacho (hoy = Providencia, RM).
   Si el cliente despacha desde otro punto, cambiar:
   ```
   CHILEXPRESS_ORIGIN_COUNTY_CODE=PROV
   CHILEXPRESS_ORIGIN_REGION_CODE=RM
   ```

> Si Chilexpress entrega una sola "subscription-key" para ambos productos, puedes poner el
> mismo valor en las dos variables.

---

## 2. Configurar Dokploy

El sitio **dejó de ser estático**: ahora es una app Node.js (sigue sirviendo los mismos HTML/CSS/JS,
solo que detrás hay un Express que expone `/api/...`).

### En Dokploy:

1. En el proyecto **iphoneup**, ir a **Settings → Build Type**.
2. Cambiar de `Static` → `Dockerfile` (autoselecciona el `Dockerfile` del repo raíz).
3. Quitar el campo **Publish Directory** (ya no aplica).
4. En **Environment Variables**, agregar:
   ```
   PORT=8080
   PUBLIC_URL=https://iphoneup.cl
   MP_ACCESS_TOKEN=APP_USR-...
   MP_PUBLIC_KEY=APP_USR-...
   CHILEXPRESS_API_KEY_RATING=...
   CHILEXPRESS_API_KEY_GEO=...
   CHILEXPRESS_ORIGIN_COUNTY_CODE=PROV
   CHILEXPRESS_ORIGIN_REGION_CODE=RM
   CHILEXPRESS_ORIGIN_COUNTY_NAME=Providencia
   ```
5. En **Networking / Ports**, exponer **8080** internamente (Traefik mapea al 443).
6. Redeploy.

### Healthcheck

Una vez desplegado, abrir:
```
https://iphoneup.cl/api/health
```
Debe devolver `{"ok":true,"env":{"mpConfigured":true,"chilexpressConfigured":true,...}}`.
Si alguno está en `false`, falta esa credencial en las env vars.

---

## 3. Desarrollo local

```bash
# Instalar dependencias (una sola vez)
npm install

# Copiar plantilla de variables
cp .env.example .env
# Editar .env con credenciales de SANDBOX/TEST

# Levantar
npm start
# Sitio: http://localhost:8080
# API:   http://localhost:8080/api/health
```

> El backend sirve el sitio estático directamente desde la raíz del repo, así que `python -m http.server`
> ya no es necesario.

---

## 4. Flujo de checkout (end-to-end)

```
[index.html]            → usuario agrega iPhones al carro
[cart drawer]           → click "Continuar al pago" → /checkout.html
[checkout.html]         → form: datos comprador + dirección
                          ↓
                          GET  /api/chilexpress/regions    → llena <select regiones>
                          GET  /api/chilexpress/coverage   → llena <select comunas>
                          POST /api/chilexpress/quote      → muestra opciones de envío
                          ↓
                          POST /api/mercadopago/preference → crea orden + preferencia
                          ↓
                          redirect a init_point (Mercado Pago Checkout Pro)
[mercadopago.com.cl]    → usuario paga (tarjeta, transferencia, etc.)
                          ↓
                          MP redirige a back_urls.success|failure|pending
                          MP llama POST /api/mercadopago/webhook (notificación)
[payment-success.html]  → fetch /api/orders/:id → muestra detalle + WhatsApp CTA
```

---

## 5. Endpoints expuestos

| Método | Ruta                                  | Descripción                                  |
|--------|---------------------------------------|----------------------------------------------|
| GET    | `/api/health`                         | Healthcheck + diagnóstico de credenciales    |
| GET    | `/api/chilexpress/regions`            | Lista de regiones de Chile                   |
| GET    | `/api/chilexpress/coverage?regionCode=RM` | Comunas de una región                    |
| POST   | `/api/chilexpress/quote`              | Cotiza envío (recibe `{destinationCountyCode, items}`) |
| POST   | `/api/mercadopago/preference`         | Crea preferencia y orden                     |
| POST   | `/api/mercadopago/webhook`            | Webhook de notificaciones MP                 |
| GET    | `/api/orders/:id`                     | Detalle de orden (sin datos sensibles)       |

---

## 6. Persistencia de órdenes

Las órdenes se guardan en `server/data/orders.json` (gitignored). Para producción seria,
migrar a una DB real (Postgres, Mongo). El archivo se llena en cada nueva orden y se actualiza
cuando llega el webhook de MP.

Para resetear el archivo: `rm server/data/orders.json` (se recrea solo).

---

## 7. Cosas pendientes / mejoras posibles

- Validar `x-signature` del webhook de MP con `MP_WEBHOOK_SECRET` (hoy se confía en `external_reference`).
- Reemplazar el archivo JSON por DB real cuando el volumen lo justifique.
- Email transaccional al cliente cuando el pago se aprueba (Resend, SendGrid, etc.).
- Hookear emisión automática de etiqueta de envío Chilexpress (API de Generación de OS).
- Migrar a **Payment Brick** (embebido) cuando se quiera evitar el redirect a mercadopago.com.cl.
