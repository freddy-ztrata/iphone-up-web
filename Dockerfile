FROM node:20-alpine

# better-sqlite3 y sharp pueden necesitar build tools nativos.
# python3, make, g++ se usan solo durante npm install y se descartan
# automáticamente al terminar (la capa de RUN igual queda — alpine es chico).
RUN apk add --no-cache python3 make g++ libc6-compat

WORKDIR /app

# Cache-bust automático: con BUILDKIT_INLINE_CACHE, cada commit cambia el contexto
# y Dokploy se ve obligado a rebuildear todas las capas posteriores a este punto.
ARG GIT_SHA=unknown
ENV GIT_SHA=${GIT_SHA}

# Instalamos dependencias primero (caché de capa)
COPY package.json package-lock.json* ./
RUN npm install --omit=dev

# Resto del sitio (html, css, js, assets, server/)
COPY . .

# Sello la build con el SHA para que Express lo exponga en /api/health
RUN echo "${GIT_SHA}" > /app/.git-sha 2>/dev/null || true

# /data es el volumen persistente: SQLite, uploads y backups viven ahí.
# Sin volumen montado en Dokploy, los datos se pierden en cada redeploy.
RUN mkdir -p /data/uploads/products /data/backups
VOLUME ["/data"]

ENV NODE_ENV=production
ENV PORT=8080
ENV DATA_DIR=/data
EXPOSE 8080

CMD ["node", "server/index.js"]
