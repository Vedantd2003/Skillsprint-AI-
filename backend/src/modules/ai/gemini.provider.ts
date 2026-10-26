import { ApiError, GoogleGenAI } from '@google/genai';
import { env } from '../../config/env';
import { logger } from '../../lib/logger';
import { AIProviderError, type AIProvider, type JsonRequest, type TextRequest, type Usage } from './provider';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Google Gemini via the official @google/genai SDK. Runs server-side only; the
 * API key is read from the environment and never leaves the backend.
 */
export class GeminiProvider implements AIProvider {
  readonly name = 'gemini';
  private client: GoogleGenAI;

  constructor(
    apiKey: string,
    readonly model: string = env.GEMINI_MODEL,
    private readonly timeoutMs = env.AI_TIMEOUT_MS,
    private readonly maxRetries = env.AI_MAX_RETRIES,
  ) {
    this.client = new GoogleGenAI({ apiKey, httpOptions: { timeout: timeoutMs } });
  }

  private async withRetry<T>(op: string, fn: (signal: AbortSignal) => Promise<T>): Promise<T> {
    let lastErr: AIProviderError | undefined;
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        return await fn(controller.signal);
      } catch (err) {
        lastErr = this.classify(err, controller.signal.aborted);
        logger.warn({ op, attempt, kind: lastErr.kind }, 'Gemini call failed');
        if (!lastErr.retryable || attempt === this.maxRetries) break;
        await sleep(400 * 2 ** attempt + Math.random() * 250);
      } finally {
        clearTimeout(timer);
      }
    }
    throw lastErr ?? new AIProviderError('unavailable', 'AI provider unavailable', false);
  }

  private classify(err: unknown, aborted: boolean): AIProviderError {
    if (err instanceof AIProviderError) return err;
    if (aborted || (err as Error)?.name === 'AbortError') return new AIProviderError('timeout', 'AI request timed out', true);
    if (err instanceof ApiError) {
      if (err.status === 429) return new AIProviderError('quota', 'AI provider rate limit or quota reached', true);
      if (err.status === 400) return new AIProviderError('bad_request', 'AI provider rejected the request', false);
      if (err.status === 401 || err.status === 403) return new AIProviderError('not_configured', 'AI provider credentials rejected', false);
      if (err.status >= 500) return new AIProviderError('unavailable', 'AI provider temporarily unavailable', true);
    }
    return new AIProviderError('unavailable', 'AI provider unavailable', true);
  }

  private usageOf(res: { usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number } }): Usage {
    return {
      inputTokens: res.usageMetadata?.promptTokenCount ?? 0,
      outputTokens: res.usageMetadata?.candidatesTokenCount ?? 0,
    };
  }

  async generateText(req: TextRequest) {
    return this.withRetry('text', async (abortSignal) => {
      const res = await this.client.models.generateContent({
        model: this.model,
        contents: req.messages.map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
        config: {
          systemInstruction: req.system,
          maxOutputTokens: req.maxOutputTokens ?? env.AI_MAX_OUTPUT_TOKENS,
          temperature: req.temperature ?? 0.6,
          abortSignal,
        },
      });
      const text = res.text?.trim();
      if (!text) {
        const reason = res.promptFeedback?.blockReason ?? res.candidates?.[0]?.finishReason;
        throw new AIProviderError(reason ? 'blocked' : 'invalid_output', 'AI returned no usable text', !reason);
      }
      return { text, usage: this.usageOf(res) };
    });
  }

  async generateJson(req: JsonRequest) {
    return this.withRetry('json', async (abortSignal) => {
      const res = await this.client.models.generateContent({
        model: this.model,
        contents: [{ role: 'user', parts: [{ text: req.prompt }] }],
        config: {
          systemInstruction: req.system,
          responseMimeType: 'application/json',
          responseJsonSchema: req.jsonSchema,
          maxOutputTokens: req.maxOutputTokens ?? env.AI_MAX_OUTPUT_TOKENS,
          temperature: req.temperature ?? 0.4,
          abortSignal,
        },
      });
      const text = res.text?.trim();
      if (!text) throw new AIProviderError('invalid_output', 'AI returned an empty response', true);
      try {
        return { data: JSON.parse(text) as unknown, usage: this.usageOf(res) };
      } catch {
        throw new AIProviderError('invalid_output', 'AI returned malformed JSON', true);
      }
    });
  }
}
