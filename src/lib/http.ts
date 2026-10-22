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

async function request(source: string, url: string, init?: RequestInit): Promise<Response> {
  if (isDemoMode()) {
    return demoResponse(url, init);
  }
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      headers: { "User-Agent": "Vynthera/0.1 (clinical evidence lookup)", ...init?.headers },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    const reason = err instanceof Error && err.name === "TimeoutError" ? "timed out" : "could not be reached";
    throw new SourceError(source, reason);
  }
  return res;
}

/**
 * Fetch JSON from a public data source. `notFoundAs` lets APIs that answer
 * "no matches" with a 404 (openFDA does) return an empty value instead of failing.
 */
export async function getJson<T>(
  source: string,
  url: string,
  options: { init?: RequestInit; notFoundAs?: T } = {},
): Promise<T> {
  const res = await request(source, url, options.init);
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

export async function getText(source: string, url: string): Promise<string> {
  const res = await request(source, url);
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
