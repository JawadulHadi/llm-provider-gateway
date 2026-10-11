export type Role = 'system' | 'user' | 'assistant';

export interface ChatMessage {
  role: Role;
  content: string;
}

export interface ChatRequest {
  messages: ChatMessage[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
}

export interface Usage {
  inputTokens: number;
  outputTokens: number;
}

export interface ChatResponse {
  text: string;
  model: string;
  provider: string;
  usage: Usage;
  latencyMs: number;
}

export interface LLMProvider {
  readonly name: string;
  chat(req: ChatRequest): Promise<ChatResponse>;
}

export type ErrorKind = 'rate_limit' | 'timeout' | 'server' | 'network' | 'auth' | 'bad_request' | 'invalid_response';

/** Every adapter maps its failures to this, so the gateway never parses provider-specific errors. */
export class ProviderError extends Error {
  constructor(
    message: string,
    readonly kind: ErrorKind,
    readonly provider: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'ProviderError';
  }
  /** Worth retrying on the same provider. */
  get retryable(): boolean {
    return this.kind === 'rate_limit' || this.kind === 'server' || this.kind === 'network' || this.kind === 'timeout';
  }
}

export function errorFromStatus(provider: string, status: number, body: string): ProviderError {
  const msg = `${provider} responded ${status}: ${body.slice(0, 200)}`;
  if (status === 429) return new ProviderError(msg, 'rate_limit', provider, status);
  if (status === 401 || status === 403) return new ProviderError(msg, 'auth', provider, status);
  if (status >= 500) return new ProviderError(msg, 'server', provider, status);
  return new ProviderError(msg, 'bad_request', provider, status);
}
