import { eq } from "drizzle-orm";
import { getDb, schema as s } from "@/db";

export type Purpose = "chat" | "planning" | "research" | "writing";

export type ChatMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: ToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

export type ToolCall = { id: string; type: "function"; function: { name: string; arguments: string } };

export type ToolDef = {
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
};

export class LlmUnavailable extends Error {}

const PROVIDERS: Record<string, { baseUrl: string; keyEnv: string }> = {
  groq: { baseUrl: "https://api.groq.com/openai/v1", keyEnv: "GROQ_API_KEY" },
};
// Test hook: LLM_TEST_URL points every purpose at a local OpenAI-compatible mock (never set in production).
if (process.env.LLM_TEST_URL && process.env.NODE_ENV !== "production") {
  PROVIDERS.groq = { baseUrl: process.env.LLM_TEST_URL, keyEnv: "GROQ_API_KEY" };
}

/**
 * The one door to every AI model. Provider + model come from the llm_settings table
 * (changeable without a deploy); every call is logged with its tokens.
 */
export async function llm(opts: {
  purpose: Purpose;
  actor: string;
  messages: ChatMessage[];
  tools?: ToolDef[];
  json?: boolean;
  maxTokens?: number;
}): Promise<{ content: string; toolCalls: ToolCall[] }> {
  const db = await getDb();
  const [setting] = await db.select().from(s.llmSettings).where(eq(s.llmSettings.purpose, opts.purpose));
  const provider = setting?.provider ?? "groq";
  const model = setting?.model ?? "llama-3.3-70b-versatile";
  const temperature = Number(setting?.temperature ?? 0.4);
  const p = PROVIDERS[provider];
  const key = p ? process.env[p.keyEnv] : undefined;
  if (!p || !key) throw new LlmUnavailable(`No API key for provider "${provider}"`);

  const started = Date.now();
  const body: Record<string, unknown> = {
    model,
    temperature,
    messages: opts.messages,
    max_tokens: opts.maxTokens ?? 2048,
  };
  if (opts.tools?.length) {
    body.tools = opts.tools;
    body.tool_choice = "auto";
  }
  if (opts.json) body.response_format = { type: "json_object" };

  let res: Response | null = null;
  let errText = "";
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      res = await fetch(`${p.baseUrl}/chat/completions`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(60000),
      });
    } catch (e) {
      errText = (e as Error).message;
      res = null;
    }
    if (res && res.status !== 429 && res.status < 500) break;
    if (res) errText = await res.text();
    await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
  }

  const log = async (ok: boolean, usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number }, error?: string) => {
    await db.insert(s.llmCalls).values({
      purpose: opts.purpose,
      provider,
      model,
      actor: opts.actor,
      promptTokens: usage?.prompt_tokens ?? 0,
      completionTokens: usage?.completion_tokens ?? 0,
      totalTokens: usage?.total_tokens ?? 0,
      durationMs: Date.now() - started,
      ok,
      error: error?.slice(0, 500),
    });
  };

  if (!res || !res.ok) {
    const msg = res ? `${res.status} ${errText || (await res.text())}` : errText;
    await log(false, undefined, msg);
    if (res && (res.status === 401 || res.status === 403)) throw new LlmUnavailable(`AI provider refused the key (${res.status})`);
    throw new LlmUnavailable(`AI call failed: ${msg.slice(0, 200)}`);
  }
  const data = (await res.json()) as {
    choices: { message: { content: string | null; tool_calls?: ToolCall[] } }[];
    usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
  };
  await log(true, data.usage);
  const msg = data.choices[0]?.message;
  return { content: msg?.content ?? "", toolCalls: msg?.tool_calls ?? [] };
}

/** Ask for JSON and parse it; tolerant of code fences. */
export async function llmJson<T>(opts: Omit<Parameters<typeof llm>[0], "json">): Promise<T> {
  const { content } = await llm({ ...opts, json: true });
  const cleaned = content.replace(/^```(json)?/m, "").replace(/```\s*$/m, "").trim();
  return JSON.parse(cleaned) as T;
}

export const HOUSE_RULES = `House rules (always apply):
- Use only facts from the approved Brand facts list given to you. Never invent figures, customers, savings, certifications or claims.
- If a sentence needs a number that is not in the facts, write [NUMBER NEEDED: what] instead of guessing.
- Agents never publish. You draft; managers review and rank; Fateh (Head of Marketing) or a named human approves.
- Brands: Ornate Solar (solar EPC and products, in business since 1998) and UnityESS (lithium-ion battery energy storage, own 8.5 GWh factory in Ghiloth, Rajasthan).
- Write in plain, warm, specific English for Indian business readers unless another language is asked for.`;
