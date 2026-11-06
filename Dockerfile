# Tahap 1: build aplikasi. Data contoh hanya ikut jika VITE_DEMO_DATA=true.
FROM node:24-slim AS build
WORKDIR /app
ARG VITE_DEMO_DATA=false
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm test && npm run build

# Tahap 2: sajikan file statis tanpa hak root.
FROM nginxinc/nginx-unprivileged:stable-alpine
LABEL org.opencontainers.image.source="https://github.com/alifsuryadi/pos-tenan-mall"
LABEL org.opencontainers.image.description="POS Tenan Mall, kasir PWA untuk tenan mall"
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --retries=3 CMD wget -q --spider http://127.0.0.1:8080/ || exit 1
