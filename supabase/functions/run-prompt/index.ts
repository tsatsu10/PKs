// PKS Edge Function: run prompt with OpenAI or DeepSeek
// Server: set OPENAI_API_KEY and/or DEEPSEEK_API_KEY in Edge Function Secrets.
// Or client can pass user_provider_id (UUID from user_ai_providers) to use their own API key.
// Invoke: POST body { promptText, objectTitle?, objectContent?, model?, user_provider_id? }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// In-memory rate limit: per user, per instance (for global limits use Redis/KV).
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 30;
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

    let body: { promptText?: string; objectTitle?: string; objectContent?: string; model?: string; user_provider_id?: string };
    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const OPENAI_MODELS = ["gpt-4.1-mini", "gpt-4.1", "gpt-4.1-nano", "gpt-4o-mini", "gpt-4o", "gpt-4-turbo", "gpt-4o-nano", "gpt-3.5-turbo"];
    const DEEPSEEK_MODELS = ["deepseek-chat", "deepseek-reasoner"];
    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    const deepseekKey = Deno.env.get("DEEPSEEK_API_KEY");
    const userProviderId = typeof body?.user_provider_id === "string" ? body.user_provider_id.trim() || null : null;

    let apiKey: string;
    let useDeepSeek: boolean;
    let model: string;
    const requestedModel = typeof body?.model === "string" ? body.model.trim() : "gpt-4.1-mini";

    if (userProviderId) {
      const { data: providerRow, error: providerErr } = await supabase
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
      apiKey = providerRow.api_key;
      useDeepSeek = providerRow.provider_type === "deepseek";
      const allowedModels = useDeepSeek ? DEEPSEEK_MODELS : OPENAI_MODELS;
      model = allowedModels.includes(requestedModel) ? requestedModel : allowedModels[0];
    } else {
      const hasOpenAI = Boolean(openaiKey);
      const hasDeepSeek = Boolean(deepseekKey);
      if (!hasOpenAI && !hasDeepSeek) {
        return new Response(
          JSON.stringify({
            error: "AI not configured",
            code: "AI_NOT_CONFIGURED",
            hint: "Set OPENAI_API_KEY and/or DEEPSEEK_API_KEY in Edge Function Secrets, or add your own key in Settings → AI API keys.",
          }),
          { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const isDeepSeek = DEEPSEEK_MODELS.includes(requestedModel);
      const isOpenAI = OPENAI_MODELS.includes(requestedModel);
      model = isDeepSeek ? requestedModel : isOpenAI ? requestedModel : "gpt-4.1-mini";
      useDeepSeek = DEEPSEEK_MODELS.includes(model);
      if (useDeepSeek && !deepseekKey) {
        return new Response(
          JSON.stringify({
            error: "DeepSeek not configured",
            code: "DEEPSEEK_API_KEY_MISSING",
            hint: "Set DEEPSEEK_API_KEY in Edge Function Secrets or add your own DeepSeek key in Settings.",
          }),
          { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (!useDeepSeek && !openaiKey) {
        return new Response(
          JSON.stringify({
            error: "OpenAI not configured",
            code: "OPENAI_API_KEY_MISSING",
            hint: "Set OPENAI_API_KEY in Edge Function Secrets or add your own OpenAI key in Settings.",
          }),
          { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      apiKey = useDeepSeek ? deepseekKey! : openaiKey!;
    }

    const { promptText, objectTitle = "", objectContent = "" } = body ?? {};
    if (!promptText || typeof promptText !== "string") {
      return new Response(JSON.stringify({ error: "promptText (string) is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userMessage =
      (objectTitle || objectContent)
        ? `Document title: ${objectTitle}\n\nContent:\n${objectContent || "(none)"}\n\nTask:\n${promptText}`
        : promptText;

    const apiUrl = useDeepSeek
      ? "https://api.deepseek.com/v1/chat/completions"
      : "https://api.openai.com/v1/chat/completions";

    const res = await fetch(apiUrl, {
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
    });

    if (!res.ok) {
      const err = await res.text();
      let detail = err;
      try {
        const parsed = JSON.parse(err);
        detail = parsed.error?.message ?? parsed.error ?? err;
      } catch {
        /* use raw err */
      }
      return new Response(
        JSON.stringify({
          error: "AI request failed",
          code: useDeepSeek ? "DEEPSEEK_ERROR" : "OPENAI_ERROR",
          detail: detail.slice(0, 500),
        }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await res.json();
    const output = data.choices?.[0]?.message?.content ?? "";
    return new Response(JSON.stringify({ output }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return new Response(
      JSON.stringify({
        error: "Server error",
        detail: message.slice(0, 300),
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
