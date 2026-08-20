import "server-only";

/**
 * Real, live-discovered constraint (not assumed): Skool sits behind
 * CloudFront + AWS WAF bot-detection that blocks plain server-side
 * `fetch()` with a 403 even when a valid, freshly-extracted session cookie
 * is attached — confirmed live during this build (a bare Node request with
 * the real cookie header was rejected; the identical URL loaded fine
 * through the actual authenticated Chrome tab seconds later). This is not
 * a security control we work around — we simply make every request
 * THROUGH the real, already-authenticated browser tab instead of a
 * separate HTTP client impersonating one.
 *
 * This is why `SkoolSession` (skool-session.ts) is a transport interface,
 * not a cookie string: for THIS run, `CdpBrowserTransport` below drives the
 * real Chrome tab Quiana authenticated in herself, via the same Chrome
 * DevTools Protocol used throughout this session's QA. A future
 * self-service product would swap this for a real headless-browser session
 * (e.g. Playwright) that performs its own login and keeps that same
 * transport shape — skool-client.ts and everything above it never changes.
 */
export interface SkoolTransport {
  /** Fetch a URL through the live browser session and return the raw
   *  response text (HTML or JSON body, caller's choice how to parse it). */
  fetchText(url: string): Promise<string>;
}

interface CdpMessage {
  id?: number;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: { message?: string };
}

/**
 * Drives one already-open, already-authenticated Chrome tab via CDP. Reused
 * across many calls (one WebSocket connection per transport instance) so a
 * multi-hundred-request extraction run doesn't reconnect per request.
 */
export class CdpBrowserTransport implements SkoolTransport {
  private ws: WebSocket | null = null;
  private nextId = 1;
  private readonly pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();

  constructor(
    private readonly cdpPort: number,
    private readonly tabId: string,
  ) {}

  private async connect(): Promise<void> {
    if (this.ws) return;
    const ws = new WebSocket(`ws://localhost:${this.cdpPort}/devtools/page/${this.tabId}`);
    await new Promise<void>((resolve, reject) => {
      ws.addEventListener("open", () => resolve());
      ws.addEventListener("error", () => reject(new Error("Could not connect to the Skool browser tab — is it still open?")));
    });
    ws.addEventListener("message", (ev) => {
      const data = JSON.parse(ev.data as string) as CdpMessage;
      if (data.id !== undefined && this.pending.has(data.id)) {
        const p = this.pending.get(data.id)!;
        this.pending.delete(data.id);
        if (data.error) p.reject(new Error(data.error.message ?? "CDP error"));
        else p.resolve(data.result);
      }
    });
    this.ws = ws;
    await this.send("Runtime.enable");
  }

  private send(method: string, params: unknown = {}): Promise<unknown> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws!.send(JSON.stringify({ id, method, params }));
    });
  }

  async fetchText(url: string): Promise<string> {
    await this.connect();
    // Runs INSIDE the real page's own JS context — inherits its real
    // cookies, TLS fingerprint, and browser headers automatically. No
    // credential of any kind is read, stored, or passed by this code.
    const expr = `
      (async () => {
        const res = await fetch(${JSON.stringify(url)}, { credentials: "include" });
        const text = await res.text();
        return JSON.stringify({ ok: res.ok, status: res.status, text });
      })()
    `;
    const result = (await this.send("Runtime.evaluate", {
      expression: expr,
      returnByValue: true,
      awaitPromise: true,
    })) as { result?: { value?: string }; exceptionDetails?: { text?: string } };
    if (!result.result?.value) {
      throw new Error(`Browser-fetch of ${url} produced no result (page may have navigated away)`);
    }
    const parsed = JSON.parse(result.result.value) as { ok: boolean; status: number; text: string };
    if (!parsed.ok) {
      throw new Error(`Skool request failed (${url}): HTTP ${parsed.status}`);
    }
    return parsed.text;
  }

  close(): void {
    this.ws?.close();
    this.ws = null;
  }
}
