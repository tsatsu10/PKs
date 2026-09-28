import { assertEquals } from "@std/assert";
import { corsHeaders } from "./cors.ts";

Deno.test("returns headers for the configured origin", () => {
  const h = corsHeaders("https://pks.example");
  assertEquals(h?.["Access-Control-Allow-Origin"], "https://pks.example");
  assertEquals(h?.["Access-Control-Allow-Methods"], "POST, OPTIONS");
});

Deno.test("fails closed when no origin is configured", () => {
  assertEquals(corsHeaders(undefined), null);
  assertEquals(corsHeaders(""), null);
  assertEquals(corsHeaders("*"), null);
});
