/** Client Ollama Cloud structured output — portage de src/04_coaching/llm_client.py. */

export class LLMError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LLMError";
  }
}

export interface GenerateOpts {
  apiKey: string;
  temperature?: number;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  sleepImpl?: (milliseconds: number) => Promise<void>;
}

const MAX_ATTEMPTS = 4;

interface OllamaStreamChunk {
  message?: { content?: string };
  error?: unknown;
}

async function readStreamedContent(response: Response): Promise<string> {
  if (!response.body) throw new Error("missing Ollama response stream");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let pending = "";
  let content = "";

  const consumeLine = (rawLine: string) => {
    const line = rawLine.trim();
    if (!line) return;

    let chunk: OllamaStreamChunk;
    try {
      chunk = JSON.parse(line) as OllamaStreamChunk;
    } catch {
      throw new Error("invalid Ollama NDJSON stream");
    }
    if (chunk.error !== undefined) {
      const detail = typeof chunk.error === "string"
        ? chunk.error
        : JSON.stringify(chunk.error);
      throw new Error(`Ollama generation error: ${detail}`);
    }
    if (typeof chunk.message?.content === "string") {
      content += chunk.message.content;
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    pending += decoder.decode(value, { stream: !done });
    const lines = pending.split("\n");
    pending = lines.pop() ?? "";
    for (const line of lines) consumeLine(line);
    if (done) break;
  }
  consumeLine(pending);
  return content;
}

export async function generateJson(
  model: string,
  system: string,
  user: string,
  schema: unknown,
  opts: GenerateOpts,
): Promise<Record<string, unknown>> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const sleep = opts.sleepImpl
    ?? ((milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds)));
  const temperature = opts.temperature ?? 0.2;
  const timeoutMs = opts.timeoutMs ?? 180_000;
  let lastReason = "unexpected response";

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetchImpl("https://ollama.com/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${opts.apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
          format: schema,
          // Ollama Cloud est lui-même derrière Cloudflare. Sans streaming, une
          // génération > 125 s ne renvoie aucun octet et finit en HTTP 524.
          stream: true,
          options: { temperature },
        }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (response.status !== 429 && response.status < 500 && !response.ok) {
        throw new LLMError(`Ollama HTTP ${response.status} (authentication/invalid request)`);
      }
      if (!response.ok) lastReason = `HTTP ${response.status}`;
      if (response.ok) {
        const content = await readStreamedContent(response);
        try {
          const parsed = JSON.parse(content) as unknown;
          if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
            return parsed as Record<string, unknown>;
          }
          lastReason = "contenu JSON non objet";
        } catch {
          // Une réponse JSON Ollama dont le contenu n'est pas JSON est retentée.
          lastReason = "contenu LLM non JSON";
        }
      }
    } catch (error) {
      if (error instanceof LLMError) throw error;
      // Timeout, erreur réseau et réponse Ollama non JSON sont retentés.
      lastReason = error instanceof Error ? error.message : String(error);
    }
    if (attempt < MAX_ATTEMPTS - 1) await sleep(2_000 * (attempt + 1));
  }
  throw new LLMError(
    `Ollama failed after ${MAX_ATTEMPTS} attempts (last reason: ${lastReason})`,
  );
}
