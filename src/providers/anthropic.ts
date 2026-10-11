import { ChatRequest, ChatResponse, LLMProvider, ProviderError } from '../types';
import { FetchLike, postJson } from './http';

export interface AnthropicConfig {
  apiKey: string;
  model: string;
  baseUrl?: string;
  fetch?: FetchLike;
}

/** Same interface, different wire format: system prompt is a separate field and content is blocks. */
export class AnthropicProvider implements LLMProvider {
  readonly name = 'anthropic';
  constructor(private cfg: AnthropicConfig) {}

  async chat(req: ChatRequest): Promise<ChatResponse> {
    const started = Date.now();
    const model = req.model ?? this.cfg.model;
    const system = req.messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');
    const messages = req.messages.filter((m) => m.role !== 'system');
    const data = await postJson(
      this.cfg.fetch ?? (fetch as unknown as FetchLike), this.name,
      `${(this.cfg.baseUrl ?? 'https://api.anthropic.com').replace(/\/$/, '')}/v1/messages`,
      { 'x-api-key': this.cfg.apiKey, 'anthropic-version': '2023-06-01' },
      { model, max_tokens: req.maxTokens ?? 1024, temperature: req.temperature, ...(system ? { system } : {}), messages },
      req.signal,
    );
    const blocks: any[] = Array.isArray(data?.content) ? data.content : [];
    const text = blocks.filter((b) => b.type === 'text').map((b) => b.text).join('');
    if (!text) throw new ProviderError('anthropic response had no text content', 'invalid_response', this.name);
    return {
      text, model: data.model ?? model, provider: this.name, latencyMs: Date.now() - started,
      usage: { inputTokens: data.usage?.input_tokens ?? 0, outputTokens: data.usage?.output_tokens ?? 0 },
    };
  }
}
