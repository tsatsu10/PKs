// PKS Edge Function: deliver webhook events to user-configured URLs
// Integrations with type 'webhook' and config { url, events?: string[] } receive POST on matching events.

import { corsHeaders } from "../_shared/cors.ts";
import { json } from "../_shared/http.ts";
import { getAdminClient, getUserClient } from "../_shared/supabase.ts";
import {
  assertResolvesToPublicIp, countDelivered, dedupeByUrl, isAllowedEvent, isWebhookUrlAllowed,
  legacySignature, MAX_PAYLOAD_BYTES, signPayload,
} from "./lib.ts";

Deno.serve(async (req) => {
  const cors = corsHeaders();
  if (!cors) {
    console.error("PKS_APP_ORIGIN is not set; refusing to serve");
    return new Response("Server misconfigured", { status: 500 });
  }
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const reply = (body: unknown, status = 200, extra: Record<string, string> = {}) => json(body, status, { ...cors, ...extra });

  try {
    const auth = await getUserClient(req);
    if (!auth) return reply({ error: "Unauthorized" }, 401);
    const { user } = auth;

    // Cheap early reject on the declared size before buffering the body (a spoofed/missing
    // Content-Length still gets the byte-accurate check right after req.text()).
    const declaredLength = req.headers.get("Content-Length");
    if (declaredLength) {
      const n = parseInt(declaredLength, 10);
      if (!Number.isNaN(n) && n > MAX_PAYLOAD_BYTES) {
        return reply({ error: "Request body too large", code: "PAYLOAD_TOO_LARGE" }, 413);
      }
    }
    const rawBody = await req.text();
    if (new TextEncoder().encode(rawBody).length > MAX_PAYLOAD_BYTES) {
      return reply({ error: "Request body too large", code: "PAYLOAD_TOO_LARGE" }, 413);
    }
    let parsed: { event?: unknown; payload?: unknown };
    try { parsed = JSON.parse(rawBody); } catch { return reply({ error: "Invalid JSON body" }, 400); }
    if (!isAllowedEvent(parsed.event)) return reply({ error: "Unknown event" }, 400);
    const event = parsed.event;

    // B18: rate limit shared across all function instances. Counters are server-only, so count with
    // the service role against the verified caller's id. Fail closed: missing data counts as limited.
    const { data: rl, error: rlErr } = await getAdminClient().rpc("consume_usage", {
      p_user_id: user.id, p_scope: "webhook_deliver", p_limit: 60, p_window_seconds: 60,
    });
    if (rlErr) return reply({ error: "Rate limit check failed" }, 503);
    if (rl?.limited !== false) {
      const retryAfter = typeof rl?.retry_after_sec === "number" ? rl.retry_after_sec : 60;
      return reply({ error: "Too many requests", code: "RATE_LIMITED", retryAfter }, 429,
        { "Retry-After": String(retryAfter) });
    }

    // Secrets are write-only for users; read them with the service role, scoped to this user.
    const { data: integrations, error: intErr } = await getAdminClient()
      .from("integrations")
      .select("id, config, webhook_secret")
      .eq("user_id", user.id).eq("type", "webhook").eq("enabled", true);
    if (intErr) {
      console.error("webhook-deliver: failed to load integrations", intErr.message);
      return reply({ error: "Server error" }, 500);
    }

    const matching = (integrations ?? []).filter((i) => {
      const events = i.config?.events;
      return !Array.isArray(events) || events.length === 0 || events.includes(event);
    });
    // Ten webhooks pointing at the same URL should send one POST, not ten. `total` below counts
    // distinct URLs actually called, not the number of integration rows that matched.
    const toCall = dedupeByUrl(matching, (i) => i.config?.url);

    const timestamp = Math.floor(Date.now() / 1000);
    const body = JSON.stringify({ event, payload: parsed.payload ?? {}, timestamp: new Date(timestamp * 1000).toISOString() });
    const results = await Promise.allSettled(toCall.map(async (i) => {
      const url = i.config?.url;
      if (!url || typeof url !== "string") return undefined;
      const check = isWebhookUrlAllowed(url);
      if (!check.allowed) throw new Error(check.reason ?? "Webhook URL not allowed");
      await assertResolvesToPublicIp(new URL(url).hostname.toLowerCase());
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "User-Agent": "PKS-Webhook/1.1",
        "X-PKS-Event": event,
        "X-PKS-Timestamp": String(timestamp),
      };
      if (i.webhook_secret) {
        headers["X-PKS-Signature-256"] = `v1=${await signPayload(i.webhook_secret, timestamp, body)}`;
        headers["X-PKS-Signature"] = await legacySignature(i.webhook_secret, body);
      }
      const res = await fetch(url, { method: "POST", headers, body, redirect: "manual", signal: AbortSignal.timeout(10_000) });
      // We only care about the status; don't leave the response body unread/unclosed.
      try { await res.body?.cancel(); } catch { /* best-effort */ }
      return res;
    }));

    return reply({ delivered: countDelivered(results), total: toCall.length });
  } catch (e) {
    console.error("webhook-deliver error:", e);
    return reply({ error: "Server error" }, 500);
  }
});
