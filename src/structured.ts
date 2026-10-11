import { z } from 'zod';
import { Gateway, GatewayResult } from './gateway';
import { ChatRequest } from './types';

export class StructuredOutputError extends Error {
  constructor(message: string, readonly lastText: string) {
    super(message);
    this.name = 'StructuredOutputError';
  }
}

export function extractJson(text: string): unknown {
  const start = text.search(/[{[]/);
  const end = Math.max(text.lastIndexOf('}'), text.lastIndexOf(']'));
  if (start === -1 || end <= start) throw new Error('no JSON found');
  return JSON.parse(text.slice(start, end + 1));
}

/** Ask for JSON, validate it with zod, and give the model one chance to repair its mistake. */
export async function chatJson<T extends z.ZodTypeAny>(
  gateway: Gateway, req: ChatRequest, schema: T, opts: { repairAttempts?: number } = {},
): Promise<{ data: z.infer<T>; result: GatewayResult; repairs: number }> {
  const messages = [...req.messages, { role: 'user' as const, content: 'Reply with a single JSON object only, no prose.' }];
  const maxRepairs = opts.repairAttempts ?? 1;
  let lastText = '';
  for (let repairs = 0; repairs <= maxRepairs; repairs++) {
    const result = await gateway.chat({ ...req, messages });
    lastText = result.response.text;
    let problem: string;
    try {
      const parsed = schema.safeParse(extractJson(lastText));
      if (parsed.success) return { data: parsed.data, result, repairs };
      problem = parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ');
    } catch (e) {
      problem = (e as Error).message;
    }
    messages.push({ role: 'assistant', content: lastText });
    messages.push({ role: 'user', content: `That was not valid. Problems: ${problem}. Reply again with corrected JSON only.` });
  }
  throw new StructuredOutputError('model did not return valid JSON for the schema', lastText);
}
