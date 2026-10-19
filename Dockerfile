# Imagem única: API + interface compilada (servida pela API) + worker (mesma imagem, outro comando)
FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm --filter api exec prisma generate && pnpm --filter web build && pnpm --filter api build

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
RUN corepack enable && apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
COPY --from=build /app /app
RUN useradd -r -u 1001 ssma && mkdir -p /app/apps/api/storage && chown -R ssma /app/apps/api/storage
USER ssma
WORKDIR /app/apps/api
EXPOSE 3333
# Aplica migrações e inicia a API (o worker usa: node dist/worker.js)
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/server.js"]
