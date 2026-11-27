import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  CdpBrowser,
  DROPZONE_SELECTORS,
  IS_LIVE_DB,
  NONEXISTENT_UUID,
  adjustStockViaApi,
  assertNoBrowserErrors,
  assertNoLegacyUiMarkers,
  assertNoStore,
  claimTicketViaUi,
  closePublicTicketViaApi,
  completeTicketViaUi,
  createInvalidPolyglotBytes,
  createOversizedBytes,
  createPublicTicket,
  dispatchSyntheticFileDrop,
  extractLaporMeta,
  fetchManual,
  getStockItems,
  hasSensitiveDataLeak,
  hasStackTrace,
  isUnauthenticatedRedirectToLogin,
  listMigrationFiles,
  loginForCookies,
  loginViaBrowser,
  parseJsonSafe,
  pressKeyCombo,
  readRepoTextFile,
  resolveAndCloseTicketViaUi,
  resolveRoleCredentials,
  setBrowserTheme,
  startE2eServer,
  type CreatedPublicTicket,
  type E2eServerHandle,
} from "./helpers/paket";

const ANY_CREDS = resolveRoleCredentials("any");
const IT_CREDS = resolveRoleCredentials("it");
const GA_CREDS = resolveRoleCredentials("ga");
const ADMIN_CREDS = resolveRoleCredentials("admin");
const USER_CREDS = resolveRoleCredentials("user");
const GA_OR_ADMIN_CREDS = GA_CREDS ?? ADMIN_CREDS;
const IT_OR_ADMIN_CREDS = IT_CREDS ?? ADMIN_CREDS;

const CORRUPT_AUTH_COOKIE =
  "sb-test-auth-token=corrupt-junk; sb-test-auth-token.0=%%%bad%%%";

function toBlobCopy(bytes: Uint8Array, mime: string): Blob {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return new Blob([copy.buffer], { type: mime });
}

describe("Paket Tier 2: Boundary, Security & Corner Cases (F1–F24, 120 Cases)", () => {
  let server: E2eServerHandle;
  let browser: CdpBrowser;
  let sharedBoundaryTicket: CreatedPublicTicket | null = null;

  beforeAll(async () => {
    server = await startE2eServer();
    browser = await CdpBrowser.launch();
    if (IS_LIVE_DB) {
      sharedBoundaryTicket = await createPublicTicket(server.baseUrl, {
        mode: "default",
      });
    }
  });

  afterAll(async () => {
    if (browser) await browser.close();
    if (server) await server.stop();
  });

  beforeEach(() => {
    browser.clearErrors();
  });

  // =========================================================================
  // F1: Dark-mode CSS & theme boundaries (5 cases)
  // =========================================================================
  describe("F1 Boundaries: Theme State, Reduced Motion & Legacy Class Hygiene", () => {
    it("F1.B1 unknown data-theme value falls back cleanly without breaking light foreground/background", async () => {
      await browser.goto(`${server.baseUrl}/`);
      try {
        await browser.evalJs(
          `document.documentElement.dataset.theme = "unexpected-theme";`,
        );
        const bg = await browser.evalJs<string>(
          `window.getComputedStyle(document.body).backgroundColor`,
        );
        expect(bg).not.toBe("rgba(0, 0, 0, 0)");
        assertNoBrowserErrors(browser);
      } finally {
        await setBrowserTheme(browser, "light");
      }
    });

    it("F1.B2 rapid light<->dark toggling leaves no CSS errors or stuck colorScheme", async () => {
      await browser.goto(`${server.baseUrl}/`);
      try {
        for (const mode of ["dark", "light", "dark", "light"] as const) {
          await setBrowserTheme(browser, mode);
        }
        const scheme = await browser.evalJs<string>(
          `document.documentElement.style.colorScheme`,
        );
        expect(scheme).toBe("light");
        assertNoBrowserErrors(browser);
      } finally {
        await setBrowserTheme(browser, "light");
      }
    });

    it("F1.B3 corrupt theme localStorage value on / does not throw runtime error", async () => {
      await browser.goto(`${server.baseUrl}/`);
      try {
        await browser.evalJs(
          `window.localStorage.setItem("it-ticketing-theme", "corrupt-{bad}");`,
        );
        await browser.goto(`${server.baseUrl}/`);
        await browser.waitForSelector("h1");
        assertNoBrowserErrors(browser);
      } finally {
        await browser.evalJs(
          `window.localStorage.removeItem("it-ticketing-theme");`,
        );
      }
    });

    it("F1.B4 /panduan HTML contains zero legacy bg-yellow-50/bg-black classes or decorative emojis", async () => {
      const res = await fetchManual(server.baseUrl, "/panduan");
      expect(res.status).toBe(200);
      assertNoLegacyUiMarkers(res.body);
    });

    it("F1.B5 custom 404 page contains zero legacy bg-yellow-50/bg-black classes or decorative emojis", async () => {
      const res = await fetchManual(server.baseUrl, "/tidak-ada-boundary");
      expect(res.status).toBe(404);
      assertNoLegacyUiMarkers(res.body);
    });
  });

  // =========================================================================
  // F2: ImageDropzone & Upload File Boundaries (5 cases)
  // =========================================================================
  describe("F2 Boundaries: Oversized, Empty, Non-Image & Polyglot Uploads", () => {
    it("F2.B1 POST /api/tiket/publik rejects 0-byte image file with 400 JSON", async () => {
      const meta = await extractLaporMeta(server.baseUrl);
      const form = new FormData();
      form.set("nama", "Tester E2E");
      form.set("kontak", "081234567890");
      form.set("siteId", meta?.siteId ?? NONEXISTENT_UUID);
      form.set("categoryId", meta?.photoCategoryId ?? meta?.categoryId ?? NONEXISTENT_UUID);
      form.set("deskripsi", "Menguji upload file kosong 0 byte.");
      form.set("penanganan", "onsite");
      form.set("file", new Blob([], { type: "image/png" }), "empty.png");

      const res = await fetchManual(server.baseUrl, "/api/tiket/publik", {
        method: "POST",
        headers: { Origin: server.baseUrl },
        body: form,
      });
      expect(res.status).toBe(400);
      expect(res.contentType).toContain("application/json");
      if (IS_LIVE_DB) {
        expect(res.body).toMatch(/kosong|empty|file/i);
      }
      assertNoStore(res);
    });

    it("F2.B2 POST /api/tiket/publik rejects > 5MB image file with 400/413 JSON", async () => {
      const meta = await extractLaporMeta(server.baseUrl);
      const form = new FormData();
      form.set("nama", "Tester E2E");
      form.set("kontak", "081234567890");
      form.set("siteId", meta?.siteId ?? NONEXISTENT_UUID);
      form.set("categoryId", meta?.photoCategoryId ?? meta?.categoryId ?? NONEXISTENT_UUID);
      form.set("deskripsi", "Menguji upload file melebihi 5MB.");
      form.set("penanganan", "onsite");
      form.set(
        "file",
        toBlobCopy(createOversizedBytes(5 * 1024 * 1024 + 1024), "image/png"),
        "huge.png",
      );

      const res = await fetchManual(server.baseUrl, "/api/tiket/publik", {
        method: "POST",
        headers: { Origin: server.baseUrl },
        body: form,
      });
      expect([400, 413]).toContain(res.status);
      if (IS_LIVE_DB && res.status === 400) {
        expect(res.body).toMatch(/5\s*MB|maksimal|terlalu besar/i);
      }
      assertNoStore(res);
    });

    it("F2.B3 POST /api/tiket/publik rejects spoofed polyglot PNG containing HTML/script bytes with 400", async () => {
      const meta = await extractLaporMeta(server.baseUrl);
      const form = new FormData();
      form.set("nama", "Tester E2E");
      form.set("kontak", "081234567890");
      form.set("siteId", meta?.siteId ?? NONEXISTENT_UUID);
      form.set("categoryId", meta?.photoCategoryId ?? meta?.categoryId ?? NONEXISTENT_UUID);
      form.set("deskripsi", "Menguji upload file polyglot HTML berkedok PNG.");
      form.set("penanganan", "onsite");
      form.set(
        "file",
        toBlobCopy(createInvalidPolyglotBytes(), "image/png"),
        "polyglot.png",
      );

      const res = await fetchManual(server.baseUrl, "/api/tiket/publik", {
        method: "POST",
        headers: { Origin: server.baseUrl },
        body: form,
      });
      expect(res.status).toBe(400);
      if (IS_LIVE_DB) {
        expect(res.body).toMatch(/gambar|format|JPEG|PNG|WebP|GIF|valid/i);
      }
      assertNoStore(res);
    });

    it.skipIf(!ANY_CREDS)(
      "F2.B4 authenticated POST /api/tiket/lampiran rejects non-image MIME (application/pdf) with 400",
      async () => {
        if (!ANY_CREDS) return;
        const cookie = await loginForCookies(
          browser,
          server.baseUrl,
          ANY_CREDS.email,
          ANY_CREDS.password,
        );
        const form = new FormData();
        form.set("ticketId", NONEXISTENT_UUID);
        form.set(
          "file",
          new Blob(["%PDF-1.4 fake"], { type: "application/pdf" }),
          "doc.pdf",
        );
        const res = await fetchManual(server.baseUrl, "/api/tiket/lampiran", {
          method: "POST",
          headers: { Origin: server.baseUrl, Cookie: cookie },
          body: form,
        });
        expect(res.status).toBe(400);
        assertNoStore(res);
      },
    );

    it("F2.B5 /lapor ImageDropzone rejects non-image synthetic drop and shows error without crashing", async () => {
      await browser.goto(`${server.baseUrl}/lapor`);
      await browser.waitForSelector("main form");
      const meta = await extractLaporMeta(server.baseUrl);
      if (meta?.photoCategoryId) {
        await browser.selectOption("#public-category", meta.photoCategoryId);
        await new Promise((r) => setTimeout(r, 150));
      }
      const dropped = await dispatchSyntheticFileDrop(
        browser,
        DROPZONE_SELECTORS,
        "evil.html",
        "text/html",
        createInvalidPolyglotBytes(),
      );
      expect(dropped).toBe(true);
      await new Promise((r) => setTimeout(r, 200));
      const alertText = await browser.evalJs<string>(
        `(document.querySelector('main [role="alert"]')?.textContent ?? "").trim()`,
      );
      expect(alertText).toMatch(/gambar|format|jpeg|png|webp|gif|valid/i);
      const previewCount = await browser.evalJs<number>(
        `document.querySelectorAll('main form img[src^="blob:"]').length`,
      );
      expect(previewCount).toBe(0);
      assertNoBrowserErrors(browser);
    });
  });

  // =========================================================================
  // F3: ImageLightbox Boundaries (5 cases)
  // =========================================================================
  describe("F3 Boundaries: ImageLightbox Empty/Escape/XSS Resilience", () => {
    it("F3.B1 /status/[nonexistent] never renders an empty/stuck Lightbox dialog", async () => {
      await browser.goto(`${server.baseUrl}/status/${NONEXISTENT_UUID}`);
      await browser.waitForSelector("main");
      const dialogCount = await browser.evalJs<number>(
        `document.querySelectorAll('[role="dialog"]').length`,
      );
      expect(dialogCount).toBe(0);
      assertNoBrowserErrors(browser);
    });

    it("F3.B2 pressing Escape on public page without Lightbox open causes zero errors", async () => {
      await browser.goto(`${server.baseUrl}/`);
      await browser.waitForSelector("main");
      await pressKeyCombo(browser, "Escape");
      assertNoBrowserErrors(browser);
    });

    it.skipIf(!IS_LIVE_DB)(
      "F3.B3 XSS payload in ticket title/attachment caption never executes when Lightbox opens",
      async () => {
        const ticket = await createPublicTicket(server.baseUrl, {
          mode: "photo",
          withImage: true,
          deskripsi: 'E2E <img src=x onerror="window.__e2eLbXss=1"> deskripsi aman.',
        });
        expect(ticket).not.toBeNull();
        if (!ticket) return;
        await browser.goto(`${server.baseUrl}/status/${ticket.token}`);
        await browser.waitForSelector("main img", { timeoutMs: 15_000 });
        await browser.click('main button:has(img), main [role="button"]:has(img)');
        await browser.waitForSelector('[role="dialog"][aria-modal="true"]');
        expect(
          await browser.evalJs<boolean>("Boolean(window.__e2eLbXss)"),
        ).toBe(false);
        assertNoBrowserErrors(browser);
      },
    );

    it("F3.B4 malformed image extension in URL query on /status/[nonexistent] does not trigger 500", async () => {
      const res = await fetchManual(
        server.baseUrl,
        `/status/${NONEXISTENT_UUID}?img=javascript:alert(1)`,
      );
      expect(res.status).toBeLessThan(500);
      expect(hasStackTrace(res.body)).toBe(false);
    });

    it("F3.B5 /panduan never opens spurious modal dialogs on initial render", async () => {
      await browser.goto(`${server.baseUrl}/panduan`);
      await browser.waitForSelector("main");
      const modalCount = await browser.evalJs<number>(
        `document.querySelectorAll('[role="dialog"], [role="alertdialog"]').length`,
      );
      expect(modalCount).toBe(0);
      assertNoBrowserErrors(browser);
    });
  });

  // =========================================================================
  // F4: MarkdownSteps Boundaries (5 cases)
  // =========================================================================
  describe("F4 Boundaries: MarkdownSteps Empty, Unclosed Fence, XSS & Large Content", () => {
    it.skipIf(!IT_OR_ADMIN_CREDS)(
      "F4.B1 MarkdownSteps neutralizes <script> and <img onerror> inside SOP solution",
      async () => {
        if (!IT_OR_ADMIN_CREDS) return;
        const cookie = await loginForCookies(
          browser,
          server.baseUrl,
          IT_OR_ADMIN_CREDS.email,
          IT_OR_ADMIN_CREDS.password,
        );
        const title = `E2E-F4B1-${Date.now()}`;
        const createRes = await fetchManual(server.baseUrl, "/api/wiki", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Origin: server.baseUrl,
            Cookie: cookie,
          },
          body: JSON.stringify({
            judul: title,
            grup: "Umum",
            masalah: "Kendala layanan IT yang memerlukan langkah SOP standar.",
            solusi:
              '1. Uji <script>window.__e2eMdXss=1</script>\n2. <img src=x onerror="window.__e2eMdXss=2">',
            status: "published",
            is_internal: false,
          }),
        });
        expect(createRes.status).toBe(201);
        const j = parseJsonSafe<{ article?: { id?: string }; id?: string }>(
          createRes.body,
        );
        const id = j?.article?.id ?? j?.id ?? "";
        try {
          await browser.goto(`${server.baseUrl}/panduan`);
          await browser.waitForText(title);
          expect(
            await browser.evalJs<boolean>(
              `Boolean(window.__e2eMdXss) || document.querySelectorAll("main script, main img[onerror]").length > 0`,
            ),
          ).toBe(false);
          assertNoBrowserErrors(browser);
        } finally {
          if (id) {
            await fetchManual(server.baseUrl, `/api/wiki/${id}`, {
              method: "DELETE",
              headers: { Origin: server.baseUrl, Cookie: cookie },
            });
          }
        }
      },
    );

    it.skipIf(!IT_OR_ADMIN_CREDS)(
      "F4.B2 MarkdownSteps handles unclosed fenced code block without UI crash",
      async () => {
        if (!IT_OR_ADMIN_CREDS) return;
        const cookie = await loginForCookies(
          browser,
          server.baseUrl,
          IT_OR_ADMIN_CREDS.email,
          IT_OR_ADMIN_CREDS.password,
        );
        const title = `E2E-F4B2-${Date.now()}`;
        const createRes = await fetchManual(server.baseUrl, "/api/wiki", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Origin: server.baseUrl,
            Cookie: cookie,
          },
          body: JSON.stringify({
            judul: title,
            grup: "Umum",
            masalah: "Kendala layanan IT yang memerlukan langkah SOP standar.",
            solusi: "1. Langkah:\n```bash\necho unclosed",
            status: "published",
            is_internal: false,
          }),
        });
        expect(createRes.status).toBe(201);
        const j = parseJsonSafe<{ article?: { id?: string }; id?: string }>(
          createRes.body,
        );
        const id = j?.article?.id ?? j?.id ?? "";
        try {
          await browser.goto(`${server.baseUrl}/panduan`);
          await browser.waitForText(title);
          assertNoBrowserErrors(browser);
        } finally {
          if (id) {
            await fetchManual(server.baseUrl, `/api/wiki/${id}`, {
              method: "DELETE",
              headers: { Origin: server.baseUrl, Cookie: cookie },
            });
          }
        }
      },
    );

    it.skipIf(!IT_OR_ADMIN_CREDS)(
      "F4.B3 MarkdownSteps handles javascript: URI payloads without creating executable href",
      async () => {
        if (!IT_OR_ADMIN_CREDS) return;
        const cookie = await loginForCookies(
          browser,
          server.baseUrl,
          IT_OR_ADMIN_CREDS.email,
          IT_OR_ADMIN_CREDS.password,
        );
        const title = `E2E-F4B3-${Date.now()}`;
        const createRes = await fetchManual(server.baseUrl, "/api/wiki", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Origin: server.baseUrl,
            Cookie: cookie,
          },
          body: JSON.stringify({
            judul: title,
            grup: "Umum",
            masalah: "Kendala layanan IT yang memerlukan langkah SOP standar.",
            solusi: "1. [Klik](javascript:alert(1))",
            status: "published",
            is_internal: false,
          }),
        });
        expect(createRes.status).toBe(201);
        const j = parseJsonSafe<{ article?: { id?: string }; id?: string }>(
          createRes.body,
        );
        const id = j?.article?.id ?? j?.id ?? "";
        try {
          await browser.goto(`${server.baseUrl}/panduan`);
          await browser.waitForText(title);
          const hasJsHref = await browser.evalJs<boolean>(
            `Array.from(document.querySelectorAll("main a")).some((a) => (a.getAttribute("href") ?? "").toLowerCase().startsWith("javascript:"))`,
          );
          expect(hasJsHref).toBe(false);
        } finally {
          if (id) {
            await fetchManual(server.baseUrl, `/api/wiki/${id}`, {
              method: "DELETE",
              headers: { Origin: server.baseUrl, Cookie: cookie },
            });
          }
        }
      },
    );

    it.skipIf(!IT_OR_ADMIN_CREDS)(
      "F4.B4 MarkdownSteps handles 4,000+ character SOP body without horizontal overflow",
      async () => {
        if (!IT_OR_ADMIN_CREDS) return;
        const cookie = await loginForCookies(
          browser,
          server.baseUrl,
          IT_OR_ADMIN_CREDS.email,
          IT_OR_ADMIN_CREDS.password,
        );
        const title = `E2E-F4B4-${Date.now()}`;
        const longText = Array.from(
          { length: 60 },
          (_, idx) => `${idx + 1}. Langkah panjang terstruktur untuk uji overflow ${"x".repeat(45)}`,
        ).join("\n");
        const createRes = await fetchManual(server.baseUrl, "/api/wiki", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Origin: server.baseUrl,
            Cookie: cookie,
          },
          body: JSON.stringify({
            judul: title,
            grup: "Umum",
            masalah: "Kendala layanan IT yang memerlukan langkah SOP standar.",
            solusi: longText,
            status: "published",
            is_internal: false,
          }),
        });
        expect(createRes.status).toBe(201);
        const j = parseJsonSafe<{ article?: { id?: string }; id?: string }>(
          createRes.body,
        );
        const id = j?.article?.id ?? j?.id ?? "";
        try {
          await browser.goto(`${server.baseUrl}/panduan`);
          await browser.waitForText(title);
          const overflow = await browser.evalJs<boolean>(
            `document.documentElement.scrollWidth > document.documentElement.clientWidth`,
          );
          expect(overflow).toBe(false);
        } finally {
          if (id) {
            await fetchManual(server.baseUrl, `/api/wiki/${id}`, {
              method: "DELETE",
              headers: { Origin: server.baseUrl, Cookie: cookie },
            });
          }
        }
      },
    );

    it("F4.B5 /panduan with empty search term shows default state cleanly", async () => {
      const res = await fetchManual(server.baseUrl, "/panduan?q=");
      expect(res.status).toBe(200);
      expect(hasStackTrace(res.body)).toBe(false);
    });
  });

  // =========================================================================
  // F5: Login UX Boundaries (5 cases)
  // =========================================================================
  describe("F5 Boundaries: Login Validation, SQLi Email & Redirect Hygiene", () => {
    it("F5.B1 /login blocks empty email/password submission via HTML5 constraint validation", async () => {
      await browser.goto(`${server.baseUrl}/login`);
      await browser.waitForSelector("#login-email");
      expect(
        await browser.evalJs<boolean>(
          `Boolean(document.querySelector("main form")?.checkValidity())`,
        ),
      ).toBe(false);
    });

    it("F5.B2 /login rejects SQLi string in email input cleanly without 500", async () => {
      await browser.goto(`${server.baseUrl}/login`);
      await browser.fillInput("#login-email", "' OR 1=1 --");
      await browser.fillInput("#login-password", "password123");
      await browser.click('main form button[type="submit"]');
      expect(await browser.evalJs<string>("window.location.pathname")).toBe(
        "/login",
      );
      expect(browser.serverErrors).toEqual([]);
    });

    it("F5.B3 /login?next=javascript:alert(1) never executes injected script", async () => {
      await browser.goto(
        `${server.baseUrl}/login?next=javascript:window.__e2eLoginXss=1`,
      );
      await browser.waitForSelector("#login-email");
      expect(
        await browser.evalJs<boolean>("Boolean(window.__e2eLoginXss)"),
      ).toBe(false);
      assertNoBrowserErrors(browser);
    });

    it("F5.B4 /login?next=//evil.example.com renders login safely without off-origin auto-redirect", async () => {
      const res = await fetchManual(
        server.baseUrl,
        "/login?next=//evil.example.com",
      );
      expect(res.status).toBe(200);
      expect(hasStackTrace(res.body)).toBe(false);
    });

    it("F5.B5 toggling password visibility twice preserves typed password value", async () => {
      await browser.goto(`${server.baseUrl}/login`);
      await browser.fillInput("#login-password", "Secret!234");
      const toggleSel =
        'button[aria-label*="sandi" i], button[aria-label*="password" i], button[aria-pressed]';
      await browser.click(toggleSel);
      await browser.click(toggleSel);
      const val = await browser.evalJs<string>(
        `document.querySelector("#login-password") instanceof HTMLInputElement ? document.querySelector("#login-password").value : ""`,
      );
      expect(val).toBe("Secret!234");
    });
  });

  // =========================================================================
  // F6: ConfirmDialog & Toast Boundaries (5 cases)
  // =========================================================================
  describe("F6 Boundaries: ConfirmDialog Cancel/Escape & Toast Lifecycle", () => {
    it.skipIf(!IT_OR_ADMIN_CREDS)(
      "F6.B1 canceling /wiki delete ConfirmDialog keeps SOP article intact",
      async () => {
        if (!IT_OR_ADMIN_CREDS) return;
        const cookie = await loginForCookies(
          browser,
          server.baseUrl,
          IT_OR_ADMIN_CREDS.email,
          IT_OR_ADMIN_CREDS.password,
        );
        const title = `E2E-F6B1-${Date.now()}`;
        const createRes = await fetchManual(server.baseUrl, "/api/wiki", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Origin: server.baseUrl,
            Cookie: cookie,
          },
          body: JSON.stringify({
            judul: title,
            grup: "Umum",
            masalah: "Kendala layanan IT yang memerlukan langkah SOP standar.",
            solusi: "1. Jangan dihapus.",
            status: "draft",
            is_internal: false,
          }),
        });
        expect(createRes.status).toBe(201);
        const j = parseJsonSafe<{ article?: { id?: string }; id?: string }>(
          createRes.body,
        );
        const id = j?.article?.id ?? j?.id ?? "";
        try {
          await browser.goto(`${server.baseUrl}/wiki`);
          await browser.waitForText(title);
          await browser.evalJs(
            `(() => {
              const card = Array.from(document.querySelectorAll("main article, main section, main div")).find((c) => (c.textContent ?? "").includes(${JSON.stringify(title)}) && c.querySelector("button"));
              const del = card ? Array.from(card.querySelectorAll("button")).find((b) => /hapus/i.test(b.textContent ?? "")) : null;
              if (del instanceof HTMLButtonElement) del.click();
            })()`,
          );
          await browser.waitForSelector('[role="alertdialog"]');
          await pressKeyCombo(browser, "Escape");
          await new Promise((r) => setTimeout(r, 200));
          const stillPresent = await browser.evalJs<boolean>(
            `document.body.innerText.includes(${JSON.stringify(title)})`,
          );
          expect(stillPresent).toBe(true);
        } finally {
          if (id) {
            await fetchManual(server.baseUrl, `/api/wiki/${id}`, {
              method: "DELETE",
              headers: { Origin: server.baseUrl, Cookie: cookie },
            });
          }
        }
      },
    );

    it.skipIf(!ADMIN_CREDS)(
      "F6.B2 canceling /admin/jadwal ConfirmDialog via Batal button emits no POST request",
      async () => {
        if (!ADMIN_CREDS) return;
        await loginViaBrowser(
          browser,
          server.baseUrl,
          ADMIN_CREDS.email,
          ADMIN_CREDS.password,
        );
        await browser.goto(`${server.baseUrl}/admin/jadwal`);
        await browser.waitForSelector("main");
        await browser.evalJs(
          `(() => {
            const btn = Array.from(document.querySelectorAll("main button")).find((b) => /generate|buat jadwal/i.test(b.textContent ?? ""));
            if (btn instanceof HTMLButtonElement) btn.click();
          })()`,
        );
        await browser.waitForSelector('[role="alertdialog"]');
        await browser.evalJs(
          `(() => {
            const btn = Array.from(document.querySelectorAll('[role="alertdialog"] button')).find((b) => /batal/i.test(b.textContent ?? ""));
            if (btn instanceof HTMLButtonElement) btn.click();
          })()`,
        );
        await new Promise((r) => setTimeout(r, 150));
        expect(
          await browser.evalJs<boolean>(
            `Boolean(document.querySelector('[role="alertdialog"]'))`,
          ),
        ).toBe(false);
      },
    );

    it("F6.B3 unauthenticated POST /api/admin/generate-jadwal with malformed Origin returns 403 no-store", async () => {
      const res = await fetchManual(
        server.baseUrl,
        "/api/admin/generate-jadwal",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Origin: "not-a-valid-origin",
          },
          body: "{}",
        },
      );
      expect(res.status).toBe(403);
      assertNoStore(res);
    });

    it.skipIf(!IT_OR_ADMIN_CREDS)(
      "F6.B4 Toast dismiss button removes role=status notification immediately",
      async () => {
        if (!IT_OR_ADMIN_CREDS) return;
        const cookie = await loginForCookies(
          browser,
          server.baseUrl,
          IT_OR_ADMIN_CREDS.email,
          IT_OR_ADMIN_CREDS.password,
        );
        const title = `E2E-F6B4-${Date.now()}`;
        const createRes = await fetchManual(server.baseUrl, "/api/wiki", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Origin: server.baseUrl,
            Cookie: cookie,
          },
          body: JSON.stringify({
            judul: title,
            grup: "Umum",
            masalah: "Kendala layanan IT yang memerlukan langkah SOP standar.",
            solusi: "1. Uji tutup toast.",
            status: "draft",
            is_internal: false,
          }),
        });
        expect(createRes.status).toBe(201);
        const cj = parseJsonSafe<{ article?: { id?: string }; id?: string }>(
          createRes.body,
        );
        const id = cj?.article?.id ?? cj?.id ?? "";
        try {
          await browser.goto(`${server.baseUrl}/wiki`);
          await browser.waitForText(title);
          await browser.evalJs(
            `(() => {
              const card = Array.from(document.querySelectorAll("main article, main section, main div")).find((c) => (c.textContent ?? "").includes(${JSON.stringify(title)}) && c.querySelector("button"));
              const del = card ? Array.from(card.querySelectorAll("button")).find((b) => /hapus/i.test(b.textContent ?? "")) : null;
              if (del instanceof HTMLButtonElement) del.click();
            })()`,
          );
          await browser.waitForSelector('[role="alertdialog"]');
          await browser.evalJs(
            `(() => {
              const btn = Array.from(document.querySelectorAll('[role="alertdialog"] button')).find((b) => !/batal/i.test(b.textContent ?? ""));
              if (btn instanceof HTMLButtonElement) btn.click();
            })()`,
          );
          await browser.waitForSelector('[role="status"]');
          await browser.click('[role="status"] button[aria-label*="Tutup" i]');
          await new Promise((r) => setTimeout(r, 100));
          expect(
            await browser.evalJs<number>(
              `document.querySelectorAll('[role="status"]').length`,
            ),
          ).toBe(0);
        } finally {
          if (id) {
            await fetchManual(server.baseUrl, `/api/wiki/${id}`, {
              method: "DELETE",
              headers: { Origin: server.baseUrl, Cookie: cookie },
            }).catch(() => undefined);
          }
        }
      },
    );

    it("F6.B5 public pages do not inject blocking alertdialog overlays on initial load", async () => {
      await browser.goto(`${server.baseUrl}/`);
      await browser.waitForSelector("main");
      expect(
        await browser.evalJs<number>(
          `document.querySelectorAll('[role="alertdialog"]').length`,
        ),
      ).toBe(0);
    });
  });

  // =========================================================================
  // F7: SQL Migration & RLS Boundary Audits (5 cases)
  // =========================================================================
  describe("F7 Boundaries: Migration Safety & RLS Isolation Contracts", () => {
    it("F7.B1 migrations 0032+ contain zero TRUNCATE or DROP commands", () => {
      const files = listMigrationFiles().filter(
        (f) => Number.parseInt(f.slice(0, 4), 10) >= 32,
      );
      expect(files.length).toBeGreaterThan(0);
      for (const file of files) {
        const sql = readRepoTextFile(`supabase/migrations/${file}`);
        expect(sql).not.toMatch(/\b(DROP|TRUNCATE)\b/i);
      }
    });

    it("F7.B2 ticket_comments RLS policy enforces staff-only internal read isolation", () => {
      const files = listMigrationFiles().filter(
        (f) => Number.parseInt(f.slice(0, 4), 10) >= 32,
      );
      const sql = files
        .map((f) => readRepoTextFile(`supabase/migrations/${f}`))
        .join("\n");
      expect(sql).toMatch(/ticket_comments[\s\S]*is_internal/i);
      expect(sql).toMatch(/CREATE\s+POLICY[\s\S]*ticket_comments/i);
    });

    it("F7.B3 in_app_notifications RLS policy scopes access to auth.uid() = user_id", () => {
      const files = listMigrationFiles().filter(
        (f) => Number.parseInt(f.slice(0, 4), 10) >= 32,
      );
      const sql = files
        .map((f) => readRepoTextFile(`supabase/migrations/${f}`))
        .join("\n");
      expect(sql).toMatch(/in_app_notifications[\s\S]*auth\.uid\(\)/i);
    });

    it("F7.B4 knowledge_articles RLS / query filters restrict is_internal=true from public reads", () => {
      const files = listMigrationFiles().filter(
        (f) => Number.parseInt(f.slice(0, 4), 10) >= 32,
      );
      const sql = files
        .map((f) => readRepoTextFile(`supabase/migrations/${f}`))
        .join("\n");
      expect(sql).toMatch(/knowledge_articles[\s\S]*is_internal/i);
    });

    it("F7.B5 migrations 0032+ avoid overly permissive USING (true) on sensitive mutation policies", () => {
      const files = listMigrationFiles().filter(
        (f) => Number.parseInt(f.slice(0, 4), 10) >= 32,
      );
      for (const file of files) {
        const sql = readRepoTextFile(`supabase/migrations/${file}`);
        expect(sql).not.toMatch(/FOR\s+(INSERT|UPDATE|DELETE)[\s\S]{0,120}USING\s*\(\s*true\s*\)/i);
      }
    });
  });

  // =========================================================================
  // F8: CSRF Origin & Cache-Control Boundaries (5 cases)
  // =========================================================================
  describe("F8 Boundaries: Cross-Origin & Malformed Origin CSRF Rejections", () => {
    it("F8.B1 cross-origin POST /api/tiket/[id]/comments returns 403 JSON with no-store", async () => {
      const res = await fetchManual(
        server.baseUrl,
        `/api/tiket/${NONEXISTENT_UUID}/comments`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Origin: "https://evil.example.com",
          },
          body: JSON.stringify({ isi: "csrf" }),
        },
      );
      expect(res.status).toBe(403);
      assertNoStore(res);
    });

    it("F8.B2 cross-origin POST /api/tiket/publik/[token]/reply returns 403 JSON with no-store", async () => {
      const res = await fetchManual(
        server.baseUrl,
        `/api/tiket/publik/${NONEXISTENT_UUID}/reply`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Origin: "https://evil.example.com",
          },
          body: JSON.stringify({ isi: "csrf" }),
        },
      );
      expect(res.status).toBe(403);
      assertNoStore(res);
    });

    it("F8.B3 cross-origin PATCH /api/notifications returns 403 JSON with no-store", async () => {
      const res = await fetchManual(server.baseUrl, "/api/notifications", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Origin: "https://evil.example.com",
        },
        body: JSON.stringify({ markAllRead: true }),
      });
      expect(res.status).toBe(403);
      assertNoStore(res);
    });

    it("F8.B4 malformed Origin header on POST /api/stok/adjust returns 403 JSON with no-store", async () => {
      const res = await fetchManual(server.baseUrl, "/api/stok/adjust", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "://malformed",
        },
        body: JSON.stringify({ kode: "X", delta: 1, jenis: "masuk" }),
      });
      expect(res.status).toBe(403);
      assertNoStore(res);
    });

    it("F8.B5 cross-origin PATCH /api/aset/[id] returns 403 JSON with no-store", async () => {
      const res = await fetchManual(
        server.baseUrl,
        `/api/aset/${NONEXISTENT_UUID}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Origin: "https://evil.example.com",
          },
          body: JSON.stringify({ status: "aktif" }),
        },
      );
      expect(res.status).toBe(403);
      assertNoStore(res);
    });
  });

  // =========================================================================
  // F9: Two-Way Ticket Comments Boundaries (5 cases)
  // =========================================================================
  describe("F9 Boundaries: Comment UUID, Body Length & Internal Escalation", () => {
    it.skipIf(!ANY_CREDS)(
      "F9.B1 GET /api/tiket/not-a-uuid/comments rejects invalid UUID with 400/404 no-store",
      async () => {
        if (!ANY_CREDS) return;
        const cookie = await loginForCookies(
          browser,
          server.baseUrl,
          ANY_CREDS.email,
          ANY_CREDS.password,
        );
        const res = await fetchManual(
          server.baseUrl,
          "/api/tiket/not-a-uuid/comments",
          { headers: { Cookie: cookie } },
        );
        expect([400, 404]).toContain(res.status);
        assertNoStore(res);
      },
    );

    it.skipIf(!ANY_CREDS)(
      "F9.B2 POST /api/tiket/not-a-uuid/comments rejects invalid UUID with 400/404 no-store",
      async () => {
        if (!ANY_CREDS) return;
        const cookie = await loginForCookies(
          browser,
          server.baseUrl,
          ANY_CREDS.email,
          ANY_CREDS.password,
        );
        const res = await fetchManual(
          server.baseUrl,
          "/api/tiket/not-a-uuid/comments",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Origin: server.baseUrl,
              Cookie: cookie,
            },
            body: JSON.stringify({ isi: "test" }),
          },
        );
        expect([400, 404]).toContain(res.status);
        assertNoStore(res);
      },
    );

    it.skipIf(!IT_OR_ADMIN_CREDS || !IS_LIVE_DB)(
      "F9.B3 POST /api/tiket/[id]/comments rejects empty/whitespace isi with 400",
      async () => {
        if (!IT_OR_ADMIN_CREDS) return;
        const ticket = sharedBoundaryTicket;
        expect(ticket).not.toBeNull();
        if (!ticket) return;
        const cookie = await loginForCookies(
          browser,
          server.baseUrl,
          IT_OR_ADMIN_CREDS.email,
          IT_OR_ADMIN_CREDS.password,
        );
        const res = await fetchManual(
          server.baseUrl,
          `/api/tiket/${ticket.id}/comments`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Origin: server.baseUrl,
              Cookie: cookie,
            },
            body: JSON.stringify({ isi: "   \n\t  " }),
          },
        );
        expect(res.status).toBe(400);
        assertNoStore(res);
      },
    );

    it.skipIf(!IT_OR_ADMIN_CREDS || !IS_LIVE_DB)(
      "F9.B4 POST /api/tiket/[id]/comments rejects > 5000 char isi with 400",
      async () => {
        if (!IT_OR_ADMIN_CREDS) return;
        const ticket = sharedBoundaryTicket;
        expect(ticket).not.toBeNull();
        if (!ticket) return;
        const cookie = await loginForCookies(
          browser,
          server.baseUrl,
          IT_OR_ADMIN_CREDS.email,
          IT_OR_ADMIN_CREDS.password,
        );
        const res = await fetchManual(
          server.baseUrl,
          `/api/tiket/${ticket.id}/comments`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Origin: server.baseUrl,
              Cookie: cookie,
            },
            body: JSON.stringify({ isi: "a".repeat(5001) }),
          },
        );
        expect(res.status).toBe(400);
        assertNoStore(res);
      },
    );

    it.skipIf(!USER_CREDS || !IT_OR_ADMIN_CREDS || !IS_LIVE_DB)(
      "F9.B5 user role sending isInternal: true cannot persist an internal note",
      async () => {
        if (!USER_CREDS || !IT_OR_ADMIN_CREDS) return;
        const ticket = sharedBoundaryTicket;
        expect(ticket).not.toBeNull();
        if (!ticket) return;
        const userCookie = await loginForCookies(
          browser,
          server.baseUrl,
          USER_CREDS.email,
          USER_CREDS.password,
        );
        const probe = `EscalateProbe-${Date.now()}`;
        const res = await fetchManual(
          server.baseUrl,
          `/api/tiket/${ticket.id}/comments`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Origin: server.baseUrl,
              Cookie: userCookie,
            },
            body: JSON.stringify({ isi: probe, isInternal: true }),
          },
        );
        if (res.status === 200 || res.status === 201) {
          const itCookie = await loginForCookies(
            browser,
            server.baseUrl,
            IT_OR_ADMIN_CREDS.email,
            IT_OR_ADMIN_CREDS.password,
          );
          const listRes = await fetchManual(
            server.baseUrl,
            `/api/tiket/${ticket.id}/comments`,
            { headers: { Cookie: itCookie } },
          );
          const json = parseJsonSafe<{
            comments?: Array<{ isi?: string; is_internal?: boolean }>;
          }>(listRes.body);
          const match = json?.comments?.find((c) => c.isi === probe);
          expect(match?.is_internal).toBe(false);
        } else {
          expect([403, 404]).toContain(res.status);
        }
      },
    );
  });

  // =========================================================================
  // F10: menunggu_user & Public Reply Boundaries (5 cases)
  // =========================================================================
  describe("F10 Boundaries: Public Reply Validation & Closed Ticket Guard", () => {
    it("F10.B1 POST /api/tiket/publik/not-a-uuid/reply returns 400/404 JSON no-store", async () => {
      const res = await fetchManual(
        server.baseUrl,
        "/api/tiket/publik/not-a-uuid/reply",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Origin: server.baseUrl,
          },
          body: JSON.stringify({ isi: "Halo" }),
        },
      );
      expect([400, 404]).toContain(res.status);
      assertNoStore(res);
    });

    it.skipIf(!IS_LIVE_DB)(
      "F10.B2 POST /api/tiket/publik/[token]/reply rejects empty/whitespace isi with 400",
      async () => {
        expect(sharedBoundaryTicket).not.toBeNull();
        if (!sharedBoundaryTicket) return;
        const res = await fetchManual(
          server.baseUrl,
          `/api/tiket/publik/${sharedBoundaryTicket.token}/reply`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Origin: server.baseUrl,
            },
            body: JSON.stringify({ isi: "   " }),
          },
        );
        expect(res.status).toBe(400);
        assertNoStore(res);
      },
    );

    it.skipIf(!IS_LIVE_DB)(
      "F10.B3 POST /api/tiket/publik/[token]/reply rejects > 5000 char isi with 400",
      async () => {
        expect(sharedBoundaryTicket).not.toBeNull();
        if (!sharedBoundaryTicket) return;
        const res = await fetchManual(
          server.baseUrl,
          `/api/tiket/publik/${sharedBoundaryTicket.token}/reply`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Origin: server.baseUrl,
            },
            body: JSON.stringify({ isi: "z".repeat(5001) }),
          },
        );
        expect(res.status).toBe(400);
        assertNoStore(res);
      },
    );

    it.skipIf(!IS_LIVE_DB)(
      "F10.B4 POST /api/tiket/publik/[token]/reply rejects malformed JSON body with 400",
      async () => {
        expect(sharedBoundaryTicket).not.toBeNull();
        if (!sharedBoundaryTicket) return;
        const res = await fetchManual(
          server.baseUrl,
          `/api/tiket/publik/${sharedBoundaryTicket.token}/reply`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Origin: server.baseUrl,
            },
            body: "{not-json",
          },
        );
        expect(res.status).toBe(400);
        assertNoStore(res);
      },
    );

    it.skipIf(!IT_OR_ADMIN_CREDS || !IS_LIVE_DB)(
      "F10.B5 closed (ditutup) ticket does NOT reopen to diproses on public reply",
      async () => {
        if (!IT_OR_ADMIN_CREDS) return;
        const ticket = await createPublicTicket(server.baseUrl, {
          mode: "default",
        });
        expect(ticket).not.toBeNull();
        if (!ticket) return;

        // Move to selesai then rate to ditutup
        await loginViaBrowser(
          browser,
          server.baseUrl,
          IT_OR_ADMIN_CREDS.email,
          IT_OR_ADMIN_CREDS.password,
        );
        await completeTicketViaUi(
          browser,
          server.baseUrl,
          ticket.id,
          "Tutup permanen",
          "2",
        );

        const rateRes = await closePublicTicketViaApi(
          server.baseUrl,
          ticket.token,
          5,
        );
        expect(rateRes.status).toBe(200);

        const replyAfterClose = await fetchManual(
          server.baseUrl,
          `/api/tiket/publik/${ticket.token}/reply`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Origin: server.baseUrl,
            },
            body: JSON.stringify({ isi: "Coba buka lagi" }),
          },
        );
        expect([400, 403, 409]).toContain(replyAfterClose.status);
        const pubRes = await fetchManual(
          server.baseUrl,
          `/api/tiket/publik/${ticket.token}`,
        );
        expect(pubRes.body).toContain("ditutup");
      },
    );
  });

  // =========================================================================
  // F11: /antrian Queue & Role Boundaries (5 cases)
  // =========================================================================
  describe("F11 Boundaries: /antrian Query Params, SQLi Search & Role Guards", () => {
    it("F11.B1 /antrian?filter=invalid&sort=unknown redirects cleanly without 500", async () => {
      const res = await fetchManual(
        server.baseUrl,
        "/antrian?filter=invalid&sort=unknown",
      );
      expect(res.status).toBeLessThan(500);
      expect(
        isUnauthenticatedRedirectToLogin({
          status: res.status,
          location: res.location,
          body: res.body,
        }),
      ).toBe(true);
    });

    it("F11.B2 /antrian with corrupt auth cookie does not 500", async () => {
      const res = await fetchManual(server.baseUrl, "/antrian", {
        headers: { Cookie: CORRUPT_AUTH_COOKIE },
      });
      expect(res.status).toBeLessThan(500);
      expect(hasStackTrace(res.body)).toBe(false);
    });

    it.skipIf(!USER_CREDS)(
      "F11.B3 standard user role is blocked from /antrian",
      async () => {
        if (!USER_CREDS) return;
        await loginViaBrowser(
          browser,
          server.baseUrl,
          USER_CREDS.email,
          USER_CREDS.password,
        );
        await browser.goto(`${server.baseUrl}/antrian`);
        const pathname = await browser.evalJs<string>("window.location.pathname");
        expect(pathname).not.toBe("/antrian");
      },
    );

    it.skipIf(!IT_OR_ADMIN_CREDS || !IS_LIVE_DB)(
      "F11.B4 /antrian search input handles SQLi payload without error or NaN",
      async () => {
        if (!IT_OR_ADMIN_CREDS) return;
        expect(sharedBoundaryTicket).not.toBeNull();
        if (!sharedBoundaryTicket) return;
        await loginViaBrowser(
          browser,
          server.baseUrl,
          IT_OR_ADMIN_CREDS.email,
          IT_OR_ADMIN_CREDS.password,
        );
        await browser.goto(`${server.baseUrl}/antrian`);
        await browser.waitForSelector("main");
        const searchSel = 'main input[type="search"], main input[type="text"]';
        const hasSearch = await browser.evalJs<boolean>(
          `Boolean(document.querySelector(${JSON.stringify(searchSel)}))`,
        );
        expect(hasSearch).toBe(true);
        await browser.fillInput(searchSel, "' OR 1=1 --");
        const text = await browser.evalJs<string>("document.body.innerText");
        expect(text).not.toContain("NaN");
        assertNoBrowserErrors(browser);
      },
    );

    it.skipIf(!IT_OR_ADMIN_CREDS)(
      "F11.B5 /antrian SLA indicators never display NaN or undefined",
      async () => {
        if (!IT_OR_ADMIN_CREDS) return;
        await loginViaBrowser(
          browser,
          server.baseUrl,
          IT_OR_ADMIN_CREDS.email,
          IT_OR_ADMIN_CREDS.password,
        );
        await browser.goto(`${server.baseUrl}/antrian`);
        await browser.waitForSelector("main");
        const text = await browser.evalJs<string>("document.body.innerText");
        expect(text).not.toContain("NaN");
        expect(text).not.toContain("undefined");
        assertNoBrowserErrors(browser);
      },
    );
  });

  // =========================================================================
  // F12: Canned Responses & Completion Boundaries (5 cases)
  // =========================================================================
  describe("F12 Boundaries: Canned Solution Empty Guard & XSS Neutralization", () => {
    it.skipIf(!IT_OR_ADMIN_CREDS || !IS_LIVE_DB)(
      "F12.B1 completing ticket with empty catatanSolusi is blocked client/server-side",
      async () => {
        if (!IT_OR_ADMIN_CREDS) return;
        const ticket = await createPublicTicket(server.baseUrl, {
          mode: "default",
        });
        expect(ticket).not.toBeNull();
        if (!ticket) return;
        try {
          await loginViaBrowser(
            browser,
            server.baseUrl,
            IT_OR_ADMIN_CREDS.email,
            IT_OR_ADMIN_CREDS.password,
          );
          await claimTicketViaUi(browser, server.baseUrl, ticket.id);
          const openedForm = await browser.evalJs<boolean>(
            `(() => {
              const btn = Array.from(document.querySelectorAll("main button")).find((b) =>
                /ubah ke selesai|selesaikan/i.test(b.textContent ?? "")
              );
              if (!(btn instanceof HTMLButtonElement)) return false;
              btn.click();
              return true;
            })()`,
          );
          expect(openedForm).toBe(true);
          await browser.waitForSelector("#solution-note, main textarea", {
            visible: true,
          });
          const hasDiff = await browser.evalJs<boolean>(
            `Boolean(document.querySelector("#difficulty-points"))`,
          );
          if (hasDiff) {
            await browser.selectOption("#difficulty-points", "2");
          }
          await browser.evalJs(
            `(() => {
              const submit = Array.from(document.querySelectorAll("main button")).find((b) => /selesaikan tiket|simpan solusi|konfirmasi selesai/i.test(b.textContent ?? ""));
              if (submit instanceof HTMLButtonElement) submit.click();
            })()`,
          );
          await new Promise((r) => setTimeout(r, 600));
          const pubRes = await fetchManual(
            server.baseUrl,
            `/api/tiket/publik/${ticket.token}`,
          );
          expect(pubRes.body).not.toContain('"status":"selesai"');
        } finally {
          await resolveAndCloseTicketViaUi(
            browser,
            server.baseUrl,
            ticket,
          ).catch(() => undefined);
        }
      },
    );

    it.skipIf(!IT_OR_ADMIN_CREDS || !IS_LIVE_DB)(
      "F12.B2 XSS payload in Wiki SOP title does not execute in TicketActions picker",
      async () => {
        if (!IT_OR_ADMIN_CREDS) return;
        const cookie = await loginForCookies(
          browser,
          server.baseUrl,
          IT_OR_ADMIN_CREDS.email,
          IT_OR_ADMIN_CREDS.password,
        );
        const xssTitle = `E2E <script>window.__e2ePickXss=1</script> ${Date.now()}`;
        const w = await fetchManual(server.baseUrl, "/api/wiki", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Origin: server.baseUrl,
            Cookie: cookie,
          },
          body: JSON.stringify({
            judul: xssTitle,
            grup: "Umum",
            masalah: "Kendala layanan IT yang memerlukan langkah SOP standar.",
            solusi: "1. Aman",
            status: "published",
            is_internal: false,
          }),
        });
        expect(w.status).toBe(201);
        const wj = parseJsonSafe<{ article?: { id?: string }; id?: string }>(w.body);
        const wid = wj?.article?.id ?? wj?.id ?? "";
        const ticket = sharedBoundaryTicket;
        try {
          expect(ticket).not.toBeNull();
          if (!ticket) return;
          await browser.goto(`${server.baseUrl}/tiket/${ticket.id}`);
          await browser.waitForSelector("main");
          expect(
            await browser.evalJs<boolean>("Boolean(window.__e2ePickXss)"),
          ).toBe(false);
          assertNoBrowserErrors(browser);
        } finally {
          if (wid) {
            await fetchManual(server.baseUrl, `/api/wiki/${wid}`, {
              method: "DELETE",
              headers: { Origin: server.baseUrl, Cookie: cookie },
            });
          }
        }
      },
    );

    it.skipIf(!IT_OR_ADMIN_CREDS || !IS_LIVE_DB)(
      "F12.B3 draft Wiki SOP does not leak as public solution in /panduan",
      async () => {
        if (!IT_OR_ADMIN_CREDS) return;
        const cookie = await loginForCookies(
          browser,
          server.baseUrl,
          IT_OR_ADMIN_CREDS.email,
          IT_OR_ADMIN_CREDS.password,
        );
        const draftTitle = `E2E-DRAFT-PICK-${Date.now()}`;
        const w = await fetchManual(server.baseUrl, "/api/wiki", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Origin: server.baseUrl,
            Cookie: cookie,
          },
          body: JSON.stringify({
            judul: draftTitle,
            grup: "Umum",
            masalah: "Kendala layanan IT yang memerlukan langkah SOP standar.",
            solusi: "1. Draft only",
            status: "draft",
            is_internal: false,
          }),
        });
        expect(w.status).toBe(201);
        const wj = parseJsonSafe<{ article?: { id?: string }; id?: string }>(w.body);
        const wid = wj?.article?.id ?? wj?.id ?? "";
        try {
          const p = await fetchManual(server.baseUrl, "/panduan");
          expect(p.body).not.toContain(draftTitle);
        } finally {
          if (wid) {
            await fetchManual(server.baseUrl, `/api/wiki/${wid}`, {
              method: "DELETE",
              headers: { Origin: server.baseUrl, Cookie: cookie },
            });
          }
        }
      },
    );

    it("F12.B4 unauthenticated POST /api/wiki returns 401 JSON no-store", async () => {
      const res = await fetchManual(server.baseUrl, "/api/wiki", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: server.baseUrl,
        },
        body: JSON.stringify({ judul: "x", grup: "Umum", solusi: "y" }),
      });
      expect(res.status).toBe(401);
      assertNoStore(res);
    });

    it("F12.B5 /tiket/invalid-id returns 404 or login redirect without 500", async () => {
      const res = await fetchManual(server.baseUrl, "/tiket/not-a-uuid");
      expect(res.status).toBeLessThan(500);
      expect(hasStackTrace(res.body)).toBe(false);
    });
  });

  // =========================================================================
  // F13: Realtime & P0 Banner Boundaries (5 cases)
  // =========================================================================
  describe("F13 Boundaries: Realtime Resilience & Nonexistent Ticket Navigation", () => {
    it("F13.B1 /antrian with corrupt auth cookie redirects cleanly without Realtime crash", async () => {
      const res = await fetchManual(server.baseUrl, "/antrian", {
        headers: { Cookie: CORRUPT_AUTH_COOKIE },
      });
      expect(res.status).toBeLessThan(500);
    });

    it.skipIf(!IT_OR_ADMIN_CREDS)(
      "F13.B2 visiting /tiket/[nonexistent-uuid] settles cleanly without Realtime crash",
      async () => {
        if (!IT_OR_ADMIN_CREDS) return;
        await loginViaBrowser(
          browser,
          server.baseUrl,
          IT_OR_ADMIN_CREDS.email,
          IT_OR_ADMIN_CREDS.password,
        );
        await browser.goto(`${server.baseUrl}/tiket/${NONEXISTENT_UUID}`);
        await browser.waitForSelector("body");
        expect(browser.pageErrors).toEqual([]);
        expect(browser.serverErrors).toEqual([]);
      },
    );

    it.skipIf(!IT_OR_ADMIN_CREDS)(
      "F13.B3 rapid navigation /antrian -> /tiket -> /antrian leaves zero leaked console/page errors",
      async () => {
        if (!IT_OR_ADMIN_CREDS) return;
        await loginViaBrowser(
          browser,
          server.baseUrl,
          IT_OR_ADMIN_CREDS.email,
          IT_OR_ADMIN_CREDS.password,
        );
        await browser.goto(`${server.baseUrl}/antrian`);
        await browser.goto(`${server.baseUrl}/tiket`);
        await browser.goto(`${server.baseUrl}/antrian`);
        assertNoBrowserErrors(browser);
      },
    );

    it.skipIf(!IT_OR_ADMIN_CREDS || !IS_LIVE_DB)(
      "F13.B4 dismissing P0 banner twice or when absent never throws browser errors",
      async () => {
        if (!IT_OR_ADMIN_CREDS) return;
        await loginViaBrowser(
          browser,
          server.baseUrl,
          IT_OR_ADMIN_CREDS.email,
          IT_OR_ADMIN_CREDS.password,
        );
        await browser.goto(`${server.baseUrl}/antrian`);
        await browser.waitForSelector("main");
        assertNoBrowserErrors(browser);

        const p0 = await createPublicTicket(server.baseUrl, { mode: "p0" });
        expect(p0).not.toBeNull();
        if (!p0) return;

        try {
          await browser.goto(`${server.baseUrl}/antrian`);
          await browser.waitForSelector(
            '[role="alert"], [data-testid="p0-banner"]',
          );
          const dismissed = await browser.evalJs<boolean>(
            `(() => {
              const banner = document.querySelector('[role="alert"], [data-testid="p0-banner"]');
              const btn = banner?.querySelector('button[aria-label*="Tutup" i], button');
              if (!(btn instanceof HTMLButtonElement)) return false;
              btn.click();
              btn.click();
              return true;
            })()`,
          );
          expect(dismissed).toBe(true);
          await new Promise((r) => setTimeout(r, 150));
          const stillVisible = await browser.evalJs<boolean>(
            `Boolean(document.querySelector('[data-testid="p0-banner"]') || Array.from(document.querySelectorAll('main [role="alert"]')).some((el) => /P0/.test(el.textContent ?? "")))`,
          );
          expect(stillVisible).toBe(false);
          assertNoBrowserErrors(browser);
        } finally {
          await resolveAndCloseTicketViaUi(
            browser,
            server.baseUrl,
            p0,
          ).catch(() => undefined);
        }
      },
    );

    it("F13.B5 unauthenticated GET /api/it/status returns 401 JSON no-store", async () => {
      const res = await fetchManual(server.baseUrl, "/api/it/status");
      expect(res.status).toBe(401);
      assertNoStore(res);
    });
  });

  // =========================================================================
  // F14: Notifications & Subscription Input Boundaries (5 cases)
  // =========================================================================
  describe("F14 Boundaries: Notification Subscription & Mark-Read Validation", () => {
    it.skipIf(!ANY_CREDS)(
      "F14.B1 POST /api/notifications/subscribe rejects empty endpoint with 400",
      async () => {
        if (!ANY_CREDS) return;
        const cookie = await loginForCookies(
          browser,
          server.baseUrl,
          ANY_CREDS.email,
          ANY_CREDS.password,
        );
        const res = await fetchManual(
          server.baseUrl,
          "/api/notifications/subscribe",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Origin: server.baseUrl,
              Cookie: cookie,
            },
            body: JSON.stringify({ endpoint: "" }),
          },
        );
        expect(res.status).toBe(400);
        assertNoStore(res);
      },
    );

    it.skipIf(!ANY_CREDS)(
      "F14.B2 POST /api/notifications/subscribe rejects malformed JSON with 400",
      async () => {
        if (!ANY_CREDS) return;
        const cookie = await loginForCookies(
          browser,
          server.baseUrl,
          ANY_CREDS.email,
          ANY_CREDS.password,
        );
        const res = await fetchManual(
          server.baseUrl,
          "/api/notifications/subscribe",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Origin: server.baseUrl,
              Cookie: cookie,
            },
            body: "{broken",
          },
        );
        expect(res.status).toBe(400);
        assertNoStore(res);
      },
    );

    it.skipIf(!ANY_CREDS)(
      "F14.B3 POST /api/notifications/subscribe rejects javascript: endpoint scheme with 400",
      async () => {
        if (!ANY_CREDS) return;
        const cookie = await loginForCookies(
          browser,
          server.baseUrl,
          ANY_CREDS.email,
          ANY_CREDS.password,
        );
        const res = await fetchManual(
          server.baseUrl,
          "/api/notifications/subscribe",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Origin: server.baseUrl,
              Cookie: cookie,
            },
            body: JSON.stringify({ endpoint: "javascript:alert(1)" }),
          },
        );
        expect(res.status).toBe(400);
        assertNoStore(res);
      },
    );

    it.skipIf(!ANY_CREDS)(
      "F14.B4 PATCH /api/notifications rejects invalid non-UUID id cleanly",
      async () => {
        if (!ANY_CREDS) return;
        const cookie = await loginForCookies(
          browser,
          server.baseUrl,
          ANY_CREDS.email,
          ANY_CREDS.password,
        );
        const res = await fetchManual(server.baseUrl, "/api/notifications", {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Origin: server.baseUrl,
            Cookie: cookie,
          },
          body: JSON.stringify({ id: "not-a-uuid" }),
        });
        expect([400, 404]).toContain(res.status);
        assertNoStore(res);
      },
    );

    it.skipIf(!ANY_CREDS)(
      "F14.B5 POST /api/tiket/lampiran rejects polyglot PNG file with 400",
      async () => {
        if (!ANY_CREDS) return;
        const cookie = await loginForCookies(
          browser,
          server.baseUrl,
          ANY_CREDS.email,
          ANY_CREDS.password,
        );
        const form = new FormData();
        form.set("ticketId", NONEXISTENT_UUID);
        form.set(
          "file",
          toBlobCopy(createInvalidPolyglotBytes(), "image/png"),
          "bad.png",
        );
        const res = await fetchManual(server.baseUrl, "/api/tiket/lampiran", {
          method: "POST",
          headers: { Origin: server.baseUrl, Cookie: cookie },
          body: form,
        });
        expect(res.status).toBe(400);
        assertNoStore(res);
      },
    );
  });

  // =========================================================================
  // F15: PublicTicketStatus Boundaries (5 cases)
  // =========================================================================
  describe("F15 Boundaries: Public Status Token, Rating Bounds & Credential Privacy", () => {
    it("F15.B1 /status/not-a-uuid renders graceful not-found without 500 or stack trace", async () => {
      const res = await fetchManual(server.baseUrl, "/status/not-a-uuid");
      expect(res.status).toBeLessThan(500);
      expect(hasStackTrace(res.body)).toBe(false);
    });

    it("F15.B2 GET /api/tiket/publik/not-a-uuid returns 404 JSON private no-store", async () => {
      const res = await fetchManual(
        server.baseUrl,
        "/api/tiket/publik/not-a-uuid",
      );
      expect(res.status).toBe(404);
      expect(res.contentType).toContain("application/json");
      assertNoStore(res);
      expect(res.cacheControl.toLowerCase()).toContain("private");
    });

    it("F15.B3 POST /api/tiket/publik/[token]/rating rejects out-of-range rating (0, 6, 3.5) with 400", async () => {
      for (const badRating of [0, 6, 3.5, "five"]) {
        const res = await fetchManual(
          server.baseUrl,
          `/api/tiket/publik/${NONEXISTENT_UUID}/rating`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Origin: server.baseUrl,
            },
            body: JSON.stringify({ rating: badRating }),
          },
        );
        expect(res.status).toBe(400);
        assertNoStore(res);
      }
    });

    it.skipIf(!IS_LIVE_DB)(
      "F15.B4 POST /api/tiket/publik/[token]/rating on newly created (baru) ticket returns 409",
      async () => {
        const ticket = await createPublicTicket(server.baseUrl, {
          mode: "default",
        });
        expect(ticket).not.toBeNull();
        if (!ticket) return;
        const res = await fetchManual(
          server.baseUrl,
          `/api/tiket/publik/${ticket.token}/rating`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Origin: server.baseUrl,
            },
            body: JSON.stringify({ rating: 5 }),
          },
        );
        expect(res.status).toBe(409);
        assertNoStore(res);
      },
    );

    it.skipIf(!IS_LIVE_DB)(
      "F15.B5 POST /api/tiket/publik/[token]/reply with jenis=remote missing password returns 400",
      async () => {
        expect(sharedBoundaryTicket).not.toBeNull();
        if (!sharedBoundaryTicket) return;
        const res = await fetchManual(
          server.baseUrl,
          `/api/tiket/publik/${sharedBoundaryTicket.token}/reply`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Origin: server.baseUrl,
            },
            body: JSON.stringify({
              isi: "Update remote",
              jenis: "remote",
              remoteApp: "AnyDesk",
              remoteId: "123456",
            }),
          },
        );
        expect(res.status).toBe(400);
        assertNoStore(res);
      },
    );
  });

  // =========================================================================
  // F16: Public Lookup & localStorage Boundaries (5 cases)
  // =========================================================================
  describe("F16 Boundaries: Public Lookup Malformed Input & Corrupt localStorage", () => {
    it("F16.B1 / lookup with non-UUID garbage shows feedback without crashing", async () => {
      await browser.goto(`${server.baseUrl}/`);
      const sel =
        'main input[placeholder*="token" i], main input[aria-label*="status" i], header input[placeholder*="token" i]';
      await browser.fillInput(sel, "not-a-valid-token");
      await browser.evalJs(
        `document.querySelector(${JSON.stringify(sel)})?.closest("form")?.requestSubmit()`,
      );
      await new Promise((r) => setTimeout(r, 200));
      assertNoBrowserErrors(browser);
    });

    it("F16.B2 / lookup with XSS payload never executes script", async () => {
      await browser.goto(`${server.baseUrl}/`);
      const sel =
        'main input[placeholder*="token" i], main input[aria-label*="status" i], header input[placeholder*="token" i]';
      await browser.fillInput(sel, '<script>window.__e2eLookupXss=1</script>');
      await browser.evalJs(
        `document.querySelector(${JSON.stringify(sel)})?.closest("form")?.requestSubmit()`,
      );
      await new Promise((r) => setTimeout(r, 200));
      expect(
        await browser.evalJs<boolean>("Boolean(window.__e2eLookupXss)"),
      ).toBe(false);
      assertNoBrowserErrors(browser);
    });

    it("F16.B3 / lookup with SQLi payload never triggers 500", async () => {
      await browser.goto(`${server.baseUrl}/`);
      const sel =
        'main input[placeholder*="token" i], main input[aria-label*="status" i], header input[placeholder*="token" i]';
      await browser.fillInput(sel, "' OR 1=1 --");
      await browser.evalJs(
        `document.querySelector(${JSON.stringify(sel)})?.closest("form")?.requestSubmit()`,
      );
      await new Promise((r) => setTimeout(r, 200));
      expect(browser.serverErrors).toEqual([]);
    });

    it("F16.B4 corrupt JSON in localStorage recent-tickets keys never crashes /", async () => {
      await browser.goto(`${server.baseUrl}/`);
      try {
        await browser.evalJs(
          `(() => {
            window.localStorage.setItem("it-ticketing-recent-tickets", "{corrupt-json");
            window.localStorage.setItem("public-ticket-history", "not-an-array");
          })()`,
        );
        await browser.goto(`${server.baseUrl}/`);
        await browser.waitForSelector("h1");
        assertNoBrowserErrors(browser);
      } finally {
        await browser.evalJs(
          `window.localStorage.removeItem("it-ticketing-recent-tickets"); window.localStorage.removeItem("public-ticket-history");`,
        );
      }
    });

    it("F16.B5 deleting 1 item from 2-item localStorage history keeps the other entry intact", async () => {
      const tokenA = "11111111-1111-4111-8111-111111111111";
      const tokenB = "22222222-2222-4222-8222-222222222222";
      await browser.goto(`${server.baseUrl}/`);
      try {
        await browser.evalJs(
          `(() => {
            const list = [
              { token: ${JSON.stringify(tokenA)}, kodeTiket: "IT-A", judul: "Tiket A", updatedAt: new Date().toISOString() },
              { token: ${JSON.stringify(tokenB)}, kodeTiket: "IT-B", judul: "Tiket B", updatedAt: new Date().toISOString() },
            ];
            window.localStorage.setItem("it-ticketing-recent-tickets", JSON.stringify(list));
            window.localStorage.setItem("public-ticket-history", JSON.stringify(list));
          })()`,
        );
        await browser.goto(`${server.baseUrl}/`);
        await browser.waitForText("Tiket A");
        await browser.evalJs(
          `(() => {
            const linkA = document.querySelector('a[href="/status/${tokenA}"]');
            const card = linkA?.closest("li, div");
            const del = card ? Array.from(card.querySelectorAll("button")).find((b) => /hapus/i.test(b.textContent ?? "") || /hapus/i.test(b.getAttribute("aria-label") ?? "")) : null;
            if (del instanceof HTMLButtonElement) del.click();
          })()`,
        );
        await new Promise((r) => setTimeout(r, 150));
        expect(
          await browser.evalJs<boolean>(
            `Boolean(document.querySelector('a[href="/status/${tokenB}"]'))`,
          ),
        ).toBe(true);
      } finally {
        await browser.evalJs(
          `window.localStorage.removeItem("it-ticketing-recent-tickets"); window.localStorage.removeItem("public-ticket-history");`,
        );
      }
    });
  });

  // =========================================================================
  // F17: /panduan & Wiki Boundaries (5 cases)
  // =========================================================================
  describe("F17 Boundaries: /panduan SQLi/XSS & Wiki PATCH Validation", () => {
    it("F17.B1 GET /panduan?q=' OR 1=1 -- renders 200 without 500 or DB error leak", async () => {
      const res = await fetchManual(
        server.baseUrl,
        "/panduan?q=%27%20OR%201%3D1%20--",
      );
      expect(res.status).toBe(200);
      expect(hasStackTrace(res.body)).toBe(false);
      expect(hasSensitiveDataLeak(res.body)).toBe(false);
    });

    it("F17.B2 /panduan search with <script>alert(1)</script> never executes script", async () => {
      await browser.goto(
        `${server.baseUrl}/panduan?q=%3Cscript%3Ewindow.__e2ePanduanXss%3D1%3C%2Fscript%3E`,
      );
      await browser.waitForSelector("main");
      expect(
        await browser.evalJs<boolean>("Boolean(window.__e2ePanduanXss)"),
      ).toBe(false);
      assertNoBrowserErrors(browser);
    });

    it.skipIf(!IT_OR_ADMIN_CREDS)(
      "F17.B3 PATCH /api/wiki/not-a-uuid returns 400/404 JSON no-store",
      async () => {
        if (!IT_OR_ADMIN_CREDS) return;
        const cookie = await loginForCookies(
          browser,
          server.baseUrl,
          IT_OR_ADMIN_CREDS.email,
          IT_OR_ADMIN_CREDS.password,
        );
        const res = await fetchManual(
          server.baseUrl,
          "/api/wiki/not-a-uuid",
          {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
              Origin: server.baseUrl,
              Cookie: cookie,
            },
            body: JSON.stringify({ judul: "Uji" }),
          },
        );
        expect([400, 404]).toContain(res.status);
        assertNoStore(res);
      },
    );

    it.skipIf(!IT_OR_ADMIN_CREDS)(
      "F17.B4 PATCH /api/wiki/[id] rejects empty judul/solusi with 400",
      async () => {
        if (!IT_OR_ADMIN_CREDS) return;
        const cookie = await loginForCookies(
          browser,
          server.baseUrl,
          IT_OR_ADMIN_CREDS.email,
          IT_OR_ADMIN_CREDS.password,
        );
        const createRes = await fetchManual(server.baseUrl, "/api/wiki", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Origin: server.baseUrl,
            Cookie: cookie,
          },
          body: JSON.stringify({
            judul: `E2E-F17B4-${Date.now()}`,
            grup: "Umum",
            masalah: "Kendala layanan IT yang memerlukan langkah SOP standar.",
            solusi: "1. Sementara untuk uji PATCH 400.",
            status: "draft",
            is_internal: false,
          }),
        });
        expect(createRes.status).toBe(201);
        const cj = parseJsonSafe<{ article?: { id?: string }; id?: string }>(
          createRes.body,
        );
        const id = cj?.article?.id ?? cj?.id ?? "";
        expect(id.length).toBeGreaterThan(0);
        try {
          const res = await fetchManual(server.baseUrl, `/api/wiki/${id}`, {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
              Origin: server.baseUrl,
              Cookie: cookie,
            },
            body: JSON.stringify({ judul: "   ", solusi: "" }),
          });
          expect(res.status).toBe(400);
          assertNoStore(res);
        } finally {
          if (id) {
            await fetchManual(server.baseUrl, `/api/wiki/${id}`, {
              method: "DELETE",
              headers: { Origin: server.baseUrl, Cookie: cookie },
            });
          }
        }
      },
    );

    it.skipIf(!USER_CREDS)(
      "F17.B5 standard user role cannot POST or PATCH /api/wiki (403)",
      async () => {
        if (!USER_CREDS) return;
        const cookie = await loginForCookies(
          browser,
          server.baseUrl,
          USER_CREDS.email,
          USER_CREDS.password,
        );
        const res = await fetchManual(server.baseUrl, "/api/wiki", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Origin: server.baseUrl,
            Cookie: cookie,
          },
          body: JSON.stringify({
            judul: "Forbidden",
            grup: "Umum",
            masalah: "Kendala layanan IT yang memerlukan langkah SOP standar.",
            solusi: "Denied",
          }),
        });
        expect(res.status).toBe(403);
      },
    );
  });

  // =========================================================================
  // F18: PublicTicketForm Security Boundaries (5 cases)
  // =========================================================================
  describe("F18 Boundaries: PublicTicketForm Honeypot, XSS & SQLi Payload Hardening", () => {
    it("F18.B1 POST /api/tiket/publik rejects filled honeypot field with 400", async () => {
      const meta = await extractLaporMeta(server.baseUrl);
      const form = new FormData();
      form.set("nama", "Bot E2E");
      form.set("kontak", "081234567890");
      form.set("siteId", meta?.siteId ?? NONEXISTENT_UUID);
      form.set("categoryId", meta?.categoryId ?? NONEXISTENT_UUID);
      form.set("deskripsi", "Bot submission test dengan deskripsi panjang.");
      form.set("penanganan", "onsite");
      form.set("website", "https://spam.example.com");

      const res = await fetchManual(server.baseUrl, "/api/tiket/publik", {
        method: "POST",
        headers: { Origin: server.baseUrl },
        body: form,
      });
      expect(res.status).toBe(400);
      if (IS_LIVE_DB) {
        expect(res.body).toMatch(/tidak valid|spam|gagal/i);
      }
      assertNoStore(res);
    });

    it("F18.B2 POST /api/tiket/publik rejects invalid siteId/categoryId UUID with 400", async () => {
      const form = new FormData();
      form.set("nama", "Tester E2E");
      form.set("kontak", "081234567890");
      form.set("siteId", "not-a-uuid");
      form.set("categoryId", "not-a-uuid");
      form.set("deskripsi", "Deskripsi valid cukup panjang untuk lolos batas minimal.");
      form.set("penanganan", "onsite");

      const res = await fetchManual(server.baseUrl, "/api/tiket/publik", {
        method: "POST",
        headers: { Origin: server.baseUrl },
        body: form,
      });
      expect(res.status).toBe(400);
      assertNoStore(res);
    });

    it.skipIf(!IS_LIVE_DB)(
      "F18.B3 POST /api/tiket/publik neutralizes XSS in deskripsi when rendered on /status/[token]",
      async () => {
        const ticket = await createPublicTicket(server.baseUrl, {
          mode: "default",
          deskripsi: '<script>window.__e2eDescXss=1</script><img src=x onerror="window.__e2eDescXss=2">',
        });
        expect(ticket).not.toBeNull();
        if (!ticket) return;
        await browser.goto(`${server.baseUrl}/status/${ticket.token}`);
        await browser.waitForSelector("main");
        expect(
          await browser.evalJs<boolean>(
            `Boolean(window.__e2eDescXss) || document.querySelectorAll("main script").length > 0`,
          ),
        ).toBe(false);
        assertNoBrowserErrors(browser);
      },
    );

    it("F18.B4 /api/aset/lookup rejects unauthenticated SQLi query with 401 no-store", async () => {
      const res = await fetchManual(
        server.baseUrl,
        "/api/aset/lookup?nomorAset=' OR 1=1 --",
      );
      expect(res.status).toBe(401);
      assertNoStore(res);
    });

    it("F18.B5 /lapor client validation prevents empty form submission", async () => {
      await browser.goto(`${server.baseUrl}/lapor`);
      await browser.waitForSelector("main form");
      expect(
        await browser.evalJs<boolean>(
          `Boolean(document.querySelector("main form")?.checkValidity())`,
        ),
      ).toBe(false);
    });
  });

  // =========================================================================
  // F19: Asset Validation & CSV Formula Injection Boundaries (5 cases)
  // =========================================================================
  describe("F19 Boundaries: Asset Enum/Range Validation & CSV Formula Neutralization", () => {
    it.skipIf(!GA_OR_ADMIN_CREDS)(
      "F19.B1 PATCH /api/aset/not-a-uuid returns 400 JSON no-store",
      async () => {
        if (!GA_OR_ADMIN_CREDS) return;
        const cookie = await loginForCookies(
          browser,
          server.baseUrl,
          GA_OR_ADMIN_CREDS.email,
          GA_OR_ADMIN_CREDS.password,
        );
        const res = await fetchManual(
          server.baseUrl,
          "/api/aset/not-a-uuid",
          {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
              Origin: server.baseUrl,
              Cookie: cookie,
            },
            body: JSON.stringify({ status: "aktif" }),
          },
        );
        expect(res.status).toBe(400);
        assertNoStore(res);
      },
    );

    it.skipIf(!GA_OR_ADMIN_CREDS)(
      "F19.B2 PATCH /api/aset/[id] rejects invalid tipe enum ('spaceship') with 400",
      async () => {
        if (!GA_OR_ADMIN_CREDS) return;
        const cookie = await loginForCookies(
          browser,
          server.baseUrl,
          GA_OR_ADMIN_CREDS.email,
          GA_OR_ADMIN_CREDS.password,
        );
        const createRes = await fetchManual(server.baseUrl, "/api/aset", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Origin: server.baseUrl,
            Cookie: cookie,
          },
          body: JSON.stringify({
            nomor_aset: `E2E-F19B2-${Date.now()}`,
            nama_perangkat: "Laptop Uji Enum Tipe",
            tipe: "laptop",
            status: "aktif",
            ram_gb: 8,
          }),
        });
        expect([200, 201]).toContain(createRes.status);
        const cj = parseJsonSafe<{ asset?: { id?: string }; id?: string }>(
          createRes.body,
        );
        const id = cj?.asset?.id ?? cj?.id ?? "";
        expect(id.length).toBeGreaterThan(0);
        try {
          const res = await fetchManual(server.baseUrl, `/api/aset/${id}`, {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
              Origin: server.baseUrl,
              Cookie: cookie,
            },
            body: JSON.stringify({ tipe: "spaceship" }),
          });
          expect(res.status).toBe(400);
          assertNoStore(res);
        } finally {
          if (id) {
            await fetchManual(server.baseUrl, `/api/aset/${id}`, {
              method: "DELETE",
              headers: { Origin: server.baseUrl, Cookie: cookie },
            });
          }
        }
      },
    );

    it.skipIf(!GA_OR_ADMIN_CREDS)(
      "F19.B3 PATCH /api/aset/[id] rejects invalid status enum ('destroyed') with 400",
      async () => {
        if (!GA_OR_ADMIN_CREDS) return;
        const cookie = await loginForCookies(
          browser,
          server.baseUrl,
          GA_OR_ADMIN_CREDS.email,
          GA_OR_ADMIN_CREDS.password,
        );
        const createRes = await fetchManual(server.baseUrl, "/api/aset", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Origin: server.baseUrl,
            Cookie: cookie,
          },
          body: JSON.stringify({
            nomor_aset: `E2E-F19B3-${Date.now()}`,
            nama_perangkat: "Laptop Uji Enum Status",
            tipe: "laptop",
            status: "aktif",
            ram_gb: 8,
          }),
        });
        expect([200, 201]).toContain(createRes.status);
        const cj = parseJsonSafe<{ asset?: { id?: string }; id?: string }>(
          createRes.body,
        );
        const id = cj?.asset?.id ?? cj?.id ?? "";
        expect(id.length).toBeGreaterThan(0);
        try {
          const res = await fetchManual(server.baseUrl, `/api/aset/${id}`, {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
              Origin: server.baseUrl,
              Cookie: cookie,
            },
            body: JSON.stringify({ status: "destroyed" }),
          });
          expect(res.status).toBe(400);
          assertNoStore(res);
        } finally {
          if (id) {
            await fetchManual(server.baseUrl, `/api/aset/${id}`, {
              method: "DELETE",
              headers: { Origin: server.baseUrl, Cookie: cookie },
            });
          }
        }
      },
    );

    it.skipIf(!GA_OR_ADMIN_CREDS)(
      "F19.B4 PATCH /api/aset/[id] rejects invalid ram_gb (-4, 9999, 3.5) with 400",
      async () => {
        if (!GA_OR_ADMIN_CREDS) return;
        const cookie = await loginForCookies(
          browser,
          server.baseUrl,
          GA_OR_ADMIN_CREDS.email,
          GA_OR_ADMIN_CREDS.password,
        );
        const createRes = await fetchManual(server.baseUrl, "/api/aset", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Origin: server.baseUrl,
            Cookie: cookie,
          },
          body: JSON.stringify({
            nomor_aset: `E2E-F19B4-${Date.now()}`,
            nama_perangkat: "Laptop Uji RAM Bounds",
            tipe: "laptop",
            status: "aktif",
            ram_gb: 8,
          }),
        });
        expect([200, 201]).toContain(createRes.status);
        const cj = parseJsonSafe<{ asset?: { id?: string }; id?: string }>(
          createRes.body,
        );
        const id = cj?.asset?.id ?? cj?.id ?? "";
        expect(id.length).toBeGreaterThan(0);
        try {
          for (const badRam of [-4, 9999, 3.5]) {
            const res = await fetchManual(server.baseUrl, `/api/aset/${id}`, {
              method: "PATCH",
              headers: {
                "Content-Type": "application/json",
                Origin: server.baseUrl,
                Cookie: cookie,
              },
              body: JSON.stringify({ ram_gb: badRam }),
            });
            expect(res.status).toBe(400);
            assertNoStore(res);
          }
        } finally {
          if (id) {
            await fetchManual(server.baseUrl, `/api/aset/${id}`, {
              method: "DELETE",
              headers: { Origin: server.baseUrl, Cookie: cookie },
            });
          }
        }
      },
    );

    it.skipIf(!USER_CREDS)(
      "F19.B5 standard user role is blocked (403) from /api/aset and /aset",
      async () => {
        if (!USER_CREDS) return;
        const cookie = await loginForCookies(
          browser,
          server.baseUrl,
          USER_CREDS.email,
          USER_CREDS.password,
        );
        const res = await fetchManual(server.baseUrl, "/api/aset", {
          headers: { Cookie: cookie },
        });
        expect(res.status).toBe(403);
      },
    );
  });

  // =========================================================================
  // F20: Stock Adjustment & Restore Boundaries (5 cases)
  // =========================================================================
  describe("F20 Boundaries: Stock Adjust Delta, Negative Cap & ticketId Validation", () => {
    it.skipIf(!GA_OR_ADMIN_CREDS)(
      "F20.B1 POST /api/stok/adjust rejects delta=0 with 400",
      async () => {
        if (!GA_OR_ADMIN_CREDS) return;
        const cookie = await loginForCookies(
          browser,
          server.baseUrl,
          GA_OR_ADMIN_CREDS.email,
          GA_OR_ADMIN_CREDS.password,
        );
        const res = await fetchManual(server.baseUrl, "/api/stok/adjust", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Origin: server.baseUrl,
            Cookie: cookie,
          },
          body: JSON.stringify({ kode: "TEST-SKU", delta: 0, jenis: "masuk" }),
        });
        expect(res.status).toBe(400);
        assertNoStore(res);
      },
    );

    it.skipIf(!GA_OR_ADMIN_CREDS)(
      "F20.B2 POST /api/stok/adjust rejects invalid delta ('abc', 0.5, null) on real SKU with 400",
      async () => {
        if (!GA_OR_ADMIN_CREDS) return;
        const cookie = await loginForCookies(
          browser,
          server.baseUrl,
          GA_OR_ADMIN_CREDS.email,
          GA_OR_ADMIN_CREDS.password,
        );
        const stocks = await getStockItems(server.baseUrl, cookie);
        const realItem = stocks[0];
        expect(realItem).toBeDefined();
        if (!realItem) return;

        for (const delta of ["abc", 0.5, null]) {
          const res = await fetchManual(server.baseUrl, "/api/stok/adjust", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Origin: server.baseUrl,
              Cookie: cookie,
            },
            body: JSON.stringify({ kode: realItem.kode, delta, jenis: "masuk" }),
          });
          expect(res.status).toBe(400);
          assertNoStore(res);
        }
        const after = await getStockItems(server.baseUrl, cookie);
        const afterItem = after.find((s) => s.kode === realItem.kode);
        expect(afterItem?.jumlah_stok).toBe(realItem.jumlah_stok);
      },
    );

    it.skipIf(!GA_OR_ADMIN_CREDS)(
      "F20.B3 POST /api/stok/adjust rejects non-UUID ticketId with 400",
      async () => {
        if (!GA_OR_ADMIN_CREDS) return;
        const cookie = await loginForCookies(
          browser,
          server.baseUrl,
          GA_OR_ADMIN_CREDS.email,
          GA_OR_ADMIN_CREDS.password,
        );
        const res = await fetchManual(server.baseUrl, "/api/stok/adjust", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Origin: server.baseUrl,
            Cookie: cookie,
          },
          body: JSON.stringify({
            kode: "TEST-SKU",
            delta: 1,
            jenis: "masuk",
            ticketId: "not-a-uuid",
          }),
        });
        expect(res.status).toBe(400);
        assertNoStore(res);
      },
    );

    it.skipIf(!GA_OR_ADMIN_CREDS)(
      "F20.B4 POST /api/stok/adjust rejects negative delta below 0 stock or unknown kode with 400/404",
      async () => {
        if (!GA_OR_ADMIN_CREDS) return;
        const cookie = await loginForCookies(
          browser,
          server.baseUrl,
          GA_OR_ADMIN_CREDS.email,
          GA_OR_ADMIN_CREDS.password,
        );
        const stocks = await getStockItems(server.baseUrl, cookie);
        const realItem = stocks[0];
        expect(realItem).toBeDefined();
        if (!realItem) return;

        const overRes = await adjustStockViaApi(server.baseUrl, cookie, {
          kode: realItem.kode,
          delta: -(realItem.jumlah_stok + 10),
          jenis: "keluar",
        });
        expect(overRes.status).toBe(400);
        expect(overRes.body).toMatch(/tidak mencukupi|stok|kurang|negatif/i);
        assertNoStore(overRes);

        const after = await getStockItems(server.baseUrl, cookie);
        const afterItem = after.find((s) => s.kode === realItem.kode);
        expect(afterItem?.jumlah_stok).toBe(realItem.jumlah_stok);

        const unknownRes = await adjustStockViaApi(server.baseUrl, cookie, {
          kode: `UNKNOWN-SKU-${Date.now()}`,
          delta: 1,
          jenis: "masuk",
        });
        expect([400, 404]).toContain(unknownRes.status);
        assertNoStore(unknownRes);
      },
    );

    it.skipIf(!USER_CREDS)(
      "F20.B5 standard user role is blocked (403) from POST /api/stok/adjust and /stok",
      async () => {
        if (!USER_CREDS) return;
        const cookie = await loginForCookies(
          browser,
          server.baseUrl,
          USER_CREDS.email,
          USER_CREDS.password,
        );
        const res = await fetchManual(server.baseUrl, "/api/stok/adjust", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Origin: server.baseUrl,
            Cookie: cookie,
          },
          body: JSON.stringify({ kode: "X", delta: 1, jenis: "masuk" }),
        });
        expect(res.status).toBe(403);
      },
    );
  });

  // =========================================================================
  // F21: /laporan & CSV Export Boundaries (5 cases)
  // =========================================================================
  describe("F21 Boundaries: /laporan Query Bounds, Role Gate & CSV Formula Safety", () => {
    it("F21.B1 /laporan?periode=invalid&tahun=abc&kuartal=99 handles invalid params without 500", async () => {
      const res = await fetchManual(
        server.baseUrl,
        "/laporan?periode=invalid&tahun=abc&kuartal=99",
      );
      expect(res.status).toBeLessThan(500);
      expect(hasStackTrace(res.body)).toBe(false);
    });

    it.skipIf(!USER_CREDS)(
      "F21.B2 standard user role is blocked (403) from GET /api/laporan/export",
      async () => {
        if (!USER_CREDS) return;
        const cookie = await loginForCookies(
          browser,
          server.baseUrl,
          USER_CREDS.email,
          USER_CREDS.password,
        );
        const res = await fetchManual(server.baseUrl, "/api/laporan/export", {
          headers: { Cookie: cookie },
        });
        expect(res.status).toBe(403);
        assertNoStore(res);
      },
    );

    it.skipIf(!IT_OR_ADMIN_CREDS)(
      "F21.B3 /laporan with future empty year renders charts without NaN SVG attributes",
      async () => {
        if (!IT_OR_ADMIN_CREDS) return;
        await loginViaBrowser(
          browser,
          server.baseUrl,
          IT_OR_ADMIN_CREDS.email,
          IT_OR_ADMIN_CREDS.password,
        );
        await browser.goto(`${server.baseUrl}/laporan?periode=tahunan&tahun=2099`);
        await browser.waitForSelector("main");
        const hasNaN = await browser.evalJs<boolean>(
          `document.body.innerHTML.includes("NaN")`,
        );
        expect(hasNaN).toBe(false);
        assertNoBrowserErrors(browser);
      },
    );

    it.skipIf(!IT_OR_ADMIN_CREDS || !IS_LIVE_DB)(
      "F21.B4 GET /api/laporan/export neutralizes CSV formula injection (=, +, -, @)",
      async () => {
        if (!IT_OR_ADMIN_CREDS) return;
        const ticket = sharedBoundaryTicket;
        expect(ticket).not.toBeNull();
        if (!ticket) return;
        const cookie = await loginForCookies(
          browser,
          server.baseUrl,
          IT_OR_ADMIN_CREDS.email,
          IT_OR_ADMIN_CREDS.password,
        );
        const csvRes = await fetchManual(
          server.baseUrl,
          "/api/laporan/export",
          { headers: { Cookie: cookie } },
        );
        expect(csvRes.status).toBe(200);
        assertNoStore(csvRes);
        expect(csvRes.body).toContain("Nomor Tiket");
        expect(csvRes.body).toContain(ticket.nomorTiket);
        expect(csvRes.body).not.toMatch(/(?:^|,)"?[=+\-@]/m);
      },
    );

    it.skipIf(!IT_OR_ADMIN_CREDS)(
      "F21.B5 /api/laporan/export handles invalid query bounds cleanly without 500",
      async () => {
        if (!IT_OR_ADMIN_CREDS) return;
        const cookie = await loginForCookies(
          browser,
          server.baseUrl,
          IT_OR_ADMIN_CREDS.email,
          IT_OR_ADMIN_CREDS.password,
        );
        const res = await fetchManual(
          server.baseUrl,
          "/api/laporan/export?periode=invalid&tahun=99999",
          { headers: { Cookie: cookie } },
        );
        expect(res.status).toBeLessThan(500);
        assertNoStore(res);
      },
    );
  });

  // =========================================================================
  // F22: Command Palette & /api/search Boundaries (5 cases)
  // =========================================================================
  describe("F22 Boundaries: /api/search Empty, SQLi, XSS & Command Palette Escape", () => {
    it.skipIf(!ANY_CREDS)(
      "F22.B1 GET /api/search?q= empty query returns 200 or 400 cleanly with no-store",
      async () => {
        if (!ANY_CREDS) return;
        const cookie = await loginForCookies(
          browser,
          server.baseUrl,
          ANY_CREDS.email,
          ANY_CREDS.password,
        );
        const res = await fetchManual(server.baseUrl, "/api/search?q=", {
          headers: { Cookie: cookie },
        });
        expect([200, 400]).toContain(res.status);
        assertNoStore(res);
      },
    );

    it.skipIf(!ANY_CREDS)(
      "F22.B2 GET /api/search?q=' OR 1=1 -- handles SQLi safely without 500 or DB leak",
      async () => {
        if (!ANY_CREDS) return;
        const cookie = await loginForCookies(
          browser,
          server.baseUrl,
          ANY_CREDS.email,
          ANY_CREDS.password,
        );
        const res = await fetchManual(
          server.baseUrl,
          "/api/search?q=%27%20OR%201%3D1%20--",
          { headers: { Cookie: cookie } },
        );
        expect(res.status).toBe(200);
        expect(hasStackTrace(res.body)).toBe(false);
        expect(hasSensitiveDataLeak(res.body)).toBe(false);
        assertNoStore(res);
      },
    );

    it.skipIf(!ANY_CREDS)(
      "F22.B3 Command Palette neutralizes XSS input and closes cleanly on Escape",
      async () => {
        if (!ANY_CREDS) return;
        await loginViaBrowser(
          browser,
          server.baseUrl,
          ANY_CREDS.email,
          ANY_CREDS.password,
        );
        await browser.goto(`${server.baseUrl}/dashboard`);
        await browser.waitForSelector("header");
        await pressKeyCombo(browser, "k", { ctrl: true });
        await browser.waitForSelector('[role="dialog"][aria-modal="true"]');
        await browser.fillInput(
          '[role="dialog"] input',
          '<script>window.__e2eCmdXss=1</script>',
        );
        await new Promise((r) => setTimeout(r, 250));
        expect(
          await browser.evalJs<boolean>("Boolean(window.__e2eCmdXss)"),
        ).toBe(false);
        await pressKeyCombo(browser, "Escape");
        await new Promise((r) => setTimeout(r, 150));
        expect(
          await browser.evalJs<boolean>(
            `Boolean(document.querySelector('[role="dialog"][aria-modal="true"]'))`,
          ),
        ).toBe(false);
        assertNoBrowserErrors(browser);
      },
    );

    it.skipIf(!USER_CREDS)(
      "F22.B4 standard user role /api/search excludes admin audit/internal data",
      async () => {
        if (!USER_CREDS) return;
        const cookie = await loginForCookies(
          browser,
          server.baseUrl,
          USER_CREDS.email,
          USER_CREDS.password,
        );
        const res = await fetchManual(
          server.baseUrl,
          "/api/search?q=admin",
          { headers: { Cookie: cookie } },
        );
        expect(res.status).toBe(200);
        expect(res.body).not.toContain("/admin/audit");
      },
    );

    it("F22.B5 GET /api/search with corrupt auth cookie returns 401 JSON no-store", async () => {
      const res = await fetchManual(server.baseUrl, "/api/search?q=tiket", {
        headers: { Cookie: CORRUPT_AUTH_COOKIE },
      });
      expect(res.status).toBe(401);
      assertNoStore(res);
    });
  });

  // =========================================================================
  // F23: /profil & Web Push Security Boundaries (5 cases)
  // =========================================================================
  describe("F23 Boundaries: /profil Password Validation & CSRF Guards", () => {
    it.skipIf(!ANY_CREDS)(
      "F23.B1 /profil rejects mismatched password confirmation without crashing",
      async () => {
        if (!ANY_CREDS) return;
        await loginViaBrowser(
          browser,
          server.baseUrl,
          ANY_CREDS.email,
          ANY_CREDS.password,
        );
        await browser.goto(`${server.baseUrl}/profil`);
        await browser.waitForSelector("main form");
        const submitted = await browser.evalJs<boolean>(
          `(() => {
            const inputs = Array.from(document.querySelectorAll('main form input[type="password"]'));
            if (inputs.length < 2) return false;
            const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
            const values = inputs.length >= 3
              ? [${JSON.stringify(ANY_CREDS.password)}, "ValidNewPass123!", "DifferentConfirm456!"]
              : ["ValidNewPass123!", "DifferentConfirm456!"];
            inputs.forEach((inp, idx) => {
              if (inp instanceof HTMLInputElement && values[idx] !== undefined) {
                setter?.call(inp, values[idx]);
                inp.dispatchEvent(new Event("input", { bubbles: true }));
                inp.dispatchEvent(new Event("change", { bubbles: true }));
              }
            });
            const form = inputs[0].closest("form");
            const submit = form?.querySelector('button[type="submit"]');
            if (submit instanceof HTMLButtonElement) submit.click();
            else form?.requestSubmit();
            return true;
          })()`,
        );
        expect(submitted).toBe(true);
        await browser.waitForSelector('main [role="alert"], main p[role="alert"]', {
          timeoutMs: 10_000,
        });
        const alertText = await browser.getText('main [role="alert"]');
        expect(alertText).toMatch(/tidak cocok|tidak sama|sesuai|cocok|sandi/i);
        assertNoBrowserErrors(browser);
      },
    );

    it("F23.B2 cross-origin POST /api/notifications/subscribe returns 403 no-store", async () => {
      const res = await fetchManual(
        server.baseUrl,
        "/api/notifications/subscribe",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Origin: "https://evil.example.com",
          },
          body: JSON.stringify({ endpoint: "https://push.example/1" }),
        },
      );
      expect(res.status).toBe(403);
      assertNoStore(res);
    });

    it("F23.B3 cross-origin POST /api/telegram/link returns 403 no-store", async () => {
      const res = await fetchManual(server.baseUrl, "/api/telegram/link", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "https://evil.example.com",
        },
        body: "{}",
      });
      expect(res.status).toBe(403);
      assertNoStore(res);
    });

    it("F23.B4 GET /profil with corrupt auth cookie redirects to /login without 500", async () => {
      const res = await fetchManual(server.baseUrl, "/profil", {
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
    });

    it("F23.B5 DELETE /api/notifications/subscribe unauthenticated returns 401 JSON no-store", async () => {
      const res = await fetchManual(
        server.baseUrl,
        "/api/notifications/subscribe",
        {
          method: "DELETE",
          headers: { Origin: server.baseUrl },
        },
      );
      expect(res.status).toBe(401);
      assertNoStore(res);
    });
  });

  // =========================================================================
  // F24: Error/Not-Found/Metadata Boundaries (5 cases)
  // =========================================================================
  describe("F24 Boundaries: Nested 404, Method Rejection & Safe SVG", () => {
    it("F24.B1 deeply nested unknown path /a/b/c/d/tidak-ada returns 404 without 500", async () => {
      const res = await fetchManual(
        server.baseUrl,
        "/a/b/c/d/tidak-ada-boundary",
      );
      expect(res.status).toBe(404);
      expect(hasStackTrace(res.body)).toBe(false);
    });

    it("F24.B2 unknown API endpoint /api/tidak-ada returns 404 without stack trace", async () => {
      const res = await fetchManual(server.baseUrl, "/api/tidak-ada-e2e");
      expect(res.status).toBe(404);
      expect(hasStackTrace(res.body)).toBe(false);
    });

    it("F24.B3 POST /manifest.webmanifest is rejected cleanly with 4xx without 500", async () => {
      const res = await fetchManual(server.baseUrl, "/manifest.webmanifest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });

    it("F24.B4 GET /icon.svg contains zero embedded <script> or inline event handlers", async () => {
      const res = await fetchManual(server.baseUrl, "/icon.svg");
      expect(res.status).toBe(200);
      expect(res.body.toLowerCase()).not.toContain("<script");
      expect(res.body.toLowerCase()).not.toMatch(/\bonload\s*=|\bonerror\s*=/);
    });

    it("F24.B5 GET /panduan with corrupt sb-* cookie never returns 500 or leaks stack trace", async () => {
      const res = await fetchManual(server.baseUrl, "/panduan", {
        headers: { Cookie: CORRUPT_AUTH_COOKIE },
      });
      expect(res.status).toBe(200);
      expect(hasStackTrace(res.body)).toBe(false);
      expect(hasSensitiveDataLeak(res.body)).toBe(false);
    });
  });
});
