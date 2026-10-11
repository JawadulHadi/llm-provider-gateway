import { describe, expect, it } from 'vitest';
import { AllProvidersFailedError, Gateway, MockProvider, ProviderError, backoffMs } from '../src';

const req = { messages: [{ role: 'user' as const, content: 'hi' }] };
const err = (name: string, kind: ConstructorParameters<typeof ProviderError>[1]) => new ProviderError(`${name} ${kind}`, kind, name);

function make(providers: MockProvider[], extra: Partial<ConstructorParameters<typeof Gateway>[1]> = {}) {
  const sleeps: number[] = [];
  const gw = new Gateway(providers, {
    maxRetries: 2, baseDelayMs: 1000, maxDelayMs: 8000, random: () => 0.5,
    sleep: async (ms) => { sleeps.push(ms); }, ...extra,
  });
  return { gw, sleeps };
}

describe('backoffMs', () => {
  it('doubles with equal jitter and respects the cap', () => {
    expect(backoffMs(1, 1000, 8000, () => 0)).toBe(500);
    expect(backoffMs(3, 1000, 8000, () => 1)).toBe(4000);
    expect(backoffMs(30, 1000, 8000, () => 1)).toBe(8000);
  });
});

describe('Gateway', () => {
  it('returns the first provider result', async () => {
    const a = new MockProvider('a', ['hello']);
    const { gw } = make([a]);
    const out = await gw.chat(req);
    expect(out.response.text).toBe('hello');
    expect(out.attempts).toHaveLength(1);
  });

  it('retries a retryable error on the same provider with jittered backoff', async () => {
    const a = new MockProvider('a', [err('a', 'rate_limit'), err('a', 'server'), 'finally']);
    const { gw, sleeps } = make([a]);
    expect((await gw.chat(req)).response.text).toBe('finally');
    expect(a.calls).toHaveLength(3);
    expect(sleeps).toEqual([750, 1500]);
  });

  it('falls back to the next provider after retries are exhausted', async () => {
    const a = new MockProvider('a', [err('a', 'server')], true);
    const b = new MockProvider('b', ['from b']);
    const { gw, sleeps } = make([a, b], { maxRetries: 1 });
    const out = await gw.chat(req);
    expect(out.response.provider).toBe('b');
    expect(a.calls).toHaveLength(2);
    expect(sleeps).toHaveLength(1);
    expect(out.attempts.map((x) => `${x.provider}:${x.ok}`)).toEqual(['a:false', 'a:false', 'b:true']);
  });

  it('does not retry auth errors but does fall back', async () => {
    const a = new MockProvider('a', [err('a', 'auth')]);
    const b = new MockProvider('b', ['ok']);
    const { gw, sleeps } = make([a, b]);
    expect((await gw.chat(req)).response.provider).toBe('b');
    expect(a.calls).toHaveLength(1);
    expect(sleeps).toHaveLength(0);
  });

  it('fails fast on bad requests instead of trying other providers', async () => {
    const a = new MockProvider('a', [err('a', 'bad_request')]);
    const b = new MockProvider('b', ['ok']);
    const { gw } = make([a, b]);
    await expect(gw.chat(req)).rejects.toBeInstanceOf(AllProvidersFailedError);
    expect(b.calls).toHaveLength(0);
  });

  it('enforces the timeout, aborts the signal and moves on', async () => {
    let signal: AbortSignal | undefined;
    const slow = new MockProvider('slow', [async (r) => { signal = r.signal; return new Promise<string>(() => {}); }]);
    const b = new MockProvider('b', ['fast']);
    const { gw } = make([slow, b], { timeoutMs: 20, maxRetries: 0 });
    const out = await gw.chat(req);
    expect(out.response.text).toBe('fast');
    expect(out.attempts[0].kind).toBe('timeout');
    expect(signal?.aborted).toBe(true);
  });

  it('opens the circuit after repeated failures, skips the provider, then recovers', async () => {
    let t = 0;
    const a = new MockProvider('a', [err('a', 'server'), err('a', 'server'), 'recovered']);
    const b = new MockProvider('b', ['b'], true);
    const { gw } = make([a, b], { maxRetries: 0, now: () => t, breaker: { failureThreshold: 2, cooldownMs: 1000 } });
    await gw.chat(req);
    await gw.chat(req); // second failure opens the circuit
    const third = await gw.chat(req);
    expect(third.attempts[0]).toMatchObject({ provider: 'a', skipped: 'circuit_open' });
    expect(a.calls).toHaveLength(2);
    t = 1001; // cooldown over, one trial allowed
    const fourth = await gw.chat(req);
    expect(fourth.response.text).toBe('recovered');
    expect(a.calls).toHaveLength(3);
  });

  it('computes cost from your price table and reports per-provider stats', async () => {
    const a = new MockProvider('a', ['x']);
    const { gw } = make([a], { prices: { 'a:mock': { inputPerMTok: 1_000_000, outputPerMTok: 2_000_000 } } });
    const out = await gw.chat(req);
    expect(out.costUsd).toBe(20); // 10 in * $1/token + 5 out * $2/token
    expect(gw.report().a).toMatchObject({ calls: 1, inputTokens: 10, outputTokens: 5, costUsd: 20 });
  });

  it('returns null cost when the model has no price', async () => {
    const { gw } = make([new MockProvider('a', ['x'])]);
    expect((await gw.chat(req)).costUsd).toBeNull();
  });

  it('reports every attempt when all providers fail', async () => {
    const a = new MockProvider('a', [err('a', 'auth')]);
    const b = new MockProvider('b', [err('b', 'server')], true);
    const { gw } = make([a, b], { maxRetries: 0 });
    const e = await gw.chat(req).catch((x) => x);
    expect(e).toBeInstanceOf(AllProvidersFailedError);
    expect(e.attempts.map((x: any) => x.provider)).toEqual(['a', 'b']);
  });

  it('requires at least one provider', () => {
    expect(() => new Gateway([])).toThrow();
  });
});
