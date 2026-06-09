type RetryOpts = {
  /** Per-attempt timeout. Each attempt gets its own AbortController. */
  timeoutMs: number;
  /** Extra attempts after the first. Default 1 (so 2 attempts total). */
  retries?: number;
  /** Backoff between attempts. Default 500ms. */
  backoffMs?: number;
};

/**
 * `fetch` with a per-attempt timeout and one retry on *transient* failure
 * (HTTP 5xx, 429, or a network-level reject). Does NOT retry our own timeout
 * abort — a slow endpoint usually stays slow, so a retry just burns time — nor
 * does it retry 4xx (deterministic) or anything the caller does after the fetch.
 *
 * The runtime ceiling is the GitHub Actions runner (multi-hour), not a Vercel
 * 60s function cap, so timeouts here are deliberately generous.
 */
export async function fetchWithRetry(
  url: string,
  init: RequestInit,
  opts: RetryOpts,
): Promise<Response> {
  const { timeoutMs, retries = 1, backoffMs = 500 } = opts;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...init, signal: controller.signal });
      // Retry transient server statuses; on the final attempt return the
      // response so the caller can surface the status + body itself.
      if ((res.status >= 500 || res.status === 429) && attempt < retries) {
        await delay(backoffMs);
        continue;
      }
      return res;
    } catch (err) {
      // Our own timeout abort, or the last attempt: give up and rethrow.
      const isAbort = err instanceof Error && err.name === 'AbortError';
      if (isAbort || attempt >= retries) {
        throw err;
      }
      await delay(backoffMs);
    } finally {
      clearTimeout(timer);
    }
  }

  // Unreachable: the loop either returns a Response or throws.
  throw new Error('fetchWithRetry: exhausted attempts');
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
