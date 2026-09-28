// PKS webhook-deliver helpers: SSRF guards, event allowlist, HMAC signing, delivery counting.

/** True when an IPv4 address string falls in a loopback/private/link-local/reserved range. */
export function isPrivateIpV4(ip: string): boolean {
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
export function parseIpV6(ip: string): number[] | null {
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
export function isPrivateIpV6(ip: string): boolean {
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
export function isWebhookUrlAllowed(urlString: string): { allowed: boolean; reason?: string } {
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
export async function assertResolvesToPublicIp(hostname: string): Promise<void> {
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

/** Event names clients may send. Keep in sync with WEBHOOK_EVENTS in frontend/src/constants/index.js. */
export const WEBHOOK_EVENTS = ["object.created", "prompt_run.completed", "export.completed"] as const;
export const MAX_PAYLOAD_BYTES = 16 * 1024;

export function isAllowedEvent(event: unknown): event is typeof WEBHOOK_EVENTS[number] {
  return typeof event === "string" && (WEBHOOK_EVENTS as readonly string[]).includes(event);
}

async function hmac(secret: string, message: string): Promise<Uint8Array> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(message)));
}

/** v1 signature: hex HMAC-SHA256 over "<unix seconds>.<body>" (replay-resistant with the timestamp). */
export async function signPayload(secret: string, timestamp: number, body: string): Promise<string> {
  const bytes = await hmac(secret, `${timestamp}.${body}`);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Legacy base64 HMAC over the body only; removed in the contract task. */
export async function legacySignature(secret: string, body: string): Promise<string> {
  return btoa(String.fromCharCode(...await hmac(secret, body)));
}

export function countDelivered(results: PromiseSettledResult<Response | undefined>[]): number {
  return results.filter((r) => r.status === "fulfilled" && r.value?.ok === true).length;
}
