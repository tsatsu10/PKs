/** Pure run-prompt logic: provider config, request validation, model choice, message building. */

export type Provider = "deepseek" | "anthropic";

export const LIMITS = { MAX_PROMPT_TEXT: 16_384, MAX_OBJECT_TITLE: 200, MAX_OBJECT_CONTENT: 50_000 } as const;

export const PROVIDERS: Record<Provider, {
  label: string;
  serverKeyEnv: string;
  userModels: string[];
  userDefault: string;
  serverModels: string[];
  serverDefault: string;
}> = {
  deepseek: {
    label: "DeepSeek",
    serverKeyEnv: "DEEPSEEK_API_KEY",
    userModels: ["deepseek-chat", "deepseek-reasoner"],
    userDefault: "deepseek-chat",
    serverModels: ["deepseek-chat", "deepseek-reasoner"],
    serverDefault: "deepseek-chat",
  },
  anthropic: {
    label: "Claude",
    serverKeyEnv: "ANTHROPIC_API_KEY",
    userModels: ["claude-opus-5", "claude-sonnet-5"],
    userDefault: "claude-opus-5",
    // Shared server key: the cheaper model only (owner decision 2026-09-27).
    serverModels: ["claude-sonnet-5"],
    serverDefault: "claude-sonnet-5",
  },
};

export function isProvider(v: unknown): v is Provider {
  return v === "deepseek" || v === "anthropic";
}

/** The model actually used: requested if allowed for this key type, else the default. */
export function pickModel(provider: Provider, requested: string, usingServerKey: boolean): string {
  const cfg = PROVIDERS[provider];
  const allowed = usingServerKey ? cfg.serverModels : cfg.userModels;
  return allowed.includes(requested) ? requested : (usingServerKey ? cfg.serverDefault : cfg.userDefault);
}

/** Per-user daily counters a server-key run consumes, in order (the global cap is separate). */
export function serverKeyCaps(provider: Provider, limits: { total: number; anthropic: number }): Array<{ scope: string; limit: number }> {
  const caps = [{ scope: "server_key", limit: limits.total }];
  if (provider === "anthropic") caps.push({ scope: "server_key:anthropic", limit: limits.anthropic });
  return caps;
}

/** Masks API-key-shaped tokens (sk-…, including sk-ant-…) before text is logged or stored. */
export function redactSecrets(text: string): string {
  return text.replace(/\bsk-[A-Za-z0-9_-]{8,}/g, "sk-***");
}

/** The prompt_runs.output recorded for a failed or refused run: the user-facing error. */
export function failedRunOutput(body: Record<string, unknown>): string {
  const error = typeof body.error === "string" && body.error ? body.error : "AI request failed";
  return redactSecrets(error);
}

export function buildUserMessage(title: string, content: string, prompt: string): { message: string; truncated: boolean } {
  const t = title.slice(0, LIMITS.MAX_OBJECT_TITLE);
  const truncated = content.length > LIMITS.MAX_OBJECT_CONTENT;
  const c = content.slice(0, LIMITS.MAX_OBJECT_CONTENT);
  if (!t && !c) return { message: prompt, truncated: false };
  return { message: `Document title: ${t}\n\nContent:\n${c || "(none)"}\n\nTask:\n${prompt}`, truncated };
}

export type RunRequest = {
  promptText: string;
  objectId: string | null;
  promptTemplateId: string | null;
  legacyTitle: string;
  legacyContent: string;
  provider: Provider | null;
  model: string;
  userProviderId: string | null;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const optionalUuid = (v: unknown): string | null | undefined =>
  v == null || v === "" ? null : (typeof v === "string" && UUID.test(v) ? v : undefined);

export function parseRunRequest(body: unknown): { ok: true; value: RunRequest } | { ok: false; error: string } {
  if (!body || typeof body !== "object") return { ok: false, error: "Invalid JSON body" };
  const b = body as Record<string, unknown>;
  if (typeof b.promptText !== "string" || !b.promptText.trim()) return { ok: false, error: "promptText (string) is required" };
  if (b.promptText.length > LIMITS.MAX_PROMPT_TEXT) {
    return { ok: false, error: `promptText must be at most ${LIMITS.MAX_PROMPT_TEXT} characters` };
  }
  const objectId = optionalUuid(b.object_id);
  const promptTemplateId = optionalUuid(b.prompt_template_id);
  const userProviderId = optionalUuid(b.user_provider_id);
  if (objectId === undefined || promptTemplateId === undefined || userProviderId === undefined) {
    return { ok: false, error: "object_id, prompt_template_id and user_provider_id must be UUIDs" };
  }
  return {
    ok: true,
    value: {
      promptText: b.promptText,
      objectId,
      promptTemplateId,
      legacyTitle: typeof b.objectTitle === "string" ? b.objectTitle : "",
      legacyContent: typeof b.objectContent === "string" ? b.objectContent : "",
      provider: isProvider(b.provider) ? b.provider : null,
      model: typeof b.model === "string" ? b.model.trim() : "",
      userProviderId,
    },
  };
}
