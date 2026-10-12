import type { IncomingMessage, ServerResponse } from 'node:http';
import { runDemo } from '../src/demo';

export default async function handler(_req: IncomingMessage, res: ServerResponse) {
  const body = JSON.stringify(await runDemo(), null, 2);
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(body);
}
