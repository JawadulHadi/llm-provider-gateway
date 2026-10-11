// Needs Ollama running locally:  npx tsx examples/ollama-with-fallback.ts
import { Gateway, LLMProvider, OllamaProvider, OpenAICompatibleProvider } from '../src';

const providers: LLMProvider[] = [new OllamaProvider({ model: 'llama3.2' })];
if (process.env.GROQ_API_KEY) {
  providers.push(new OpenAICompatibleProvider({
    name: 'groq', baseUrl: 'https://api.groq.com/openai/v1', model: 'llama-3.1-8b-instant',
    apiKey: process.env.GROQ_API_KEY,
  }));
}

const gateway = new Gateway(providers, {
  maxRetries: 1, timeoutMs: 20000, breaker: { failureThreshold: 3, cooldownMs: 30000 },
});

gateway.chat({ messages: [{ role: 'user', content: 'Say hello in five words.' }] })
  .then((r) => console.log(r.response.text, r.attempts, gateway.report()))
  .catch((e) => console.error(e.message));
