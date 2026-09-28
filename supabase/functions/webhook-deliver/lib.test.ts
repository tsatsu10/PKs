import { assertEquals } from "@std/assert";
import {
  countDelivered, dedupeByUrl, isAllowedEvent, isWebhookUrlAllowed, legacySignature,
  MAX_PAYLOAD_BYTES, normalizeWebhookUrl, signPayload,
} from "./lib.ts";

Deno.test("signs timestamp.body with HMAC-SHA256 (hex)", async () => {
  const sig = await signPayload("whsec_test", 1700000000, '{"event":"object.created"}');
  assertEquals(sig, "aabe67d47e4ed839a7db5f1db800a332ef23cdc46d9053902f8cd474baa84d5a");
});

Deno.test("legacy signature is base64 HMAC-SHA256 of the body alone", async () => {
  // Independently verified: printf '%s' '{"event":"object.created"}' | openssl dgst -sha256 -hmac whsec_test -binary | base64
  const sig = await legacySignature("whsec_test", '{"event":"object.created"}');
  assertEquals(sig, "GsxVAFudmWhlofhTnYyGTIeruipUaD1R600M2gADwZw=");
});

Deno.test("only known events are accepted", () => {
  assertEquals(isAllowedEvent("object.created"), true);
  assertEquals(isAllowedEvent("anything.else"), false);
});

Deno.test("only 2xx responses count as delivered", () => {
  const results: PromiseSettledResult<Response | undefined>[] = [
    { status: "fulfilled", value: new Response(null, { status: 204 }) },
    { status: "fulfilled", value: new Response(null, { status: 500 }) },
    { status: "fulfilled", value: undefined },
    { status: "rejected", reason: new Error("x") },
  ];
  assertEquals(countDelivered(results), 1);
});

Deno.test("SSRF guard still blocks private targets", () => {
  assertEquals(isWebhookUrlAllowed("http://example.com").allowed, false);
  assertEquals(isWebhookUrlAllowed("https://127.0.0.1/x").allowed, false);
  assertEquals(isWebhookUrlAllowed("https://[::ffff:10.0.0.1]/x").allowed, false);
  assertEquals(isWebhookUrlAllowed("https://hooks.example.com/x").allowed, true);
});

Deno.test("payload cap is 16 KB", () => {
  assertEquals(MAX_PAYLOAD_BYTES, 16 * 1024);
});

Deno.test("dedupeByUrl keeps one entry per normalized URL", () => {
  const items = [
    { id: 1, url: "https://hooks.example.com/x" },
    { id: 2, url: "https://hooks.example.com/x/" }, // trailing slash, same target
    { id: 3, url: "https://HOOKS.example.com/x" }, // different case host, same target
    { id: 4, url: "https://hooks.example.com/y" }, // different path
    { id: 5, url: "not a url" },
  ];
  const deduped = dedupeByUrl(items, (i) => i.url);
  assertEquals(deduped.map((i) => i.id), [1, 4, 5]);
});

Deno.test("normalizeWebhookUrl treats query param order as equivalent", () => {
  assertEquals(
    normalizeWebhookUrl("https://hooks.example.com/x?b=2&a=1"),
    normalizeWebhookUrl("https://hooks.example.com/x?a=1&b=2"),
  );
});
