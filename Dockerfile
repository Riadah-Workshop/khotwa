# Khotwa temporary self-hosted STAGING preview (Cloudflare Worker local simulator).
# Not a production-hardened deployment solution. See VPS-COOLIFY.md.
FROM node:22-bookworm-slim AS builder
WORKDIR /app
ENV CI=true
RUN corepack enable
# Cache the costly dependency installation across normal source-code commits.
# Only dependency manifests invalidate this layer.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN corepack pnpm install --frozen-lockfile
COPY . .
# Fail the image build if the login gateway or its protections regress.
RUN node --experimental-strip-types scripts/test-khotwa-auth.mjs
RUN corepack pnpm build
RUN node scripts/prepare-vps-config.mjs

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production \
    WRANGLER_SEND_METRICS=false
COPY --from=builder /app /app
RUN mkdir -p /data/state && chown -R node:node /data /app
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=90s --retries=3 CMD ["node","scripts/healthcheck-vps.mjs"]
CMD ["node","scripts/launch-vps-preview.mjs"]
