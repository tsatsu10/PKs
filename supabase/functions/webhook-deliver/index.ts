// PKS Edge Function: deliver webhook events to user-configured URLs
// Integrations with type 'webhook' and config { url, events?: string[] } receive POST on matching events.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const appOrigin = Deno.env.get("PKS_APP_ORIGIN") ?? "*";
const corsHeaders = {
  "Access-Control-Allow-Origin": appOrigin,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/** True when an IPv4 address string falls in a loopback/private/link-local/reserved range. */
function isPrivateIpV4(ip: string): boolean {
  const m = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return false;
  const [a, b] = m.slice(1).map(Number);
  return (
    a === 0 ||
    a === 127 ||
    a === 10 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 169 && b === 254) ||
    (a === 100 && b >= 64 && b <= 127) || // CGNAT
    a >= 224 // multicast/reserved
  );
}

/** True when an IPv6 address string is loopback/link-local/unique-local or a mapped private IPv4. */
function isPrivateIpV6(ip: string): boolean {
  const v = ip.toLowerCase().replace(/^\[|\]$/g, "");
  if (v === "::" || v === "::1") return true;
  if (v.startsWith("fe8") || v.startsWith("fe9") || v.startsWith("fea") || v.startsWith("feb")) return true; // link-local
  if (v.startsWith("fc") || v.startsWith("fd")) return true; // unique-local
  const mapped = v.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (mapped) return isPrivateIpV4(mapped[1]);
  return false;
}

/** Reject URLs that could be used for SSRF (internal/private/metadata). Only allow HTTPS with public hostnames. */
function isWebhookUrlAllowed(urlString: string): { allowed: boolean; reason?: string } {
  let url: URL;
  try {
    url = new URL(urlString);
  } catch {
    return { allowed: false, reason: "Invalid URL" };
  }
  if (url.protocol !== "https:") {
    return { allowed: false, reason: "Only HTTPS URLs are allowed" };
  }
  const host = url.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) {
    return { allowed: false, reason: "Local/private hostnames are not allowed" };
  }
  if (host === "metadata.google.internal" || host === "169.254.169.254") {
    return { allowed: false, reason: "Metadata endpoints are not allowed" };
  }
  if (isPrivateIpV4(host)) {
    return { allowed: false, reason: "Private/reserved IP addresses are not allowed" };
  }
  if (host.startsWith("[") || host.includes(":")) {
    if (isPrivateIpV6(host)) {
      return { allowed: false, reason: "Private/reserved IP addresses are not allowed" };
    }
  }
  return { allowed: true };
}

/**
 * Resolve a hostname and reject it if any A/AAAA record points at a
 * private/internal address (defends against DNS names like 127.0.0.1.nip.io).
 * DNS errors fail closed.
 */
async function assertResolvesToPublicIp(hostname: string): Promise<void> {
  // Literal IPs were already validated by isWebhookUrlAllowed.
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname) || hostname.includes(":")) return;
  const records: string[] = [];
  for (const type of ["A", "AAAA"] as const) {
    try {
      records.push(...(await Deno.resolveDns(hostname, type)) as string[]);
    } catch {
      // Missing record type is fine; both failing leaves records empty -> fail closed.
    }
  }
  if (records.length === 0) {
    throw new Error("Webhook host did not resolve");
  }
  for (const ip of records) {
    if (isPrivateIpV4(ip) || isPrivateIpV6(ip)) {
      throw new Error("Webhook host resolves to a private address");
    }
  }
}

// Max request body size (DoS protection).
const MAX_BODY_BYTES = 1024 * 1024; // 1 MB

// In-memory rate limit: per user, per instance (for global limits use Redis/KV).
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 120;
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(userId: string): { allowed: boolean; retryAfter?: number } {
  const now = Date.now();
  const entry = rateLimitMap.get(userId);
  if (!entry) {
    rateLimitMap.set(userId, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return { allowed: true };
  }
  if (now >= entry.resetAt) {
    entry.count = 1;
    entry.resetAt = now + RATE_LIMIT_WINDOW_MS;
    return { allowed: true };
  }
  if (entry.count >= RATE_LIMIT_MAX) {
    return { allowed: false, retryAfter: Math.ceil((entry.resetAt - now) / 1000) };
  }
  entry.count += 1;
  return { allowed: true };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Anon key + the caller's JWT: queries run as the user with RLS enforced.
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const rl = checkRateLimit(user.id);
    if (!rl.allowed) {
      return new Response(
        JSON.stringify({
          error: "Too many requests",
          code: "RATE_LIMITED",
          retryAfter: rl.retryAfter,
        }),
        {
          status: 429,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
            ...(rl.retryAfter != null ? { "Retry-After": String(rl.retryAfter) } : {}),
          },
        }
      );
    }

    const contentLength = req.headers.get("Content-Length");
    if (contentLength) {
      const size = parseInt(contentLength, 10);
      if (!Number.isNaN(size) && size > MAX_BODY_BYTES) {
        return new Response(
          JSON.stringify({ error: "Request body too large", code: "PAYLOAD_TOO_LARGE" }),
          { status: 413, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }
    const rawBody = await req.text();
    if (rawBody.length > MAX_BODY_BYTES) {
      return new Response(
        JSON.stringify({ error: "Request body too large", code: "PAYLOAD_TOO_LARGE" }),
        { status: 413, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    let parsed: { event?: unknown; payload?: unknown };
    try {
      parsed = JSON.parse(rawBody);
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { event, payload } = parsed;
    if (!event || typeof event !== "string") {
      return new Response(JSON.stringify({ error: "event required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: integrations } = await supabase
      .from("integrations")
      .select("id, config")
      .eq("user_id", user.id)
      .eq("type", "webhook")
      .eq("enabled", true);

    const toCall = (integrations ?? []).filter((i) => {
      const events = i.config?.events;
      return !events || !Array.isArray(events) || events.includes(event);
    });

    const results = await Promise.allSettled(
      toCall.map(async (i) => {
        const url = i.config?.url;
        if (!url || typeof url !== "string") return;
        const urlCheck = isWebhookUrlAllowed(url);
        if (!urlCheck.allowed) {
          throw new Error(urlCheck.reason ?? "Webhook URL not allowed");
        }
        await assertResolvesToPublicIp(new URL(url).hostname.toLowerCase());
        const body = JSON.stringify({ event, payload: payload ?? {}, timestamp: new Date().toISOString() });
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
          "User-Agent": "PKS-Webhook/1.0",
          "X-PKS-Event": event,
        };
        if (i.config?.secret) {
          const enc = new TextEncoder();
          const key = await crypto.subtle.importKey(
            "raw",
            enc.encode(i.config.secret),
            { name: "HMAC", hash: "SHA-256" },
            false,
            ["sign"]
          );
          const sig = await crypto.subtle.sign("HMAC", key, enc.encode(body));
          headers["X-PKS-Signature"] = btoa(String.fromCharCode(...new Uint8Array(sig)));
        }
        // No redirect following (a 3xx could point at an internal address) and
        // a hard timeout so one slow endpoint cannot stall the whole delivery.
        await fetch(url, {
          method: "POST",
          headers,
          body,
          redirect: "manual",
          signal: AbortSignal.timeout(10_000),
        });
      })
    );

    const delivered = results.filter((r) => r.status === "fulfilled").length;
    return new Response(
      JSON.stringify({ delivered, total: toCall.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("webhook-deliver error:", e);
    return new Response(
      JSON.stringify({ error: "Server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
