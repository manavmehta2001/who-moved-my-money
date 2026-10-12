export class HttpError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
    readonly url: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

type FetchOptions = {
  timeoutMs?: number;
  retries?: number;
  headers?: Record<string, string>;
  /** Statuses that mean "this request will never succeed" — don't retry them. */
  noRetryStatuses?: number[];
};

const DEFAULT_HEADERS = {
  "User-Agent": "Mozilla/5.0 (compatible; WhoMovedMyMoney/1.0; educational project)",
  Accept: "application/json, text/plain, application/xml, */*",
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function fetchWithRetry(url: string, opts: FetchOptions = {}): Promise<Response> {
  const { timeoutMs = 15_000, retries = 3, headers = {}, noRetryStatuses = [400, 401, 403, 404] } = opts;
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { ...DEFAULT_HEADERS, ...headers },
        signal: AbortSignal.timeout(timeoutMs),
        redirect: "follow",
        cache: "no-store",
      });
      if (res.ok) return res;
      const err = new HttpError(`HTTP ${res.status} from ${new URL(url).host}`, res.status, url);
      if (noRetryStatuses.includes(res.status)) throw err;
      lastError = err;
    } catch (e) {
      if (e instanceof HttpError && e.status !== null && noRetryStatuses.includes(e.status)) throw e;
      lastError = e;
    }
    if (attempt < retries) await sleep(400 * 2 ** attempt + Math.random() * 250);
  }
  if (lastError instanceof Error) throw lastError;
  throw new HttpError(`Request failed: ${url}`, null, url);
}

export async function fetchJson(url: string, opts?: FetchOptions): Promise<unknown> {
  const res = await fetchWithRetry(url, opts);
  return res.json();
}

export async function fetchText(url: string, opts?: FetchOptions): Promise<string> {
  const res = await fetchWithRetry(url, opts);
  return res.text();
}

/** Runs `fn` over `items` with at most `limit` in flight; results keep input order. */
export async function mapLimit<T, R>(items: readonly T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}

export async function settleLimit<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<Array<{ item: T; ok: true; value: R } | { item: T; ok: false; error: string }>> {
  return mapLimit(items, limit, async (item) => {
    try {
      return { item, ok: true as const, value: await fn(item) };
    } catch (e) {
      return { item, ok: false as const, error: e instanceof Error ? e.message : String(e) };
    }
  });
}
