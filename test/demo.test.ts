import { describe, expect, it } from 'vitest';
import { runDemo } from '../src/demo';

describe('hosted demo', () => {
  it('falls back after retries, opens the circuit and repairs prose into valid JSON', async () => {
    const d = await runDemo();
    expect(d.data).toEqual({ name: 'Ada', age: 36 });
    expect(d.repairs).toBe(1);
    expect(d.backoffDelaysMs).toHaveLength(2);
    expect(d.report.primary.failures).toBe(3);
    expect(d.lastCall.provider).toBe('fallback');
    expect(d.lastCall.attempts[0]).toMatchObject({ provider: 'primary', skipped: 'circuit_open' });
    expect(d.lastCall.costUsd).toBeGreaterThan(0);
  });
});
