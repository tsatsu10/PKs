// PKS Edge Function: run a prompt over a knowledge object with DeepSeek or Claude.
// Order: auth → validate → per-minute limit → load object (as the user, under RLS) → key/provider
// → server-key caps → AI call → server-owned prompt_runs row.
import Anthropic from "@anthropic-ai/sdk";
import { corsHeaders } from "../_shared/cors.ts";
import { json } from "../_shared/http.ts";
import { getAdminClient, getUserClient } from "../_shared/supabase.ts";
import { hintForDeepSeekAuthCode, validateDeepSeekApiKey } from "./deepseekKey.ts";
import {
  buildUserMessage,
  failedRunOutput,
  isProvider,
  parseRunRequest,
  pickModel,
  type Provider,
  PROVIDERS,
  redactSecrets,
  serverKeyCaps,
} from "./lib.ts";

const RATE_LIMIT_PER_MINUTE = 20;
const env = (k: string, d: number) => Number(Deno.env.get(k) ?? "") || d;
const SERVER_KEY_DAILY_LIMIT = env("SERVER_KEY_DAILY_LIMIT", 50); // per user, all providers
const SERVER_KEY_DAILY_LIMIT_ANTHROPIC = env("SERVER_KEY_DAILY_LIMIT_ANTHROPIC", 10); // per user, Claude
const SERVER_KEY_GLOBAL_DAILY_LIMIT = env("SERVER_KEY_GLOBAL_DAILY_LIMIT", 500); // all users together
const DAY = 86_400;
const DEEPSEEK_TIMEOUT_MS = 60_000;
const CLAUDE_TIMEOUT_MS = 110_000; // with maxRetries 0, stays under the 150 s edge limit
const DEEPSEEK_API_URL = "https://api.deepseek.com/v1/chat/completions";

type Usage = { input: number | null; output: number | null };
type RunResult =
  | { ok: true; output: string; usage: Usage }
  | { ok: false; status: number; body: Record<string, unknown> };

function validateAnthropicApiKey(raw: string): { ok: true; key: string } | { ok: false; hint: string } {
  const key = raw.trim().replace(/^bearer\s+/i, "");
  if (!key.startsWith("sk-ant-") || /\s/.test(key)) {
    return { ok: false, hint: "Claude API keys start with sk-ant-. Create one at console.anthropic.com → API Keys." };
  }
  return { ok: true, key };
}

async function runDeepSeek(apiKey: string, model: string, userMessage: string, usingServerKey: boolean): Promise<RunResult> {
  const res = await fetch(DEEPSEEK_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model, messages: [{ role: "user", content: userMessage }], max_tokens: 4096 }),
    signal: AbortSignal.timeout(DEEPSEEK_TIMEOUT_MS),
  }).catch((e) => {
    if (e instanceof DOMException && e.name === "TimeoutError") return null;
    throw e;
  });
  if (!res) {
    return { ok: false, status: 504, body: { error: "AI request timed out", code: "UPSTREAM_TIMEOUT", hint: "Try again, or shorten the prompt." } };
  }
  if (!res.ok) {
    let upstreamCode = "DEEPSEEK_ERROR";
    let upstreamMessage = "";
    try {
      const errJson = await res.json();
      const errObj = errJson?.error;
      upstreamMessage = (typeof errObj === "object" && errObj?.message) || errJson?.message ||
        (typeof errObj === "string" ? errObj : "") || "";
      upstreamCode = (typeof errObj === "object" && errObj?.code) || errJson?.code || upstreamCode;
    } catch { /* ignore parse errors */ }
    upstreamMessage = redactSecrets(String(upstreamMessage));
    if (usingServerKey) {
      // Upstream errors for the shared key stay server-side.
      console.error("DeepSeek error (server key)", res.status, upstreamCode, upstreamMessage);
      return { ok: false, status: 502, body: { error: "AI request failed", code: "UPSTREAM_ERROR", hint: "Try again in a moment." } };
    }
    const hint = upstreamMessage ? `DeepSeek: ${upstreamMessage}` : hintForDeepSeekAuthCode(String(upstreamCode));
    return { ok: false, status: 502, body: { error: upstreamMessage || "AI request failed", code: upstreamCode, hint } };
  }
  const data = await res.json();
  return {
    ok: true,
    output: data.choices?.[0]?.message?.content ?? "",
    usage: { input: data.usage?.prompt_tokens ?? null, output: data.usage?.completion_tokens ?? null },
  };
}

async function runClaude(apiKey: string, model: string, userMessage: string, usingServerKey: boolean): Promise<RunResult> {
  const client = new Anthropic({ apiKey, timeout: CLAUDE_TIMEOUT_MS, maxRetries: 0 });
  const messages = [{ role: "user" as const, content: userMessage }];
  try {
    const response = model === "claude-opus-5"
      ? await client.beta.messages.create({
        model,
        max_tokens: 16000,
        thinking: { type: "adaptive" },
        // Server-side fallback: a safety-classifier decline is re-run on Anthropic's recommended model.
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        messages,
      })
      : await client.messages.create({
        model,
        max_tokens: usingServerKey ? 4096 : 16000,
        thinking: { type: "adaptive" },
        output_config: { effort: usingServerKey ? "medium" : "high" },
        messages,
      });

    if (response.stop_reason === "refusal") {
      return {
        ok: false,
        status: 422,
        body: { error: "Claude declined this request", code: "REFUSAL", hint: response.stop_details?.explanation || "Try rephrasing the prompt." },
      };
    }
    const output = response.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { text: string }).text)
      .join("");
    return { ok: true, output, usage: { input: response.usage?.input_tokens ?? null, output: response.usage?.output_tokens ?? null } };
  } catch (e) {
    const fail = (status: number, code: string, error: string, hint: string): RunResult => {
      if (usingServerKey) {
        console.error("Claude error (server key)", status, code, redactSecrets(e instanceof Error ? e.message : String(e)));
        return { ok: false, status: status === 504 ? 504 : 502, body: { error: "AI request failed", code: "UPSTREAM_ERROR", hint: "Try again in a moment." } };
      }
      return { ok: false, status, body: { error: redactSecrets(error), code, hint: redactSecrets(hint) } };
    };
    if (e instanceof Anthropic.AuthenticationError) {
      return fail(502, "INVALID_API_KEY", "Invalid Claude API key", "Check the key in Settings → AI API keys (it starts with sk-ant-).");
    }
    if (e instanceof Anthropic.PermissionDeniedError) return fail(502, "PERMISSION_DENIED", "Claude API key lacks access", e.message);
    if (e instanceof Anthropic.RateLimitError) return fail(429, "UPSTREAM_RATE_LIMITED", "Claude rate limit reached", "Try again in a minute.");
    // Includes timeouts (APIConnectionTimeoutError); must precede APIError, its superclass.
    if (e instanceof Anthropic.APIConnectionError) {
      return fail(504, "UPSTREAM_TIMEOUT", "AI request timed out or could not connect", "Try again, or shorten the prompt.");
    }
    if (e instanceof Anthropic.APIError) return fail(502, e.type ?? "CLAUDE_ERROR", e.message, `Claude: ${e.message}`);
    throw e;
  }
}

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
    const { supabase, user } = auth;

    // B19: validate before spending any quota.
    let raw: unknown;
    try {
      raw = await req.json();
    } catch {
      return reply({ error: "Invalid JSON body" }, 400);
    }
    const parsed = parseRunRequest(raw);
    if (!parsed.ok) return reply({ error: parsed.error }, 400);
    const input = parsed.value;

    const { data: rl, error: rlErr } = await supabase.rpc("consume_usage", {
      p_scope: "run_prompt_minute",
      p_limit: RATE_LIMIT_PER_MINUTE,
      p_window_seconds: 60,
    });
    if (rlErr) return reply({ error: "Rate limit check failed", code: "RATE_LIMIT_ERROR", hint: "Try again in a moment." }, 503);
    if (rl?.limited !== false) {
      const retryAfter = typeof rl?.retry_after_sec === "number" ? rl.retry_after_sec : 60;
      return reply({
        error: "Too many requests",
        code: "RATE_LIMITED",
        hint: `Limit: ${RATE_LIMIT_PER_MINUTE} runs per minute. Try again in ${retryAfter}s.`,
        retryAfter,
      }, 429, { "Retry-After": String(retryAfter) });
    }

    // Load the object as the user (RLS) instead of trusting client-sent content.
    let title = input.legacyTitle;
    let content = input.legacyContent;
    if (input.objectId) {
      const { data: obj, error: objErr } = await supabase
        .from("knowledge_objects").select("title, content").eq("id", input.objectId).single();
      if (objErr || !obj) return reply({ error: "Object not found", code: "OBJECT_NOT_FOUND" }, 404);
      title = obj.title ?? "";
      content = obj.content ?? "";
    }

    let provider: Provider;
    let apiKey: string;
    const usingServerKey = !input.userProviderId;
    if (input.userProviderId) {
      // api_key has no SELECT grant for app users; read it with the service role, scoped to the verified caller.
      const { data: row, error } = await getAdminClient()
        .from("user_ai_providers").select("api_key, provider_type")
        .eq("id", input.userProviderId).eq("user_id", user.id).single();
      if (error || !row?.api_key) {
        return reply({
          error: "Invalid or missing AI provider",
          code: "USER_PROVIDER_INVALID",
          hint: "The selected API key may have been removed. Check Settings → AI API keys.",
        }, 400);
      }
      if (!isProvider(row.provider_type)) {
        return reply({
          error: "Unsupported AI provider",
          code: "PROVIDER_NOT_SUPPORTED",
          hint: "Add a DeepSeek or Claude API key in Settings → AI API keys.",
        }, 400);
      }
      provider = row.provider_type;
      apiKey = row.api_key;
    } else {
      provider = input.provider ?? "deepseek";
      const cfg = PROVIDERS[provider];
      const serverKey = Deno.env.get(cfg.serverKeyEnv);
      if (!serverKey) {
        return reply({
          error: `${cfg.label} not configured`,
          code: `${provider.toUpperCase()}_API_KEY_MISSING`,
          hint: `No shared ${cfg.label} key is set on the server. Add your own ${cfg.label} key in Settings → AI API keys.`,
        }, 503);
      }
      // S2: per-user total, per-user per-provider, then a global cap across all users. All fail closed.
      const caps = serverKeyCaps(provider, { total: SERVER_KEY_DAILY_LIMIT, anthropic: SERVER_KEY_DAILY_LIMIT_ANTHROPIC });
      for (const { scope, limit } of caps) {
        const { data: q, error: qErr } = await supabase.rpc("consume_usage", { p_scope: scope, p_limit: limit, p_window_seconds: DAY });
        if (qErr || q?.limited !== false) {
          return reply({
            error: "Daily limit reached",
            code: "SERVER_KEY_QUOTA",
            hint: `The shared ${cfg.label} key allows ${limit} runs per day. Add your own key in Settings → AI API keys to keep going.`,
          }, 429);
        }
      }
      const { data: g, error: gErr } = await getAdminClient().rpc("consume_global_usage", {
        p_scope: "server_key_global",
        p_limit: SERVER_KEY_GLOBAL_DAILY_LIMIT,
        p_window_seconds: DAY,
      });
      if (gErr || g?.limited !== false) {
        console.error("Global server-key cap reached or check failed", gErr?.message ?? g);
        return reply({
          error: "Shared AI capacity reached for today",
          code: "SERVER_KEY_GLOBAL_QUOTA",
          hint: "Add your own API key in Settings → AI API keys, or try again tomorrow.",
        }, 429);
      }
      apiKey = serverKey;
    }

    const model = pickModel(provider, input.model, usingServerKey);
    if (provider === "deepseek") {
      const check = validateDeepSeekApiKey(apiKey);
      if (!check.ok) return reply({ error: "Invalid DeepSeek API key", code: check.code, hint: check.hint }, 400);
      apiKey = check.key;
    } else {
      const check = validateAnthropicApiKey(apiKey);
      if (!check.ok) return reply({ error: "Invalid Claude API key", code: "INVALID_API_KEY", hint: check.hint }, 400);
      apiKey = check.key;
    }

    const { message, truncated } = buildUserMessage(title, content, input.promptText);
    const result = provider === "anthropic"
      ? await runClaude(apiKey, model, message, usingServerKey)
      : await runDeepSeek(apiKey, model, message, usingServerKey);

    // B8/D13: one server-written run row per call, completed or failed. Legacy bodies (no object_id) get none.
    let run: { id: string; created_at: string } | undefined;
    if (input.objectId) {
      const { data: runRow, error: runErr } = await supabase.from("prompt_runs").insert({
        user_id: user.id,
        knowledge_object_id: input.objectId,
        prompt_template_id: input.promptTemplateId,
        status: result.ok ? "completed" : "failed",
        output: result.ok ? result.output : failedRunOutput(result.body),
        provider,
        model,
        input_tokens: result.ok ? result.usage.input : null,
        output_tokens: result.ok ? result.usage.output : null,
        truncated,
      }).select("id, created_at").single();
      if (runErr) console.error("Failed to record prompt run", runErr.message);
      else run = runRow;
    }

    if (!result.ok) return reply({ ...result.body, run }, result.status);
    return reply({ output: result.output, provider, model, truncated, run });
  } catch (e) {
    console.error("run-prompt error:", redactSecrets(e instanceof Error ? e.stack ?? e.message : String(e)));
    return reply({ error: "Server error", hint: "Something went wrong on the server. Try again in a moment." }, 500);
  }
});
