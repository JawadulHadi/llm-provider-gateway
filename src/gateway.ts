import { backoffMs } from './backoff';
import { ChatRequest, ChatResponse, LLMProvider, ProviderError } from './types';

export interface Price {
  inputPerMTok: number; // USD per million input tokens. Supply your own, prices change.
  outputPerMTok: number;
}

export interface GatewayOptions {
  maxRetries?: number; // retries per provider after the first try
  baseDelayMs?: number;
  maxDelayMs?: number;
  timeoutMs?: number;
  breaker?: { failureThreshold: number; cooldownMs: number };
  prices?: Record<string, Price>; // key: `${provider}:${model}`
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
}

export interface Attempt {
  provider: string;
  ok: boolean;
  skipped?: 'circuit_open';
  error?: string;
  kind?: string;
  latencyMs: number;
}

export interface GatewayResult {
  response: ChatResponse;
  attempts: Attempt[];
  costUsd: number | null; // null when no price is configured for the model
}

export class AllProvidersFailedError extends Error {
  constructor(readonly attempts: Attempt[]) {
    super(`all providers failed: ${attempts.map((a) => `${a.provider}${a.skipped ? '(skipped)' : ''}`).join(', ')}`);
    this.name = 'AllProvidersFailedError';
  }
}

interface Health {
  failures: number;
  openUntil: number;
}

export interface ProviderStats {
  calls: number;
  failures: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  totalLatencyMs: number;
}

export class Gateway {
  private health = new Map<string, Health>();
  private ledger = new Map<string, ProviderStats>();
  private o: Required<Omit<GatewayOptions, 'breaker' | 'prices'>> & Pick<GatewayOptions, 'breaker' | 'prices'>;

  constructor(private providers: LLMProvider[], opts: GatewayOptions = {}) {
    if (providers.length === 0) throw new Error('at least one provider is required');
    this.o = {
      maxRetries: opts.maxRetries ?? 2, baseDelayMs: opts.baseDelayMs ?? 500, maxDelayMs: opts.maxDelayMs ?? 8000,
      timeoutMs: opts.timeoutMs ?? 30000, breaker: opts.breaker, prices: opts.prices,
      now: opts.now ?? Date.now, sleep: opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms))),
      random: opts.random ?? Math.random,
    };
  }

  private stats(name: string): ProviderStats {
    let s = this.ledger.get(name);
    if (!s) this.ledger.set(name, (s = { calls: 0, failures: 0, inputTokens: 0, outputTokens: 0, costUsd: 0, totalLatencyMs: 0 }));
    return s;
  }

  private isOpen(name: string): boolean {
    const h = this.health.get(name);
    return !!h && h.openUntil > this.o.now();
  }

  private recordFailure(name: string) {
    this.stats(name).failures++;
    const br = this.o.breaker;
    if (!br) return;
    const h = this.health.get(name) ?? { failures: 0, openUntil: 0 };
    h.failures++;
    if (h.failures >= br.failureThreshold) h.openUntil = this.o.now() + br.cooldownMs; // after cooldown one trial is allowed
    this.health.set(name, h);
  }

  private async callWithTimeout(p: LLMProvider, req: ChatRequest): Promise<ChatResponse> {
    const ctrl = new AbortController();
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        ctrl.abort();
        reject(new ProviderError(`${p.name} timed out after ${this.o.timeoutMs}ms`, 'timeout', p.name));
      }, this.o.timeoutMs);
    });
    try {
      return await Promise.race([p.chat({ ...req, signal: ctrl.signal }), timeout]);
    } finally {
      clearTimeout(timer);
    }
  }

  cost(res: ChatResponse): number | null {
    const price = this.o.prices?.[`${res.provider}:${res.model}`];
    if (!price) return null;
    return (res.usage.inputTokens * price.inputPerMTok + res.usage.outputTokens * price.outputPerMTok) / 1_000_000;
  }

  async chat(req: ChatRequest): Promise<GatewayResult> {
    const attempts: Attempt[] = [];
    for (const p of this.providers) {
      if (this.isOpen(p.name)) {
        attempts.push({ provider: p.name, ok: false, skipped: 'circuit_open', latencyMs: 0 });
        continue;
      }
      for (let n = 1; n <= this.o.maxRetries + 1; n++) {
        const started = this.o.now();
        try {
          const response = await this.callWithTimeout(p, req);
          this.health.delete(p.name);
          const costUsd = this.cost(response);
          const s = this.stats(p.name);
          s.calls++;
          s.inputTokens += response.usage.inputTokens;
          s.outputTokens += response.usage.outputTokens;
          s.costUsd += costUsd ?? 0;
          s.totalLatencyMs += response.latencyMs;
          attempts.push({ provider: p.name, ok: true, latencyMs: this.o.now() - started });
          return { response, attempts, costUsd };
        } catch (err) {
          const e = err instanceof ProviderError ? err : new ProviderError(String((err as Error).message), 'network', p.name);
          this.recordFailure(p.name);
          attempts.push({ provider: p.name, ok: false, error: e.message, kind: e.kind, latencyMs: this.o.now() - started });
          // The caller's request is wrong: another provider will reject it too.
          if (e.kind === 'bad_request') throw new AllProvidersFailedError(attempts);
          if (!e.retryable || n > this.o.maxRetries) break; // move on to the next provider
          await this.o.sleep(backoffMs(n, this.o.baseDelayMs, this.o.maxDelayMs, this.o.random));
        }
      }
    }
    throw new AllProvidersFailedError(attempts);
  }

  report(): Record<string, ProviderStats & { avgLatencyMs: number }> {
    return Object.fromEntries(
      [...this.ledger].map(([k, s]) => [k, { ...s, avgLatencyMs: s.calls ? Math.round(s.totalLatencyMs / s.calls) : 0 }]),
    );
  }
}
