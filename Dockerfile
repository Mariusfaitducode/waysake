# Atlas — API Fastify + site compilé. Données dans /data (volume).

# 1. Construction : outils de compilation pour les modules natifs (better-sqlite3), puis le site.
FROM node:22-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
RUN corepack enable
# onnxruntime-node : seul le moteur CPU (inclus dans le paquet) sert ; pas de téléchargement CUDA/TensorRT sur amd64.
ENV ONNXRUNTIME_NODE_INSTALL=skip
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY tsconfig.json vite.config.ts ./
COPY server ./server
COPY web ./web
RUN pnpm build && CI=true pnpm prune --prod
# onnxruntime-node embarque Windows, macOS et Linux toutes architectures : on ne garde que linux/<arch>.
RUN for d in node_modules/.pnpm/onnxruntime-node@*/node_modules/onnxruntime-node/bin/napi-v*; do \
      find "$d" -mindepth 1 -maxdepth 1 ! -name linux -exec rm -rf {} + ; \
      find "$d/linux" -mindepth 1 -maxdepth 1 ! -name "$(node -p process.arch)" -exec rm -rf {} + ; \
    done

# 2. Exécution : seulement ce qui sert.
FROM node:22-slim
ENV NODE_ENV=production ATLAS_DATA_DIR=/data ATLAS_PORT=8420
WORKDIR /app
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/server ./server
COPY --from=build /app/dist ./dist
VOLUME /data
EXPOSE 8420
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD node -e "fetch('http://127.0.0.1:8420/api/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["node_modules/.bin/tsx", "server/main.ts"]
