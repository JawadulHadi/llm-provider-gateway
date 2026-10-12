import { z } from 'zod';
import { Gateway } from './gateway';
import { MockProvider } from './providers/mock';
import { chatJson } from './structured';
import { ProviderError } from './types';

/**
 * Offline demo for the hosted page. Mock providers stand in for real ones, so no API key is
 * needed and nothing is billed: the primary rate-limits until its retries run out and its circuit
 * opens, the fallback first returns prose, and chatJson repairs it into validated JSON.
 */
export async function runDemo() {
  const rateLimited = () => new ProviderError('primary responded 429: rate limited', 'rate_limit', 'primary', 429);
  const primary = new MockProvider('primary', [rateLimited()], true);
  const fallback = new MockProvider('fallback', [
    'Sure! The person is Ada and she is 36.',
    '{"name": "Ada", "age": 36}',
  ]);
  const delays: number[] = [];
  const gateway = new Gateway([primary, fallback], {
    maxRetries: 2,
    baseDelayMs: 500,
    sleep: async (ms) => { delays.push(ms); }, // record the backoff instead of waiting
    random: () => 0.5,
    breaker: { failureThreshold: 3, cooldownMs: 60_000 }, // the repair call skips the primary
    prices: { 'fallback:mock': { inputPerMTok: 0.05, outputPerMTok: 0.08 } }, // example numbers
  });
  const { data, result, repairs } = await chatJson(
    gateway,
    { messages: [{ role: 'user', content: 'Extract: Ada, 36' }] },
    z.object({ name: z.string(), age: z.number() }),
  );
  return {
    note: 'Mock providers: no model was called and no key is used.',
    data,
    repairs,
    lastCall: { provider: result.response.provider, attempts: result.attempts, costUsd: result.costUsd },
    backoffDelaysMs: delays,
    report: gateway.report(),
  };
}
