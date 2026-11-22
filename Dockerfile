# Listig – en image med både server och klient.
# Bygg:  docker build -t listig .
# Kör:   docker run -p 3000:3000 -v listig-data:/data listig

# 1) Klienten → statiska filer (client/dist)
FROM node:22-slim AS client
WORKDIR /app/client
COPY client/package.json client/package-lock.json ./
RUN npm ci
COPY client/ ./
COPY shared/ ../shared/
RUN npm run build

# 2) Servern → ett paket (server/dist/index.js)
FROM node:22-slim AS server
WORKDIR /app/server
COPY server/package.json server/package-lock.json ./
RUN npm ci
COPY server/ ./
COPY shared/ ../shared/
RUN npm run build && npm prune --omit=dev

# 3) Körning: bara det som behövs
FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    HOST=0.0.0.0 \
    STATIC_DIR=/app/public \
    DATABASE_URL=file:/data/listig.db

COPY --from=server --chown=node:node /app/server/node_modules ./node_modules
COPY --from=server --chown=node:node /app/server/dist ./dist
COPY --from=server --chown=node:node /app/server/package.json ./
COPY --from=client --chown=node:node /app/client/dist ./public

# All data (SQLite) ligger i /data – montera en volym så överlever den uppdateringar
RUN mkdir -p /data && chown node:node /data
VOLUME ["/data"]

USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/index.js"]
