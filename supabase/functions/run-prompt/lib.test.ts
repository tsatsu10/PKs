import { assertEquals } from "@std/assert";
import {
  buildUserMessage,
  completionOutcome,
  EMPTY_OUTPUT_BODY,
  failedRunOutput,
  LIMITS,
  parseRunRequest,
  pickModel,
  redactSecrets,
  serverKeyCaps,
  upstreamFailure,
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

Deno.test("serverKeyCaps: Claude runs consume the narrower per-user Claude cap first", () => {
  assertEquals(serverKeyCaps("anthropic", { total: 50, anthropic: 10 }), [
    { scope: "server_key:anthropic", limit: 10 },
    { scope: "server_key", limit: 50 },
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

Deno.test("completionOutcome detects output truncation per provider", () => {
  assertEquals(completionOutcome("anthropic", "max_tokens", "partial"), { empty: false, outputTruncated: true });
  assertEquals(completionOutcome("anthropic", "end_turn", "done"), { empty: false, outputTruncated: false });
  assertEquals(completionOutcome("deepseek", "length", "partial"), { empty: false, outputTruncated: true });
  assertEquals(completionOutcome("deepseek", "stop", "done"), { empty: false, outputTruncated: false });
  // Each provider's own vocabulary only.
  assertEquals(completionOutcome("deepseek", "max_tokens", "x").outputTruncated, false);
  assertEquals(completionOutcome("anthropic", "length", "x").outputTruncated, false);
});

Deno.test("completionOutcome treats an empty or whitespace-only answer as empty", () => {
  assertEquals(completionOutcome("anthropic", "end_turn", "").empty, true);
  assertEquals(completionOutcome("deepseek", null, "  \n ").empty, true);
  assertEquals(completionOutcome("anthropic", "max_tokens", ""), { empty: true, outputTruncated: true });
  assertEquals(EMPTY_OUTPUT_BODY, { error: "The AI returned no answer", code: "EMPTY_OUTPUT", hint: "Try again, or shorten the prompt." });
});

Deno.test("upstreamFailure maps timeouts anywhere to 504 UPSTREAM_TIMEOUT", () => {
  const timeout = new DOMException("Signal timed out.", "TimeoutError");
  const abort = new DOMException("The operation was aborted.", "AbortError");
  for (const serverKey of [true, false]) {
    for (const e of [timeout, abort]) {
      const f = upstreamFailure(e, serverKey, "DeepSeek");
      assertEquals(f.status, 504);
      assertEquals(f.body.code, "UPSTREAM_TIMEOUT");
    }
  }
});

Deno.test("upstreamFailure: other errors are 502 UPSTREAM_ERROR, generic on the server key", () => {
  const e = new TypeError("error sending request: dns error for sk-1234567890abcdef");
  const server = upstreamFailure(e, true, "DeepSeek");
  assertEquals(server, { status: 502, body: { error: "AI request failed", code: "UPSTREAM_ERROR", hint: "Try again in a moment." } });
  const own = upstreamFailure(e, false, "DeepSeek");
  assertEquals(own.status, 502);
  assertEquals(own.body.code, "UPSTREAM_ERROR");
  assertEquals(own.body.error, "DeepSeek request failed: error sending request: dns error for sk-***");
  const parse = upstreamFailure(new SyntaxError("Unexpected token < in JSON"), false, "DeepSeek");
  assertEquals(parse.body.error, "DeepSeek request failed: Unexpected token < in JSON");
  assertEquals(upstreamFailure("weird", false, "Claude").body.error, "Claude request failed: weird");
});
