const BODY_CAP = 512 * 1024;
const DEFAULT_TIMEOUT_MS = 15_000;
const USER_AGENT = 'DomiaAudit/0.1 (+https://github.com/brmel/Domia)';

export interface ProbeResult {
  readonly url: string;
  readonly status: number;
  readonly ok: boolean;
  readonly headers: Readonly<Record<string, string>>;
  readonly setCookies: readonly string[];
  readonly body: string;
  readonly truncated: boolean;
  readonly finalUrl: string;
  readonly redirected: boolean;
  readonly elapsedMs: number;
  readonly error?: string;
}

export interface ProbeOptions {
  readonly timeoutMs?: number;
  readonly method?: 'GET' | 'HEAD';
  readonly redirect?: 'follow' | 'manual';
}

function headerMap(h: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  h.forEach((value, key) => { out[key.toLowerCase()] = value; });
  return out;
}

function setCookieList(h: Headers): string[] {
  const getter = (h as unknown as { getSetCookie?: () => string[] }).getSetCookie;
  if (typeof getter === 'function') return getter.call(h);
  const single = h.get('set-cookie');
  return single ? [single] : [];
}

/** One HTTP observation, never throwing: a dead endpoint is data, not an exception. */
export async function probe(url: string, opts: ProbeOptions = {}): Promise<ProbeResult> {
  const started = Date.now();
  const empty = {
    url, status: 0, ok: false, headers: {}, setCookies: [], body: '', truncated: false,
    finalUrl: url, redirected: false,
  };
  try {
    const res = await fetch(url, {
      method: opts.method ?? 'GET',
      redirect: opts.redirect ?? 'follow',
      headers: { 'user-agent': USER_AGENT, accept: '*/*' },
      signal: AbortSignal.timeout(opts.timeoutMs ?? DEFAULT_TIMEOUT_MS),
    });
    const raw = opts.method === 'HEAD' ? '' : await res.text();
    return {
      url,
      status: res.status,
      ok: res.ok,
      headers: headerMap(res.headers),
      setCookies: setCookieList(res.headers),
      body: raw.slice(0, BODY_CAP),
      truncated: raw.length > BODY_CAP,
      finalUrl: res.url || url,
      redirected: Boolean(res.redirected),
      elapsedMs: Date.now() - started,
    };
  } catch (e) {
    return { ...empty, elapsedMs: Date.now() - started, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function probeAll(urls: readonly string[], opts: ProbeOptions = {}): Promise<Map<string, ProbeResult>> {
  const results = await Promise.all(urls.map(async (u) => [u, await probe(u, opts)] as const));
  return new Map(results);
}

export function originOf(url: string): string {
  return new URL(url).origin;
}

export function headerOf(p: ProbeResult, name: string): string | undefined {
  return p.headers[name.toLowerCase()];
}
