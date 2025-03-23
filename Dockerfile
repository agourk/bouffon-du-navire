# Dockerfile
FROM node:22-slim AS base

RUN apt-get update -y && apt-get install -y openssl

WORKDIR /app

COPY package.json pnpm-lock.yaml ./

RUN corepack enable && \
    pnpm install --prod --frozen-lockfile && \
    pnpm add @nestjs/cli prisma

FROM base AS prisma

WORKDIR /app

COPY . .

RUN pnpm run db:generate

FROM prisma AS build

WORKDIR /app

RUN pnpm run build

FROM prisma AS runtime

WORKDIR /app

COPY --from=build /app/tsconfig*.json .
COPY --from=build /app/dist ./dist
COPY --from=prisma /app/prisma ./prisma

EXPOSE 8080

ENV NODE_ENV=production
ENV PORT=3000
ENV LOG_LEVEL=log

COPY --chmod=0755 docker-entrypoint.sh .

ENTRYPOINT [ "/app/docker-entrypoint.sh" ]
CMD [ "node", "dist/src/main" ]
