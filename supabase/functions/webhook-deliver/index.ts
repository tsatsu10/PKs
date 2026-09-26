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
  const [a, b, c] = m.slice(1).map(Number);
  return (
    a === 0 ||
    a === 127 ||
    a === 10 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 169 && b === 254) ||
    (a === 100 && b >= 64 && b <= 127) || // CGNAT
    (a === 192 && b === 0 && (c === 0 || c === 2)) || // IETF protocol assignments, TEST-NET-1
    (a === 198 && (b === 18 || b === 19)) || // benchmarking
    (a === 198 && b === 51 && c === 100) || // TEST-NET-2
    (a === 203 && b === 0 && c === 113) || // TEST-NET-3
    a >= 224 // multicast/reserved
  );
}

/** Parse an IPv6 literal (optionally bracketed, may embed dotted IPv4) into 16 bytes; null if invalid. */
function parseIpV6(ip: string): number[] | null {
  let v = ip.toLowerCase().replace(/^\[|\]$/g, "");
  const zone = v.indexOf("%");
  if (zone !== -1) v = v.slice(0, zone);
  const dotted = v.match(/^(.*:)(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (dotted) {
    const o = dotted[2].split(".").map(Number);
    if (o.some((n) => n > 255)) return null;
    v = `${dotted[1]}${((o[0] << 8) | o[1]).toString(16)}:${((o[2] << 8) | o[3]).toString(16)}`;
  }
  const halves = v.split("::");
  if (halves.length > 2) return null;
  const parse = (part: string) => (part === "" ? [] : part.split(":"));
  const head = parse(halves[0]);
  const tail = halves.length === 2 ? parse(halves[1]) : [];
  const fill = 8 - head.length - tail.length;
  if (halves.length === 1 ? head.length !== 8 : fill < 1) return null;
  const groups = [...head, ...Array(halves.length === 2 ? fill : 0).fill("0"), ...tail];
  const bytes: number[] = [];
  for (const g of groups) {
    if (!/^[0-9a-f]{1,4}$/.test(g)) return null;
    const n = parseInt(g, 16);
    bytes.push(n >> 8, n & 0xff);
  }
  return bytes;
}

/**
 * True when an IPv6 address is non-public: unspecified/loopback, link-/site-local, unique-local,
 * multicast, documentation, Teredo, or any form that embeds a private IPv4 (mapped, compatible,
 * NAT64, 6to4). Unparseable input counts as private (fail closed).
 */
function isPrivateIpV6(ip: string): boolean {
  const b = parseIpV6(ip);
  if (!b) return true;
  const v4 = (o: number) => `${b[o]}.${b[o + 1]}.${b[o + 2]}.${b[o + 3]}`;
  const zeros = (from: number, to: number) => b.slice(from, to).every((x) => x === 0);
  if (zeros(0, 10) && b[10] === 0xff && b[11] === 0xff) return isPrivateIpV4(v4(12)); // ::ffff:0:0/96
  if (zeros(0, 12)) return true; // ::, ::1, and deprecated IPv4-compatible ::a.b.c.d
  if (b[0] === 0x00 && b[1] === 0x64 && b[2] === 0xff && b[3] === 0x9b) return true; // NAT64 64:ff9b::/96, 64:ff9b:1::/48
  if (b[0] === 0x20 && b[1] === 0x02) return isPrivateIpV4(v4(2)); // 6to4 2002::/16
  if (b[0] === 0x20 && b[1] === 0x01 && (zeros(2, 4) || (b[2] === 0x0d && b[3] === 0xb8))) return true; // Teredo, documentation
  if (b[0] === 0x01 && b[1] === 0x00 && zeros(2, 8)) return true; // discard-only 100::/64
  if (b[0] === 0xfe && b[1] >= 0x80) return true; // link-local fe80::/10 and site-local fec0::/10
  if ((b[0] & 0xfe) === 0xfc) return true; // unique-local fc00::/7
  if (b[0] === 0xff) return true; // multicast
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
  // Note: DNS is re-resolved by fetch() after assertResolvesToPublicIp, so a rebinding DNS
  // server can still race the check. Blind (response never returned), HTTPS-only, no redirects.
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
    if (ip.includes(":") ? isPrivateIpV6(ip) : isPrivateIpV4(ip)) {
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
