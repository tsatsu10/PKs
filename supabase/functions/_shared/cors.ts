/**
 * CORS headers for the single allowed app origin (PKS_APP_ORIGIN).
 * Returns null when the origin is unset or a wildcard, so callers fail closed
 * instead of serving every site.
 */
export function corsHeaders(origin: string | null | undefined = Deno.env.get("PKS_APP_ORIGIN")): Record<string, string> | null {
  if (!origin || origin === "*") return null;
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}
