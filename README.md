# Khotwa | خطوة — School administration system

Renamed from the supplied Maktabi v147 **source archive** on 2026-11-17. This repository contains the school-management application, SQL migrations, API routes, Arabic/English interface, original assets, and an optional **Coolify staging-preview deployment**.

**Getting started:** [VPS-COOLIFY.md](VPS-COOLIFY.md) — includes exact GitHub, credential, Coolify, DNS and first-test steps.

**Architecture:** Next.js 16 + Vinext, React, Drizzle ORM, Cloudflare Worker API, D1 database, R2 object attachments. Original project targets ChatGPT Sites; the staging container uses Wrangler's local simulator with persisted state. This does not automatically make it a hardened production VPS app.

**Changes for Khotwa:** UI labels, translations, source filename/style hooks, app metadata, PWA identity, package name, original Maktabi-named asset *paths*, isolated project identity, plus a single-admin signed-session gateway and Git-based Docker Compose staging configuration. The original registered author credits, author certificate contents, live data and external integrations are NOT replaced by branding changes.

For local development, use Node >=22.13 and `corepack pnpm install --frozen-lockfile` then `corepack pnpm dev`. The old local ChatGPT login mock is still part of the source's development tooling and is not a production login. The Worker gateway introduced here is used by the built staging Worker.

Please keep the GitHub repository **private**: original owner information, access-policy email addresses and source-specific school information remain present. Do not use real student data on a staging preview.
