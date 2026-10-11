import { ChatRequest, ChatResponse, LLMProvider, ProviderError } from '../types';

export type MockStep = string | ProviderError | ((req: ChatRequest) => Promise<string>);

/** Scripted provider for tests and offline development. */
export class MockProvider implements LLMProvider {
  calls: ChatRequest[] = [];
  constructor(readonly name: string, private script: MockStep[], private repeatLast = false) {}

  async chat(req: ChatRequest): Promise<ChatResponse> {
    this.calls.push(req);
    const i = Math.min(this.calls.length - 1, this.script.length - 1);
    const step = this.calls.length > this.script.length && !this.repeatLast ? undefined : this.script[i];
    if (step === undefined) throw new ProviderError(`${this.name} script exhausted`, 'server', this.name);
    if (step instanceof ProviderError) throw step;
    const text = typeof step === 'string' ? step : await step(req);
    return { text, model: 'mock', provider: this.name, latencyMs: 1, usage: { inputTokens: 10, outputTokens: 5 } };
  }
}
