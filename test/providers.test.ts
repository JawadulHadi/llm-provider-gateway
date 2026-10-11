import { describe, expect, it } from 'vitest';
import { AnthropicProvider, OllamaProvider, OpenAICompatibleProvider, ProviderError } from '../src';
import { Captured, fakeFetch } from './helpers';

const msgs = [{ role: 'system' as const, content: 'be brief' }, { role: 'user' as const, content: 'hi' }];

describe('OpenAICompatibleProvider', () => {
  const ok = { model: 'm1', choices: [{ message: { content: 'hello' } }], usage: { prompt_tokens: 7, completion_tokens: 3 } };

  it('sends the OpenAI format and parses text and usage', async () => {
    const cap: Captured[] = [];
    const p = new OpenAICompatibleProvider({ name: 'groq', baseUrl: 'https://x.test/v1/', model: 'm1', apiKey: 'k', fetch: fakeFetch(200, ok, cap) });
    const res = await p.chat({ messages: msgs, temperature: 0.2, maxTokens: 50 });
    expect(res).toMatchObject({ text: 'hello', provider: 'groq', model: 'm1', usage: { inputTokens: 7, outputTokens: 3 } });
    expect(cap[0].url).toBe('https://x.test/v1/chat/completions');
    expect(cap[0].init.headers.authorization).toBe('Bearer k');
    expect(JSON.parse(cap[0].init.body)).toMatchObject({ model: 'm1', max_tokens: 50, temperature: 0.2 });
  });

  it('omits the auth header when there is no key (local servers)', async () => {
    const cap: Captured[] = [];
    const p = new OpenAICompatibleProvider({ name: 'lmstudio', baseUrl: 'http://localhost:1234/v1', model: 'm', fetch: fakeFetch(200, ok, cap) });
    await p.chat({ messages: msgs });
    expect(cap[0].init.headers.authorization).toBeUndefined();
  });

  it.each([
    [429, 'rate_limit', true], [500, 'server', true], [503, 'server', true],
    [401, 'auth', false], [403, 'auth', false], [400, 'bad_request', false],
  ])('maps HTTP %i to %s (retryable=%s)', async (status, kind, retryable) => {
    const p = new OpenAICompatibleProvider({ name: 'p', baseUrl: 'http://x', model: 'm', fetch: fakeFetch(status as number, 'nope') });
    const err = await p.chat({ messages: msgs }).catch((e) => e);
    expect(err).toBeInstanceOf(ProviderError);
    expect(err.kind).toBe(kind);
    expect(err.retryable).toBe(retryable);
  });

  it('maps network failures, non-JSON and missing content', async () => {
    const boom = new OpenAICompatibleProvider({ name: 'p', baseUrl: 'http://x', model: 'm', fetch: async () => { throw new Error('ECONNRESET'); } });
    expect((await boom.chat({ messages: msgs }).catch((e) => e)).kind).toBe('network');
    const junk = new OpenAICompatibleProvider({ name: 'p', baseUrl: 'http://x', model: 'm', fetch: fakeFetch(200, '<html>') });
    expect((await junk.chat({ messages: msgs }).catch((e) => e)).kind).toBe('invalid_response');
    const empty = new OpenAICompatibleProvider({ name: 'p', baseUrl: 'http://x', model: 'm', fetch: fakeFetch(200, { choices: [] }) });
    expect((await empty.chat({ messages: msgs }).catch((e) => e)).kind).toBe('invalid_response');
  });

  it('reports an aborted request as a timeout', async () => {
    const ctrl = new AbortController();
    const p = new OpenAICompatibleProvider({ name: 'p', baseUrl: 'http://x', model: 'm', fetch: async () => { ctrl.abort(); throw new Error('aborted'); } });
    expect((await p.chat({ messages: msgs, signal: ctrl.signal }).catch((e) => e)).kind).toBe('timeout');
  });
});

describe('AnthropicProvider', () => {
  it('moves the system prompt out of messages and joins text blocks', async () => {
    const cap: Captured[] = [];
    const body = { model: 'claude-x', content: [{ type: 'text', text: 'he' }, { type: 'tool_use' }, { type: 'text', text: 'llo' }], usage: { input_tokens: 4, output_tokens: 2 } };
    const p = new AnthropicProvider({ apiKey: 'k', model: 'claude-x', fetch: fakeFetch(200, body, cap) });
    const res = await p.chat({ messages: msgs });
    expect(res).toMatchObject({ text: 'hello', provider: 'anthropic', usage: { inputTokens: 4, outputTokens: 2 } });
    const sent = JSON.parse(cap[0].init.body);
    expect(sent.system).toBe('be brief');
    expect(sent.messages).toEqual([{ role: 'user', content: 'hi' }]);
    expect(sent.max_tokens).toBe(1024);
    expect(cap[0].init.headers['x-api-key']).toBe('k');
    expect(cap[0].url).toBe('https://api.anthropic.com/v1/messages');
  });

  it('rejects a response with no text', async () => {
    const p = new AnthropicProvider({ apiKey: 'k', model: 'm', fetch: fakeFetch(200, { content: [] }) });
    expect((await p.chat({ messages: msgs }).catch((e) => e)).kind).toBe('invalid_response');
  });
});

describe('OllamaProvider', () => {
  it('uses the native chat API and token counters', async () => {
    const cap: Captured[] = [];
    const p = new OllamaProvider({ model: 'llama3.2', fetch: fakeFetch(200, { message: { content: 'yo' }, prompt_eval_count: 9, eval_count: 2 }, cap) });
    const res = await p.chat({ messages: msgs });
    expect(res).toMatchObject({ text: 'yo', provider: 'ollama', usage: { inputTokens: 9, outputTokens: 2 } });
    expect(cap[0].url).toBe('http://localhost:11434/api/chat');
    expect(JSON.parse(cap[0].init.body).stream).toBe(false);
  });
});
