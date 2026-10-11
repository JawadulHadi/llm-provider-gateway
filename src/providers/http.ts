import { ProviderError, errorFromStatus } from '../types';

export type FetchLike = (url: string, init: any) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>;

/** POST JSON and return the parsed body, mapping every failure to a ProviderError. */
export async function postJson(
  fetchFn: FetchLike, provider: string, url: string, headers: Record<string, string>, body: unknown,
  signal?: AbortSignal,
): Promise<any> {
  let res;
  try {
    res = await fetchFn(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body), signal });
  } catch (err) {
    if (signal?.aborted) throw new ProviderError(`${provider} request aborted`, 'timeout', provider);
    throw new ProviderError(`${provider} network error: ${(err as Error).message}`, 'network', provider);
  }
  const text = await res.text();
  if (!res.ok) throw errorFromStatus(provider, res.status, text);
  try {
    return JSON.parse(text);
  } catch {
    throw new ProviderError(`${provider} returned non-JSON`, 'invalid_response', provider, res.status);
  }
}
