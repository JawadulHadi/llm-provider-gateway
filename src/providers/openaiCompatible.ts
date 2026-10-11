import { ChatRequest, ChatResponse, LLMProvider, ProviderError } from '../types';
import { FetchLike, postJson } from './http';

export interface OpenAICompatibleConfig {
  name: string; // e.g. 'openai', 'groq', 'openrouter', 'lmstudio'
  baseUrl: string; // e.g. https://api.openai.com/v1
  model: string;
  apiKey?: string;
  fetch?: FetchLike;
}

/** One adapter for every service that speaks the OpenAI chat-completions format. */
export class OpenAICompatibleProvider implements LLMProvider {
  readonly name: string;
  constructor(private cfg: OpenAICompatibleConfig) {
    this.name = cfg.name;
  }

  async chat(req: ChatRequest): Promise<ChatResponse> {
    const started = Date.now();
    const model = req.model ?? this.cfg.model;
    const data = await postJson(
      this.cfg.fetch ?? (fetch as unknown as FetchLike), this.name,
      `${this.cfg.baseUrl.replace(/\/$/, '')}/chat/completions`,
      this.cfg.apiKey ? { authorization: `Bearer ${this.cfg.apiKey}` } : {},
      { model, messages: req.messages, temperature: req.temperature, max_tokens: req.maxTokens },
      req.signal,
    );
    const text = data?.choices?.[0]?.message?.content;
    if (typeof text !== 'string') throw new ProviderError(`${this.name} response had no message content`, 'invalid_response', this.name);
    return {
      text, model: data.model ?? model, provider: this.name, latencyMs: Date.now() - started,
      usage: { inputTokens: data.usage?.prompt_tokens ?? 0, outputTokens: data.usage?.completion_tokens ?? 0 },
    };
  }
}
