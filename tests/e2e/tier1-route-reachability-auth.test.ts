import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fetchManual, parseJsonSafe } from "./helpers/http";
import {
  ALL_20_ROUTE_PATTERNS,
  API_401_ENDPOINTS,
  API_403_ENDPOINTS,
  NONEXISTENT_UUID,
  PROTECTED_ROUTES,
  PUBLIC_ROUTES,
  hasSensitiveDataLeak,
  hasStackTrace,
  isUnauthenticatedRedirectToLogin,
} from "./helpers/routes";
import { startE2eServer, type E2eServerHandle } from "./helpers/server";

type PrerenderRouteEntry = {
  renderingMode?: string;
  experimentalPPR?: boolean;
  response?: string;
  compute?: string;
  prefetchDataRoute?: string | null;
};

type PrerenderManifest = {
  version?: number;
  routes?: Record<string, PrerenderRouteEntry>;
  dynamicRoutes?: Record<string, PrerenderRouteEntry>;
};

function readNextJson<T>(relativePath: string): T {
  const fullPath = path.join(process.cwd(), ".next", relativePath);
  if (!fs.existsSync(fullPath)) {
    throw new Error(
      `Missing ${fullPath}. Ensure \`npm run build\` has completed before running Tier 1 E2E.`,
    );
  }
  return JSON.parse(fs.readFileSync(fullPath, "utf8")) as T;
}

describe("Tier 1: Build Classification, Route Reachability & Auth Enforcement", () => {
  let server: E2eServerHandle;

  beforeAll(async () => {
    server = await startE2eServer();
  });

  afterAll(async () => {
    if (server) {
      await server.stop();
    }
  });

  describe("Next.js 16 Build Manifests (.next)", () => {
    it("registers all 20 application routes in app-path-routes-manifest.json", () => {
      const appPathRoutes = readNextJson<Record<string, string>>(
        "app-path-routes-manifest.json",
      );
      const registeredRoutes = new Set(Object.values(appPathRoutes));

      for (const route of ALL_20_ROUTE_PATTERNS) {
        expect(
          registeredRoutes.has(route),
          `Expected route ${route} in .next/app-path-routes-manifest.json`,
        ).toBe(true);
      }
    });

    it("verifies prerender-manifest.json v4 classifications (0 dynamic pages; STATIC_COMPLETE on /, /login, /lapor and PPR_RESUMING on 17 routes)", () => {
      const manifest = readNextJson<PrerenderManifest>(
        "prerender-manifest.json",
      );
      expect(manifest.version).toBe(4);

      const routes = manifest.routes ?? {};
      const dynamicRoutes = manifest.dynamicRoutes ?? {};

      for (const staticPath of ["/", "/login"] as const) {
        const entry = routes[staticPath];
        expect(entry, `Expected ${staticPath} in prerender-manifest.json`).toBeDefined();
        expect(
          entry?.renderingMode === "PARTIALLY_STATIC" ||
            entry?.renderingMode === "STATIC",
          `Expected ${staticPath} renderingMode to be PARTIALLY_STATIC or STATIC, got ${entry?.renderingMode}`,
        ).toBe(true);
        expect(entry?.response).toBe("complete");
        expect(entry?.compute).toBe("static");
        expect(typeof entry?.prefetchDataRoute).toBe("string");
        expect((entry?.prefetchDataRoute ?? "").length).toBeGreaterThan(0);
      }

      if (process.env.E2E_ALLOW_DYNAMIC_BASELINE === "1") {
        return;
      }

      const allBuildRoutes = [...PUBLIC_ROUTES, ...PROTECTED_ROUTES];
      for (const route of allBuildRoutes) {
        const entry =
          routes[route.routePattern] ?? dynamicRoutes[route.routePattern];
        expect(
          entry,
          `Expected ${route.routePattern} in prerender-manifest.json (0 dynamic pages expected)`,
        ).toBeDefined();
        expect(
          entry?.renderingMode === "PARTIALLY_STATIC" ||
            entry?.renderingMode === "STATIC",
          `Expected ${route.routePattern} renderingMode to be PARTIALLY_STATIC or STATIC, got ${entry?.renderingMode}`,
        ).toBe(true);

        if (route.expectedBuildClass === "STATIC_COMPLETE") {
          expect(
            entry?.response,
            `Expected ${route.routePattern} response="complete"`,
          ).toBe("complete");
          expect(
            entry?.compute,
            `Expected ${route.routePattern} compute="static"`,
          ).toBe("static");
          expect(
            typeof entry?.prefetchDataRoute,
            `Expected ${route.routePattern} prefetchDataRoute to be defined`,
          ).toBe("string");
          expect((entry?.prefetchDataRoute ?? "").length).toBeGreaterThan(0);
        } else {
          expect(
            entry?.experimentalPPR,
            `Expected ${route.routePattern} experimentalPPR=true`,
          ).toBe(true);
          expect(
            entry?.response,
            `Expected ${route.routePattern} response="initial"`,
          ).toBe("initial");
          expect(
            entry?.compute,
            `Expected ${route.routePattern} compute="resuming"`,
          ).toBe("resuming");
        }
      }
    });
  });

  describe("Public Routes Reachability (4/4)", () => {
    it("GET / returns 200 HTML with portal heading, SLA table, and /lapor + /login links", async () => {
      const res = await fetchManual(server.baseUrl, "/");
      expect(res.status).toBe(200);
      expect(res.contentType).toContain("text/html");
      expect(res.body).toContain("Layanan Bantuan IT Debito Jogja");
      expect(res.body).toContain("Target SLA Penanganan");
      expect(res.body).toContain("P0");
      expect(res.body).toContain("P3");
      expect(res.body).toContain('href="/lapor"');
      expect(res.body).toContain('href="/login"');
      expect(hasStackTrace(res.body)).toBe(false);
    });

    it("GET /lapor returns 200 HTML with heading, home link, and form or DB-fallback state", async () => {
      const res = await fetchManual(server.baseUrl, "/lapor");
      expect(res.status).toBe(200);
      expect(res.contentType).toContain("text/html");
      expect(res.body).toContain("Buat Tiket Layanan IT");
      expect(res.body).toContain('href="/"');
      const hasFormOrFallback =
        res.body.includes("public-name") ||
        res.body.includes("Gagal memuat") ||
        res.body.includes("belum tersedia");
      expect(hasFormOrFallback).toBe(true);
      expect(hasStackTrace(res.body)).toBe(false);
    });

    it("GET /login returns 200 HTML with login form inputs and /lapor link", async () => {
      const res = await fetchManual(server.baseUrl, "/login");
      expect(res.status).toBe(200);
      expect(res.contentType).toContain("text/html");
      expect(res.body).toContain("Masuk ke IT Service Desk");
      expect(res.body).toContain('id="login-email"');
      expect(res.body).toContain('id="login-password"');
      expect(res.body).toContain('href="/lapor"');
      expect(hasStackTrace(res.body)).toBe(false);
    });

    it("GET /status/[valid-uuid] returns non-500 HTML shell without stack trace", async () => {
      const res = await fetchManual(
        server.baseUrl,
        `/status/${NONEXISTENT_UUID}`,
      );
      expect(res.status).toBeLessThan(500);
      expect([200, 404]).toContain(res.status);
      expect(res.contentType).toContain("text/html");
      expect(hasStackTrace(res.body)).toBe(false);
    });
  });

  describe("Authenticated Routes Unauthenticated Guard (16/16)", () => {
    for (const route of PROTECTED_ROUTES) {
      it(`GET ${route.samplePath} enforces /login redirect without 500 or data leaks`, async () => {
        const res = await fetchManual(server.baseUrl, route.samplePath);
        expect(res.status).toBeLessThan(500);
        expect(
          isUnauthenticatedRedirectToLogin({
            status: res.status,
            location: res.location,
            body: res.body,
          }),
          `Expected ${route.samplePath} to redirect to /login (got status=${res.status}, location=${res.location})`,
        ).toBe(true);
        expect(hasSensitiveDataLeak(res.body)).toBe(false);
        expect(hasStackTrace(res.body)).toBe(false);
      });
    }
  });

  describe("Protected API Auth Matrix (401 vs 403)", () => {
    for (const endpoint of API_401_ENDPOINTS) {
      it(`${endpoint.method} ${endpoint.path} returns 401 JSON without cookies`, async () => {
        const res = await fetchManual(server.baseUrl, endpoint.path, {
          method: endpoint.method,
          headers: endpoint.body
            ? { "Content-Type": "application/json" }
            : undefined,
          body: endpoint.body ? JSON.stringify(endpoint.body) : undefined,
        });

        expect(res.status).toBe(401);
        expect(res.contentType).toContain("application/json");
        const json = parseJsonSafe<{ error?: string }>(res.body);
        expect(json?.error).toBeTypeOf("string");
        expect((json?.error ?? "").length).toBeGreaterThan(0);

        const lowerCache = res.cacheControl.toLowerCase();
        if (endpoint.expectsNoStore) {
          expect(lowerCache).toContain("no-store");
        }
        expect(lowerCache).not.toContain("public");
        expect(lowerCache).not.toContain("max-age");
        expect(hasStackTrace(res.body)).toBe(false);
      });
    }

    for (const endpoint of API_403_ENDPOINTS) {
      it(`${endpoint.method} ${endpoint.path} returns 403 JSON without cookies`, async () => {
        const res = await fetchManual(server.baseUrl, endpoint.path, {
          method: endpoint.method,
          headers: endpoint.body
            ? { "Content-Type": "application/json" }
            : undefined,
          body: endpoint.body ? JSON.stringify(endpoint.body) : undefined,
        });

        expect(res.status).toBe(403);
        expect(res.contentType).toContain("application/json");
        const json = parseJsonSafe<{ error?: string }>(res.body);
        expect(json?.error).toBeTypeOf("string");
        expect((json?.error ?? "").length).toBeGreaterThan(0);

        const lowerCache = res.cacheControl.toLowerCase();
        if (endpoint.expectsNoStore) {
          expect(lowerCache).toContain("no-store");
        }
        expect(lowerCache).not.toContain("public");
        expect(lowerCache).not.toContain("max-age");
        expect(hasStackTrace(res.body)).toBe(false);
      });
    }
  });
});
