FROM node:24-bookworm-slim AS build
WORKDIR /app
RUN npm install --global pnpm@11.25.0
COPY . .
RUN pnpm install --frozen-lockfile && pnpm test && node --experimental-transform-types --test tests/vps-auth-api.test.mjs && pnpm exec tsc --noEmit && pnpm build && pnpm test:payment-return
FROM node:24-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production HOSTNAME=0.0.0.0 PORT=3100 SAS_DATA_DIR=/data
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
COPY --from=build --chown=node:node /app/drizzle ./drizzle
COPY --from=build --chown=node:node /app/lib/vps-*.mjs ./lib/
COPY --from=build --chown=node:node /app/scripts/vps-admin.mjs ./scripts/
USER node
EXPOSE 3100
CMD ["node","server.js"]


