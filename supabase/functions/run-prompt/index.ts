// PKS Edge Function: run prompt with OpenAI
// Set OPENAI_API_KEY in Supabase: Project Settings → Edge Functions → Secrets
// Invoke: POST body { promptText: string, objectTitle?: string, objectContent?: string, model?: string }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const apiKey = Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) {
      return new Response(
        JSON.stringify({
          error: "AI not configured",
          code: "OPENAI_API_KEY_MISSING",
          hint: "Set OPENAI_API_KEY in Supabase: Project Settings → Edge Functions → Secrets to enable Generate with AI.",
        }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

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

    let body: { promptText?: string; objectTitle?: string; objectContent?: string; model?: string };
    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { promptText, objectTitle = "", objectContent = "", model = "gpt-4o-mini" } = body ?? {};
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

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
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
          code: "OPENAI_ERROR",
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
