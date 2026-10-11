import { ChatRequest, ChatResponse, LLMProvider, ProviderError } from '../types';
import { FetchLike, postJson } from './http';

export interface OllamaConfig {
  model: string;
  host?: string;
  fetch?: FetchLike;
}

/** Local models through Ollama's native API. Free and private. */
export class OllamaProvider implements LLMProvider {
  readonly name = 'ollama';
  constructor(private cfg: OllamaConfig) {}

  async chat(req: ChatRequest): Promise<ChatResponse> {
    const started = Date.now();
    const model = req.model ?? this.cfg.model;
    const data = await postJson(
      this.cfg.fetch ?? (fetch as unknown as FetchLike), this.name,
      `${(this.cfg.host ?? 'http://localhost:11434').replace(/\/$/, '')}/api/chat`, {},
      { model, messages: req.messages, stream: false, options: { temperature: req.temperature ?? 0, num_predict: req.maxTokens } },
      req.signal,
    );
    const text = data?.message?.content;
    if (typeof text !== 'string') throw new ProviderError('ollama response had no message content', 'invalid_response', this.name);
    return {
      text, model, provider: this.name, latencyMs: Date.now() - started,
      usage: { inputTokens: data.prompt_eval_count ?? 0, outputTokens: data.eval_count ?? 0 },
    };
  }
}
