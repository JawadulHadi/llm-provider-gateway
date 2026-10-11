import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { Gateway, MockProvider, StructuredOutputError, chatJson } from '../src';

const schema = z.object({ name: z.string(), age: z.number() });
const req = { messages: [{ role: 'user' as const, content: 'extract' }] };
const gw = (p: MockProvider) => new Gateway([p], { sleep: async () => {} });

describe('chatJson', () => {
  it('parses plain and fenced JSON', async () => {
    const p = new MockProvider('a', ['Sure:\n```json\n{"name":"Ada","age":36}\n```']);
    const out = await chatJson(gw(p), req, schema);
    expect(out.data).toEqual({ name: 'Ada', age: 36 });
    expect(out.repairs).toBe(0);
  });

  it('asks the model to repair a schema violation, quoting the problem', async () => {
    const p = new MockProvider('a', ['{"name":"Ada","age":"old"}', '{"name":"Ada","age":36}']);
    const out = await chatJson(gw(p), req, schema);
    expect(out.repairs).toBe(1);
    const repairPrompt = p.calls[1].messages.at(-1)!.content;
    expect(repairPrompt).toContain('age');
  });

  it('recovers from non-JSON output', async () => {
    const p = new MockProvider('a', ['I cannot do that', '{"name":"Bo","age":1}']);
    expect((await chatJson(gw(p), req, schema)).data.name).toBe('Bo');
  });

  it('throws a typed error after the repair budget is spent', async () => {
    const p = new MockProvider('a', ['nope'], true);
    const e = await chatJson(gw(p), req, schema, { repairAttempts: 1 }).catch((x) => x);
    expect(e).toBeInstanceOf(StructuredOutputError);
    expect(e.lastText).toBe('nope');
    expect(p.calls).toHaveLength(2);
  });
});
