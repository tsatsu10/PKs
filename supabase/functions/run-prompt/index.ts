// PKS Edge Function: run a prompt with DeepSeek or Claude (Anthropic).
// Server defaults: DEEPSEEK_API_KEY / ANTHROPIC_API_KEY in Edge Function Secrets (daily-capped per user).
// Or the client passes user_provider_id (a row in user_ai_providers; its provider_type picks the API).
// Invoke: POST body { promptText, objectTitle?, objectContent?, model?, provider?, user_provider_id? }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Anthropic from "npm:@anthropic-ai/sdk";
import { validateDeepSeekApiKey, hintForDeepSeekAuthCode } from "./deepseekKey.ts";

const appOrigin = Deno.env.get("PKS_APP_ORIGIN") ?? "*";
const corsHeaders = {
  "Access-Control-Allow-Origin": appOrigin,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const RATE_LIMIT_PER_MINUTE = 20;
// Daily cap per user on the shared server keys (users with their own key are not capped).
const SERVER_KEY_DAILY_LIMIT = Number(Deno.env.get("SERVER_KEY_DAILY_LIMIT") ?? "50") || 50;
const DEEPSEEK_TIMEOUT_MS = 60_000;
// Claude with adaptive thinking can take longer; stays under the Edge Function wall-clock limit.
const CLAUDE_TIMEOUT_MS = 120_000;
const MAX_PROMPT_TEXT = 16_384;
const MAX_OBJECT_TITLE = 200;
const MAX_OBJECT_CONTENT = 50_000;
const DEEPSEEK_API_URL = "https://api.deepseek.com/v1/chat/completions";

type Provider = "deepseek" | "anthropic";

const PROVIDERS: Record<Provider, { label: string; models: string[]; defaultModel: string; serverKeyEnv: string }> = {
  deepseek: {
    label: "DeepSeek",
    models: ["deepseek-chat", "deepseek-reasoner"],
    defaultModel: "deepseek-chat",
    serverKeyEnv: "DEEPSEEK_API_KEY",
  },
  anthropic: {
    label: "Claude",
    models: ["claude-opus-5"],
    defaultModel: "claude-opus-5",
    serverKeyEnv: "ANTHROPIC_API_KEY",
  },
};

function isProvider(v: unknown): v is Provider {
  return v === "deepseek" || v === "anthropic";
}

function json(body: unknown, status = 200, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", ...extraHeaders },
  });
}

function validateAnthropicApiKey(raw: string): { ok: true; key: string } | { ok: false; hint: string } {
  const key = raw.trim().replace(/^bearer\s+/i, "");
  if (!key.startsWith("sk-ant-") || /\s/.test(key)) {
    return { ok: false, hint: "Claude API keys start with sk-ant-. Create one at console.anthropic.com → API Keys." };
  }
  return { ok: true, key };
}

type RunResult = { ok: true; output: string } | { ok: false; status: number; body: Record<string, unknown> };

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
      upstreamMessage =
        (typeof errObj === "object" && errObj?.message) ||
        errJson?.message ||
        (typeof errJson?.error === "string" ? errJson.error : "") ||
        "";
      upstreamCode = (typeof errObj === "object" && errObj?.code) || errJson?.code || upstreamCode;
    } catch {
      /* ignore parse errors */
    }
    if (usingServerKey) {
      // Upstream errors for the shared key can echo key fragments or config details; keep them server-side.
      console.error("DeepSeek error (server key)", res.status, upstreamCode, upstreamMessage);
      return { ok: false, status: 502, body: { error: "AI request failed", code: "UPSTREAM_ERROR", hint: "Try again in a moment." } };
    }
    // Prefer DeepSeek's own message (e.g. "Insufficient Balance") over the generic key hint.
    const hint = upstreamMessage
      ? `DeepSeek: ${upstreamMessage}`
      : hintForDeepSeekAuthCode(String(upstreamCode));
    return { ok: false, status: 502, body: { error: upstreamMessage || "AI request failed", code: upstreamCode, hint } };
  }

  const data = await res.json();
  return { ok: true, output: data.choices?.[0]?.message?.content ?? "" };
}

async function runClaude(apiKey: string, model: string, userMessage: string, usingServerKey: boolean): Promise<RunResult> {
  const client = new Anthropic({ apiKey, timeout: CLAUDE_TIMEOUT_MS, maxRetries: 1 });
  try {
    const response = await client.beta.messages.create({
      model,
      max_tokens: 16000,
      thinking: { type: "adaptive" },
      // Server-side fallback: a safety-classifier decline is re-run on Anthropic's recommended model.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      messages: [{ role: "user", content: userMessage }],
    });

    if (response.stop_reason === "refusal") {
      return {
        ok: false,
        status: 422,
        body: {
          error: "Claude declined this request",
          code: "REFUSAL",
          hint: response.stop_details?.explanation || "Try rephrasing the prompt.",
        },
      };
    }

    const output = response.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { text: string }).text)
      .join("");
    return { ok: true, output };
  } catch (e) {
    const fail = (status: number, code: string, error: string, hint: string): RunResult => {
      if (usingServerKey) {
        console.error("Claude error (server key)", status, code, e instanceof Error ? e.message : e);
        return { ok: false, status: status === 504 ? 504 : 502, body: { error: "AI request failed", code: "UPSTREAM_ERROR", hint: "Try again in a moment." } };
      }
      return { ok: false, status, body: { error, code, hint } };
    };
    if (e instanceof Anthropic.AuthenticationError) {
      return fail(502, "INVALID_API_KEY", "Invalid Claude API key", "Check the key in Settings → AI API keys (it starts with sk-ant-).");
    }
    if (e instanceof Anthropic.PermissionDeniedError) {
      return fail(502, "PERMISSION_DENIED", "Claude API key lacks access", e.message);
    }
    if (e instanceof Anthropic.RateLimitError) {
      return fail(429, "UPSTREAM_RATE_LIMITED", "Claude rate limit reached", "Try again in a minute.");
    }
    if (e instanceof Anthropic.APIConnectionError) {
      // Includes timeouts (APIConnectionTimeoutError is a subclass).
      return fail(504, "UPSTREAM_TIMEOUT", "AI request timed out or could not connect", "Try again, or shorten the prompt.");
    }
    if (e instanceof Anthropic.APIError) {
      // e.g. 400 "Your credit balance is too low", 529 overloaded.
      return fail(502, e.type ?? "CLAUDE_ERROR", e.message, `Claude: ${e.message}`);
    }
    throw e;
  }
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

    const { data: rlData, error: rlError } = await supabase.rpc("increment_run_prompt_rate_limit", {
      p_limit_per_minute: RATE_LIMIT_PER_MINUTE,
    });
    if (rlError) {
      return new Response(
        JSON.stringify({
          error: "Rate limit check failed",
          code: "RATE_LIMIT_ERROR",
          hint: "Try again in a moment.",
        }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const rl = rlData as { count?: number; limited?: boolean; retry_after_sec?: number; error?: string } | null;
    if (rl?.error === "unauthorized" || rl?.limited === true) {
      const retryAfter = typeof rl?.retry_after_sec === "number" ? rl.retry_after_sec : 60;
      return new Response(
        JSON.stringify({
          error: "Too many requests",
          code: "RATE_LIMITED",
          hint: `Limit: ${RATE_LIMIT_PER_MINUTE} Run prompt requests per minute. Try again in ${retryAfter}s.`,
          retryAfter,
        }),
        {
          status: 429,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
            "Retry-After": String(retryAfter),
          },
        }
      );
    }

    let body: {
      promptText?: string;
      objectTitle?: string;
      objectContent?: string;
      model?: string;
      provider?: string;
      user_provider_id?: string;
    };
    try {
      body = await req.json();
    } catch {
      return json({ error: "Invalid JSON body" }, 400);
    }

    const userProviderId = typeof body?.user_provider_id === "string" ? body.user_provider_id.trim() || null : null;
    const usingServerKey = !userProviderId;

    let provider: Provider;
    let apiKey: string;

    if (userProviderId) {
      // api_key has no SELECT grant for app users; read it with the service role, scoped to the
      // already-verified caller.
      const admin = createClient(
        Deno.env.get("SUPABASE_URL") ?? "",
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
        { auth: { persistSession: false } }
      );
      const { data: providerRow, error: providerErr } = await admin
        .from("user_ai_providers")
        .select("api_key, provider_type")
        .eq("id", userProviderId)
        .eq("user_id", user.id)
        .single();
      if (providerErr || !providerRow?.api_key) {
        return json({
          error: "Invalid or missing AI provider",
          code: "USER_PROVIDER_INVALID",
          hint: "The selected API key may have been removed. Check Settings → AI API keys.",
        }, 400);
      }
      if (!isProvider(providerRow.provider_type)) {
        return json({
          error: "Unsupported AI provider",
          code: "PROVIDER_NOT_SUPPORTED",
          hint: "Add a DeepSeek or Claude API key in Settings → AI API keys.",
        }, 400);
      }
      provider = providerRow.provider_type;
      apiKey = providerRow.api_key;
    } else {
      provider = isProvider(body?.provider) ? body.provider : "deepseek";
      const serverCfg = PROVIDERS[provider];
      const serverKey = Deno.env.get(serverCfg.serverKeyEnv);
      if (!serverKey) {
        return json({
          error: `${serverCfg.label} not configured`,
          code: provider === "deepseek" ? "DEEPSEEK_API_KEY_MISSING" : "ANTHROPIC_API_KEY_MISSING",
          hint: `No shared ${serverCfg.label} key is set on the server (${serverCfg.serverKeyEnv}). Add your own ${serverCfg.label} key in Settings → AI API keys.`,
        }, 503);
      }
      const { data: quota, error: quotaErr } = await supabase.rpc("consume_server_key_quota", {
        p_daily_limit: SERVER_KEY_DAILY_LIMIT,
      });
      const q = quota as { limited?: boolean } | null;
      if (quotaErr || q?.limited !== false) {
        return json({
          error: "Daily limit reached",
          code: "SERVER_KEY_QUOTA",
          hint: `The shared AI key allows ${SERVER_KEY_DAILY_LIMIT} runs per day. Add your own key in Settings → AI API keys to keep going.`,
        }, 429);
      }
      apiKey = serverKey;
    }

    const cfg = PROVIDERS[provider];
    const requestedModel = typeof body?.model === "string" ? body.model.trim() : "";
    const model = cfg.models.includes(requestedModel) ? requestedModel : cfg.defaultModel;

    if (provider === "deepseek") {
      const keyCheck = validateDeepSeekApiKey(apiKey);
      if (!keyCheck.ok) {
        return json({ error: "Invalid DeepSeek API key", code: keyCheck.code, hint: keyCheck.hint }, 400);
      }
      apiKey = keyCheck.key;
    } else {
      const keyCheck = validateAnthropicApiKey(apiKey);
      if (!keyCheck.ok) {
        return json({ error: "Invalid Claude API key", code: "INVALID_API_KEY", hint: keyCheck.hint }, 400);
      }
      apiKey = keyCheck.key;
    }

    const rawPromptText = body?.promptText;
    const rawObjectTitle = body?.objectTitle;
    const rawObjectContent = body?.objectContent;
    if (!rawPromptText || typeof rawPromptText !== "string") {
      return json({ error: "promptText (string) is required" }, 400);
    }
    if (rawPromptText.length > MAX_PROMPT_TEXT) {
      return json({ error: `promptText must be at most ${MAX_PROMPT_TEXT} characters` }, 400);
    }
    const objectTitle =
      typeof rawObjectTitle === "string" ? rawObjectTitle.slice(0, MAX_OBJECT_TITLE) : "";
    const objectContent =
      typeof rawObjectContent === "string" ? rawObjectContent.slice(0, MAX_OBJECT_CONTENT) : "";

    const userMessage =
      (objectTitle || objectContent)
        ? `Document title: ${objectTitle}\n\nContent:\n${objectContent || "(none)"}\n\nTask:\n${rawPromptText}`
        : rawPromptText;

    const result = provider === "anthropic"
      ? await runClaude(apiKey, model, userMessage, usingServerKey)
      : await runDeepSeek(apiKey, model, userMessage, usingServerKey);

    if (!result.ok) return json(result.body, result.status);
    return json({ output: result.output, provider, model });
  } catch (_e) {
    return new Response(
      JSON.stringify({
        error: "Server error",
        hint: "Something went wrong on the server. Try again in a moment.",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
