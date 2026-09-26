// PKS Edge Function: run prompt with DeepSeek only
// Server: set DEEPSEEK_API_KEY in Edge Function Secrets.
// Or client can pass user_provider_id (UUID from user_ai_providers, deepseek only).
// Invoke: POST body { promptText, objectTitle?, objectContent?, model?, user_provider_id? }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { normalizeDeepSeekApiKey, validateDeepSeekApiKey, hintForDeepSeekAuthCode } from "./deepseekKey.ts";

const appOrigin = Deno.env.get("PKS_APP_ORIGIN") ?? "*";
const corsHeaders = {
  "Access-Control-Allow-Origin": appOrigin,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const RATE_LIMIT_PER_MINUTE = 20;
// Daily cap per user on the shared server key (users with their own key are not capped).
const SERVER_KEY_DAILY_LIMIT = Number(Deno.env.get("SERVER_KEY_DAILY_LIMIT") ?? "50") || 50;
const UPSTREAM_TIMEOUT_MS = 60_000;
const MAX_PROMPT_TEXT = 16_384;
const MAX_OBJECT_TITLE = 200;
const MAX_OBJECT_CONTENT = 50_000;
const DEEPSEEK_MODELS = ["deepseek-chat", "deepseek-reasoner"];
const DEFAULT_MODEL = "deepseek-chat";
const DEEPSEEK_API_URL = "https://api.deepseek.com/v1/chat/completions";

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

    let body: { promptText?: string; objectTitle?: string; objectContent?: string; model?: string; user_provider_id?: string };
    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const deepseekKey = Deno.env.get("DEEPSEEK_API_KEY");
    const userProviderId = typeof body?.user_provider_id === "string" ? body.user_provider_id.trim() || null : null;
    const requestedModel = typeof body?.model === "string" ? body.model.trim() : DEFAULT_MODEL;
    const model = DEEPSEEK_MODELS.includes(requestedModel) ? requestedModel : DEFAULT_MODEL;

    let apiKey: string;

    const usingServerKey = !userProviderId;

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
        return new Response(
          JSON.stringify({
            error: "Invalid or missing AI provider",
            code: "USER_PROVIDER_INVALID",
            hint: "The selected API key may have been removed. Check Settings → AI API keys.",
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (providerRow.provider_type !== "deepseek") {
        return new Response(
          JSON.stringify({
            error: "Only DeepSeek providers are supported",
            code: "PROVIDER_NOT_SUPPORTED",
            hint: "Add a DeepSeek API key in Settings → AI API keys.",
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      apiKey = providerRow.api_key;
    } else {
      if (!deepseekKey) {
        return new Response(
          JSON.stringify({
            error: "DeepSeek not configured",
            code: "DEEPSEEK_API_KEY_MISSING",
            hint: "Set DEEPSEEK_API_KEY in Edge Function Secrets or add your own DeepSeek key in Settings.",
          }),
          { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const { data: quota, error: quotaErr } = await supabase.rpc("consume_server_key_quota", {
        p_daily_limit: SERVER_KEY_DAILY_LIMIT,
      });
      const q = quota as { limited?: boolean } | null;
      if (quotaErr || q?.limited !== false) {
        return new Response(
          JSON.stringify({
            error: "Daily limit reached",
            code: "SERVER_KEY_QUOTA",
            hint: `The shared AI key allows ${SERVER_KEY_DAILY_LIMIT} runs per day. Add your own DeepSeek key in Settings → AI API keys to keep going.`,
          }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      apiKey = deepseekKey;
    }

    const keyCheck = validateDeepSeekApiKey(apiKey);
    if (!keyCheck.ok) {
      return new Response(
        JSON.stringify({ error: "Invalid DeepSeek API key", code: keyCheck.code, hint: keyCheck.hint }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    apiKey = keyCheck.key;

    const rawPromptText = body?.promptText;
    const rawObjectTitle = body?.objectTitle;
    const rawObjectContent = body?.objectContent;
    if (!rawPromptText || typeof rawPromptText !== "string") {
      return new Response(JSON.stringify({ error: "promptText (string) is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (rawPromptText.length > MAX_PROMPT_TEXT) {
      return new Response(
        JSON.stringify({ error: `promptText must be at most ${MAX_PROMPT_TEXT} characters` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const objectTitle =
      typeof rawObjectTitle === "string" ? rawObjectTitle.slice(0, MAX_OBJECT_TITLE) : "";
    const objectContent =
      typeof rawObjectContent === "string" ? rawObjectContent.slice(0, MAX_OBJECT_CONTENT) : "";

    const userMessage =
      (objectTitle || objectContent)
        ? `Document title: ${objectTitle}\n\nContent:\n${objectContent || "(none)"}\n\nTask:\n${rawPromptText}`
        : rawPromptText;

    const res = await fetch(DEEPSEEK_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: userMessage }],
        max_tokens: 4096,
      }),
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    }).catch((e) => {
      if (e instanceof DOMException && e.name === "TimeoutError") return null;
      throw e;
    });

    if (!res) {
      return new Response(
        JSON.stringify({ error: "AI request timed out", code: "UPSTREAM_TIMEOUT", hint: "Try again, or shorten the prompt." }),
        { status: 504, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
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
        upstreamCode =
          (typeof errObj === "object" && errObj?.code) ||
          errJson?.code ||
          upstreamCode;
      } catch {
        /* ignore parse errors */
      }
      if (usingServerKey) {
        // Upstream errors for the shared key can echo key fragments or config details; keep them server-side.
        console.error("DeepSeek error (server key)", res.status, upstreamCode, upstreamMessage);
        return new Response(
          JSON.stringify({ error: "AI request failed", code: "UPSTREAM_ERROR", hint: "Try again in a moment." }),
          { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const hint = hintForDeepSeekAuthCode(String(upstreamCode)) || upstreamMessage ||
        "Check your DeepSeek API key in Settings → AI API keys, or DEEPSEEK_API_KEY in Edge Function secrets.";
      return new Response(
        JSON.stringify({
          error: upstreamMessage || "AI request failed",
          code: upstreamCode,
          hint,
        }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await res.json();
    const output = data.choices?.[0]?.message?.content ?? "";
    return new Response(JSON.stringify({ output }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
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
