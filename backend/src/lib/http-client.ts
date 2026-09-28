/**
 * Outbound JSON requests to third-party APIs (payment providers, email).
 *
 * Every call has a timeout, so a hung provider cannot hold a request (and a database
 * connection) forever. Failures are thrown as `UpstreamError` with the status and body,
 * which callers log and translate into a user-facing message.
 */
export class UpstreamError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly body?: unknown,
  ) {
    super(message);
    this.name = 'UpstreamError';
  }
}

interface PostJsonOptions {
  headers?: Record<string, string>;
  timeoutMs: number;
}

export async function postJson<Response>(url: string, body: unknown, options: PostJsonOptions): Promise<Response> {
  let response: globalThis.Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...options.headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(options.timeoutMs),
    });
  } catch (error) {
    throw new UpstreamError(`Request to ${new URL(url).host} failed: ${(error as Error).message}`);
  }

  const text = await response.text();
  let parsed: unknown = text;
  try {
    parsed = JSON.parse(text);
  } catch {
    // Keep the raw text; some error pages are HTML.
  }

  if (!response.ok) {
    throw new UpstreamError(`${new URL(url).host} answered HTTP ${response.status}`, response.status, parsed);
  }
  return parsed as Response;
}
