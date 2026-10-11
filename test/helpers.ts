import { FetchLike } from '../src/providers/http';

export interface Captured {
  url: string;
  init: any;
}

export function fakeFetch(status: number, body: unknown, captured: Captured[] = []): FetchLike {
  return async (url, init) => {
    captured.push({ url, init });
    const text = typeof body === 'string' ? body : JSON.stringify(body);
    return { ok: status >= 200 && status < 300, status, text: async () => text };
  };
}
