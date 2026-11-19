# Khotwa/Coolify staging: cache dependencies, build once, ship only the
# generated Worker + the runtime required by the local Cloudflare simulator.
# NOTE: Wrangler dev/Miniflare is still a STAGING runtime, not production.
FROM node:22-bookworm-slim AS build
WORKDIR /app
ENV CI=true \
    WRANGLER_SEND_METRICS=false
RUN corepack enable
# A code-only change does not invalidate the dependency layer.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=khotwa-pnpm-store,target=/pnpm/store,sharing=locked \
    corepack pnpm install --frozen-lockfile --store-dir /pnpm/store
COPY . .
# Fast security/compatibility tests run before the expensive Vite compilation.
RUN node --experimental-strip-types scripts/test-khotwa-auth.mjs \
    && node --experimental-strip-types scripts/test-origin-policy.mjs \
    && node --experimental-strip-types scripts/test-school-tenancy.mjs \
    && node --experimental-strip-types scripts/test-multischool-auth.mjs \
    && node --experimental-strip-types scripts/test-deputy-invitations.mjs \
    && node --experimental-strip-types scripts/test-hostinger-smtp.mjs \
    && node --experimental-strip-types scripts/test-node-smtp-relay.mjs
RUN corepack pnpm build && node scripts/prepare-vps-config.mjs

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    CI=true \
    WRANGLER_SEND_METRICS=false \
    WRANGLER_WRITE_LOGS=false \
    HOME=/data \
    WRANGLER_LOG_PATH=/data/state/logs \
    WRANGLER_REGISTRY_PATH=/data/state/registry \
    MINIFLARE_REGISTRY_PATH=/data/state/miniflare-registry
# Keep Wrangler (the staging server) and its dependency graph. Do not copy
# application source, test scripts or Vite caches into the runtime image.
COPY --from=build /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
# Keep original static assets as a compatibility fallback for the Worker asset router.
COPY --from=build /app/public ./public
COPY --from=build /app/scripts/launch-vps-preview.mjs ./scripts/launch-vps-preview.mjs
COPY --from=build /app/scripts/smtp-relay.mjs ./scripts/smtp-relay.mjs
COPY --from=build /app/scripts/healthcheck-vps.mjs ./scripts/healthcheck-vps.mjs
COPY --from=build /app/package.json ./package.json
RUN mkdir -p /data/state /app/.wrangler \
    && chown node:node /app /app/.wrangler /data /data/state
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=8s --start-period=150s --retries=3 \
    CMD ["node", "scripts/healthcheck-vps.mjs"]
CMD ["node", "scripts/launch-vps-preview.mjs"]
