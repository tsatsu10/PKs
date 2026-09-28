import { assertEquals } from "@std/assert";
import { countDelivered, isAllowedEvent, isWebhookUrlAllowed, MAX_PAYLOAD_BYTES, signPayload } from "./lib.ts";

Deno.test("signs timestamp.body with HMAC-SHA256 (hex)", async () => {
  const sig = await signPayload("whsec_test", 1700000000, '{"event":"object.created"}');
  assertEquals(sig, "aabe67d47e4ed839a7db5f1db800a332ef23cdc46d9053902f8cd474baa84d5a");
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
