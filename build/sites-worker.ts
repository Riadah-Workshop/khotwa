import handler from "vinext/server/fetch-handler";
import { handleKhotwaAuthentication } from "../lib/standalone-auth";
import {runWithSchool} from "../lib/school-tenancy";
import { runWithConnectorBinding } from "../lib/connector-context";
import { withSecurityHeaders } from "../lib/security-headers";
import type { ConnectorBinding } from "../lib/connector-contract.mjs";

const routes = {
  async fetch(request: Request, env: Cloudflare.Env, ctx: ExecutionContext<{ CONNECTORS?: ConnectorBinding }>) {
    // The public version endpoint is not a DB readiness signal. Coolify uses
    // /readyz to avoid marking a container healthy before the schema exists.
    if (new URL(request.url).pathname === '/readyz') {
      if (request.method !== 'GET') return new Response('Method Not Allowed', {status: 405});
      try {
        if (!env.DB) throw new Error('Missing D1 binding');
        await env.DB.batch([env.DB.prepare('SELECT 1 FROM settings LIMIT 1'),env.DB.prepare('SELECT 1 FROM khotwa_schools LIMIT 1')]);
        return Response.json({service: 'khotwa', status: 'ready'}, {headers: {'Cache-Control': 'no-store'}});
      } catch {
        return Response.json({service: 'khotwa', status: 'not-ready'}, {status: 503, headers: {'Cache-Control': 'no-store'}});
      }
    }
    const result = await handleKhotwaAuthentication(request, env);
    if (result.response) return result.response;
    request = result.request!;
    let binding = ctx.props?.CONNECTORS;
    // Local preview emulates the same request-scoped capability. This branch and
    // the auxiliary service binding are absent from production builds.
    if (import.meta.env.DEV && !binding && env.CONNECTORS) {
      const preview = env.CONNECTORS;
      const expiresAt = Date.now() + 60_000;
      binding = {
        async getContext() {
          if (Date.now() >= expiresAt) return { status: "request_context_expired" };
          return preview.getContext?.() ?? { status: "binding_unavailable" };
        },
        async invoke(connectorId, actionName, args) {
          if (Date.now() >= expiresAt) {
            return { status: "request_context_expired", message: "This request has expired. Please try again." };
          }
          return preview.invoke(connectorId, actionName, args);
        },
      };
    }
    return result.school
      ? runWithSchool(result.school, () => runWithConnectorBinding(binding, () => handler.fetch(request, env, ctx)))
      : runWithConnectorBinding(binding, () => handler.fetch(request, env, ctx));
  },
};

export default {
  // Single exit point: login pages, redirects, API responses, static assets and
  // /readyz all leave the Worker through withSecurityHeaders().
  async fetch(request: Request, env: Cloudflare.Env, ctx: ExecutionContext<{ CONNECTORS?: ConnectorBinding }>) {
    return withSecurityHeaders(await routes.fetch(request, env, ctx));
  },
};
