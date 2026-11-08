# ABSENSI JNT CARGO — image produksi
# Base Alpine (musl) dipakai agar tidak membawa paket glibc/zlib Debian yang
# masih memiliki CVE tanpa perbaikan pada base image sebelumnya.
FROM node:24-alpine

ENV NODE_ENV=production \
    PORT=3000 \
    DATA_DIR=/data

# Perbarui seluruh paket sistem ke patch terbaru, lalu siapkan folder data.
RUN apk upgrade --no-cache \
 && mkdir -p /data \
 && chown -R node:node /data

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund \
 && npm cache clean --force

COPY . .

USER node

EXPOSE 3000

CMD ["node", "server.js"]
