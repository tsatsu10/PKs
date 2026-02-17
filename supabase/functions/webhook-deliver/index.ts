// PKS Edge Function: deliver webhook events to user-configured URLs
// Integrations with type 'webhook' and config { url, events?: string[] } receive POST on matching events.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
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

    const { event, payload } = await req.json();
    if (!event || typeof event !== "string") {
      return new Response(JSON.stringify({ error: "event required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: integrations } = await supabase
      .from("integrations")
      .select("id, config")
      .eq("type", "webhook")
      .eq("enabled", true);

    const toCall = (integrations ?? []).filter((i) => {
      const events = i.config?.events;
      return !events || !Array.isArray(events) || events.includes(event);
    });

    const results = await Promise.allSettled(
      toCall.map(async (i) => {
        const url = i.config?.url;
        if (!url || typeof url !== "string") return;
        const body = JSON.stringify({ event, payload: payload ?? {}, timestamp: new Date().toISOString() });
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
          "User-Agent": "PKS-Webhook/1.0",
          "X-PKS-Event": event,
        };
        if (i.config?.secret) {
          const enc = new TextEncoder();
          const key = await crypto.subtle.importKey(
            "raw",
            enc.encode(i.config.secret),
            { name: "HMAC", hash: "SHA-256" },
            false,
            ["sign"]
          );
          const sig = await crypto.subtle.sign("HMAC", key, enc.encode(body));
          headers["X-PKS-Signature"] = btoa(String.fromCharCode(...new Uint8Array(sig)));
        }
        await fetch(url, { method: "POST", headers, body });
      })
    );

    const delivered = results.filter((r) => r.status === "fulfilled").length;
    return new Response(
      JSON.stringify({ delivered, total: toCall.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ error: String(e?.message ?? e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
