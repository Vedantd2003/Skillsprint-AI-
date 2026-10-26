/**
 * Provider-agnostic AI interface. The app talks only to this interface, so
 * Gemini can be swapped for another model provider without touching routes.
 */
export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface TextRequest {
  system: string;
  messages: ChatTurn[];
  maxOutputTokens?: number;
  temperature?: number;
}

export interface JsonRequest {
  system: string;
  prompt: string;
  /** JSON Schema passed to the model for structured output. */
  jsonSchema: Record<string, unknown>;
  maxOutputTokens?: number;
  temperature?: number;
}

export interface Usage {
  inputTokens: number;
  outputTokens: number;
}

export interface AIProvider {
  readonly name: string;
  readonly model: string;
  generateText(req: TextRequest): Promise<{ text: string; usage: Usage }>;
  generateJson(req: JsonRequest): Promise<{ data: unknown; usage: Usage }>;
}

export type AIErrorKind = 'not_configured' | 'quota' | 'unavailable' | 'timeout' | 'blocked' | 'invalid_output' | 'bad_request';

export class AIProviderError extends Error {
  constructor(
    public readonly kind: AIErrorKind,
    message: string,
    public readonly retryable = false,
  ) {
    super(message);
    this.name = 'AIProviderError';
  }
}
