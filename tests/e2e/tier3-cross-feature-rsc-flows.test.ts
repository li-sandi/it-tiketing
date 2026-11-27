import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  fetchManual,
  fetchRsc,
  hasAuthSessionSetCookie,
} from "./helpers/http";
import {
  NONEXISTENT_UUID,
  PROTECTED_ROUTES,
  hasSensitiveDataLeak,
  hasStackTrace,
  isUnauthenticatedRedirectToLogin,
} from "./helpers/routes";
import { startE2eServer, type E2eServerHandle } from "./helpers/server";

const WARM_RSC_LATENCY_BUDGET_MS = 1_500;
const NON_AUTH_COOKIES =
  "it-ticketing-theme=dark; sb-test-auth-token-code-verifier=abc";

describe("Tier 3: Cross-Feature RSC Flows, Partial Prefetching & Proxy Bypass", () => {
  let server: E2eServerHandle;

  beforeAll(async () => {
    server = await startE2eServer();
  });

  afterAll(async () => {
    if (server) {
      await server.stop();
    }
  });

  describe("RSC & Partial Prefetching Protocol on Public Routes", () => {
    it("executes Next.js 16 validateRSCRequestHeaders 307 -> ?_rsc= handshake before serving Flight payload", async () => {
      const handshake = await fetchRsc(server.baseUrl, "/", {
        prefetch: true,
        followRedirects: false,
      });
      expect(handshake.status).toBe(307);
      expect(handshake.location).toBeTruthy();
      expect(handshake.location).toMatch(/[?&]_rsc=/);

      const resolved = await fetchRsc(
        server.baseUrl,
        handshake.location ?? "/",
        {
          prefetch: true,
          followRedirects: false,
        },
      );
      expect(resolved.status).toBe(200);
      expect(resolved.contentType).toContain("text/x-component");
      // Next.js 16 may emit duplicate `x-nextjs-prerender: 1` headers joined as "1, 1".
      expect(resolved.xNextjsPrerender).toMatch(/^1(?:\s*,\s*1)*$/);
    });

    for (const staticRoute of ["/", "/login", "/lapor"] as const) {
      it(`GET ${staticRoute} serves prerendered RSC prefetch & /_tree segment within ${WARM_RSC_LATENCY_BUDGET_MS}ms`, async () => {
        const warmup = await fetchRsc(server.baseUrl, staticRoute, {
          prefetch: true,
        });
        expect(warmup.status).toBe(200);

        const prefetchRes = await fetchRsc(server.baseUrl, staticRoute, {
          prefetch: true,
        });
        expect(prefetchRes.status).toBe(200);
        expect(prefetchRes.contentType).toContain("text/x-component");
        expect(prefetchRes.vary.toLowerCase()).toContain("rsc");
        expect(prefetchRes.vary.toLowerCase()).toContain("next-router-prefetch");
        if (
          staticRoute !== "/lapor" ||
          process.env.E2E_ALLOW_DYNAMIC_BASELINE !== "1"
        ) {
          expect(prefetchRes.xNextjsPrerender).toMatch(/^1(?:\s*,\s*1)*$/);
        }
        if (prefetchRes.xNextjsCache !== null) {
          expect(["HIT", "MISS", "STALE", "REVALIDATED"]).toContain(
            prefetchRes.xNextjsCache,
          );
        }
        expect(prefetchRes.durationMs).toBeLessThan(WARM_RSC_LATENCY_BUDGET_MS);
        expect(hasStackTrace(prefetchRes.body)).toBe(false);

        const segmentRes = await fetchRsc(server.baseUrl, staticRoute, {
          prefetch: true,
          segmentPrefetch: "/_tree",
        });
        expect(segmentRes.status).toBe(200);
        expect(segmentRes.contentType).toContain("text/x-component");
        expect(segmentRes.durationMs).toBeLessThan(WARM_RSC_LATENCY_BUDGET_MS);
        expect(hasStackTrace(segmentRes.body)).toBe(false);
      });
    }

    it(`GET /status/${NONEXISTENT_UUID} serves /_tree segment prefetch (200) and streamed RSC Flight navigation cleanly`, async () => {
      const target = `/status/${NONEXISTENT_UUID}`;

      // Warm up PPR segment & Flight route first.
      await fetchRsc(server.baseUrl, target, {
        prefetch: true,
        segmentPrefetch: "/_tree",
      });
      await fetchRsc(server.baseUrl, target, { prefetch: false });

      const treeRes = await fetchRsc(server.baseUrl, target, {
        prefetch: true,
        segmentPrefetch: "/_tree",
      });
      expect(treeRes.status).toBe(200);
      expect(treeRes.contentType).toContain("text/x-component");
      expect(treeRes.durationMs).toBeLessThan(WARM_RSC_LATENCY_BUDGET_MS);
      expect(hasSensitiveDataLeak(treeRes.body)).toBe(false);
      expect(hasStackTrace(treeRes.body)).toBe(false);

      const navRes = await fetchRsc(server.baseUrl, target, {
        prefetch: false,
      });
      expect(navRes.status).toBeLessThan(500);
      expect(navRes.contentType).toContain("text/x-component");
      expect(navRes.vary.toLowerCase()).toContain("rsc");
      expect(navRes.durationMs).toBeLessThan(WARM_RSC_LATENCY_BUDGET_MS);
      expect(hasSensitiveDataLeak(navRes.body)).toBe(false);
      expect(hasStackTrace(navRes.body)).toBe(false);
    });
  });

  describe("No-Cookie & Non-Auth-Cookie Proxy Bypass on Public Routes", () => {
    for (const publicRoute of [
      "/",
      "/lapor",
      "/login",
      `/status/${NONEXISTENT_UUID}`,
    ]) {
      it(`GET ${publicRoute} without cookies emits zero sb-* session Set-Cookie headers`, async () => {
        const htmlRes = await fetchManual(server.baseUrl, publicRoute);
        expect(htmlRes.status).toBeLessThan(500);
        if (publicRoute !== `/status/${NONEXISTENT_UUID}`) {
          expect(htmlRes.status).toBe(200);
        }
        expect(hasAuthSessionSetCookie(htmlRes.setCookies)).toBe(false);

        const rscRes = await fetchRsc(
          server.baseUrl,
          publicRoute,
          publicRoute.startsWith("/status/")
            ? { prefetch: true, segmentPrefetch: "/_tree" }
            : { prefetch: true },
        );
        expect(rscRes.status).toBe(200);
        expect(hasAuthSessionSetCookie(rscRes.setCookies)).toBe(false);
      });

      it(`GET ${publicRoute} with non-auth cookies (theme + code-verifier) bypasses Supabase session refresh cleanly`, async () => {
        const htmlRes = await fetchManual(server.baseUrl, publicRoute, {
          headers: { Cookie: NON_AUTH_COOKIES },
        });
        expect(htmlRes.status).toBeLessThan(500);
        if (publicRoute !== `/status/${NONEXISTENT_UUID}`) {
          expect(htmlRes.status).toBe(200);
        }
        expect(hasAuthSessionSetCookie(htmlRes.setCookies)).toBe(false);
        expect(
          htmlRes.setCookies.some((c) => /\bsb-/i.test(c)),
        ).toBe(false);

        const rscRes = await fetchRsc(server.baseUrl, publicRoute, {
          ...(publicRoute.startsWith("/status/")
            ? { prefetch: true, segmentPrefetch: "/_tree" }
            : { prefetch: true }),
          headers: { Cookie: NON_AUTH_COOKIES },
        });
        expect(rscRes.status).toBe(200);
        expect(hasAuthSessionSetCookie(rscRes.setCookies)).toBe(false);
        expect(
          rscRes.setCookies.some((c) => /\bsb-/i.test(c)),
        ).toBe(false);
      });
    }
  });

  describe("Multi-Route Sequential RSC Traversal Chains", () => {
    it("traverses public navigation chain (/ -> /lapor -> /login -> /status/[uuid] -> /) sequentially within latency budget", async () => {
      const hops: Array<{
        path: string;
        options: { prefetch: boolean; segmentPrefetch?: string };
      }> = [
        { path: "/", options: { prefetch: true } },
        { path: "/lapor", options: { prefetch: true } },
        { path: "/login", options: { prefetch: true } },
        {
          path: `/status/${NONEXISTENT_UUID}`,
          options: { prefetch: true, segmentPrefetch: "/_tree" },
        },
        { path: `/status/${NONEXISTENT_UUID}`, options: { prefetch: false } },
        { path: "/", options: { prefetch: true } },
      ];

      // Pre-warm once to avoid cold-start skew in local run.
      for (const hop of hops) {
        await fetchRsc(server.baseUrl, hop.path, hop.options);
      }

      for (const hop of hops) {
        const res = await fetchRsc(server.baseUrl, hop.path, hop.options);
        expect(res.status).toBeLessThan(500);
        expect(res.contentType).toContain("text/x-component");
        expect(hasStackTrace(res.body)).toBe(false);
        expect(
          res.durationMs,
          `Warm RSC hop for ${hop.path} took ${res.durationMs.toFixed(1)}ms`,
        ).toBeLessThan(WARM_RSC_LATENCY_BUDGET_MS);
      }
    });

    it("executes PPR /_tree segment prefetch (200) and RSC Flight navigation (redirect to /login) across all 16 protected routes", async () => {
      for (const route of PROTECTED_ROUTES) {
        const treeRes = await fetchRsc(server.baseUrl, route.samplePath, {
          prefetch: true,
          segmentPrefetch: "/_tree",
        });
        expect(
          treeRes.status,
          `Expected 200 /_tree segment prefetch for ${route.samplePath}`,
        ).toBe(200);
        expect(treeRes.contentType).toContain("text/x-component");
        expect(treeRes.durationMs).toBeLessThan(WARM_RSC_LATENCY_BUDGET_MS);
        expect(hasSensitiveDataLeak(treeRes.body)).toBe(false);
        expect(hasStackTrace(treeRes.body)).toBe(false);

        const navRes = await fetchRsc(server.baseUrl, route.samplePath, {
          prefetch: false,
        });
        expect(navRes.status).toBeLessThan(500);
        if (navRes.status === 200) {
          expect(navRes.contentType).toContain("text/x-component");
        }
        expect(
          isUnauthenticatedRedirectToLogin({
            status: navRes.status,
            location: navRes.location,
            body: navRes.body,
          }),
          `Expected RSC Flight navigation for ${route.samplePath} to redirect to /login (status=${navRes.status})`,
        ).toBe(true);
        expect(hasSensitiveDataLeak(navRes.body)).toBe(false);
        expect(hasStackTrace(navRes.body)).toBe(false);
        expect(
          navRes.durationMs,
          `Unauth RSC Flight navigation for ${route.samplePath} exceeded budget`,
        ).toBeLessThan(WARM_RSC_LATENCY_BUDGET_MS);
      }
    });
  });
});
