import { assertEquals } from "@std/assert";
import {
  buildUserMessage,
  failedRunOutput,
  LIMITS,
  parseRunRequest,
  pickModel,
  redactSecrets,
  serverKeyCaps,
} from "./lib.ts";

Deno.test("server-key Claude runs are pinned to Sonnet 5", () => {
  assertEquals(pickModel("anthropic", "claude-opus-5", true), "claude-sonnet-5");
  assertEquals(pickModel("anthropic", "", true), "claude-sonnet-5");
});

Deno.test("own-key Claude runs default to Opus 5 and may choose Sonnet 5", () => {
  assertEquals(pickModel("anthropic", "", false), "claude-opus-5");
  assertEquals(pickModel("anthropic", "claude-sonnet-5", false), "claude-sonnet-5");
  assertEquals(pickModel("anthropic", "gpt-9", false), "claude-opus-5");
});

Deno.test("buildUserMessage flags truncated content", () => {
  const long = "x".repeat(LIMITS.MAX_OBJECT_CONTENT + 10);
  const { message, truncated } = buildUserMessage("Title", long, "Summarize");
  assertEquals(truncated, true);
  assertEquals(message.includes("x".repeat(LIMITS.MAX_OBJECT_CONTENT + 1)), false);
  assertEquals(buildUserMessage("", "", "Just this").message, "Just this");
});

Deno.test("parseRunRequest validates before anything is spent", () => {
  assertEquals(parseRunRequest(null).ok, false);
  assertEquals(parseRunRequest({ promptText: "" }).ok, false);
  assertEquals(parseRunRequest({ promptText: "a".repeat(LIMITS.MAX_PROMPT_TEXT + 1) }).ok, false);
  assertEquals(parseRunRequest({ promptText: "Hi", object_id: "not-a-uuid" }).ok, false);
  const ok = parseRunRequest({ promptText: "Hi", object_id: "00000000-0000-0000-0000-000000000001", provider: "anthropic" });
  assertEquals(ok.ok, true);
  if (ok.ok) assertEquals(ok.value.objectId, "00000000-0000-0000-0000-000000000001");
});

Deno.test("parseRunRequest accepts the legacy body from old clients", () => {
  const legacy = parseRunRequest({ promptText: "Hi", objectTitle: "T", objectContent: "C" });
  assertEquals(legacy.ok, true);
  if (legacy.ok) {
    assertEquals(legacy.value.objectId, null);
    assertEquals(legacy.value.legacyTitle, "T");
  }
});

Deno.test("serverKeyCaps: every server-key run counts against the per-user total", () => {
  assertEquals(serverKeyCaps("deepseek", { total: 50, anthropic: 10 }), [{ scope: "server_key", limit: 50 }]);
});

Deno.test("serverKeyCaps: Claude runs also count against the per-user Claude cap", () => {
  assertEquals(serverKeyCaps("anthropic", { total: 50, anthropic: 10 }), [
    { scope: "server_key", limit: 50 },
    { scope: "server_key:anthropic", limit: 10 },
  ]);
});

Deno.test("failedRunOutput records the user-facing error, never an empty string", () => {
  assertEquals(failedRunOutput({ error: "Claude declined this request", code: "REFUSAL" }), "Claude declined this request");
  assertEquals(failedRunOutput({ code: "UPSTREAM_ERROR" }), "AI request failed");
  assertEquals(failedRunOutput({ error: "" }), "AI request failed");
});

Deno.test("redactSecrets masks API-key-shaped tokens", () => {
  assertEquals(
    redactSecrets("Incorrect API key provided: sk-ant-api03-AbCdEf123456_789 and sk-1234567890abcdef"),
    "Incorrect API key provided: sk-*** and sk-***",
  );
  assertEquals(redactSecrets("Your credit balance is too low"), "Your credit balance is too low");
  assertEquals(failedRunOutput({ error: "Bad key sk-1234567890abcdef" }), "Bad key sk-***");
});
