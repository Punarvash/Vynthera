import { demoResponse } from "./demo/responses";

export class SourceError extends Error {
  constructor(
    public readonly source: string,
    message: string,
    public readonly status?: number,
  ) {
    super(`${source}: ${message}`);
    this.name = "SourceError";
  }
}

const TIMEOUT_MS = 8000;

export function isDemoMode(): boolean {
  return process.env.VYNTHERA_DEMO_DATA === "1";
}

/**
 * Minimum gap between requests to hosts with strict rate limits.
 * NCBI allows 3 requests/second without an API key and 10 with one; openFDA allows 240/minute.
 */
function minIntervalMs(host: string): number {
  if (host === "eutils.ncbi.nlm.nih.gov") return process.env.NCBI_API_KEY ? 120 : 360;
  if (host === "api.fda.gov") return process.env.OPENFDA_API_KEY ? 60 : 260;
  // data.cms.gov answers bursts with 429 "exceeded the rate limits".
  if (host === "data.cms.gov") return 400;
  return 0;
}

const nextSlot = new Map<string, number>();

async function waitForSlot(host: string): Promise<void> {
  const gap = minIntervalMs(host);
  if (!gap) return;
  const now = Date.now();
  const at = Math.max(now, nextSlot.get(host) ?? 0);
  nextSlot.set(host, at + gap);
  if (at > now) await new Promise((r) => setTimeout(r, at - now));
}

interface RequestOptions {
  timeoutMs?: number;
  /** Do not log failed responses (for lookups where failure is expected, like non-open-access full texts). */
  quiet?: boolean;
}

async function request(source: string, url: string, init?: RequestInit, opts: RequestOptions = {}): Promise<Response> {
  if (isDemoMode()) {
    return demoResponse(url, init);
  }
  const host = new URL(url).hostname;
  for (let attempt = 0; ; attempt++) {
    await waitForSlot(host);
    let res: Response;
    try {
      res = await fetch(url, {
        ...init,
        headers: { "User-Agent": "Vynthera/0.1 (clinical evidence lookup)", ...init?.headers },
        signal: AbortSignal.timeout(opts.timeoutMs ?? TIMEOUT_MS),
      });
    } catch (err) {
      const reason = err instanceof Error && err.name === "TimeoutError" ? "timed out" : "could not be reached";
      throw new SourceError(source, reason);
    }
    // Back off and retry when rate-limited or briefly unavailable.
    if ((res.status === 429 || res.status === 503) && attempt < 2) {
      const retryAfter = Number(res.headers.get("retry-after"));
      await new Promise((r) => setTimeout(r, Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter, 5) * 1000 : 800 * (attempt + 1)));
      continue;
    }
    if (!res.ok && res.status !== 404 && !opts.quiet) {
      // Log the body (e.g. a GraphQL validation message) for debugging; the user sees a plain message.
      const body = await res.clone().text().catch(() => "");
      console.error(`${source} HTTP ${res.status} for ${url.replace(/api_key=[^&]+/, "api_key=***").slice(0, 200)}: ${body.slice(0, 500)}`);
    }
    return res;
  }
}

/**
 * Fetch JSON from a public data source. `notFoundAs` lets APIs that answer
 * "no matches" with a 404 (openFDA does) return an empty value instead of failing.
 */
export async function getJson<T>(
  source: string,
  url: string,
  options: { init?: RequestInit; notFoundAs?: T } & RequestOptions = {},
): Promise<T> {
  const res = await request(source, url, options.init, options);
  if (res.status === 404 && options.notFoundAs !== undefined) {
    return options.notFoundAs;
  }
  if (!res.ok) {
    throw new SourceError(source, `responded with HTTP ${res.status}`, res.status);
  }
  try {
    return (await res.json()) as T;
  } catch {
    throw new SourceError(source, "returned a response that could not be read");
  }
}

export async function getText(source: string, url: string, opts: RequestOptions = {}): Promise<string> {
  const res = await request(source, url, undefined, opts);
  if (!res.ok) {
    throw new SourceError(source, `responded with HTTP ${res.status}`, res.status);
  }
  return res.text();
}

export function describeError(err: unknown): string {
  if (err instanceof SourceError) return err.message;
  if (err instanceof Error) return err.message;
  return "Unknown error";
}
