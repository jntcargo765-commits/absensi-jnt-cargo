# ABSENSI JNT CARGO — image produksi
FROM node:24-bookworm-slim

ENV NODE_ENV=production \
    PORT=3000 \
    DATA_DIR=/data

# Perbarui paket sistem (termasuk pustaka OpenSSL/TLS) lalu siapkan folder data.
RUN apt-get update \
 && apt-get -y upgrade \
 && rm -rf /var/lib/apt/lists/* \
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
