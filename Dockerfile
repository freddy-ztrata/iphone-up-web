FROM node:20-alpine

WORKDIR /app

# Instalamos dependencias primero (caché de capa)
COPY package.json package-lock.json* ./
RUN npm install --omit=dev

# Resto del sitio (html, css, js, assets, server/)
COPY . .

ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080

CMD ["node", "server/index.js"]
