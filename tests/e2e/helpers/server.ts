import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";

export type E2eServerHandle = {
  baseUrl: string;
  managed: boolean;
  stop: () => Promise<void>;
};

async function isPortBindable(port: number, host = "127.0.0.1"): Promise<boolean> {
  return new Promise((resolve) => {
    const tester = net.createServer();
    tester.unref();
    tester.once("error", () => {
      resolve(false);
    });
    tester.once("listening", () => {
      tester.close(() => resolve(true));
    });
    tester.listen(port, host);
  });
}

async function ensurePortFree(
  port: number,
  timeoutMs = 3_000,
  host = "127.0.0.1",
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isPortBindable(port, host)) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }

  throw new Error(
    `Port ${port} on ${host} is already in use. Stop any lingering next start process or set E2E_PORT / E2E_BASE_URL.`,
  );
}

async function waitForPortRelease(
  port: number,
  timeoutMs = 3_000,
  host = "127.0.0.1",
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isPortBindable(port, host)) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

async function waitForServerReady(
  baseUrl: string,
  child: ChildProcess | null,
  getLogs: () => string,
  timeoutMs = 30_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastError = "Server did not respond";

  while (Date.now() < deadline) {
    if (child && child.exitCode !== null) {
      throw new Error(
        `next start exited prematurely with code ${child.exitCode}.\n${getLogs()}`,
      );
    }

    try {
      const response = await fetch(`${baseUrl}/`, {
        redirect: "manual",
        signal: AbortSignal.timeout(2_000),
      });
      if (response.status === 200) {
        return;
      }
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(
    `Timed out waiting for E2E server at ${baseUrl} (${lastError}).\n${getLogs()}`,
  );
}

function killProcessTree(pid: number): void {
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
    return;
  }
}

export async function startE2eServer(): Promise<E2eServerHandle> {
  const externalUrl = process.env.E2E_BASE_URL?.trim();
  if (externalUrl) {
    const baseUrl = externalUrl.replace(/\/+$/, "");
    await waitForServerReady(baseUrl, null, () => "(external E2E_BASE_URL)");
    return {
      baseUrl,
      managed: false,
      stop: async () => {},
    };
  }

  const repoRoot = process.cwd();
  const nextDir = path.join(repoRoot, ".next");
  if (!fs.existsSync(nextDir)) {
    throw new Error(
      ".next build output not found. Run `npm run build` first or set E2E_BASE_URL.",
    );
  }

  const nextBin = path.join(repoRoot, "node_modules", "next", "dist", "bin", "next");
  if (!fs.existsSync(nextBin)) {
    throw new Error(`Next.js CLI binary not found at ${nextBin}`);
  }

  const port = Number(process.env.E2E_PORT || "3102");
  if (!Number.isInteger(port) || port <= 0) {
    throw new Error(`Invalid E2E_PORT: ${process.env.E2E_PORT}`);
  }

  await ensurePortFree(port);

  const baseUrl = `http://127.0.0.1:${port}`;
  const logs: string[] = [];

  const child = spawn(
    process.execPath,
    [nextBin, "start", "-p", String(port), "-H", "127.0.0.1"],
    {
      cwd: repoRoot,
      env: { ...process.env },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    },
  );

  const emergencyCleanup = () => {
    if (child.pid !== undefined && child.exitCode === null) {
      killProcessTree(child.pid);
    }
  };
  process.once("exit", emergencyCleanup);
  process.once("SIGINT", emergencyCleanup);
  process.once("SIGTERM", emergencyCleanup);

  const detachCleanup = () => {
    process.off("exit", emergencyCleanup);
    process.off("SIGINT", emergencyCleanup);
    process.off("SIGTERM", emergencyCleanup);
  };

  child.stdout?.on("data", (chunk: Buffer) => {
    logs.push(chunk.toString("utf8"));
  });
  child.stderr?.on("data", (chunk: Buffer) => {
    logs.push(chunk.toString("utf8"));
  });

  const getLogs = () => logs.join("").slice(-4000);

  try {
    await waitForServerReady(baseUrl, child, getLogs);
  } catch (error) {
    detachCleanup();
    if (child.pid !== undefined && child.exitCode === null) {
      killProcessTree(child.pid);
    }
    throw error;
  }

  let stopped = false;
  return {
    baseUrl,
    managed: true,
    stop: async () => {
      if (stopped) return;
      stopped = true;
      detachCleanup();
      if (child.pid !== undefined && child.exitCode === null) {
        killProcessTree(child.pid);
      }
      if (child.exitCode === null) {
        await new Promise<void>((resolve) => {
          const timer = setTimeout(() => {
            if (
              child.pid !== undefined &&
              child.exitCode === null &&
              process.platform !== "win32"
            ) {
              try {
                process.kill(child.pid, "SIGKILL");
              } catch {
                // Ignore if already dead.
              }
            }
            resolve();
          }, 5_000);
          child.once("exit", () => {
            clearTimeout(timer);
            resolve();
          });
        });
      }
      await waitForPortRelease(port);
    },
  };
}
