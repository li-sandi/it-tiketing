import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fetchManual, parseJsonSafe } from "./helpers/http";
import {
  NONEXISTENT_UUID,
  hasSensitiveDataLeak,
  hasStackTrace,
  isUnauthenticatedRedirectToLogin,
} from "./helpers/routes";
import { startE2eServer, type E2eServerHandle } from "./helpers/server";

const CORRUPT_AUTH_COOKIE = [
  "sb-test-auth-token=corrupt-base64-junk",
  "sb-test-auth-token.0=%%%invalid%%%",
  'sb-test-auth-token.1={"access_token":null',
].join("; ");

describe("Tier 2: Boundary Conditions, Invalid Inputs & Error Handling", () => {
  let server: E2eServerHandle;

  beforeAll(async () => {
    server = await startE2eServer();
  });

  afterAll(async () => {
    if (server) {
      await server.stop();
    }
  });

  describe("Invalid Tokens & IDs", () => {
    for (const invalidToken of ["invalid-token", "123", "not_a_uuid_at_all"]) {
      it(`GET /status/${invalidToken} returns 404 or streamed not-found without 500`, async () => {
        const res = await fetchManual(server.baseUrl, `/status/${invalidToken}`);
        expect(res.status).toBeLessThan(500);
        const isNotFound =
          res.status === 404 ||
          (res.status === 200 &&
            (res.body.includes("noindex") ||
              res.body.includes("404") ||
              res.body.includes("tidak ditemukan")));
        expect(isNotFound).toBe(true);
        expect(hasStackTrace(res.body)).toBe(false);
      });
    }

    it("GET /tiket/invalid-id returns 404 or /login redirect without 500", async () => {
      const res = await fetchManual(server.baseUrl, "/tiket/invalid-id");
      expect(res.status).toBeLessThan(500);
      const validOutcome =
        res.status === 404 ||
        isUnauthenticatedRedirectToLogin({
          status: res.status,
          location: res.location,
          body: res.body,
        });
      expect(validOutcome).toBe(true);
      expect(hasStackTrace(res.body)).toBe(false);
    });

    for (const badApiToken of ["invalid", "123"]) {
      it(`GET /api/tiket/publik/${badApiToken} returns 404 JSON with private no-store cache headers`, async () => {
        const res = await fetchManual(
          server.baseUrl,
          `/api/tiket/publik/${badApiToken}`,
        );
        expect(res.status).toBe(404);
        expect(res.contentType).toContain("application/json");
        expect(res.cacheControl.toLowerCase()).toContain("no-store");
        expect(res.cacheControl.toLowerCase()).toContain("private");
        const json = parseJsonSafe<{ error?: string }>(res.body);
        expect(json?.error).toBe("Tiket tidak ditemukan.");
        expect(hasStackTrace(res.body)).toBe(false);
      });
    }

    it(`GET /api/tiket/publik/${NONEXISTENT_UUID} returns 404 JSON (or clean JSON 500 if DB/admin env offline) without stack trace`, async () => {
      const res = await fetchManual(
        server.baseUrl,
        `/api/tiket/publik/${NONEXISTENT_UUID}`,
      );
      expect(hasStackTrace(res.body)).toBe(false);
      expect(hasSensitiveDataLeak(res.body)).toBe(false);
      expect(res.contentType).toContain("application/json");
      expect(res.cacheControl.toLowerCase()).toContain("no-store");
      expect(res.cacheControl.toLowerCase()).toContain("private");
      const json = parseJsonSafe<{ error?: string }>(res.body);
      expect((json?.error ?? "").length).toBeGreaterThan(0);

      if (process.env.E2E_REQUIRE_LIVE_DB === "1") {
        expect(res.status).toBe(404);
        expect(json?.error).toBe("Tiket tidak ditemukan.");
      } else {
        expect([404, 500]).toContain(res.status);
      }
    });

    it(`GET /status/${NONEXISTENT_UUID} renders graceful error/not-found HTML without React #441 or unhandled 500`, async () => {
      const res = await fetchManual(
        server.baseUrl,
        `/status/${NONEXISTENT_UUID}`,
      );
      expect(res.status).toBe(200);
      expect(res.contentType).toContain("text/html");
      expect(res.body).not.toMatch(
        /Minified React error #441|Application error|server error occurred/i,
      );
      expect(res.body).toMatch(/Tiket tidak ditemukan|Gagal memuat status tiket/i);
      expect(hasStackTrace(res.body)).toBe(false);
      expect(hasSensitiveDataLeak(res.body)).toBe(false);
    });
  });

  describe("Malformed Query Parameters & HTTP Method Boundaries", () => {
    it("GET /?foo=bar&bad=%%% renders 200 HTML cleanly without 500", async () => {
      const res = await fetchManual(server.baseUrl, "/?foo=bar&bad=%%%");
      expect(res.status).toBe(200);
      expect(res.contentType).toContain("text/html");
      expect(res.body).toContain("Layanan Bantuan IT Debito Jogja");
      expect(hasStackTrace(res.body)).toBe(false);
    });

    it("POST / rejects unsupported method with 4xx without 500 or stack trace", async () => {
      const res = await fetchManual(server.baseUrl, "/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
      expect(hasStackTrace(res.body)).toBe(false);
    });

    for (const queryRoute of [
      "/dashboard?tab=invalid&bad=%%%",
      "/antrian?filter=invalid&sort=unknown",
      "/tiket/baru?prefill=bad&site=not-a-uuid",
      "/tiket?status=invalid&site=not-a-uuid",
      "/wiki?q=test&grup=Jaringan",
      "/aset?q=test&status=invalid",
      "/stok?sort=invalid",
      "/laporan?periode=invalid&tahun=abc&kuartal=99&bulan=invalid",
      "/laporan?periode=bulanan&tahun=99999999&kuartal=99",
      "/admin/audit?page=-1&aksi=unknown",
    ]) {
      it(`GET ${queryRoute} does not 500 and redirects to /login`, async () => {
        const res = await fetchManual(server.baseUrl, queryRoute);
        expect(res.status).toBeLessThan(500);
        expect(
          isUnauthenticatedRedirectToLogin({
            status: res.status,
            location: res.location,
            body: res.body,
          }),
        ).toBe(true);
        expect(hasSensitiveDataLeak(res.body)).toBe(false);
        expect(hasStackTrace(res.body)).toBe(false);
      });
    }

    it("GET /lapor?ref=%%%bad%%% renders 200 HTML cleanly without 500", async () => {
      const res = await fetchManual(server.baseUrl, "/lapor?ref=%%%bad%%%");
      expect(res.status).toBe(200);
      expect(res.contentType).toContain("text/html");
      expect(res.body).toContain("Buat Tiket Layanan IT");
      expect(hasStackTrace(res.body)).toBe(false);
    });

    it("GET /login?next=javascript:alert(1) renders 200 HTML cleanly without reflecting raw script payload", async () => {
      const res = await fetchManual(
        server.baseUrl,
        "/login?next=javascript:alert(1)",
      );
      expect(res.status).toBe(200);
      expect(res.body).toContain("Masuk ke IT Service Desk");
      expect(res.body).not.toContain("<script>alert(1)</script>");
      expect(hasStackTrace(res.body)).toBe(false);
    });

    it("GET /api/aset/lookup?nomorAset= returns 401 JSON without 500", async () => {
      const res = await fetchManual(
        server.baseUrl,
        "/api/aset/lookup?nomorAset=",
      );
      expect(res.status).toBe(401);
      expect(res.contentType).toContain("application/json");
      expect(hasStackTrace(res.body)).toBe(false);
    });

    it("GET /api/laporan/export?periode=bulanan&tahun=99999999&kuartal=99 returns 401 JSON without 500", async () => {
      const res = await fetchManual(
        server.baseUrl,
        "/api/laporan/export?periode=bulanan&tahun=99999999&kuartal=99",
      );
      expect(res.status).toBe(401);
      expect(res.contentType).toContain("application/json");
      expect(hasStackTrace(res.body)).toBe(false);
    });
  });

  describe("Malformed / Corrupt sb-* Auth Cookies", () => {
    for (const pagePath of [
      "/dashboard",
      "/antrian",
      "/tiket",
      "/admin",
      "/admin/pengaturan",
    ]) {
      it(`GET ${pagePath} with corrupt sb-* cookies never 500s and enforces /login redirect`, async () => {
        const res = await fetchManual(server.baseUrl, pagePath, {
          headers: { Cookie: CORRUPT_AUTH_COOKIE },
        });
        expect(res.status).toBeLessThan(500);
        expect(
          isUnauthenticatedRedirectToLogin({
            status: res.status,
            location: res.location,
            body: res.body,
          }),
        ).toBe(true);
        expect(hasSensitiveDataLeak(res.body)).toBe(false);
        expect(hasStackTrace(res.body)).toBe(false);
      });
    }

    for (const apiCheck of [
      { path: "/api/stok", expectedStatus: 401 },
      { path: "/api/wiki", expectedStatus: 401 },
      { path: "/api/laporan/export", expectedStatus: 401 },
      { path: "/api/aset", expectedStatus: 403 },
      { path: "/api/admin/settings", expectedStatus: 403 },
    ]) {
      it(`GET ${apiCheck.path} with corrupt sb-* cookies returns ${apiCheck.expectedStatus} JSON without stack trace`, async () => {
        const res = await fetchManual(server.baseUrl, apiCheck.path, {
          headers: { Cookie: CORRUPT_AUTH_COOKIE },
        });
        expect(res.status).toBe(apiCheck.expectedStatus);
        expect(res.contentType).toContain("application/json");
        const json = parseJsonSafe<{ error?: string }>(res.body);
        expect(json?.error).toBeTypeOf("string");
        expect(hasStackTrace(res.body)).toBe(false);
      });
    }
  });

  describe("Pre-DB Validation, Honeypot & Cross-Origin CSRF Boundaries", () => {
    it("POST /api/tiket/publik rejects cross-origin Origin with 403", async () => {
      const res = await fetchManual(server.baseUrl, "/api/tiket/publik", {
        method: "POST",
        headers: {
          Origin: "https://evil.example.com",
          "Content-Type": "application/json",
        },
        body: "{}",
      });
      expect(res.status).toBe(403);
      expect(res.contentType).toContain("application/json");
      expect(res.cacheControl.toLowerCase()).toContain("no-store");
      expect(hasStackTrace(res.body)).toBe(false);
    });

    it("POST /api/tiket/publik rejects malformed Origin header with 403", async () => {
      const res = await fetchManual(server.baseUrl, "/api/tiket/publik", {
        method: "POST",
        headers: {
          Origin: "not-a-valid-origin",
        },
      });
      expect(res.status).toBe(403);
      expect(res.contentType).toContain("application/json");
    });

    it("POST /api/tiket/publik rejects non-FormData payload with 400", async () => {
      const res = await fetchManual(server.baseUrl, "/api/tiket/publik", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nama: "Tester" }),
      });
      expect(res.status).toBe(400);
      const json = parseJsonSafe<{ error?: string }>(res.body);
      expect(json?.error).toBe("Data form tidak valid.");
    });

    it("POST /api/tiket/publik rejects triggered honeypot field with 400", async () => {
      const form = new FormData();
      form.set("website", "https://spam.example");
      form.set("nama", "Pelapor Valid");
      form.set("siteId", NONEXISTENT_UUID);
      form.set("categoryId", NONEXISTENT_UUID);
      form.set("deskripsi", "Deskripsi gangguan minimal lima karakter");
      form.set("penanganan", "remote");

      const res = await fetchManual(server.baseUrl, "/api/tiket/publik", {
        method: "POST",
        body: form,
      });
      expect(res.status).toBe(400);
      const json = parseJsonSafe<{ error?: string }>(res.body);
      expect(json?.error).toBe("Permintaan tidak valid.");
    });

    it.each([
      {
        label: "nama too short (< 2 chars)",
        fields: {
          nama: "A",
          siteId: NONEXISTENT_UUID,
          categoryId: NONEXISTENT_UUID,
          deskripsi: "Deskripsi valid cukup panjang",
          penanganan: "remote",
        },
      },
      {
        label: "invalid siteId UUID",
        fields: {
          nama: "Pelapor Uji",
          siteId: "not-a-uuid",
          categoryId: NONEXISTENT_UUID,
          deskripsi: "Deskripsi valid cukup panjang",
          penanganan: "remote",
        },
      },
      {
        label: "invalid categoryId UUID",
        fields: {
          nama: "Pelapor Uji",
          siteId: NONEXISTENT_UUID,
          categoryId: "12345",
          deskripsi: "Deskripsi valid cukup panjang",
          penanganan: "remote",
        },
      },
      {
        label: "deskripsi too short (< 5 chars)",
        fields: {
          nama: "Pelapor Uji",
          siteId: NONEXISTENT_UUID,
          categoryId: NONEXISTENT_UUID,
          deskripsi: "abc",
          penanganan: "remote",
        },
      },
      {
        label: "invalid penanganan enum",
        fields: {
          nama: "Pelapor Uji",
          siteId: NONEXISTENT_UUID,
          categoryId: NONEXISTENT_UUID,
          deskripsi: "Deskripsi valid cukup panjang",
          penanganan: "telepathy",
        },
      },
      {
        label: "out-of-range jumlahUser (0)",
        fields: {
          nama: "Pelapor Uji",
          siteId: NONEXISTENT_UUID,
          categoryId: NONEXISTENT_UUID,
          deskripsi: "Deskripsi valid cukup panjang",
          penanganan: "onsite",
          jumlahUser: "0",
        },
      },
      {
        label: "non-integer jumlahUser (abc)",
        fields: {
          nama: "Pelapor Uji",
          siteId: NONEXISTENT_UUID,
          categoryId: NONEXISTENT_UUID,
          deskripsi: "Deskripsi valid cukup panjang",
          penanganan: "onsite",
          jumlahUser: "abc",
        },
      },
      {
        label: "fractional jumlahUser (1.5)",
        fields: {
          nama: "Pelapor Uji",
          siteId: NONEXISTENT_UUID,
          categoryId: NONEXISTENT_UUID,
          deskripsi: "Deskripsi valid cukup panjang",
          penanganan: "onsite",
          jumlahUser: "1.5",
        },
      },
      {
        label: "kontak exceeds 200 chars",
        fields: {
          nama: "Pelapor Uji",
          kontak: "k".repeat(201),
          siteId: NONEXISTENT_UUID,
          categoryId: NONEXISTENT_UUID,
          deskripsi: "Deskripsi valid cukup panjang",
          penanganan: "remote",
        },
      },
      {
        label: "out-of-range jumlahTask (100001)",
        fields: {
          nama: "Pelapor Uji",
          siteId: NONEXISTENT_UUID,
          categoryId: NONEXISTENT_UUID,
          deskripsi: "Deskripsi valid cukup panjang",
          penanganan: "onsite",
          jumlahTask: "100001",
        },
      },
    ])(
      "POST /api/tiket/publik rejects pre-DB invalid input ($label) with 400",
      async ({ fields }) => {
        const form = new FormData();
        for (const [k, v] of Object.entries(fields)) {
          form.set(k, v);
        }
        const res = await fetchManual(server.baseUrl, "/api/tiket/publik", {
          method: "POST",
          body: form,
        });
        expect(res.status).toBe(400);
        expect(res.contentType).toContain("application/json");
        const json = parseJsonSafe<{ error?: string }>(res.body);
        expect((json?.error ?? "").length).toBeGreaterThan(0);
        expect(hasStackTrace(res.body)).toBe(false);
      },
    );

    it("POST /api/tiket/publik rejects empty 0-byte attachment file with 400", async () => {
      const form = new FormData();
      form.set("nama", "Pelapor Uji");
      form.set("siteId", NONEXISTENT_UUID);
      form.set("categoryId", NONEXISTENT_UUID);
      form.set("deskripsi", "Deskripsi valid cukup panjang");
      form.set("penanganan", "remote");
      form.set("file", new File([], "empty.png", { type: "image/png" }));

      const res = await fetchManual(server.baseUrl, "/api/tiket/publik", {
        method: "POST",
        body: form,
      });
      expect(res.status).toBe(400);
      expect(res.contentType).toContain("application/json");
      const json = parseJsonSafe<{ error?: string }>(res.body);
      expect(json?.error).toBe("File lampiran kosong.");
      expect(hasStackTrace(res.body)).toBe(false);
    });

    it("POST /api/tiket/publik/[token]/rating validates token, Origin CSRF, JSON, and rating range before DB", async () => {
      const badTokenRes = await fetchManual(
        server.baseUrl,
        "/api/tiket/publik/invalid/rating",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rating: 5 }),
        },
      );
      expect(badTokenRes.status).toBe(404);

      const csrfRes = await fetchManual(
        server.baseUrl,
        `/api/tiket/publik/${NONEXISTENT_UUID}/rating`,
        {
          method: "POST",
          headers: {
            Origin: "https://evil.example.com",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ rating: 5 }),
        },
      );
      expect(csrfRes.status).toBe(403);

      const badJsonRes = await fetchManual(
        server.baseUrl,
        `/api/tiket/publik/${NONEXISTENT_UUID}/rating`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{not-json",
        },
      );
      expect(badJsonRes.status).toBe(400);

      for (const badRating of [0, 6, 3.5, "5", null]) {
        const rangeRes = await fetchManual(
          server.baseUrl,
          `/api/tiket/publik/${NONEXISTENT_UUID}/rating`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ rating: badRating }),
          },
        );
        expect(rangeRes.status).toBe(400);
        expect(hasStackTrace(rangeRes.body)).toBe(false);
      }

      const validMissingRes = await fetchManual(
        server.baseUrl,
        `/api/tiket/publik/${NONEXISTENT_UUID}/rating`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rating: 5 }),
        },
      );
      expect(hasStackTrace(validMissingRes.body)).toBe(false);
      expect(hasSensitiveDataLeak(validMissingRes.body)).toBe(false);
      expect(validMissingRes.contentType).toContain("application/json");
      expect(validMissingRes.cacheControl.toLowerCase()).toContain("no-store");
      expect(validMissingRes.cacheControl.toLowerCase()).toContain("private");
      const validMissingJson = parseJsonSafe<{ error?: string }>(
        validMissingRes.body,
      );
      expect((validMissingJson?.error ?? "").length).toBeGreaterThan(0);
      if (process.env.E2E_REQUIRE_LIVE_DB === "1") {
        expect(validMissingRes.status).toBe(409);
      } else {
        expect([409, 500]).toContain(validMissingRes.status);
      }
    });

    it("POST /api/wiki/self-check enforces Origin CSRF (403) and returns empty result for short query (< 5 chars)", async () => {
      const csrfRes = await fetchManual(
        server.baseUrl,
        "/api/wiki/self-check",
        {
          method: "POST",
          headers: {
            Origin: "https://evil.example.com",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ deskripsi: "laptop lambat" }),
        },
      );
      expect(csrfRes.status).toBe(403);

      const badJsonRes = await fetchManual(
        server.baseUrl,
        "/api/wiki/self-check",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{bad-json",
        },
      );
      expect([200, 400]).toContain(badJsonRes.status);
      expect(hasStackTrace(badJsonRes.body)).toBe(false);

      const shortRes = await fetchManual(
        server.baseUrl,
        "/api/wiki/self-check",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ deskripsi: "abc" }),
        },
      );
      expect(shortRes.status).toBe(200);
      expect(shortRes.cacheControl.toLowerCase()).toContain("no-store");
      const shortJson = parseJsonSafe<{
        articles?: unknown[];
        aiSummary?: unknown;
      }>(shortRes.body);
      expect(shortJson?.articles).toEqual([]);
      expect(shortJson?.aiSummary).toBeNull();

      const validQueryRes = await fetchManual(
        server.baseUrl,
        "/api/wiki/self-check",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ deskripsi: "laptop tidak bisa connect wifi" }),
        },
      );
      expect(hasStackTrace(validQueryRes.body)).toBe(false);
      expect(hasSensitiveDataLeak(validQueryRes.body)).toBe(false);
      expect(validQueryRes.contentType).toContain("application/json");
      expect(validQueryRes.cacheControl.toLowerCase()).toContain("no-store");
      if (process.env.E2E_REQUIRE_LIVE_DB === "1") {
        expect(validQueryRes.status).toBe(200);
      } else {
        expect([200, 500]).toContain(validQueryRes.status);
      }
    });

    it("POST /api/tiket/remote-ids enforces Origin CSRF (403), invalid JSON/short nomorAset (400), and unauth lookup boundary", async () => {
      const csrfRes = await fetchManual(
        server.baseUrl,
        "/api/tiket/remote-ids",
        {
          method: "POST",
          headers: {
            Origin: "https://evil.example.com",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ nomorAset: "AST-0001" }),
        },
      );
      expect(csrfRes.status).toBe(403);

      const badJsonRes = await fetchManual(
        server.baseUrl,
        "/api/tiket/remote-ids",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{broken",
        },
      );
      expect(badJsonRes.status).toBe(400);

      const shortAssetRes = await fetchManual(
        server.baseUrl,
        "/api/tiket/remote-ids",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ nomorAset: "A1" }),
        },
      );
      expect(shortAssetRes.status).toBe(400);

      const unknownAssetRes = await fetchManual(
        server.baseUrl,
        "/api/tiket/remote-ids",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ nomorAset: "NO-SUCH-ASSET-E2E-9999" }),
        },
      );
      expect(hasStackTrace(unknownAssetRes.body)).toBe(false);
      expect(hasSensitiveDataLeak(unknownAssetRes.body)).toBe(false);
      expect(unknownAssetRes.contentType).toContain("application/json");
      expect(unknownAssetRes.cacheControl.toLowerCase()).toContain("no-store");
      expect(unknownAssetRes.cacheControl.toLowerCase()).toContain("private");
      const unknownJson = parseJsonSafe<{ error?: string }>(
        unknownAssetRes.body,
      );
      expect((unknownJson?.error ?? "").length).toBeGreaterThan(0);
      if (process.env.E2E_REQUIRE_LIVE_DB === "1") {
        expect(unknownAssetRes.status).toBe(401);
      } else {
        expect([401, 500]).toContain(unknownAssetRes.status);
      }
    });

    it.each([
      { method: "POST", path: "/api/aset", body: {}, originFirst: true },
      { method: "POST", path: "/api/aset/import", body: { csv: "" }, originFirst: true },
      { method: "PATCH", path: `/api/aset/${NONEXISTENT_UUID}`, body: {}, originFirst: true },
      { method: "POST", path: "/api/wiki", body: {}, originFirst: true },
      { method: "PATCH", path: `/api/wiki/${NONEXISTENT_UUID}`, body: {}, originFirst: true },
      { method: "PATCH", path: "/api/it/status", body: { status: "free" }, originFirst: true },
      { method: "POST", path: "/api/tiket/remote-credentials", body: {}, originFirst: true },
      { method: "POST", path: `/api/tiket/${NONEXISTENT_UUID}/approval`, body: { keputusan: "disetujui" }, originFirst: true },
      { method: "POST", path: `/api/tiket/${NONEXISTENT_UUID}/merge`, body: { childIds: [] }, originFirst: true },
      { method: "POST", path: `/api/tiket/${NONEXISTENT_UUID}/remote-reveal`, body: {}, originFirst: true },
      { method: "POST", path: "/api/notifications/subscribe", body: {}, originFirst: true },
      { method: "DELETE", path: "/api/notifications/subscribe", body: undefined, originFirst: true },
      { method: "POST", path: "/api/stok", body: {}, originFirst: true },
      { method: "POST", path: "/api/stok/adjust", body: {}, originFirst: true },
      { method: "POST", path: "/api/tiket/lampiran", body: {}, originFirst: true },
      { method: "POST", path: "/api/notif/tiket-baru", body: {}, originFirst: true },
      { method: "POST", path: "/api/telegram/link", body: {}, originFirst: true },
      { method: "POST", path: "/api/telegram/sync", body: undefined, originFirst: true },
      { method: "POST", path: "/api/admin/sites", body: {}, originFirst: false },
      { method: "PATCH", path: "/api/admin/settings", body: {}, originFirst: false },
    ])(
      "Protected mutation $method $path rejects cross-origin Origin with 403 JSON + no-store",
      async ({ method, path, body, originFirst }) => {
        const res = await fetchManual(server.baseUrl, path, {
          method,
          headers: {
            Origin: "https://evil.example.com",
            ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
          },
          body: body !== undefined ? JSON.stringify(body) : undefined,
        });
        expect(res.status).toBe(403);
        expect(res.contentType).toContain("application/json");
        expect(res.cacheControl.toLowerCase()).toContain("no-store");
        const json = parseJsonSafe<{ error?: string }>(res.body);
        expect((json?.error ?? "").length).toBeGreaterThan(0);
        if (originFirst) {
          expect(json?.error).toBe("Asal permintaan tidak diizinkan.");
        }
        expect(hasStackTrace(res.body)).toBe(false);
      },
    );
  });
});
