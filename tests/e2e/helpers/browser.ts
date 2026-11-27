import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

type CdpResponse = {
  id?: number;
  method?: string;
  params?: Record<string, unknown>;
  result?: Record<string, unknown>;
  error?: { code?: number; message?: string };
};

export type BrowserServerError = {
  url: string;
  status: number;
};

export type NavigationMetrics = {
  durationMs: number;
  finalUrl: string;
  pathname: string;
  markerPreserved: boolean;
};

const DEFAULT_BROWSER_PATHS = [
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/usr/bin/microsoft-edge",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
];

export function resolveBrowserExecutable(): string {
  const custom = process.env.CHROME_PATH?.trim();
  if (custom && fs.existsSync(custom)) {
    return custom;
  }

  for (const candidate of DEFAULT_BROWSER_PATHS) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  throw new Error(
    "No headless browser found. Set CHROME_PATH or install Microsoft Edge / Google Chrome.",
  );
}

function killBrowserTree(pid: number): void {
  if (process.platform === "win32") {
    try {
      execFileSync("taskkill", ["/PID", String(pid), "/T", "/F"], {
        stdio: "ignore",
      });
    } catch {
      // Process already exited.
    }
    return;
  }

  try {
    process.kill(pid, "SIGTERM");
  } catch {
    // Already exited.
  }
}

async function waitForChildExit(
  child: ChildProcess,
  timeoutMs = 2_000,
): Promise<void> {
  if (child.exitCode !== null) return;
  await new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, timeoutMs);
    child.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

async function cleanupProfileDir(userDataDir: string): Promise<void> {
  for (let attempt = 0; attempt < 25; attempt++) {
    try {
      fs.rmSync(userDataDir, { recursive: true, force: true });
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }
}

async function waitForDevToolsPort(
  child: ChildProcess,
  getStderr: () => string,
  timeoutMs = 15_000,
): Promise<number> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const stderr = getStderr();
    const match = stderr.match(/DevTools listening on ws:\/\/[^:]+:(\d+)\//);
    if (match?.[1]) {
      return Number(match[1]);
    }
    if (child.exitCode !== null) {
      throw new Error(
        `Headless browser exited with code ${child.exitCode}.\n${stderr}`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  throw new Error(
    `Timed out waiting for headless browser CDP port.\n${getStderr()}`,
  );
}

async function getPageWebSocketUrl(port: number): Promise<string> {
  const deadline = Date.now() + 10_000;
  let lastError = "No page target found";

  while (Date.now() < deadline) {
    try {
      const listRes = await fetch(`http://127.0.0.1:${port}/json/list`, {
        signal: AbortSignal.timeout(2_000),
      });
      if (listRes.ok) {
        const targets = (await listRes.json()) as Array<{
          type?: string;
          webSocketDebuggerUrl?: string;
        }>;
        const page = targets.find(
          (t) => t.type === "page" && typeof t.webSocketDebuggerUrl === "string",
        );
        if (page?.webSocketDebuggerUrl) {
          return page.webSocketDebuggerUrl;
        }
      }

      const newRes = await fetch(
        `http://127.0.0.1:${port}/json/new?about:blank`,
        {
          method: "PUT",
          signal: AbortSignal.timeout(2_000),
        },
      );
      if (newRes.ok) {
        const created = (await newRes.json()) as {
          webSocketDebuggerUrl?: string;
        };
        if (created.webSocketDebuggerUrl) {
          return created.webSocketDebuggerUrl;
        }
      }
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw new Error(`Failed to acquire CDP page target: ${lastError}`);
}

export class CdpBrowser {
  private readonly child: ChildProcess;
  private readonly userDataDir: string;
  private readonly ws: WebSocket;
  private nextId = 1;
  private closed = false;
  private readonly pending = new Map<
    number,
    {
      resolve: (value: Record<string, unknown>) => void;
      reject: (reason: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();

  public readonly pageErrors: string[] = [];
  public readonly consoleErrors: string[] = [];
  public readonly serverErrors: BrowserServerError[] = [];

  private constructor(
    child: ChildProcess,
    userDataDir: string,
    ws: WebSocket,
  ) {
    this.child = child;
    this.userDataDir = userDataDir;
    this.ws = ws;

    this.ws.addEventListener("message", (event) => {
      if (typeof event.data !== "string") return;
      let msg: CdpResponse;
      try {
        msg = JSON.parse(event.data) as CdpResponse;
      } catch {
        return;
      }

      if (typeof msg.id === "number") {
        const entry = this.pending.get(msg.id);
        if (entry) {
          this.pending.delete(msg.id);
          clearTimeout(entry.timer);
          if (msg.error) {
            entry.reject(
              new Error(msg.error.message ?? `CDP error ${msg.error.code ?? ""}`),
            );
          } else {
            entry.resolve(msg.result ?? {});
          }
        }
        return;
      }

      this.handleEvent(msg.method, msg.params);
    });
  }

  static async launch(): Promise<CdpBrowser> {
    const executablePath = resolveBrowserExecutable();
    const userDataDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "it-ticketing-e2e-"),
    );

    const stderrChunks: string[] = [];
    const child = spawn(
      executablePath,
      [
        "--headless=new",
        "--remote-debugging-port=0",
        "--no-first-run",
        "--no-default-browser-check",
        "--disable-gpu",
        "--disable-background-networking",
        "--disable-extensions",
        "--window-size=1280,800",
        `--user-data-dir=${userDataDir}`,
        "about:blank",
      ],
      {
        stdio: ["ignore", "ignore", "pipe"],
        windowsHide: true,
      },
    );

    child.stderr?.on("data", (chunk: Buffer) => {
      stderrChunks.push(chunk.toString("utf8"));
    });

    const getStderr = () => stderrChunks.join("").slice(-4000);

    let ws: WebSocket | null = null;
    try {
      const port = await waitForDevToolsPort(child, getStderr);
      const wsUrl = await getPageWebSocketUrl(port);

      ws = new WebSocket(wsUrl);
      await new Promise<void>((resolve, reject) => {
        if (!ws) return reject(new Error("Missing WebSocket"));
        const timer = setTimeout(
          () => reject(new Error("Timed out connecting to CDP WebSocket")),
          10_000,
        );
        ws.addEventListener("open", () => {
          clearTimeout(timer);
          resolve();
        });
        ws.addEventListener("error", () => {
          clearTimeout(timer);
          reject(new Error("CDP WebSocket connection error"));
        });
      });

      const browser = new CdpBrowser(child, userDataDir, ws);
      await browser.send("Page.enable");
      await browser.send("Runtime.enable");
      await browser.send("Network.enable");
      return browser;
    } catch (error) {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
      if (child.pid !== undefined && child.exitCode === null) {
        killBrowserTree(child.pid);
        await waitForChildExit(child, 2_000);
      }
      await cleanupProfileDir(userDataDir);
      throw error;
    }
  }

  private handleEvent(
    method: string | undefined,
    params: Record<string, unknown> | undefined,
  ): void {
    if (!method || !params) return;

    if (method === "Runtime.exceptionThrown") {
      const details = params.exceptionDetails as
        | {
            text?: string;
            exception?: { description?: string };
          }
        | undefined;
      const message =
        details?.exception?.description ??
        details?.text ??
        "Uncaught browser exception";
      this.pageErrors.push(message);
      return;
    }

    if (method === "Runtime.consoleAPICalled") {
      if (params.type === "error") {
        const args = (params.args as Array<{ value?: unknown; description?: string }>) ?? [];
        const text = args
          .map((arg) =>
            arg.value !== undefined
              ? String(arg.value)
              : (arg.description ?? "[object]"),
          )
          .join(" ");
        this.consoleErrors.push(text);
      }
      return;
    }

    if (method === "Network.responseReceived") {
      const response = params.response as
        | { url?: string; status?: number }
        | undefined;
      if (response && typeof response.status === "number" && response.status >= 500) {
        this.serverErrors.push({
          url: response.url ?? "",
          status: response.status,
        });
      }
    }
  }

  public clearErrors(): void {
    this.pageErrors.length = 0;
    this.consoleErrors.length = 0;
    this.serverErrors.length = 0;
  }

  public async send(
    method: string,
    params: Record<string, unknown> = {},
    timeoutMs = 15_000,
  ): Promise<Record<string, unknown>> {
    if (this.closed) {
      throw new Error("Browser session is already closed.");
    }
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP command timed out: ${method}`));
      }, timeoutMs);

      this.pending.set(id, { resolve, reject, timer });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  public async evalJs<T>(expression: string): Promise<T> {
    const response = await this.send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });

    const exceptionDetails = response.exceptionDetails as
      | { text?: string; exception?: { description?: string } }
      | undefined;
    if (exceptionDetails) {
      throw new Error(
        `Browser JS error: ${
          exceptionDetails.exception?.description ??
          exceptionDetails.text ??
          "unknown"
        }`,
      );
    }

    const result = response.result as { value?: T } | undefined;
    return result?.value as T;
  }

  public async goto(
    url: string,
    options: { timeoutMs?: number } = {},
  ): Promise<{ url: string; pathname: string; durationMs: number }> {
    const timeoutMs = options.timeoutMs ?? 20_000;
    const startedAt = performance.now();

    await this.send("Page.navigate", { url }, timeoutMs);

    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const state = await this.evalJs<{ readyState: string; href: string }>(
        `({ readyState: document.readyState, href: window.location.href })`,
      );
      if (state.readyState === "complete" && state.href !== "about:blank") {
        await new Promise((resolve) => setTimeout(resolve, 150));
        const finalInfo = await this.evalJs<{ url: string; pathname: string }>(
          `({ url: window.location.href, pathname: window.location.pathname })`,
        );
        return {
          ...finalInfo,
          durationMs: performance.now() - startedAt,
        };
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    throw new Error(`Timed out navigating to ${url}`);
  }

  public async waitForPathname(
    expectedPathname: string,
    timeoutMs = 15_000,
  ): Promise<string> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const info = await this.evalJs<{
        pathname: string;
        href: string;
        readyState: string;
      }>(
        `({ pathname: window.location.pathname, href: window.location.href, readyState: document.readyState })`,
      );
      if (info.pathname === expectedPathname && info.readyState === "complete") {
        return info.href;
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    const current = await this.evalJs<string>("window.location.href");
    throw new Error(
      `Timed out waiting for pathname "${expectedPathname}" (current: ${current})`,
    );
  }

  public async waitForSelector(
    selector: string,
    options: { timeoutMs?: number; visible?: boolean } = {},
  ): Promise<void> {
    const { timeoutMs = 15_000, visible = true } = options;
    const deadline = Date.now() + timeoutMs;
    const serialized = JSON.stringify(selector);

    while (Date.now() < deadline) {
      const found = await this.evalJs<boolean>(
        `(() => {
          const nodes = Array.from(document.querySelectorAll(${serialized}));
          if (!${visible}) return nodes.length > 0;
          return nodes.some((el) => {
            const style = window.getComputedStyle(el);
            if (style.display === "none" || style.visibility === "hidden") return false;
            return el.getClientRects().length > 0;
          });
        })()`,
      );
      if (found) return;
      await new Promise((resolve) => setTimeout(resolve, 75));
    }

    throw new Error(`Timed out waiting for selector: ${selector}`);
  }

  public async waitForText(
    text: string,
    timeoutMs = 15_000,
  ): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    const serialized = JSON.stringify(text);

    while (Date.now() < deadline) {
      const found = await this.evalJs<boolean>(
        `Boolean(document.body && document.body.innerText.includes(${serialized}))`,
      );
      if (found) return;
      await new Promise((resolve) => setTimeout(resolve, 75));
    }

    throw new Error(`Timed out waiting for text: ${text}`);
  }

  public async getText(selector: string): Promise<string> {
    const serialized = JSON.stringify(selector);
    return this.evalJs<string>(
      `(() => {
        const nodes = Array.from(document.querySelectorAll(${serialized}));
        const visible = nodes.find((el) => {
          const style = window.getComputedStyle(el);
          return style.display !== "none" && style.visibility !== "hidden" && el.getClientRects().length > 0;
        }) ?? nodes[0];
        return visible ? (visible.textContent ?? "").trim() : "";
      })()`,
    );
  }

  public async click(selector: string): Promise<void> {
    await this.waitForSelector(selector, { visible: true });
    const serialized = JSON.stringify(selector);
    const clicked = await this.evalJs<boolean>(
      `(() => {
        const nodes = Array.from(document.querySelectorAll(${serialized}));
        const target = nodes.find((el) => {
          const style = window.getComputedStyle(el);
          return style.display !== "none" && style.visibility !== "hidden" && el.getClientRects().length > 0;
        });
        if (!(target instanceof HTMLElement)) return false;
        target.scrollIntoView({ block: "center" });
        target.click();
        return true;
      })()`,
    );
    if (!clicked) {
      throw new Error(`Unable to click visible element for selector: ${selector}`);
    }
  }

  public async fillInput(selector: string, value: string): Promise<void> {
    await this.waitForSelector(selector, { visible: true });
    const serializedSelector = JSON.stringify(selector);
    const serializedValue = JSON.stringify(value);
    const updated = await this.evalJs<boolean>(
      `(() => {
        const nodes = Array.from(document.querySelectorAll(${serializedSelector}));
        const target = nodes.find((el) => {
          const style = window.getComputedStyle(el);
          return style.display !== "none" && style.visibility !== "hidden" && el.getClientRects().length > 0;
        });
        if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)) {
          return false;
        }
        const proto = target instanceof HTMLTextAreaElement
          ? HTMLTextAreaElement.prototype
          : HTMLInputElement.prototype;
        const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
        setter?.call(target, ${serializedValue});
        target.dispatchEvent(new Event("input", { bubbles: true }));
        target.dispatchEvent(new Event("change", { bubbles: true }));
        return true;
      })()`,
    );
    if (!updated) {
      throw new Error(`Unable to fill input for selector: ${selector}`);
    }
  }

  public async selectOption(selector: string, value: string): Promise<void> {
    await this.waitForSelector(selector, { visible: true });
    const serializedSelector = JSON.stringify(selector);
    const serializedValue = JSON.stringify(value);
    const updated = await this.evalJs<boolean>(
      `(() => {
        const nodes = Array.from(document.querySelectorAll(${serializedSelector}));
        const target = nodes.find((el) => {
          const style = window.getComputedStyle(el);
          return style.display !== "none" && style.visibility !== "hidden" && el.getClientRects().length > 0;
        });
        if (!(target instanceof HTMLSelectElement)) {
          return false;
        }
        const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
        setter?.call(target, ${serializedValue});
        target.dispatchEvent(new Event("change", { bubbles: true }));
        return true;
      })()`,
    );
    if (!updated) {
      throw new Error(`Unable to select option for selector: ${selector}`);
    }
  }

  public async clickLinkAndWaitForUrl(
    selector: string,
    expectedPathname: string,
    timeoutMs = 15_000,
  ): Promise<NavigationMetrics> {
    await this.waitForSelector(selector, { visible: true, timeoutMs });
    const startedAt = performance.now();

    await this.click(selector);
    const finalUrl = await this.waitForPathname(expectedPathname, timeoutMs);
    // Allow React hydration / active-link class update microtask to settle.
    await new Promise((resolve) => setTimeout(resolve, 100));

    const markerPreserved = await this.evalJs<boolean>(
      `Boolean((window).__e2eNavMarker)`,
    );

    return {
      durationMs: performance.now() - startedAt,
      finalUrl,
      pathname: expectedPathname,
      markerPreserved,
    };
  }

  public async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;

    for (const [id, entry] of this.pending.entries()) {
      clearTimeout(entry.timer);
      entry.reject(new Error("Browser closed"));
      this.pending.delete(id);
    }

    try {
      if (
        this.ws.readyState === WebSocket.OPEN ||
        this.ws.readyState === WebSocket.CONNECTING
      ) {
        this.ws.close();
      }
    } catch {
      // Ignore WebSocket close error.
    }

    if (this.child.pid !== undefined && this.child.exitCode === null) {
      killBrowserTree(this.child.pid);
      await waitForChildExit(this.child, 2_000);
    }

    await cleanupProfileDir(this.userDataDir);
  }
}
