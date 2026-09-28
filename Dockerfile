FROM node:24-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3001 \
    HOST=0.0.0.0 \
    DATABASE_PATH=/data/gbt.sqlite
COPY package*.json ./
# Paketler kurulduktan sonra npm/yarn/corepack silinir: çalışan sunucu onları hiç kullanmaz,
# içlerinde çıkan CVE'ler de böylece imajda kalmaz (saldırı yüzeyi küçülür).
RUN npm ci --omit=dev \
 && rm -rf /usr/local/lib/node_modules /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack \
           /usr/local/bin/yarn /usr/local/bin/yarnpkg /opt/yarn-* /root/.npm /tmp/* \
 && mkdir -p /data && chown node:node /data
COPY --from=build /app/dist ./dist
COPY server ./server
COPY src/shared ./src/shared
USER node
VOLUME /data
EXPOSE 3001
CMD ["node", "server/index.ts"]
