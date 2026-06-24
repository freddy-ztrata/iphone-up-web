FROM node:20-alpine

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

ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080

CMD ["node", "server/index.js"]
