export type HttpResponseResult = {
  status: number;
  ok: boolean;
  url: string;
  headers: Headers;
  location: string | null;
  contentType: string;
  cacheControl: string;
  vary: string;
  setCookies: string[];
  body: string;
  durationMs: number;
};

export type RscResponseResult = HttpResponseResult & {
  xNextjsPrerender: string | null;
  xNextjsCache: string | null;
  xNextjsPostponed: string | null;
  xNextjsStaleTime: string | null;
};

function readSetCookies(headers: Headers): string[] {
  if (typeof headers.getSetCookie === "function") {
    return headers.getSetCookie();
  }
  const single = headers.get("set-cookie");
  return single ? [single] : [];
}

export async function fetchManual(
  baseUrl: string,
  pathname: string,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<HttpResponseResult> {
  const { timeoutMs = 10_000, ...requestInit } = init;
  const targetUrl = new URL(pathname, baseUrl).toString();
  const startedAt = performance.now();

  const response = await fetch(targetUrl, {
    ...requestInit,
    redirect: "manual",
    signal: requestInit.signal ?? AbortSignal.timeout(timeoutMs),
  });

  const body = await response.text();
  const durationMs = performance.now() - startedAt;

  return {
    status: response.status,
    ok: response.ok,
    url: response.url,
    headers: response.headers,
    location: response.headers.get("location"),
    contentType: response.headers.get("content-type") ?? "",
    cacheControl: response.headers.get("cache-control") ?? "",
    vary: response.headers.get("vary") ?? "",
    setCookies: readSetCookies(response.headers),
    body,
    durationMs,
  };
}

export async function fetchRsc(
  baseUrl: string,
  pathname: string,
  options: {
    prefetch?: boolean;
    segmentPrefetch?: string;
    followRedirects?: boolean;
    headers?: Record<string, string>;
    timeoutMs?: number;
  } = {},
): Promise<RscResponseResult> {
  const {
    prefetch = true,
    segmentPrefetch,
    followRedirects = true,
    headers: extraHeaders = {},
    timeoutMs = 10_000,
  } = options;

  const requestHeaders: Record<string, string> = {
    RSC: "1",
    ...extraHeaders,
  };

  if (prefetch) {
    requestHeaders["Next-Router-Prefetch"] = "1";
  }
  if (segmentPrefetch) {
    requestHeaders["Next-Router-Segment-Prefetch"] = segmentPrefetch;
  }

  const targetUrl = new URL(pathname, baseUrl).toString();
  const startedAt = performance.now();

  const response = await fetch(targetUrl, {
    method: "GET",
    headers: requestHeaders,
    redirect: followRedirects ? "follow" : "manual",
    signal: AbortSignal.timeout(timeoutMs),
  });

  const body = await response.text();
  const durationMs = performance.now() - startedAt;

  return {
    status: response.status,
    ok: response.ok,
    url: response.url,
    headers: response.headers,
    location: response.headers.get("location"),
    contentType: response.headers.get("content-type") ?? "",
    cacheControl: response.headers.get("cache-control") ?? "",
    vary: response.headers.get("vary") ?? "",
    setCookies: readSetCookies(response.headers),
    body,
    durationMs,
    xNextjsPrerender: response.headers.get("x-nextjs-prerender"),
    xNextjsCache: response.headers.get("x-nextjs-cache"),
    xNextjsPostponed: response.headers.get("x-nextjs-postponed"),
    xNextjsStaleTime: response.headers.get("x-nextjs-stale-time"),
  };
}

export function hasAuthSessionSetCookie(setCookies: string[]): boolean {
  return setCookies.some((cookie) =>
    /^sb-[^=]+-auth-token(?:\.\d+)?=/i.test(cookie.trim()),
  );
}

export function parseJsonSafe<T = Record<string, unknown>>(
  body: string,
): T | null {
  try {
    return JSON.parse(body) as T;
  } catch {
    return null;
  }
}
