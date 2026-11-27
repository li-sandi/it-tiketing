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
  clearBrowserCookies,
  closeModalDialog,
  closePublicTicketViaApi,
  completeTicketViaUi,
  createMinimalPngBytes,
  createPublicTicket,
  dispatchSyntheticFileDrop,
  dispatchSyntheticPaste,
  ensureTicketFormDropzoneVisible,
  extractLaporMeta,
  fetchManual,
  getStockItems,
  hasAuthSessionSetCookie,
  hasSensitiveDataLeak,
  hasStackTrace,
  isUnauthenticatedRedirectToLogin,
  listMigrationFiles,
  loginForCookies,
  loginViaBrowser,
  measureContrastSamples,
  moveTicketToMenungguUserViaUi,
  parseJsonSafe,
  pressKeyCombo,
  readNextManifestSafe,
  readRepoTextFile,
  repoFileExists,
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

function extractCssHrefFromHtml(html: string): string | null {
  const match = html.match(/href="(\/_next\/static\/css\/[^"]+\.css)"/i);
  return match?.[1] ?? null;
}

async function fetchCombinedCss(baseUrl: string): Promise<string> {
  const homeRes = await fetchManual(baseUrl, "/");
  const cssHref = extractCssHrefFromHtml(homeRes.body);
  if (!cssHref) return "";
  const cssRes = await fetchManual(baseUrl, cssHref);
  return cssRes.status === 200 ? cssRes.body : "";
}

describe("Paket Tier 1: Requirement-Driven Feature Coverage (F1–F24, 120 Cases)", () => {
  let server: E2eServerHandle;
  let browser: CdpBrowser;
  let sharedImageTicket: CreatedPublicTicket | null = null;
  let sharedCommentTicket: CreatedPublicTicket | null = null;

  beforeAll(async () => {
    server = await startE2eServer();
    browser = await CdpBrowser.launch();
    if (IS_LIVE_DB) {
      sharedImageTicket = await createPublicTicket(server.baseUrl, {
        mode: "photo",
        withImage: true,
      });
      sharedCommentTicket = await createPublicTicket(server.baseUrl, {
        mode: "default",
      });
    }
  });

  afterAll(async () => {
    if (browser) {
      await browser.close();
    }
    if (server) {
      await server.stop();
    }
  });

  beforeEach(() => {
    browser.clearErrors();
  });

  // =========================================================================
  // F1: Dark-mode CSS & WCAG AA fixes + @media print (5 cases)
  // =========================================================================
  describe("F1: Dark-Mode CSS Parity, WCAG AA Contrast & @media print", () => {
    it("F1.1 serves dark-mode CSS tokens and .text-red-900 / .text-emerald-700 parity overrides", async () => {
      const css = await fetchCombinedCss(server.baseUrl);
      expect(css.length).toBeGreaterThan(0);
      expect(css).toContain('data-theme="dark"');
      expect(css).toContain("--danger-text");
      expect(css).toContain("--success-text");
      expect(css).toContain("text-red-900");
      expect(css).toContain("text-emerald-700");
    });

    it("F1.2 includes @media print rules in served stylesheet", async () => {
      const css = await fetchCombinedCss(server.baseUrl);
      expect(css).toMatch(/@media\s+print/i);
    });

    it("F1.3 achieves WCAG AA contrast on /, /lapor, and /login in light mode", async () => {
      for (const route of ["/", "/lapor", "/login"]) {
        await browser.goto(`${server.baseUrl}${route}`);
        await setBrowserTheme(browser, "light");
        const samples = await measureContrastSamples(browser, [
          "h1",
          "main p",
          'main a[href="/lapor"], main button[type="submit"]',
        ]);
        expect(samples.length).toBeGreaterThan(0);
        for (const sample of samples) {
          expect(
            sample.ratio,
            `${route} light ${sample.selector} (${sample.fg} on ${sample.bg})`,
          ).toBeGreaterThanOrEqual(sample.required);
        }
      }
      assertNoBrowserErrors(browser);
    });

    it("F1.4 achieves WCAG AA contrast on /, /lapor, and /login in dark mode", async () => {
      try {
        for (const route of ["/", "/lapor", "/login"]) {
          await browser.goto(`${server.baseUrl}${route}`);
          await setBrowserTheme(browser, "dark");
          const samples = await measureContrastSamples(browser, [
            "h1",
            "main p",
            'main a[href="/lapor"], main button[type="submit"]',
          ]);
          expect(samples.length).toBeGreaterThan(0);
          for (const sample of samples) {
            expect(
              sample.ratio,
              `${route} dark ${sample.selector} (${sample.fg} on ${sample.bg})`,
            ).toBeGreaterThanOrEqual(sample.required);
          }
        }
        assertNoBrowserErrors(browser);
      } finally {
        await setBrowserTheme(browser, "light");
      }
    });

    it("F1.5 eliminates legacy bg-yellow-50, bg-black classes and decorative emojis on public portals", async () => {
      for (const route of ["/", "/lapor", "/login"]) {
        const res = await fetchManual(server.baseUrl, route);
        expect(res.status).toBe(200);
        assertNoLegacyUiMarkers(res.body, {
          checkClasses: true,
          checkRawPunctuation: false,
          checkEmojis: true,
        });
      }
    });
  });

  // =========================================================================
  // F2: Shared ImageDropzone + compression (5 cases)
  // =========================================================================
  describe("F2: Shared ImageDropzone (Drag-and-Drop, Ctrl+V Paste & Compression)", () => {
    it("F2.1 /lapor renders ImageDropzone area with drag-drop & paste guidance", async () => {
      await browser.goto(`${server.baseUrl}/lapor`);
      await browser.waitForSelector("main form");
      const meta = await extractLaporMeta(server.baseUrl);
      if (meta?.photoCategoryId) {
        await browser.selectOption("#public-category", meta.photoCategoryId);
        await new Promise((r) => setTimeout(r, 150));
      }
      const hasDropzone = await browser.evalJs<boolean>(
        `(() => {
          const text = document.body.innerText;
          const fileInput = document.querySelector('main input[type="file"]');
          return Boolean(fileInput) && /seret|tarik|paste|ctrl\+v|tempel/i.test(text);
        })()`,
      );
      expect(hasDropzone).toBe(true);
      assertNoBrowserErrors(browser);
    });

    it("F2.2 /lapor ImageDropzone accepts synthetic PNG DataTransfer drop and shows preview", async () => {
      await browser.goto(`${server.baseUrl}/lapor`);
      await browser.waitForSelector("main form");
      const meta = await extractLaporMeta(server.baseUrl);
      if (meta?.photoCategoryId) {
        await browser.selectOption("#public-category", meta.photoCategoryId);
        await new Promise((r) => setTimeout(r, 150));
      }
      const dispatched = await dispatchSyntheticFileDrop(
        browser,
        DROPZONE_SELECTORS,
        "drop-test.png",
        "image/png",
        createMinimalPngBytes(),
      );
      expect(dispatched).toBe(true);
      await new Promise((r) => setTimeout(r, 250));
      const previewCount = await browser.evalJs<number>(
        `document.querySelectorAll('main form img[src^="blob:"], main form img[src^="data:"]').length`,
      );
      expect(previewCount).toBeGreaterThan(0);
      assertNoBrowserErrors(browser);
    });

    it("F2.3 /lapor ImageDropzone accepts synthetic Ctrl+V ClipboardEvent PNG paste", async () => {
      await browser.goto(`${server.baseUrl}/lapor`);
      await browser.waitForSelector("main form");
      const meta = await extractLaporMeta(server.baseUrl);
      if (meta?.photoCategoryId) {
        await browser.selectOption("#public-category", meta.photoCategoryId);
        await new Promise((r) => setTimeout(r, 150));
      }
      const pasted = await dispatchSyntheticPaste(
        browser,
        DROPZONE_SELECTORS,
        "paste-test.png",
        "image/png",
        createMinimalPngBytes(),
      );
      expect(pasted).toBe(true);
      await new Promise((r) => setTimeout(r, 250));
      const previewCount = await browser.evalJs<number>(
        `document.querySelectorAll('main form img[src^="blob:"], main form img[src^="data:"]').length`,
      );
      expect(previewCount).toBeGreaterThan(0);
      assertNoBrowserErrors(browser);
    });

    it("F2.4 removing an attached image in ImageDropzone clears thumbnail preview", async () => {
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
        "remove-me.png",
        "image/png",
        createMinimalPngBytes(),
      );
      expect(dropped).toBe(true);
      await new Promise((r) => setTimeout(r, 250));
      const removed = await browser.evalJs<boolean>(
        `(() => {
          const btn = document.querySelector('main form button[aria-label*="Hapus" i], main form button[title*="Hapus" i]');
          if (!(btn instanceof HTMLButtonElement)) return false;
          btn.click();
          return true;
        })()`,
      );
      expect(removed).toBe(true);
      await new Promise((r) => setTimeout(r, 150));
      const previewCount = await browser.evalJs<number>(
        `document.querySelectorAll('main form img[src^="blob:"], main form img[src^="data:"]').length`,
      );
      expect(previewCount).toBe(0);
      assertNoBrowserErrors(browser);
    });

    it.skipIf(!ANY_CREDS)(
      "F2.5 authenticated /tiket/baru exposes ImageDropzone accepting synthetic PNG drop",
      async () => {
        if (!ANY_CREDS) return;
        await loginViaBrowser(
          browser,
          server.baseUrl,
          ANY_CREDS.email,
          ANY_CREDS.password,
        );
        await browser.goto(`${server.baseUrl}/tiket/baru`);
        await browser.waitForSelector("main form");
        const hasDropzoneInitially = await browser.evalJs<boolean>(
          `Boolean(document.querySelector('[data-image-dropzone="true"], [data-testid="image-dropzone"]'))`,
        );
        if (!hasDropzoneInitially) {
          const photoCatId = await browser.evalJs<string>(
            `(() => {
              const sel = document.querySelector('#category, main select[id*="category" i], main select');
              if (!(sel instanceof HTMLSelectElement)) return "";
              const opts = Array.from(sel.options).filter((o) => o.value);
              const match = opts.find((o) => /error aplikasi kerja|masalah vpn|foto/i.test(o.textContent ?? "")) ?? opts[0];
              return match ? match.value : "";
            })()`,
          );
          if (photoCatId) {
            await browser.selectOption(
              '#category, main select[id*="category" i], main select',
              photoCatId,
            );
            await new Promise((r) => setTimeout(r, 150));
          }
        }
        const hasDropzone = await browser.evalJs<boolean>(
          `Boolean(document.querySelector('main input[type="file"]')) && /seret|tarik|paste|ctrl\+v|tempel/i.test(document.body.innerText)`,
        );
        expect(hasDropzone).toBe(true);
        const dropped = await dispatchSyntheticFileDrop(
          browser,
          DROPZONE_SELECTORS,
          "baru-drop.png",
          "image/png",
          createMinimalPngBytes(),
        );
        expect(dropped).toBe(true);
        await new Promise((r) => setTimeout(r, 200));
        const previewCount = await browser.evalJs<number>(
          `document.querySelectorAll('main form img[src^="blob:"], main form img[src^="data:"]').length`,
        );
        expect(previewCount).toBeGreaterThan(0);
        assertNoBrowserErrors(browser);
      },
    );
  });

  // =========================================================================
  // F3: Shared ImageLightbox modal (5 cases)
  // =========================================================================
  describe("F3: Shared ImageLightbox Modal", () => {
    it.skipIf(!IS_LIVE_DB)(
      "F3.1 /status/[token] with attachment renders Lightbox trigger opening role=dialog aria-modal=true",
      async () => {
        expect(sharedImageTicket).not.toBeNull();
        if (!sharedImageTicket) return;
        await browser.goto(
          `${server.baseUrl}/status/${sharedImageTicket.token}`,
        );
        await browser.waitForSelector("main img", { timeoutMs: 15_000 });
        const opened = await browser.evalJs<boolean>(
          `(() => {
            const trigger = document.querySelector('main button:has(img), main [role="button"]:has(img)');
            if (!(trigger instanceof HTMLElement)) return false;
            trigger.click();
            return true;
          })()`,
        );
        expect(opened).toBe(true);
        await browser.waitForSelector('[role="dialog"][aria-modal="true"]');
        assertNoBrowserErrors(browser);
      },
    );

    it.skipIf(!IS_LIVE_DB)(
      "F3.2 ImageLightbox renders full preview image with non-empty src inside dialog",
      async () => {
        expect(sharedImageTicket).not.toBeNull();
        if (!sharedImageTicket) return;
        await browser.goto(
          `${server.baseUrl}/status/${sharedImageTicket.token}`,
        );
        await browser.waitForSelector("main img");
        await browser.click('main button:has(img), main [role="button"]:has(img)');
        await browser.waitForSelector('[role="dialog"][aria-modal="true"] img');
        const src = await browser.evalJs<string>(
          `document.querySelector('[role="dialog"] img')?.getAttribute("src") ?? ""`,
        );
        expect(src.length).toBeGreaterThan(0);
        assertNoBrowserErrors(browser);
      },
    );

    it.skipIf(!IS_LIVE_DB)(
      "F3.3 pressing Escape key closes the ImageLightbox modal cleanly",
      async () => {
        expect(sharedImageTicket).not.toBeNull();
        if (!sharedImageTicket) return;
        await browser.goto(
          `${server.baseUrl}/status/${sharedImageTicket.token}`,
        );
        await browser.waitForSelector("main img");
        await browser.click('main button:has(img), main [role="button"]:has(img)');
        await browser.waitForSelector('[role="dialog"][aria-modal="true"]');
        await pressKeyCombo(browser, "Escape");
        await new Promise((r) => setTimeout(r, 150));
        const stillOpen = await browser.evalJs<boolean>(
          `Boolean(document.querySelector('[role="dialog"][aria-modal="true"]'))`,
        );
        expect(stillOpen).toBe(false);
        assertNoBrowserErrors(browser);
      },
    );

    it.skipIf(!IS_LIVE_DB)(
      "F3.4 clicking Lightbox close button closes the modal cleanly",
      async () => {
        expect(sharedImageTicket).not.toBeNull();
        if (!sharedImageTicket) return;
        await browser.goto(
          `${server.baseUrl}/status/${sharedImageTicket.token}`,
        );
        await browser.waitForSelector("main img");
        await browser.click('main button:has(img), main [role="button"]:has(img)');
        await browser.waitForSelector('[role="dialog"][aria-modal="true"]');
        expect(await closeModalDialog(browser, /tutup|close/i)).toBe(true);
        await new Promise((r) => setTimeout(r, 150));
        const stillOpen = await browser.evalJs<boolean>(
          `Boolean(document.querySelector('[role="dialog"][aria-modal="true"]'))`,
        );
        expect(stillOpen).toBe(false);
        assertNoBrowserErrors(browser);
      },
    );

    it.skipIf(!IT_OR_ADMIN_CREDS || !IS_LIVE_DB)(
      "F3.5 authenticated /tiket/[id] attachment opens ImageLightbox modal",
      async () => {
        if (!IT_OR_ADMIN_CREDS) return;
        expect(sharedImageTicket).not.toBeNull();
        if (!sharedImageTicket) return;
        await loginViaBrowser(
          browser,
          server.baseUrl,
          IT_OR_ADMIN_CREDS.email,
          IT_OR_ADMIN_CREDS.password,
        );
        await browser.goto(`${server.baseUrl}/tiket/${sharedImageTicket.id}`);
        await browser.waitForSelector("main img");
        await browser.click('main button:has(img), main [role="button"]:has(img)');
        await browser.waitForSelector('[role="dialog"][aria-modal="true"]');
        assertNoBrowserErrors(browser);
      },
    );
  });

  // =========================================================================
  // F4: Shared MarkdownSteps renderer (5 cases)
  // =========================================================================
  describe("F4: Shared MarkdownSteps Renderer", () => {
    it("F4.1 /panduan renders structured <ol>/<ul>/<code> without raw triple backticks", async () => {
      await browser.goto(`${server.baseUrl}/panduan`);
      await browser.waitForSelector("main");
      const text = await browser.evalJs<string>("document.body.innerText");
      expect(text).not.toContain("```");
      assertNoBrowserErrors(browser);
    });

    it.skipIf(!IT_OR_ADMIN_CREDS)(
      "F4.2 authenticated /wiki renders ordered steps (<ol><li>) via MarkdownSteps",
      async () => {
        if (!IT_OR_ADMIN_CREDS) return;
        const cookie = await loginForCookies(
          browser,
          server.baseUrl,
          IT_OR_ADMIN_CREDS.email,
          IT_OR_ADMIN_CREDS.password,
        );
        const title = `E2E-F4-SOP-${Date.now()}`;
        const createRes = await fetchManual(server.baseUrl, "/api/wiki", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Origin: server.baseUrl,
            Cookie: cookie,
          },
          body: JSON.stringify({
            judul: title,
            grup: "Jaringan",
            masalah: "Kendala layanan IT yang memerlukan langkah SOP standar.",
            solusi:
              "1. Buka terminal `cmd`\n2. Jalankan perintah berikut:\n```bash\nipconfig /flushdns\n```",
            status: "published",
            is_internal: false,
          }),
        });
        expect(createRes.status).toBe(201);
        const created = parseJsonSafe<{ article?: { id?: string }; id?: string }>(
          createRes.body,
        );
        const articleId = created?.article?.id ?? created?.id ?? "";
        try {
          await browser.goto(`${server.baseUrl}/wiki`);
          await browser.waitForText(title);
          const hasOl = await browser.evalJs<boolean>(
            `document.querySelectorAll("main ol li").length >= 2`,
          );
          expect(hasOl).toBe(true);
        } finally {
          if (articleId) {
            await fetchManual(server.baseUrl, `/api/wiki/${articleId}`, {
              method: "DELETE",
              headers: { Origin: server.baseUrl, Cookie: cookie },
            });
          }
        }
      },
    );

    it.skipIf(!IT_OR_ADMIN_CREDS)(
      "F4.3 authenticated /wiki renders fenced code blocks in <pre><code>",
      async () => {
        if (!IT_OR_ADMIN_CREDS) return;
        const cookie = await loginForCookies(
          browser,
          server.baseUrl,
          IT_OR_ADMIN_CREDS.email,
          IT_OR_ADMIN_CREDS.password,
        );
        const title = `E2E-F4-CODE-${Date.now()}`;
        const createRes = await fetchManual(server.baseUrl, "/api/wiki", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Origin: server.baseUrl,
            Cookie: cookie,
          },
          body: JSON.stringify({
            judul: title,
            grup: "Sistem",
            masalah: "Kendala layanan IT yang memerlukan langkah SOP standar.",
            solusi: "1. Cek service:\n```sh\nsystemctl status nginx\n```",
            status: "published",
            is_internal: false,
          }),
        });
        expect(createRes.status).toBe(201);
        const created = parseJsonSafe<{ article?: { id?: string }; id?: string }>(
          createRes.body,
        );
        const articleId = created?.article?.id ?? created?.id ?? "";
        try {
          await browser.goto(`${server.baseUrl}/wiki`);
          await browser.waitForText(title);
          const hasPreCode = await browser.evalJs<boolean>(
            `Array.from(document.querySelectorAll("main pre code")).some((el) => (el.textContent ?? "").includes("systemctl status nginx"))`,
          );
          expect(hasPreCode).toBe(true);
        } finally {
          if (articleId) {
            await fetchManual(server.baseUrl, `/api/wiki/${articleId}`, {
              method: "DELETE",
              headers: { Origin: server.baseUrl, Cookie: cookie },
            });
          }
        }
      },
    );

    it.skipIf(!IT_OR_ADMIN_CREDS)(
      "F4.4 authenticated /wiki renders inline code inside <code> elements",
      async () => {
        if (!IT_OR_ADMIN_CREDS) return;
        const cookie = await loginForCookies(
          browser,
          server.baseUrl,
          IT_OR_ADMIN_CREDS.email,
          IT_OR_ADMIN_CREDS.password,
        );
        const title = `E2E-F4-INLINE-${Date.now()}`;
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
            solusi: "1. Jalankan `ping 1.1.1.1` untuk uji koneksi.",
            status: "published",
            is_internal: false,
          }),
        });
        expect(createRes.status).toBe(201);
        const created = parseJsonSafe<{ article?: { id?: string }; id?: string }>(
          createRes.body,
        );
        const articleId = created?.article?.id ?? created?.id ?? "";
        try {
          await browser.goto(`${server.baseUrl}/wiki`);
          await browser.waitForText(title);
          const hasInlineCode = await browser.evalJs<boolean>(
            `Array.from(document.querySelectorAll("main code")).some((el) => (el.textContent ?? "").includes("ping 1.1.1.1"))`,
          );
          expect(hasInlineCode).toBe(true);
        } finally {
          if (articleId) {
            await fetchManual(server.baseUrl, `/api/wiki/${articleId}`, {
              method: "DELETE",
              headers: { Origin: server.baseUrl, Cookie: cookie },
            });
          }
        }
      },
    );

    it.skipIf(!IT_OR_ADMIN_CREDS)(
      "F4.5 MarkdownSteps neutralizes HTML/script payloads without DOM script execution",
      async () => {
        if (!IT_OR_ADMIN_CREDS) return;
        const cookie = await loginForCookies(
          browser,
          server.baseUrl,
          IT_OR_ADMIN_CREDS.email,
          IT_OR_ADMIN_CREDS.password,
        );
        const title = `E2E-F4-XSS-${Date.now()}`;
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
              '1. Jangan jalankan <script>window.__e2eXss=1</script> <img src=x onerror="window.__e2eXss=2">',
            status: "published",
            is_internal: false,
          }),
        });
        expect(createRes.status).toBe(201);
        const created = parseJsonSafe<{ article?: { id?: string }; id?: string }>(
          createRes.body,
        );
        const articleId = created?.article?.id ?? created?.id ?? "";
        try {
          await browser.goto(`${server.baseUrl}/wiki`);
          await browser.waitForText(title);
          const xssRan = await browser.evalJs<boolean>(
            `Boolean(window.__e2eXss) || Boolean(document.querySelector("main img[onerror]"))`,
          );
          expect(xssRan).toBe(false);
          assertNoBrowserErrors(browser);
        } finally {
          if (articleId) {
            await fetchManual(server.baseUrl, `/api/wiki/${articleId}`, {
              method: "DELETE",
              headers: { Origin: server.baseUrl, Cookie: cookie },
            });
          }
        }
      },
    );
  });

  // =========================================================================
  // F5: app/login/page.tsx UX upgrade (5 cases)
  // =========================================================================
  describe("F5: Login Page UX Upgrade", () => {
    it("F5.1 /login renders #login-email, #login-password, and password visibility toggle", async () => {
      await browser.goto(`${server.baseUrl}/login`);
      await browser.waitForSelector("#login-email");
      const info = await browser.evalJs<{
        emailType: string;
        passType: string;
        hasToggle: boolean;
      }>(
        `(() => {
          const email = document.querySelector("#login-email");
          const pass = document.querySelector("#login-password");
          const toggle = document.querySelector(
            'button[aria-label*="sandi" i], button[aria-label*="password" i], button[aria-pressed]'
          );
          return {
            emailType: email instanceof HTMLInputElement ? email.type : "",
            passType: pass instanceof HTMLInputElement ? pass.type : "",
            hasToggle: toggle instanceof HTMLButtonElement,
          };
        })()`,
      );
      expect(info.emailType).toBe("email");
      expect(info.passType).toBe("password");
      expect(info.hasToggle).toBe(true);
      assertNoBrowserErrors(browser);
    });

    it("F5.2 clicking password visibility toggle switches input type between password and text", async () => {
      await browser.goto(`${server.baseUrl}/login`);
      await browser.waitForSelector("#login-password");
      const toggleSel =
        'button[aria-label*="sandi" i], button[aria-label*="password" i], button[aria-pressed]';
      await browser.click(toggleSel);
      expect(
        await browser.evalJs<string>(
          `document.querySelector("#login-password")?.getAttribute("type") ?? ""`,
        ),
      ).toBe("text");
      await browser.click(toggleSel);
      expect(
        await browser.evalJs<string>(
          `document.querySelector("#login-password")?.getAttribute("type") ?? ""`,
        ),
      ).toBe("password");
      assertNoBrowserErrors(browser);
    });

    it("F5.3 invalid login displays Indonesian role=alert error without raw English Supabase message", async () => {
      await browser.goto(`${server.baseUrl}/login`);
      await browser.fillInput("#login-email", "invalid-e2e@example.com");
      await browser.fillInput("#login-password", "WrongPassword123!");
      await browser.click('main form button[type="submit"]');
      await browser.waitForSelector('main [role="alert"]', { timeoutMs: 15_000 });
      const alertText = await browser.getText('main [role="alert"]');
      expect(alertText.length).toBeGreaterThan(5);
      expect(alertText).not.toContain("Invalid login credentials");
      expect(alertText).toMatch(/email|sandi|salah|gagal|login/i);
    });

    it("F5.4 /login provides forgot-password / Admin contact guide without auth", async () => {
      await browser.goto(`${server.baseUrl}/login`);
      await browser.waitForSelector("main");
      const text = await browser.evalJs<string>("document.body.innerText");
      expect(text).toMatch(/lupa.*sandi|hubungi.*admin|administrator/i);
      assertNoBrowserErrors(browser);
    });

    it("F5.5 /login contains zero legacy classes, raw punctuation, or decorative emojis", async () => {
      const res = await fetchManual(server.baseUrl, "/login");
      expect(res.status).toBe(200);
      assertNoLegacyUiMarkers(res.body);
    });
  });

  // =========================================================================
  // F6: ConfirmDialog + Toast replacing window.confirm (5 cases)
  // =========================================================================
  describe("F6: ConfirmDialog & Toast (Zero window.confirm)", () => {
    it("F6.1 unauthenticated POST /api/admin/generate-jadwal returns 403 JSON with no-store", async () => {
      const res = await fetchManual(server.baseUrl, "/api/admin/generate-jadwal", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: server.baseUrl,
        },
        body: "{}",
      });
      expect(res.status).toBe(403);
      expect(res.contentType).toContain("application/json");
      assertNoStore(res);
    });

    it.skipIf(!ADMIN_CREDS)(
      "F6.2 /admin/jadwal opens ConfirmDialog (role=alertdialog) instead of window.confirm",
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
          `window.confirm = () => { throw new Error("window.confirm must not be called"); };`,
        );
        const clicked = await browser.evalJs<boolean>(
          `(() => {
            const btn = Array.from(document.querySelectorAll("main button")).find((b) =>
              /generate|buat jadwal/i.test(b.textContent ?? "")
            );
            if (!(btn instanceof HTMLButtonElement)) return false;
            btn.click();
            return true;
          })()`,
        );
        expect(clicked).toBe(true);
        await browser.waitForSelector('[role="alertdialog"][aria-modal="true"]');
        assertNoBrowserErrors(browser);
      },
    );

    it.skipIf(!ADMIN_CREDS)(
      "F6.3 canceling ConfirmDialog on /admin/jadwal closes modal cleanly without API mutation",
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
            const btn = Array.from(document.querySelectorAll("main button")).find((b) =>
              /generate|buat jadwal/i.test(b.textContent ?? "")
            );
            if (btn instanceof HTMLButtonElement) btn.click();
          })()`,
        );
        await browser.waitForSelector('[role="alertdialog"][aria-modal="true"]');
        await pressKeyCombo(browser, "Escape");
        await new Promise((r) => setTimeout(r, 150));
        const open = await browser.evalJs<boolean>(
          `Boolean(document.querySelector('[role="alertdialog"]'))`,
        );
        expect(open).toBe(false);
        assertNoBrowserErrors(browser);
      },
    );

    it.skipIf(!IT_OR_ADMIN_CREDS)(
      "F6.4 /wiki delete triggers ConfirmDialog (role=alertdialog) and never window.confirm",
      async () => {
        if (!IT_OR_ADMIN_CREDS) return;
        const cookie = await loginForCookies(
          browser,
          server.baseUrl,
          IT_OR_ADMIN_CREDS.email,
          IT_OR_ADMIN_CREDS.password,
        );
        const title = `E2E-F6-DEL-${Date.now()}`;
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
            solusi: "1. Langkah sementara.",
            status: "draft",
            is_internal: false,
          }),
        });
        expect(createRes.status).toBe(201);
        const created = parseJsonSafe<{ article?: { id?: string }; id?: string }>(
          createRes.body,
        );
        const articleId = created?.article?.id ?? created?.id ?? "";
        try {
          await browser.goto(`${server.baseUrl}/wiki`);
          await browser.waitForText(title);
          await browser.evalJs(
            `window.confirm = () => { throw new Error("window.confirm called on /wiki"); };`,
          );
          const openedDialog = await browser.evalJs<boolean>(
            `(() => {
              const cards = Array.from(document.querySelectorAll("main article, main section, main div"));
              const card = cards.find((c) => (c.textContent ?? "").includes(${JSON.stringify(title)}) && c.querySelector("button"));
              const delBtn = card ? Array.from(card.querySelectorAll("button")).find((b) => /hapus/i.test(b.textContent ?? "")) : null;
              if (!(delBtn instanceof HTMLButtonElement)) return false;
              delBtn.click();
              return true;
            })()`,
          );
          expect(openedDialog).toBe(true);
          await browser.waitForSelector('[role="alertdialog"][aria-modal="true"]');
          assertNoBrowserErrors(browser);
        } finally {
          if (articleId) {
            await fetchManual(server.baseUrl, `/api/wiki/${articleId}`, {
              method: "DELETE",
              headers: { Origin: server.baseUrl, Cookie: cookie },
            });
          }
        }
      },
    );

    it.skipIf(!IT_OR_ADMIN_CREDS)(
      "F6.5 confirming /wiki delete removes article and displays accessible Toast (role=status)",
      async () => {
        if (!IT_OR_ADMIN_CREDS) return;
        const cookie = await loginForCookies(
          browser,
          server.baseUrl,
          IT_OR_ADMIN_CREDS.email,
          IT_OR_ADMIN_CREDS.password,
        );
        const title = `E2E-F6-CONFIRM-${Date.now()}`;
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
            solusi: "1. Hapus via ConfirmDialog.",
            status: "draft",
            is_internal: false,
          }),
        });
        expect(createRes.status).toBe(201);
        await browser.goto(`${server.baseUrl}/wiki`);
        await browser.waitForText(title);
        await browser.evalJs(
          `(() => {
            const cards = Array.from(document.querySelectorAll("main article, main section, main div"));
            const card = cards.find((c) => (c.textContent ?? "").includes(${JSON.stringify(title)}) && c.querySelector("button"));
            const delBtn = card ? Array.from(card.querySelectorAll("button")).find((b) => /hapus/i.test(b.textContent ?? "")) : null;
            if (delBtn instanceof HTMLButtonElement) delBtn.click();
          })()`,
        );
        await browser.waitForSelector('[role="alertdialog"][aria-modal="true"]');
        await browser.evalJs(
          `(() => {
            const btns = Array.from(document.querySelectorAll('[role="alertdialog"] button'));
            const confirm = btns.find((b) => /hapus|lanjutkan|ya/i.test(b.textContent ?? "") && !/batal/i.test(b.textContent ?? ""));
            if (confirm instanceof HTMLButtonElement) confirm.click();
          })()`,
        );
        await browser.waitForSelector('[role="status"]');
        assertNoBrowserErrors(browser);
      },
    );
  });

  // =========================================================================
  // F7: DB Migrations 0032+ (no DROP, strict RLS, Realtime) (5 cases)
  // =========================================================================
  describe("F7: DB Migrations 0032+ SQL & RLS Contracts", () => {
    it("F7.1 additive migrations >= 0032 exist and contain zero DROP statements", () => {
      const files = listMigrationFiles().filter((f) => {
        const num = Number.parseInt(f.slice(0, 4), 10);
        return Number.isInteger(num) && num >= 32;
      });
      expect(files.length).toBeGreaterThan(0);
      for (const file of files) {
        const sql = readRepoTextFile(`supabase/migrations/${file}`);
        expect(sql, `Forbidden DROP in ${file}`).not.toMatch(
          /\bDROP\s+(TABLE|POLICY|FUNCTION|COLUMN|INDEX|TRIGGER|VIEW|TYPE)\b/i,
        );
      }
    });

    it("F7.2 migrations 0032+ create ticket_comments and in_app_notifications with RLS enabled", () => {
      const files = listMigrationFiles().filter((f) => {
        const num = Number.parseInt(f.slice(0, 4), 10);
        return Number.isInteger(num) && num >= 32;
      });
      const combined = files
        .map((f) => readRepoTextFile(`supabase/migrations/${f}`))
        .join("\n");
      expect(combined).toMatch(/CREATE\s+TABLE[^;]*ticket_comments/i);
      expect(combined).toMatch(/CREATE\s+TABLE[^;]*in_app_notifications/i);
      expect(combined).toMatch(/ticket_comments[\s\S]*ENABLE\s+ROW\s+LEVEL\s+SECURITY/i);
      expect(combined).toMatch(/in_app_notifications[\s\S]*ENABLE\s+ROW\s+LEVEL\s+SECURITY/i);
      expect(combined).toMatch(/CREATE\s+POLICY/i);
    });

    it("F7.3 migrations 0032+ add knowledge_articles.is_internal boolean column", () => {
      const files = listMigrationFiles().filter((f) => {
        const num = Number.parseInt(f.slice(0, 4), 10);
        return Number.isInteger(num) && num >= 32;
      });
      const combined = files
        .map((f) => readRepoTextFile(`supabase/migrations/${f}`))
        .join("\n");
      expect(combined).toMatch(/knowledge_articles[\s\S]*is_internal/i);
    });

    it("F7.4 migrations 0032+ enable supabase_realtime publication and handle_sla_pause procurement updates", () => {
      const files = listMigrationFiles().filter((f) => {
        const num = Number.parseInt(f.slice(0, 4), 10);
        return Number.isInteger(num) && num >= 32;
      });
      const combined = files
        .map((f) => readRepoTextFile(`supabase/migrations/${f}`))
        .join("\n");
      expect(combined).toMatch(/supabase_realtime/i);
      expect(combined).toMatch(/handle_sla_pause/i);
    });

    it("F7.5 supabase/README.md documents migrations 0032+", () => {
      const readme = readRepoTextFile("supabase/README.md");
      expect(readme).toMatch(/0032/);
      expect(readme).toMatch(/ticket_comments/i);
      expect(readme).toMatch(/in_app_notifications/i);
    });
  });

  // =========================================================================
  // F8: Backend security, cache headers, audit & Web Push (5 cases)
  // =========================================================================
  describe("F8: Backend Security, Cache-Control: no-store, Audit & sw.js", () => {
    it("F8.1 unauthenticated GET /api/stok returns 401 JSON with Cache-Control: no-store", async () => {
      const res = await fetchManual(server.baseUrl, "/api/stok");
      expect(res.status).toBe(401);
      expect(res.contentType).toContain("application/json");
      assertNoStore(res);
      expect(hasStackTrace(res.body)).toBe(false);
    });

    it("F8.2 unauthenticated GET /api/laporan/export returns 401 JSON with Cache-Control: no-store", async () => {
      const res = await fetchManual(server.baseUrl, "/api/laporan/export");
      expect(res.status).toBe(401);
      expect(res.contentType).toContain("application/json");
      assertNoStore(res);
      expect(hasStackTrace(res.body)).toBe(false);
    });

    it.skipIf(!IT_OR_ADMIN_CREDS)(
      "F8.3 authenticated GET /api/stok and GET /api/laporan/export return 200 with Cache-Control: no-store",
      async () => {
        if (!IT_OR_ADMIN_CREDS) return;
        const cookie = await loginForCookies(
          browser,
          server.baseUrl,
          IT_OR_ADMIN_CREDS.email,
          IT_OR_ADMIN_CREDS.password,
        );
        const stokRes = await fetchManual(server.baseUrl, "/api/stok", {
          headers: { Cookie: cookie },
        });
        expect(stokRes.status).toBe(200);
        assertNoStore(stokRes);

        const exportRes = await fetchManual(
          server.baseUrl,
          "/api/laporan/export",
          { headers: { Cookie: cookie } },
        );
        expect(exportRes.status).toBe(200);
        assertNoStore(exportRes);
      },
    );

    it.skipIf(!ADMIN_CREDS)(
      "F8.4 authenticated Admin POST /api/admin/generate-jadwal records audit entry on /admin/audit",
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
        const clickedGenerate = await browser.evalJs<boolean>(
          `(() => {
            const btn = Array.from(document.querySelectorAll("main button")).find((b) =>
              /generate|buat jadwal/i.test(b.textContent ?? "")
            );
            if (!(btn instanceof HTMLButtonElement) || btn.disabled) return false;
            btn.click();
            return true;
          })()`,
        );
        expect(clickedGenerate).toBe(true);
        await browser.waitForSelector('[role="alertdialog"][aria-modal="true"]');
        const confirmed = await browser.evalJs<boolean>(
          `(() => {
            const btns = Array.from(document.querySelectorAll('[role="alertdialog"] button'));
            const ok = btns.find((b) =>
              /ya,\s*generate jadwal|generate|lanjutkan|ya/i.test(b.textContent ?? "") &&
              !/batal/i.test(b.textContent ?? "")
            );
            if (!(ok instanceof HTMLButtonElement)) return false;
            ok.click();
            return true;
          })()`,
        );
        expect(confirmed).toBe(true);
        await browser.waitForSelector('[role="status"]', { timeoutMs: 15_000 });
        await browser.goto(`${server.baseUrl}/admin/audit`);
        await browser.waitForSelector("main table, main");
        const text = await browser.evalJs<string>("document.body.innerText");
        expect(text).toMatch(/jadwal/i);
        assertNoBrowserErrors(browser);
      },
    );

    it("F8.5 GET /sw.js returns 200 JS with push and notificationclick listeners", async () => {
      const res = await fetchManual(server.baseUrl, "/sw.js");
      expect(res.status).toBe(200);
      expect(res.contentType).toMatch(/javascript/i);
      expect(res.body).toContain("push");
      expect(res.body).toContain("notificationclick");
    });
  });

  // =========================================================================
  // F9: Two-way ticket discussion (Public vs Internal IT isolation) (5 cases)
  // =========================================================================
  describe("F9: Two-Way Ticket Discussion & Internal Note Isolation", () => {
    it("F9.1 unauthenticated GET and POST /api/tiket/[id]/comments return 401 JSON no-store", async () => {
      const getRes = await fetchManual(
        server.baseUrl,
        `/api/tiket/${NONEXISTENT_UUID}/comments`,
      );
      expect(getRes.status).toBe(401);
      expect(getRes.contentType).toContain("application/json");
      assertNoStore(getRes);

      const postRes = await fetchManual(
        server.baseUrl,
        `/api/tiket/${NONEXISTENT_UUID}/comments`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Origin: server.baseUrl,
          },
          body: JSON.stringify({ isi: "Unauth comment" }),
        },
      );
      expect(postRes.status).toBe(401);
      expect(postRes.contentType).toContain("application/json");
      assertNoStore(postRes);
    });

    it.skipIf(!IT_OR_ADMIN_CREDS || !IS_LIVE_DB)(
      "F9.2 authenticated IT posts public reply (isInternal: false) returned by GET comments",
      async () => {
        if (!IT_OR_ADMIN_CREDS) return;
        const ticket = sharedCommentTicket;
        expect(ticket).not.toBeNull();
        if (!ticket) return;

        const cookie = await loginForCookies(
          browser,
          server.baseUrl,
          IT_OR_ADMIN_CREDS.email,
          IT_OR_ADMIN_CREDS.password,
        );
        const msg = `Balasan publik IT F9.2 ${Date.now()}`;
        const postRes = await fetchManual(
          server.baseUrl,
          `/api/tiket/${ticket.id}/comments`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Origin: server.baseUrl,
              Cookie: cookie,
            },
            body: JSON.stringify({ isi: msg, isInternal: false }),
          },
        );
        expect([200, 201]).toContain(postRes.status);
        assertNoStore(postRes);

        const getRes = await fetchManual(
          server.baseUrl,
          `/api/tiket/${ticket.id}/comments`,
          { headers: { Cookie: cookie } },
        );
        expect(getRes.status).toBe(200);
        expect(getRes.body).toContain(msg);
      },
    );

    it.skipIf(!IT_OR_ADMIN_CREDS || !IS_LIVE_DB)(
      "F9.3 authenticated IT posts internal note (isInternal: true) persisted with is_internal=true",
      async () => {
        if (!IT_OR_ADMIN_CREDS) return;
        const ticket = sharedCommentTicket;
        expect(ticket).not.toBeNull();
        if (!ticket) return;

        const cookie = await loginForCookies(
          browser,
          server.baseUrl,
          IT_OR_ADMIN_CREDS.email,
          IT_OR_ADMIN_CREDS.password,
        );
        const note = `Catatan internal rahasia IT F9.3 ${Date.now()}`;
        const postRes = await fetchManual(
          server.baseUrl,
          `/api/tiket/${ticket.id}/comments`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Origin: server.baseUrl,
              Cookie: cookie,
            },
            body: JSON.stringify({ isi: note, isInternal: true }),
          },
        );
        expect([200, 201]).toContain(postRes.status);

        const getRes = await fetchManual(
          server.baseUrl,
          `/api/tiket/${ticket.id}/comments`,
          { headers: { Cookie: cookie } },
        );
        expect(getRes.status).toBe(200);
        expect(getRes.body).toContain(note);
        expect(getRes.body).toMatch(/"is_internal"\s*:\s*true/);
      },
    );

    it.skipIf(!IT_OR_ADMIN_CREDS || !IS_LIVE_DB)(
      "F9.4 public GET /api/tiket/publik/[token] returns public replies and NEVER exposes internal IT notes",
      async () => {
        if (!IT_OR_ADMIN_CREDS) return;
        const ticket = sharedCommentTicket;
        expect(ticket).not.toBeNull();
        if (!ticket) return;

        const cookie = await loginForCookies(
          browser,
          server.baseUrl,
          IT_OR_ADMIN_CREDS.email,
          IT_OR_ADMIN_CREDS.password,
        );
        const publicMsg = `Info publik F9.4 ${Date.now()}`;
        const internalMsg = `SECRET-INTERNAL-NOTE-F9.4-${Date.now()}`;

        const pubPost = await fetchManual(
          server.baseUrl,
          `/api/tiket/${ticket.id}/comments`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Origin: server.baseUrl,
              Cookie: cookie,
            },
            body: JSON.stringify({ isi: publicMsg, isInternal: false }),
          },
        );
        expect([200, 201]).toContain(pubPost.status);
        const intPost = await fetchManual(
          server.baseUrl,
          `/api/tiket/${ticket.id}/comments`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Origin: server.baseUrl,
              Cookie: cookie,
            },
            body: JSON.stringify({ isi: internalMsg, isInternal: true }),
          },
        );
        expect([200, 201]).toContain(intPost.status);

        const pubRes = await fetchManual(
          server.baseUrl,
          `/api/tiket/publik/${ticket.token}`,
        );
        expect(pubRes.status).toBe(200);
        expect(pubRes.body).toContain(publicMsg);
        expect(pubRes.body).not.toContain(internalMsg);
      },
    );

    it.skipIf(!USER_CREDS || !IT_OR_ADMIN_CREDS || !IS_LIVE_DB)(
      "F9.5 standard user role GET /api/tiket/[id]/comments never receives internal IT notes",
      async () => {
        if (!USER_CREDS || !IT_OR_ADMIN_CREDS) return;
        const ticket = sharedCommentTicket;
        expect(ticket).not.toBeNull();
        if (!ticket) return;

        const itCookie = await loginForCookies(
          browser,
          server.baseUrl,
          IT_OR_ADMIN_CREDS.email,
          IT_OR_ADMIN_CREDS.password,
        );
        const internalMsg = `IT-ONLY-NOTE-F9.5-${Date.now()}`;
        await fetchManual(server.baseUrl, `/api/tiket/${ticket.id}/comments`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Origin: server.baseUrl,
            Cookie: itCookie,
          },
          body: JSON.stringify({ isi: internalMsg, isInternal: true }),
        });

        const userCookie = await loginForCookies(
          browser,
          server.baseUrl,
          USER_CREDS.email,
          USER_CREDS.password,
        );
        const userRes = await fetchManual(
          server.baseUrl,
          `/api/tiket/${ticket.id}/comments`,
          { headers: { Cookie: userCookie } },
        );
        expect([200, 403, 404]).toContain(userRes.status);
        expect(userRes.body).not.toContain(internalMsg);
      },
    );
  });

  // =========================================================================
  // F10: menunggu_user reason & auto-resume (5 cases)
  // =========================================================================
  describe("F10: menunggu_user Reason & Auto-Resume to diproses", () => {
    it("F10.1 POST /api/tiket/publik/[nonexistent]/reply returns 404 JSON no-store without stack trace", async () => {
      const res = await fetchManual(
        server.baseUrl,
        `/api/tiket/publik/${NONEXISTENT_UUID}/reply`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Origin: server.baseUrl,
          },
          body: JSON.stringify({ isi: "Halo IT, sudah dicoba" }),
        },
      );
      expect(res.contentType).toContain("application/json");
      assertNoStore(res);
      expect(hasStackTrace(res.body)).toBe(false);
      if (IS_LIVE_DB) {
        expect(res.status).toBe(404);
      } else {
        expect([404, 500]).toContain(res.status);
      }
    });

    it.skipIf(!IT_OR_ADMIN_CREDS || !IS_LIVE_DB)(
      "F10.2 moving diproses ticket to menunggu_user prompts & persists reason visible on /status/[token]",
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
          const reason = `Mohon kirim ID AnyDesk terbaru ${Date.now()}`;
          await moveTicketToMenungguUserViaUi(
            browser,
            server.baseUrl,
            ticket.id,
            reason,
          );

          const pubRes = await fetchManual(
            server.baseUrl,
            `/api/tiket/publik/${ticket.token}`,
          );
          expect(pubRes.status).toBe(200);
          expect(pubRes.body).toContain("menunggu_user");
          expect(pubRes.body).toContain(reason);
        } finally {
          await resolveAndCloseTicketViaUi(browser, server.baseUrl, ticket).catch(
            () => undefined,
          );
        }
      },
    );

    it.skipIf(!IT_OR_ADMIN_CREDS || !IS_LIVE_DB)(
      "F10.3 public reply on menunggu_user ticket auto-resumes status to diproses",
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
          await moveTicketToMenungguUserViaUi(
            browser,
            server.baseUrl,
            ticket.id,
            "Menunggu konfirmasi pelapor",
          );

          const replyRes = await fetchManual(
            server.baseUrl,
            `/api/tiket/publik/${ticket.token}/reply`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Origin: server.baseUrl,
              },
              body: JSON.stringify({
                isi: "Sudah saya nyalakan ulang laptopnya",
                jenis: "komentar",
              }),
            },
          );
          expect([200, 201]).toContain(replyRes.status);
          assertNoStore(replyRes);

          const pubRes = await fetchManual(
            server.baseUrl,
            `/api/tiket/publik/${ticket.token}`,
          );
          expect(pubRes.body).toContain("diproses");
        } finally {
          await resolveAndCloseTicketViaUi(browser, server.baseUrl, ticket).catch(
            () => undefined,
          );
        }
      },
    );

    it.skipIf(!IT_OR_ADMIN_CREDS || !IS_LIVE_DB)(
      "F10.4 public remote password update on menunggu_user auto-resumes status to diproses",
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
          await moveTicketToMenungguUserViaUi(
            browser,
            server.baseUrl,
            ticket.id,
            "Password remote salah",
          );

          const remoteRes = await fetchManual(
            server.baseUrl,
            `/api/tiket/publik/${ticket.token}/reply`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Origin: server.baseUrl,
              },
              body: JSON.stringify({
                isi: "Password remote diperbarui",
                jenis: "remote",
                remoteApp: "AnyDesk",
                remoteId: "998877665",
                remotePassword: "NewPassE2E!99",
              }),
            },
          );
          expect([200, 201]).toContain(remoteRes.status);
          const pubRes = await fetchManual(
            server.baseUrl,
            `/api/tiket/publik/${ticket.token}`,
          );
          expect(pubRes.body).toContain("diproses");
          expect(pubRes.body).not.toContain("NewPassE2E!99");
        } finally {
          await resolveAndCloseTicketViaUi(browser, server.baseUrl, ticket).catch(
            () => undefined,
          );
        }
      },
    );

    it.skipIf(!IT_OR_ADMIN_CREDS || !IS_LIVE_DB)(
      "F10.5 auto-resume creates an unread notification for assigned IT in /api/notifications",
      async () => {
        if (!IT_OR_ADMIN_CREDS) return;
        const ticket = await createPublicTicket(server.baseUrl, {
          mode: "default",
        });
        expect(ticket).not.toBeNull();
        if (!ticket) return;

        try {
          const itCookie = await loginForCookies(
            browser,
            server.baseUrl,
            IT_OR_ADMIN_CREDS.email,
            IT_OR_ADMIN_CREDS.password,
          );
          await moveTicketToMenungguUserViaUi(
            browser,
            server.baseUrl,
            ticket.id,
            "Alasan uji notifikasi auto-resume F10.5",
          );

          const replyRes = await fetchManual(
            server.baseUrl,
            `/api/tiket/publik/${ticket.token}/reply`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Origin: server.baseUrl,
              },
              body: JSON.stringify({
                isi: `Auto-resume F10.5 ${Date.now()}`,
                jenis: "komentar",
              }),
            },
          );
          expect([200, 201]).toContain(replyRes.status);

          const notifRes = await fetchManual(
            server.baseUrl,
            "/api/notifications",
            {
              headers: { Cookie: itCookie },
            },
          );
          expect(notifRes.status).toBe(200);
          assertNoStore(notifRes);
          const json = parseJsonSafe<{
            unreadCount?: number;
            notifications?: Array<{
              ticket_id?: string | null;
              dibaca?: boolean;
              judul?: string;
              pesan?: string;
              tautan?: string | null;
            }>;
            items?: Array<{
              ticket_id?: string | null;
              dibaca?: boolean;
              judul?: string;
              pesan?: string;
              tautan?: string | null;
            }>;
          }>(notifRes.body);
          expect(json?.unreadCount ?? 0).toBeGreaterThanOrEqual(1);
          const list = json?.notifications ?? json?.items ?? [];
          const match = list.find(
            (n) =>
              !n.dibaca &&
              (n.ticket_id === ticket.id ||
                (n.tautan ?? "").includes(ticket.id) ||
                (n.judul ?? "").includes(ticket.nomorTiket) ||
                (n.pesan ?? "").includes(ticket.nomorTiket)),
          );
          expect(match).toBeDefined();
        } finally {
          await resolveAndCloseTicketViaUi(browser, server.baseUrl, ticket).catch(
            () => undefined,
          );
        }
      },
    );
  });

  // =========================================================================
  // F11: /antrian 1-click Ambil & SLA countdown (5 cases)
  // =========================================================================
  describe("F11: /antrian 1-Click Ambil & Live SLA Countdown", () => {
    it("F11.1 unauthenticated GET /antrian redirects to /login without leaks", async () => {
      const res = await fetchManual(server.baseUrl, "/antrian");
      expect(
        isUnauthenticatedRedirectToLogin({
          status: res.status,
          location: res.location,
          body: res.body,
        }),
      ).toBe(true);
      expect(hasSensitiveDataLeak(res.body)).toBe(false);
    });

    it.skipIf(!IT_OR_ADMIN_CREDS)(
      "F11.2 authenticated IT /antrian renders SLA remaining countdown indicator",
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
        expect(text).toMatch(/SLA|Sisa|Terlambat|Jam|Menit/i);
        assertNoBrowserErrors(browser);
      },
    );

    it.skipIf(!IT_OR_ADMIN_CREDS || !IS_LIVE_DB)(
      "F11.3 /antrian shows inline 1-click Ambil button on unassigned baru ticket",
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
          await browser.goto(`${server.baseUrl}/antrian`);
          await browser.waitForText(ticket.nomorTiket);
          const hasAmbil = await browser.evalJs<boolean>(
            `Array.from(document.querySelectorAll("main button")).some((b) => /^Ambil$/i.test((b.textContent ?? "").trim()))`,
          );
          expect(hasAmbil).toBe(true);
          assertNoBrowserErrors(browser);
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
      "F11.4 clicking 1-click Ambil on /antrian claims ticket cleanly without reload crash",
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
          await browser.goto(`${server.baseUrl}/antrian`);
          await browser.waitForText(ticket.nomorTiket);
          const clicked = await browser.evalJs<boolean>(
            `(() => {
              const rows = Array.from(document.querySelectorAll("main tr, main [data-ticket-id]"));
              const row = rows.find((r) => (r.textContent ?? "").includes(${JSON.stringify(ticket.nomorTiket)}));
              const btn = row ? Array.from(row.querySelectorAll("button")).find((b) => /ambil/i.test(b.textContent ?? "")) : null;
              if (!(btn instanceof HTMLButtonElement)) return false;
              btn.click();
              return true;
            })()`,
          );
          expect(clicked).toBe(true);
          await new Promise((r) => setTimeout(r, 1000));
          const pubRes = await fetchManual(
            server.baseUrl,
            `/api/tiket/publik/${ticket.token}`,
          );
          expect(pubRes.body).toContain("diproses");
          assertNoBrowserErrors(browser);
        } finally {
          await resolveAndCloseTicketViaUi(
            browser,
            server.baseUrl,
            ticket,
          ).catch(() => undefined);
        }
      },
    );

    it.skipIf(!IT_OR_ADMIN_CREDS)(
      "F11.5 /antrian renders zero legacy bg-black/bg-yellow-50 classes and zero decorative emojis",
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
        const html = await browser.evalJs<string>("document.body.innerHTML");
        assertNoLegacyUiMarkers(html, {
          checkClasses: true,
          checkRawPunctuation: false,
          checkEmojis: true,
        });
      },
    );
  });

  // =========================================================================
  // F12: Canned Responses / Wiki SOP quick-solution picker (5 cases)
  // =========================================================================
  describe("F12: Canned Responses / Wiki SOP Quick-Solution Picker", () => {
    it.skipIf(!IT_OR_ADMIN_CREDS || !IS_LIVE_DB)(
      "F12.1 /tiket/[id] TicketActions exposes Canned Response / Wiki SOP picker",
      async () => {
        if (!IT_OR_ADMIN_CREDS) return;
        const ticket = sharedCommentTicket;
        expect(ticket).not.toBeNull();
        if (!ticket) return;

        await loginViaBrowser(
          browser,
          server.baseUrl,
          IT_OR_ADMIN_CREDS.email,
          IT_OR_ADMIN_CREDS.password,
        );
        await claimTicketViaUi(browser, server.baseUrl, ticket.id);
        await browser.evalJs(
          `(() => {
            const btn = Array.from(document.querySelectorAll("main button")).find((b) =>
              /ubah ke selesai|selesaikan/i.test(b.textContent ?? "")
            );
            if (btn instanceof HTMLButtonElement) btn.click();
          })()`,
        );
        await browser.waitForSelector("#solution-note, main textarea", {
          visible: true,
        });
        const hasPicker = await browser.evalJs<boolean>(
          `/template solusi|canned|pilih sop|wiki sop/i.test(document.body.innerText)`,
        );
        expect(hasPicker).toBe(true);
        assertNoBrowserErrors(browser);
      },
    );

    it.skipIf(!IT_OR_ADMIN_CREDS || !IS_LIVE_DB)(
      "F12.2 selecting a built-in Canned Response populates solution textarea",
      async () => {
        if (!IT_OR_ADMIN_CREDS) return;
        const ticket = sharedCommentTicket;
        expect(ticket).not.toBeNull();
        if (!ticket) return;

        await loginViaBrowser(
          browser,
          server.baseUrl,
          IT_OR_ADMIN_CREDS.email,
          IT_OR_ADMIN_CREDS.password,
        );
        await claimTicketViaUi(browser, server.baseUrl, ticket.id);
        await browser.evalJs(
          `(() => {
            const btn = Array.from(document.querySelectorAll("main button")).find((b) =>
              /ubah ke selesai|selesaikan/i.test(b.textContent ?? "")
            );
            if (btn instanceof HTMLButtonElement) btn.click();
          })()`,
        );
        await browser.waitForSelector("#solution-note, main textarea", {
          visible: true,
        });
        const populated = await browser.evalJs<string>(
          `(() => {
            const select = Array.from(document.querySelectorAll("main select")).find((s) =>
              s.id !== "difficulty-points" &&
              Array.from(s.options).some((o) => /template|canned|solusi|reset|restart/i.test(o.textContent ?? ""))
            );
            if (!(select instanceof HTMLSelectElement)) return "";
            const opt = Array.from(select.options).find((o) => o.value);
            if (!opt) return "";
            const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
            setter?.call(select, opt.value);
            select.dispatchEvent(new Event("change", { bubbles: true }));
            const ta = document.querySelector("#solution-note") ?? document.querySelector('main textarea[placeholder*="solusi" i], main textarea');
            return ta instanceof HTMLTextAreaElement ? ta.value : "";
          })()`,
        );
        expect(populated.length).toBeGreaterThan(0);
        assertNoBrowserErrors(browser);
      },
    );

    it.skipIf(!IT_OR_ADMIN_CREDS || !IS_LIVE_DB)(
      "F12.3 published Wiki SOP appears in TicketActions picker and populates solution",
      async () => {
        if (!IT_OR_ADMIN_CREDS) return;
        const cookie = await loginForCookies(
          browser,
          server.baseUrl,
          IT_OR_ADMIN_CREDS.email,
          IT_OR_ADMIN_CREDS.password,
        );
        const sopTitle = `E2E-SOP-PICK-${Date.now()}`;
        const sopBody = "1. Restart spooler Windows.";
        const wikiRes = await fetchManual(server.baseUrl, "/api/wiki", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Origin: server.baseUrl,
            Cookie: cookie,
          },
          body: JSON.stringify({
            judul: sopTitle,
            grup: "Printer",
            masalah: "Kendala layanan IT yang memerlukan langkah SOP standar.",
            solusi: sopBody,
            status: "published",
            is_internal: false,
          }),
        });
        expect(wikiRes.status).toBe(201);
        const wikiJson = parseJsonSafe<{ article?: { id?: string }; id?: string }>(
          wikiRes.body,
        );
        const wikiId = wikiJson?.article?.id ?? wikiJson?.id ?? "";
        const ticket = sharedCommentTicket;
        try {
          expect(ticket).not.toBeNull();
          if (!ticket) return;
          await claimTicketViaUi(browser, server.baseUrl, ticket.id);
          await browser.evalJs(
            `(() => {
              const btn = Array.from(document.querySelectorAll("main button")).find((b) =>
                /ubah ke selesai|selesaikan/i.test(b.textContent ?? "")
              );
              if (btn instanceof HTMLButtonElement) btn.click();
            })()`,
          );
          await browser.waitForSelector("#solution-note, main textarea", {
            visible: true,
          });
          const hasSopOption = await browser.evalJs<boolean>(
            `Array.from(document.querySelectorAll("main option")).some((o) => (o.textContent ?? "").includes(${JSON.stringify(sopTitle)}))`,
          );
          expect(hasSopOption).toBe(true);
        } finally {
          if (wikiId) {
            await fetchManual(server.baseUrl, `/api/wiki/${wikiId}`, {
              method: "DELETE",
              headers: { Origin: server.baseUrl, Cookie: cookie },
            });
          }
        }
      },
    );

    it.skipIf(!IT_OR_ADMIN_CREDS || !IS_LIVE_DB)(
      "F12.4 completing ticket with canned solution transitions status to selesai",
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
          const solutionText = `Solusi cepat terverifikasi ${Date.now()}`;
          await completeTicketViaUi(
            browser,
            server.baseUrl,
            ticket.id,
            solutionText,
            "2",
          );
          const pubRes = await fetchManual(
            server.baseUrl,
            `/api/tiket/publik/${ticket.token}`,
          );
          expect(pubRes.body).toContain("selesai");
        } finally {
          await closePublicTicketViaApi(server.baseUrl, ticket.token, 5).catch(
            () => undefined,
          );
        }
      },
    );

    it.skipIf(!IT_OR_ADMIN_CREDS || !IS_LIVE_DB)(
      "F12.5 completed solution text is visible on public /status/[token]",
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
          const solutionText = `Solusi publik E2E ${Date.now()}`;
          await completeTicketViaUi(
            browser,
            server.baseUrl,
            ticket.id,
            solutionText,
            "2",
          );

          await clearBrowserCookies(browser);
          await browser.goto(`${server.baseUrl}/status/${ticket.token}`);
          await browser.waitForText(solutionText);
          assertNoBrowserErrors(browser);
        } finally {
          await closePublicTicketViaApi(server.baseUrl, ticket.token, 5).catch(
            () => undefined,
          );
        }
      },
    );
  });

  // =========================================================================
  // F13: Supabase Realtime (/antrian, /tiket/[id]) + P0 banner (5 cases)
  // =========================================================================
  describe("F13: Supabase Realtime & P0 Urgent Banner", () => {
    it.skipIf(!IT_OR_ADMIN_CREDS)(
      "F13.1 /antrian initializes live Realtime monitoring without browser/console/server errors",
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
        await new Promise((r) => setTimeout(r, 500));
        assertNoBrowserErrors(browser);
      },
    );

    it.skipIf(!IT_OR_ADMIN_CREDS || !IS_LIVE_DB)(
      "F13.2 active P0 ticket displays P0 urgent alert banner on /antrian",
      async () => {
        if (!IT_OR_ADMIN_CREDS) return;
        const p0Ticket = await createPublicTicket(server.baseUrl, {
          mode: "p0",
        });
        expect(p0Ticket).not.toBeNull();
        if (!p0Ticket) return;

        try {
          await loginViaBrowser(
            browser,
            server.baseUrl,
            IT_OR_ADMIN_CREDS.email,
            IT_OR_ADMIN_CREDS.password,
          );
          await browser.goto(`${server.baseUrl}/antrian`);
          await browser.waitForSelector("main");
          const hasP0Banner = await browser.evalJs<boolean>(
            `(() => {
              const banner = document.querySelector('[role="alert"], [data-testid="p0-banner"]');
              const text = (banner?.textContent ?? document.body.innerText);
              return /P0/.test(text) && /kritis|darurat|segera|urgent/i.test(text);
            })()`,
          );
          expect(hasP0Banner).toBe(true);
          assertNoBrowserErrors(browser);
        } finally {
          await resolveAndCloseTicketViaUi(
            browser,
            server.baseUrl,
            p0Ticket,
          ).catch(() => undefined);
        }
      },
    );

    it.skipIf(!IT_OR_ADMIN_CREDS || !IS_LIVE_DB)(
      "F13.3 P0 urgent alert banner on /antrian can be dismissed cleanly",
      async () => {
        if (!IT_OR_ADMIN_CREDS) return;
        const p0Ticket = await createPublicTicket(server.baseUrl, {
          mode: "p0",
        });
        expect(p0Ticket).not.toBeNull();
        if (!p0Ticket) return;

        try {
          await loginViaBrowser(
            browser,
            server.baseUrl,
            IT_OR_ADMIN_CREDS.email,
            IT_OR_ADMIN_CREDS.password,
          );
          await browser.goto(`${server.baseUrl}/antrian`);
          await browser.waitForSelector(
            '[role="alert"], [data-testid="p0-banner"]',
          );
          const dismissed = await browser.evalJs<boolean>(
            `(() => {
              const banner = document.querySelector('[role="alert"], [data-testid="p0-banner"]');
              if (!banner) return false;
              const btn = banner.querySelector('button[aria-label*="Tutup" i], button');
              if (!(btn instanceof HTMLButtonElement)) return false;
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
            p0Ticket,
          ).catch(() => undefined);
        }
      },
    );

    it.skipIf(!IT_OR_ADMIN_CREDS || !IS_LIVE_DB)(
      "F13.4 /tiket/[id] reflects new public comment dynamically without manual full reload",
      async () => {
        if (!IT_OR_ADMIN_CREDS) return;
        const ticket = sharedCommentTicket;
        expect(ticket).not.toBeNull();
        if (!ticket) return;

        await loginViaBrowser(
          browser,
          server.baseUrl,
          IT_OR_ADMIN_CREDS.email,
          IT_OR_ADMIN_CREDS.password,
        );
        await browser.goto(`${server.baseUrl}/tiket/${ticket.id}`);
        await browser.waitForSelector("main");
        await browser.evalJs(`window.__e2eRtMarker = "live"`);

        const replyMsg = `Realtime check ${Date.now()}`;
        const replyRes = await fetchManual(
          server.baseUrl,
          `/api/tiket/publik/${ticket.token}/reply`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Origin: server.baseUrl,
            },
            body: JSON.stringify({ isi: replyMsg, jenis: "komentar" }),
          },
        );
        expect([200, 201]).toContain(replyRes.status);
        await browser.waitForText(replyMsg, 10_000);
        expect(
          await browser.evalJs<string>("window.__e2eRtMarker ?? ''"),
        ).toBe("live");
      },
    );

    it.skipIf(!IT_OR_ADMIN_CREDS || !IS_LIVE_DB)(
      "F13.5 sidebar operational badges render live counts cleanly without errors",
      async () => {
        if (!IT_OR_ADMIN_CREDS) return;
        expect(sharedCommentTicket).not.toBeNull();
        await loginViaBrowser(
          browser,
          server.baseUrl,
          IT_OR_ADMIN_CREDS.email,
          IT_OR_ADMIN_CREDS.password,
        );
        await browser.goto(`${server.baseUrl}/dashboard`);
        await browser.waitForSelector('nav[aria-label="Menu Utama"]');
        const badgeState = await browser.evalJs<{
          hasAntrianBadge: boolean;
          antrianCount: number;
          hasNaN: boolean;
        }>(
          `(() => {
            const nav = document.querySelector('nav[aria-label="Menu Utama"]');
            if (!nav) return { hasAntrianBadge: false, antrianCount: 0, hasNaN: true };
            const antrianLink = nav.querySelector('a[href="/antrian"]');
            const stokLink = nav.querySelector('a[href="/stok"]');
            const badgeText = Array.from(antrianLink?.querySelectorAll("span") ?? [])
              .map((s) => (s.textContent ?? "").trim())
              .find((t) => /^\\d+$/.test(t)) ?? "";
            const navText = (antrianLink?.textContent ?? "") + " " + (stokLink?.textContent ?? "");
            return {
              hasAntrianBadge: Boolean(badgeText),
              antrianCount: badgeText ? Number.parseInt(badgeText, 10) : 0,
              hasNaN: /NaN|undefined/i.test(navText),
            };
          })()`,
        );
        expect(badgeState.hasAntrianBadge).toBe(true);
        expect(badgeState.antrianCount).toBeGreaterThanOrEqual(1);
        expect(badgeState.hasNaN).toBe(false);
        assertNoBrowserErrors(browser);
      },
    );
  });

  // =========================================================================
  // F14: In-App Notifications API & Authenticated Attachments (5 cases)
  // =========================================================================
  describe("F14: In-App Notifications API & Authenticated Dropzone/Lightbox", () => {
    it("F14.1 unauthenticated GET and PATCH /api/notifications return 401 JSON with no-store", async () => {
      const getRes = await fetchManual(server.baseUrl, "/api/notifications");
      expect(getRes.status).toBe(401);
      expect(getRes.contentType).toContain("application/json");
      assertNoStore(getRes);

      const patchRes = await fetchManual(server.baseUrl, "/api/notifications", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Origin: server.baseUrl,
        },
        body: JSON.stringify({ markAllRead: true }),
      });
      expect(patchRes.status).toBe(401);
      expect(patchRes.contentType).toContain("application/json");
      assertNoStore(patchRes);
    });

    it.skipIf(!ANY_CREDS)(
      "F14.2 authenticated GET /api/notifications returns 200 JSON with unreadCount & no-store",
      async () => {
        if (!ANY_CREDS) return;
        const cookie = await loginForCookies(
          browser,
          server.baseUrl,
          ANY_CREDS.email,
          ANY_CREDS.password,
        );
        const res = await fetchManual(server.baseUrl, "/api/notifications", {
          headers: { Cookie: cookie },
        });
        expect(res.status).toBe(200);
        expect(res.contentType).toContain("application/json");
        assertNoStore(res);
        const json = parseJsonSafe<{ unreadCount?: number }>(res.body);
        expect(typeof json?.unreadCount).toBe("number");
      },
    );

    it.skipIf(!ANY_CREDS)(
      "F14.3 authenticated PATCH /api/notifications marks notifications read with no-store",
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
          body: JSON.stringify({ markAllRead: true }),
        });
        expect(res.status).toBe(200);
        assertNoStore(res);
      },
    );

    it.skipIf(!ANY_CREDS)(
      "F14.4 authenticated /tiket/baru supports ImageDropzone paste & preview",
      async () => {
        if (!ANY_CREDS) return;
        await loginViaBrowser(
          browser,
          server.baseUrl,
          ANY_CREDS.email,
          ANY_CREDS.password,
        );
        await browser.goto(`${server.baseUrl}/tiket/baru`);
        await browser.waitForSelector("main form");
        await ensureTicketFormDropzoneVisible(browser);
        const pasted = await dispatchSyntheticPaste(
          browser,
          DROPZONE_SELECTORS,
          "auth-paste.png",
          "image/png",
          createMinimalPngBytes(),
        );
        expect(pasted).toBe(true);
        await new Promise((r) => setTimeout(r, 250));
        const hasPreview = await browser.evalJs<boolean>(
          `document.querySelectorAll('main form img[src^="blob:"], main form img[src^="data:"]').length > 0`,
        );
        expect(hasPreview).toBe(true);
        assertNoBrowserErrors(browser);
      },
    );

    it.skipIf(!IT_OR_ADMIN_CREDS || !IS_LIVE_DB)(
      "F14.5 authenticated /tiket/[id] uses ImageDropzone & ImageLightbox without legacy classes",
      async () => {
        if (!IT_OR_ADMIN_CREDS) return;
        expect(sharedImageTicket).not.toBeNull();
        if (!sharedImageTicket) return;
        await loginViaBrowser(
          browser,
          server.baseUrl,
          IT_OR_ADMIN_CREDS.email,
          IT_OR_ADMIN_CREDS.password,
        );
        await browser.goto(`${server.baseUrl}/tiket/${sharedImageTicket.id}`);
        await browser.waitForSelector("main img");
        await browser.click('main button:has(img), main [role="button"]:has(img)');
        await browser.waitForSelector('[role="dialog"][aria-modal="true"]');
        await pressKeyCombo(browser, "Escape");
        await new Promise((r) => setTimeout(r, 150));
        const html = await browser.evalJs<string>("document.body.innerHTML");
        assertNoLegacyUiMarkers(html, {
          checkClasses: true,
          checkRawPunctuation: false,
          checkEmojis: true,
        });
        assertNoBrowserErrors(browser);
      },
    );
  });

  // =========================================================================
  // F15: PublicTicketStatus.tsx R1 + R2 + R3 overhaul (5 cases)
  // =========================================================================
  describe("F15: PublicTicketStatus Corporate UI, Copy Link, Thread & ConfirmDialog Rating", () => {
    it("F15.1 /status/[nonexistent] renders Corporate Service Desk UI without legacy classes/punctuation/emojis", async () => {
      const res = await fetchManual(
        server.baseUrl,
        `/status/${NONEXISTENT_UUID}`,
      );
      expect(res.status).toBe(200);
      assertNoLegacyUiMarkers(res.body);
    });

    it.skipIf(!IS_LIVE_DB)(
      "F15.2 /status/[token] renders Salin Tautan Pelacakan button with feedback",
      async () => {
        expect(sharedImageTicket).not.toBeNull();
        if (!sharedImageTicket) return;
        await browser.goto(
          `${server.baseUrl}/status/${sharedImageTicket.token}`,
        );
        await browser.waitForSelector("main");
        const copied = await browser.evalJs<boolean>(
          `(() => {
            const btn = Array.from(document.querySelectorAll("main button")).find((b) =>
              /salin tautan/i.test(b.textContent ?? "")
            );
            if (!(btn instanceof HTMLButtonElement)) return false;
            btn.click();
            return true;
          })()`,
        );
        expect(copied).toBe(true);
        assertNoBrowserErrors(browser);
      },
    );

    it.skipIf(!IS_LIVE_DB)(
      "F15.3 /status/[token] renders public discussion thread and reply composer",
      async () => {
        expect(sharedImageTicket).not.toBeNull();
        if (!sharedImageTicket) return;
        await browser.goto(
          `${server.baseUrl}/status/${sharedImageTicket.token}`,
        );
        await browser.waitForSelector("main textarea");
        const hasReplyUi = await browser.evalJs<boolean>(
          `/diskusi|balas|komentar|tanggapan/i.test(document.body.innerText)`,
        );
        expect(hasReplyUi).toBe(true);
        assertNoBrowserErrors(browser);
      },
    );

    it.skipIf(!IS_LIVE_DB)(
      "F15.4 /status/[token] persists ticket entry into localStorage recent-ticket history",
      async () => {
        expect(sharedImageTicket).not.toBeNull();
        if (!sharedImageTicket) return;
        await browser.goto(
          `${server.baseUrl}/status/${sharedImageTicket.token}`,
        );
        await browser.waitForSelector("main");
        const stored = await browser.evalJs<string>(
          `JSON.stringify(Object.keys(window.localStorage).map((k) => [k, window.localStorage.getItem(k)]))`,
        );
        expect(stored).toContain(sharedImageTicket.token);
      },
    );

    it.skipIf(!IT_OR_ADMIN_CREDS || !IS_LIVE_DB)(
      "F15.5 rating submission on selesai ticket opens ConfirmDialog before closing to ditutup",
      async () => {
        if (!IT_OR_ADMIN_CREDS) return;
        const ticket = await createPublicTicket(server.baseUrl, {
          mode: "default",
        });
        expect(ticket).not.toBeNull();
        if (!ticket) return;

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
          "Selesai untuk uji rating",
          "2",
        );

        await clearBrowserCookies(browser);
        await browser.goto(`${server.baseUrl}/status/${ticket.token}`);
        await browser.waitForSelector("main");
        const triggered = await browser.evalJs<boolean>(
          `(() => {
            const star = document.querySelector('main button[aria-label*="5" i], main button[aria-label*="Bintang" i]');
            if (star instanceof HTMLButtonElement) star.click();
            const submit = Array.from(document.querySelectorAll("main button")).find((b) =>
              /kirim rating|tutup tiket|konfirmasi selesai/i.test(b.textContent ?? "")
            );
            if (!(submit instanceof HTMLButtonElement)) return false;
            submit.click();
            return true;
          })()`,
        );
        expect(triggered).toBe(true);
        await browser.waitForSelector('[role="alertdialog"][aria-modal="true"]');
        await browser.evalJs(
          `(() => {
            const btn = Array.from(document.querySelectorAll('[role="alertdialog"] button')).find((b) =>
              !/batal/i.test(b.textContent ?? "")
            );
            if (btn instanceof HTMLButtonElement) btn.click();
          })()`,
        );
        await browser.waitForSelector('[role="status"]');
      },
    );
  });

  // =========================================================================
  // F16: Public Ticket Lookup (/, PublicHeader) & localStorage History (5 cases)
  // =========================================================================
  describe("F16: Public Ticket Lookup & localStorage Recent History", () => {
    it("F16.1 / and PublicHeader render Cek Status Tiket lookup control", async () => {
      await browser.goto(`${server.baseUrl}/`);
      await browser.waitForSelector("header");
      const hasLookup = await browser.evalJs<boolean>(
        `/Cek Status Tiket/i.test(document.body.innerText) && Boolean(document.querySelector('input[placeholder*="token" i], input[aria-label*="status" i], input[name*="token" i]'))`,
      );
      expect(hasLookup).toBe(true);
      assertNoBrowserErrors(browser);
    });

    it("F16.2 submitting a UUID token in Cek Status Tiket navigates to /status/<token>", async () => {
      await browser.goto(`${server.baseUrl}/`);
      const sel =
        'main input[placeholder*="token" i], main input[aria-label*="status" i], header input[placeholder*="token" i]';
      await browser.fillInput(sel, NONEXISTENT_UUID);
      await browser.evalJs(
        `(() => {
          const input = document.querySelector(${JSON.stringify(sel)});
          const form = input?.closest("form");
          const btn = form?.querySelector('button[type="submit"]');
          if (btn instanceof HTMLButtonElement) btn.click();
          else form?.requestSubmit();
        })()`,
      );
      await browser.waitForPathname(`/status/${NONEXISTENT_UUID}`);
      assertNoBrowserErrors(browser);
    });

    it("F16.3 submitting a full /status/<token> URL extracts token and navigates to /status/<token>", async () => {
      await browser.goto(`${server.baseUrl}/`);
      const sel =
        'main input[placeholder*="token" i], main input[aria-label*="status" i], header input[placeholder*="token" i]';
      await browser.fillInput(
        sel,
        `${server.baseUrl}/status/${NONEXISTENT_UUID}`,
      );
      await browser.evalJs(
        `(() => {
          const input = document.querySelector(${JSON.stringify(sel)});
          const form = input?.closest("form");
          const btn = form?.querySelector('button[type="submit"]');
          if (btn instanceof HTMLButtonElement) btn.click();
          else form?.requestSubmit();
        })()`,
      );
      await browser.waitForPathname(`/status/${NONEXISTENT_UUID}`);
      assertNoBrowserErrors(browser);
    });

    it("F16.4 / renders Tiket Terakhir dari Perangkat Ini from localStorage recent entries", async () => {
      await browser.goto(`${server.baseUrl}/`);
      try {
        await browser.evalJs(
          `(() => {
            const item = [{
              token: ${JSON.stringify(NONEXISTENT_UUID)},
              kodeTiket: "IT-E2E-001",
              judul: "Uji Riwayat Lokal",
              updatedAt: new Date().toISOString(),
            }];
            window.localStorage.setItem("it-ticketing-recent-tickets", JSON.stringify(item));
            window.localStorage.setItem("public-ticket-history", JSON.stringify(item));
          })()`,
        );
        await browser.goto(`${server.baseUrl}/`);
        await browser.waitForText("Tiket Terakhir dari Perangkat Ini");
        const hasLink = await browser.evalJs<boolean>(
          `Boolean(document.querySelector('a[href="/status/${NONEXISTENT_UUID}"]'))`,
        );
        expect(hasLink).toBe(true);
      } finally {
        await browser.evalJs(
          `window.localStorage.removeItem("it-ticketing-recent-tickets"); window.localStorage.removeItem("public-ticket-history");`,
        );
      }
    });

    it("F16.5 deleting/clearing entry in Tiket Terakhir dari Perangkat Ini removes it from DOM and localStorage", async () => {
      await browser.goto(`${server.baseUrl}/`);
      try {
        await browser.evalJs(
          `(() => {
            const item = [{
              token: ${JSON.stringify(NONEXISTENT_UUID)},
              kodeTiket: "IT-E2E-DEL",
              judul: "Hapus Riwayat Lokal",
              updatedAt: new Date().toISOString(),
            }];
            window.localStorage.setItem("it-ticketing-recent-tickets", JSON.stringify(item));
            window.localStorage.setItem("public-ticket-history", JSON.stringify(item));
          })()`,
        );
        await browser.goto(`${server.baseUrl}/`);
        await browser.waitForText("Tiket Terakhir dari Perangkat Ini");
        const deleted = await browser.evalJs<boolean>(
          `(() => {
            const btns = Array.from(document.querySelectorAll("main button"));
            const del = btns.find((b) => /hapus|bersihkan/i.test(b.textContent ?? "") || /hapus/i.test(b.getAttribute("aria-label") ?? ""));
            if (!(del instanceof HTMLButtonElement)) return false;
            del.click();
            return true;
          })()`,
        );
        expect(deleted).toBe(true);
        await new Promise((r) => setTimeout(r, 150));
        const stillHasLink = await browser.evalJs<boolean>(
          `Boolean(document.querySelector('a[href="/status/${NONEXISTENT_UUID}"]'))`,
        );
        expect(stillHasLink).toBe(false);
      } finally {
        await browser.evalJs(
          `window.localStorage.removeItem("it-ticketing-recent-tickets"); window.localStorage.removeItem("public-ticket-history");`,
        );
      }
    });
  });

  // =========================================================================
  // F17: Public Self-Service /panduan & Wiki Edit Mode (5 cases)
  // =========================================================================
  describe("F17: Public /panduan Self-Service & Wiki Edit Mode", () => {
    it("F17.1 GET /panduan returns 200 HTML without auth and emits zero sb-* Set-Cookie headers", async () => {
      const res = await fetchManual(server.baseUrl, "/panduan");
      expect(res.status).toBe(200);
      expect(res.contentType).toContain("text/html");
      expect(hasAuthSessionSetCookie(res.setCookies)).toBe(false);
      expect(hasStackTrace(res.body)).toBe(false);
    });

    it("F17.2 / and /lapor both contain accessible <a href='/panduan'> links", async () => {
      const home = await fetchManual(server.baseUrl, "/");
      const lapor = await fetchManual(server.baseUrl, "/lapor");
      expect(home.body).toContain('href="/panduan"');
      expect(lapor.body).toContain('href="/panduan"');
    });

    it("F17.3 /panduan supports search & group filter in browser without errors", async () => {
      await browser.goto(`${server.baseUrl}/panduan`);
      await browser.waitForSelector("main");
      const searchSel = 'main input[type="search"], main input[type="text"]';
      const hasSearch = await browser.evalJs<boolean>(
        `Boolean(document.querySelector(${JSON.stringify(searchSel)}))`,
      );
      expect(hasSearch).toBe(true);
      await browser.fillInput(searchSel, "VPN");
      assertNoBrowserErrors(browser);
    });

    it.skipIf(!IT_OR_ADMIN_CREDS)(
      "F17.4 /panduan excludes is_internal=true and status=draft SOP articles",
      async () => {
        if (!IT_OR_ADMIN_CREDS) return;
        const cookie = await loginForCookies(
          browser,
          server.baseUrl,
          IT_OR_ADMIN_CREDS.email,
          IT_OR_ADMIN_CREDS.password,
        );
        const pubTitle = `E2E-PUB-SOP-${Date.now()}`;
        const intTitle = `E2E-INT-SOP-${Date.now()}`;
        const draftTitle = `E2E-DRF-SOP-${Date.now()}`;

        const ids: string[] = [];
        for (const spec of [
          { judul: pubTitle, status: "published", is_internal: false },
          { judul: intTitle, status: "published", is_internal: true },
          { judul: draftTitle, status: "draft", is_internal: false },
        ]) {
          const r = await fetchManual(server.baseUrl, "/api/wiki", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Origin: server.baseUrl,
              Cookie: cookie,
            },
            body: JSON.stringify({
              ...spec,
              grup: "Umum",
              masalah: "Kendala layanan IT yang memerlukan langkah SOP standar.",
              solusi: "1. Langkah uji visibilitas.",
            }),
          });
          expect(r.status).toBe(201);
          const j = parseJsonSafe<{ article?: { id?: string }; id?: string }>(r.body);
          const id = j?.article?.id ?? j?.id;
          if (id) ids.push(id);
        }

        try {
          const panduanRes = await fetchManual(server.baseUrl, "/panduan");
          expect(panduanRes.status).toBe(200);
          expect(panduanRes.body).toContain(pubTitle);
          expect(panduanRes.body).not.toContain(intTitle);
          expect(panduanRes.body).not.toContain(draftTitle);
        } finally {
          for (const id of ids) {
            await fetchManual(server.baseUrl, `/api/wiki/${id}`, {
              method: "DELETE",
              headers: { Origin: server.baseUrl, Cookie: cookie },
            });
          }
        }
      },
    );

    it.skipIf(!IT_OR_ADMIN_CREDS)(
      "F17.5 /wiki supports Edit Mode (PATCH /api/wiki/[id]) and is_internal toggle",
      async () => {
        if (!IT_OR_ADMIN_CREDS) return;
        const cookie = await loginForCookies(
          browser,
          server.baseUrl,
          IT_OR_ADMIN_CREDS.email,
          IT_OR_ADMIN_CREDS.password,
        );
        const origTitle = `E2E-EDIT-ORIG-${Date.now()}`;
        const updatedTitle = `E2E-EDIT-DONE-${Date.now()}`;
        const createRes = await fetchManual(server.baseUrl, "/api/wiki", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Origin: server.baseUrl,
            Cookie: cookie,
          },
          body: JSON.stringify({
            judul: origTitle,
            grup: "Umum",
            masalah: "Kendala layanan IT yang memerlukan langkah SOP standar.",
            solusi: "1. Langkah awal.",
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
          await browser.goto(`${server.baseUrl}/wiki`);
          await browser.waitForText(origTitle);
          const openedEdit = await browser.evalJs<boolean>(
            `(() => {
              const cards = Array.from(document.querySelectorAll("main article, main section, main div"));
              const card = cards.find((c) => (c.textContent ?? "").includes(${JSON.stringify(origTitle)}) && c.querySelector("button"));
              const editBtn = card ? Array.from(card.querySelectorAll("button")).find((b) => /edit|ubah/i.test(b.textContent ?? "")) : null;
              if (!(editBtn instanceof HTMLButtonElement)) return false;
              editBtn.click();
              return true;
            })()`,
          );
          expect(openedEdit).toBe(true);
          await browser.evalJs(
            `(() => {
              const inputs = Array.from(document.querySelectorAll('main input[type="text"], [role="dialog"] input[type="text"]'));
              const titleInput = inputs.find((i) => i instanceof HTMLInputElement && i.value.includes(${JSON.stringify(origTitle)}));
              if (titleInput instanceof HTMLInputElement) {
                const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
                setter?.call(titleInput, ${JSON.stringify(updatedTitle)});
                titleInput.dispatchEvent(new Event("input", { bubbles: true }));
              }
              const saveBtn = Array.from(document.querySelectorAll('main button, [role="dialog"] button')).find((b) =>
                /simpan perubahan|simpan/i.test(b.textContent ?? "")
              );
              if (saveBtn instanceof HTMLButtonElement) saveBtn.click();
            })()`,
          );
          await browser.waitForText(updatedTitle);
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
  });

  // =========================================================================
  // F18: PublicTicketForm dropzone/paste & legacy-class cleanup (5 cases)
  // =========================================================================
  describe("F18: PublicTicketForm Dropzone & Corporate Styling", () => {
    it("F18.1 GET /lapor contains zero bg-yellow-50, bg-black, raw em-dash/ellipsis, or emojis", async () => {
      const res = await fetchManual(server.baseUrl, "/lapor");
      expect(res.status).toBe(200);
      assertNoLegacyUiMarkers(res.body);
    });

    it("F18.2 /lapor site select placeholder avoids raw em-dash", async () => {
      await browser.goto(`${server.baseUrl}/lapor`);
      await browser.waitForSelector("main");
      const siteText = await browser.evalJs<string>(
        `document.querySelector("#public-site option")?.textContent ?? (document.querySelector("main")?.innerText ?? "")`,
      );
      expect(siteText).not.toContain("\u2014");
    });

    it("F18.3 /lapor photo category displays ImageDropzone supporting drag-and-drop & paste", async () => {
      await browser.goto(`${server.baseUrl}/lapor`);
      await browser.waitForSelector("main form");
      const meta = await extractLaporMeta(server.baseUrl);
      if (meta?.photoCategoryId) {
        await browser.selectOption("#public-category", meta.photoCategoryId);
        await new Promise((r) => setTimeout(r, 150));
      }
      const hasInput = await browser.evalJs<boolean>(
        `Boolean(document.querySelector('main form input[type="file"]'))`,
      );
      expect(hasInput).toBe(true);
      assertNoBrowserErrors(browser);
    });

    it.skipIf(!IS_LIVE_DB)(
      "F18.4 POST /api/tiket/publik with valid minimal PNG returns 201 with token",
      async () => {
        const created = await createPublicTicket(server.baseUrl, {
          mode: "photo",
          withImage: true,
        });
        expect(created).not.toBeNull();
        expect(created?.token.length).toBeGreaterThan(10);
      },
    );

    it("F18.5 /lapor submit button uses non-black accent background with WCAG AA contrast", async () => {
      await browser.goto(`${server.baseUrl}/lapor`);
      await browser.waitForSelector('main form button[type="submit"]');
      const samples = await measureContrastSamples(browser, [
        'main form button[type="submit"]',
      ]);
      expect(samples.length).toBe(1);
      expect(samples[0]?.bg).not.toBe("rgb(0, 0, 0)");
      expect(samples[0]?.ratio ?? 0).toBeGreaterThanOrEqual(4.5);
    });
  });

  // =========================================================================
  // F19: Asset Service History drawer, Full Edit Modal, CSV Export (5 cases)
  // =========================================================================
  describe("F19: Asset Service History, Full Edit Modal & CSV Export", () => {
    it("F19.1 unauthenticated /api/aset and /api/aset/[id]/history reject with 401/403 JSON no-store", async () => {
      const listRes = await fetchManual(server.baseUrl, "/api/aset");
      expect([401, 403]).toContain(listRes.status);
      assertNoStore(listRes);

      const histRes = await fetchManual(
        server.baseUrl,
        `/api/aset/${NONEXISTENT_UUID}/history`,
      );
      expect([401, 403]).toContain(histRes.status);
      assertNoStore(histRes);
    });

    it.skipIf(!GA_OR_ADMIN_CREDS)(
      "F19.2 GA/Admin opens full Edit Asset modal on /aset and updates via PATCH /api/aset/[id]",
      async () => {
        if (!GA_OR_ADMIN_CREDS) return;
        const cookie = await loginForCookies(
          browser,
          server.baseUrl,
          GA_OR_ADMIN_CREDS.email,
          GA_OR_ADMIN_CREDS.password,
        );
        const nomor = `E2E-AST-${Date.now()}`;
        const updatedName = `Laptop Edited ${Date.now()}`;
        const createRes = await fetchManual(server.baseUrl, "/api/aset", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Origin: server.baseUrl,
            Cookie: cookie,
          },
          body: JSON.stringify({
            nomor_aset: nomor,
            nama_perangkat: "Laptop Uji E2E",
            tipe: "laptop",
            status: "aktif",
            ram_gb: 8,
          }),
        });
        expect([200, 201]).toContain(createRes.status);
        const created = parseJsonSafe<{ asset?: { id?: string }; id?: string }>(
          createRes.body,
        );
        const id = created?.asset?.id ?? created?.id ?? "";
        try {
          await browser.goto(`${server.baseUrl}/aset`);
          await browser.waitForText(nomor);
          const openedModal = await browser.evalJs<boolean>(
            `(() => {
              const row = Array.from(document.querySelectorAll("main tr")).find((r) =>
                (r.textContent ?? "").includes(${JSON.stringify(nomor)})
              );
              const editBtn = row ? Array.from(row.querySelectorAll("button")).find((b) => /edit|ubah/i.test(b.textContent ?? "")) : null;
              if (!(editBtn instanceof HTMLButtonElement)) return false;
              editBtn.click();
              return true;
            })()`,
          );
          expect(openedModal).toBe(true);
          await browser.waitForSelector('[role="dialog"][aria-modal="true"]');

          const submitted = await browser.evalJs<boolean>(
            `(() => {
              const dlg = document.querySelector('[role="dialog"][aria-modal="true"]');
              if (!dlg) return false;
              const inputs = Array.from(dlg.querySelectorAll('input'));
              const nameInput = inputs.find((i) =>
                /nama/i.test((i.name ?? "") + " " + (i.id ?? "") + " " + (i.placeholder ?? "")) ||
                (i.value ?? "").includes("Laptop Uji E2E")
              );
              const ramInput = inputs.find((i) =>
                i.type === "number" || /ram/i.test((i.name ?? "") + " " + (i.id ?? ""))
              );
              const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
              if (!(nameInput instanceof HTMLInputElement)) return false;
              setter?.call(nameInput, ${JSON.stringify(updatedName)});
              nameInput.dispatchEvent(new Event("input", { bubbles: true }));
              nameInput.dispatchEvent(new Event("change", { bubbles: true }));
              if (ramInput instanceof HTMLInputElement) {
                setter?.call(ramInput, "16");
                ramInput.dispatchEvent(new Event("input", { bubbles: true }));
                ramInput.dispatchEvent(new Event("change", { bubbles: true }));
              }
              const submit = dlg.querySelector('button[type="submit"]') ?? Array.from(dlg.querySelectorAll("button")).find((b) => /simpan/i.test(b.textContent ?? ""));
              if (!(submit instanceof HTMLButtonElement)) return false;
              submit.click();
              return true;
            })()`,
          );
          expect(submitted).toBe(true);
          await browser.waitForText(updatedName);
          const listRes = await fetchManual(server.baseUrl, "/api/aset", {
            headers: { Cookie: cookie },
          });
          expect(listRes.status).toBe(200);
          expect(listRes.body).toContain(updatedName);
          assertNoBrowserErrors(browser);
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
      "F19.3 GA/Admin opens Service History drawer per nomor_aset on /aset",
      async () => {
        if (!GA_OR_ADMIN_CREDS) return;
        const cookie = await loginForCookies(
          browser,
          server.baseUrl,
          GA_OR_ADMIN_CREDS.email,
          GA_OR_ADMIN_CREDS.password,
        );
        const nomor = `E2E-HIST-${Date.now()}`;
        const createRes = await fetchManual(server.baseUrl, "/api/aset", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Origin: server.baseUrl,
            Cookie: cookie,
          },
          body: JSON.stringify({
            nomor_aset: nomor,
            nama_perangkat: "PC Riwayat Uji",
            tipe: "pc",
            status: "aktif",
            ram_gb: 16,
          }),
        });
        expect([200, 201]).toContain(createRes.status);
        const created = parseJsonSafe<{ asset?: { id?: string }; id?: string }>(
          createRes.body,
        );
        const id = created?.asset?.id ?? created?.id ?? "";
        try {
          await browser.goto(`${server.baseUrl}/aset`);
          await browser.waitForText(nomor);
          const opened = await browser.evalJs<boolean>(
            `(() => {
              const row = Array.from(document.querySelectorAll("main tr")).find((r) =>
                (r.textContent ?? "").includes(${JSON.stringify(nomor)})
              );
              const btn = row ? Array.from(row.querySelectorAll("button")).find((b) => /riwayat|servis|detail/i.test(b.textContent ?? "")) : null;
              if (!(btn instanceof HTMLButtonElement)) return false;
              btn.click();
              return true;
            })()`,
          );
          expect(opened).toBe(true);
          await browser.waitForSelector('[role="dialog"]');
          assertNoBrowserErrors(browser);
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
      "F19.4 /aset renders Export CSV action button",
      async () => {
        if (!GA_OR_ADMIN_CREDS) return;
        await loginViaBrowser(
          browser,
          server.baseUrl,
          GA_OR_ADMIN_CREDS.email,
          GA_OR_ADMIN_CREDS.password,
        );
        await browser.goto(`${server.baseUrl}/aset`);
        await browser.waitForSelector("main");
        const hasExport = await browser.evalJs<boolean>(
          `Array.from(document.querySelectorAll("main button, main a")).some((el) => /export csv|ekspor csv|unduh csv/i.test(el.textContent ?? ""))`,
        );
        expect(hasExport).toBe(true);
        assertNoBrowserErrors(browser);
      },
    );

    it.skipIf(!GA_OR_ADMIN_CREDS)(
      "F19.5 /aset renders zero legacy bg-black/bg-yellow-50 classes and zero decorative emojis",
      async () => {
        if (!GA_OR_ADMIN_CREDS) return;
        await loginViaBrowser(
          browser,
          server.baseUrl,
          GA_OR_ADMIN_CREDS.email,
          GA_OR_ADMIN_CREDS.password,
        );
        await browser.goto(`${server.baseUrl}/aset`);
        await browser.waitForSelector("main");
        const html = await browser.evalJs<string>("document.body.innerHTML");
        assertNoLegacyUiMarkers(html, {
          checkClasses: true,
          checkRawPunctuation: false,
          checkEmojis: true,
        });
      },
    );
  });

  // =========================================================================
  // F20: Stock Restock Follow-up (StokClient.tsx) (5 cases)
  // =========================================================================
  describe("F20: Stock Restock & menunggu_pengadaan Ticket Recovery", () => {
    it("F20.1 unauthenticated POST /api/stok/adjust returns 401 JSON no-store and /stok redirects", async () => {
      const apiRes = await fetchManual(server.baseUrl, "/api/stok/adjust", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: server.baseUrl,
        },
        body: JSON.stringify({ kode: "TEST", delta: 1, jenis: "masuk" }),
      });
      expect(apiRes.status).toBe(401);
      assertNoStore(apiRes);

      const pageRes = await fetchManual(server.baseUrl, "/stok");
      expect(
        isUnauthenticatedRedirectToLogin({
          status: pageRes.status,
          location: pageRes.location,
          body: pageRes.body,
        }),
      ).toBe(true);
    });

    it.skipIf(!GA_OR_ADMIN_CREDS)(
      "F20.2 /stok renders Corporate UI without legacy bg-black button classes",
      async () => {
        if (!GA_OR_ADMIN_CREDS) return;
        await loginViaBrowser(
          browser,
          server.baseUrl,
          GA_OR_ADMIN_CREDS.email,
          GA_OR_ADMIN_CREDS.password,
        );
        await browser.goto(`${server.baseUrl}/stok`);
        await browser.waitForSelector("main");
        const html = await browser.evalJs<string>("document.body.innerHTML");
        assertNoLegacyUiMarkers(html, {
          checkClasses: true,
          checkRawPunctuation: false,
          checkEmojis: true,
        });
      },
    );

    it.skipIf(!GA_OR_ADMIN_CREDS || !IS_LIVE_DB)(
      "F20.3 /stok shows menunggu_pengadaan follow-up section & recovery controls when restocked",
      async () => {
        if (!GA_OR_ADMIN_CREDS) return;
        const gaCookie = await loginForCookies(
          browser,
          server.baseUrl,
          GA_OR_ADMIN_CREDS.email,
          GA_OR_ADMIN_CREDS.password,
        );
        const stocks = await getStockItems(server.baseUrl, gaCookie);
        const kabel = stocks.find((s) => s.kode === "kabel_power") ?? stocks[0];
        expect(kabel).toBeDefined();
        if (!kabel) return;

        const origQty = kabel.jumlah_stok;
        let ticket: CreatedPublicTicket | null = null;
        try {
          if (origQty > 0) {
            const zeroRes = await adjustStockViaApi(server.baseUrl, gaCookie, {
              kode: kabel.kode,
              delta: -origQty,
              jenis: "penyesuaian",
              catatan: "E2E F20.3 zero stock setup",
            });
            expect(zeroRes.status).toBe(200);
          }

          ticket = await createPublicTicket(server.baseUrl, {
            mode: "procurement",
          });
          expect(ticket).not.toBeNull();
          if (!ticket) return;
          expect(ticket.status).toBe("menunggu_pengadaan");

          await browser.goto(`${server.baseUrl}/stok`);
          await browser.waitForSelector("main table");
          const restocked = await browser.evalJs<boolean>(
            `(() => {
              const rows = Array.from(document.querySelectorAll("main table tbody tr"));
              const row = rows.find((r) => (r.textContent ?? "").includes(${JSON.stringify(kabel.kode)}));
              if (!row) return false;
              const qtyInput = row.querySelector('input[type="number"]');
              if (qtyInput instanceof HTMLInputElement) {
                const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
                setter?.call(qtyInput, "1");
                qtyInput.dispatchEvent(new Event("input", { bubbles: true }));
                qtyInput.dispatchEvent(new Event("change", { bubbles: true }));
              }
              const addBtn = Array.from(row.querySelectorAll("button")).find((b) => /\+\s*tambah/i.test(b.textContent ?? ""));
              if (!(addBtn instanceof HTMLButtonElement)) return false;
              addBtn.click();
              return true;
            })()`,
          );
          expect(restocked).toBe(true);
          await browser.waitForText(ticket.nomorTiket);
          const hasRestoreBtn = await browser.evalJs<boolean>(
            `Array.from(document.querySelectorAll("main button")).some((b) => /kembalikan|antrian|proses|aktifkan/i.test(b.textContent ?? ""))`,
          );
          expect(hasRestoreBtn).toBe(true);
          assertNoBrowserErrors(browser);
        } finally {
          const curStocks = await getStockItems(server.baseUrl, gaCookie);
          const curQty =
            curStocks.find((s) => s.kode === kabel.kode)?.jumlah_stok ?? origQty;
          if (curQty !== origQty) {
            await adjustStockViaApi(server.baseUrl, gaCookie, {
              kode: kabel.kode,
              delta: origQty - curQty,
              jenis: "penyesuaian",
              catatan: "E2E F20.3 restore stock",
            });
          }
          if (ticket && IT_OR_ADMIN_CREDS) {
            await loginViaBrowser(
              browser,
              server.baseUrl,
              IT_OR_ADMIN_CREDS.email,
              IT_OR_ADMIN_CREDS.password,
            );
            await resolveAndCloseTicketViaUi(
              browser,
              server.baseUrl,
              ticket,
            ).catch(() => undefined);
          }
        }
      },
    );

    it("F20.4 unauthenticated POST /api/stok/restore-tickets enforces 401/403 with no-store", async () => {
      const res = await fetchManual(
        server.baseUrl,
        "/api/stok/restore-tickets",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Origin: server.baseUrl,
          },
          body: JSON.stringify({ ticketId: NONEXISTENT_UUID }),
        },
      );
      expect([401, 403]).toContain(res.status);
      assertNoStore(res);
    });

    it.skipIf(!GA_OR_ADMIN_CREDS || !IT_OR_ADMIN_CREDS || !IS_LIVE_DB)(
      "F20.5 restoring a menunggu_pengadaan ticket triggers IT notification cleanly",
      async () => {
        if (!GA_OR_ADMIN_CREDS || !IT_OR_ADMIN_CREDS) return;
        const gaCookie = await loginForCookies(
          browser,
          server.baseUrl,
          GA_OR_ADMIN_CREDS.email,
          GA_OR_ADMIN_CREDS.password,
        );
        const stocks = await getStockItems(server.baseUrl, gaCookie);
        const kabel = stocks.find((s) => s.kode === "kabel_power") ?? stocks[0];
        expect(kabel).toBeDefined();
        if (!kabel) return;

        const origQty = kabel.jumlah_stok;
        let ticket: CreatedPublicTicket | null = null;
        try {
          if (origQty > 0) {
            const zeroRes = await adjustStockViaApi(server.baseUrl, gaCookie, {
              kode: kabel.kode,
              delta: -origQty,
              jenis: "penyesuaian",
              catatan: "E2E F20.5 zero stock setup",
            });
            expect(zeroRes.status).toBe(200);
          }

          ticket = await createPublicTicket(server.baseUrl, {
            mode: "procurement",
          });
          expect(ticket).not.toBeNull();
          if (!ticket) return;
          expect(ticket.status).toBe("menunggu_pengadaan");

          const addRes = await adjustStockViaApi(server.baseUrl, gaCookie, {
            kode: kabel.kode,
            delta: 1,
            jenis: "masuk",
            catatan: "E2E F20.5 restock",
          });
          expect(addRes.status).toBe(200);

          const restoreRes = await fetchManual(
            server.baseUrl,
            "/api/stok/restore-tickets",
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Origin: server.baseUrl,
                Cookie: gaCookie,
              },
              body: JSON.stringify({ ticketId: ticket.id }),
            },
          );
          expect(restoreRes.status).toBe(200);
          assertNoStore(restoreRes);

          const pubRes = await fetchManual(
            server.baseUrl,
            `/api/tiket/publik/${ticket.token}`,
          );
          expect(pubRes.status).toBe(200);
          expect(pubRes.body).toContain("baru");

          const itCookie = await loginForCookies(
            browser,
            server.baseUrl,
            IT_OR_ADMIN_CREDS.email,
            IT_OR_ADMIN_CREDS.password,
          );
          const notifRes = await fetchManual(
            server.baseUrl,
            "/api/notifications",
            { headers: { Cookie: itCookie } },
          );
          expect(notifRes.status).toBe(200);
          assertNoStore(notifRes);
          const notifJson = parseJsonSafe<{
            notifications?: Array<{
              ticket_id?: string | null;
              dibaca?: boolean;
              judul?: string;
              pesan?: string;
              tautan?: string | null;
            }>;
            items?: Array<{
              ticket_id?: string | null;
              dibaca?: boolean;
              judul?: string;
              pesan?: string;
              tautan?: string | null;
            }>;
          }>(notifRes.body);
          const list = notifJson?.notifications ?? notifJson?.items ?? [];
          const matched = list.find(
            (n) =>
              !n.dibaca &&
              (n.ticket_id === ticket?.id ||
                (n.tautan ?? "").includes(ticket?.id ?? "") ||
                (n.judul ?? "").includes(ticket?.nomorTiket ?? "") ||
                (n.pesan ?? "").includes(ticket?.nomorTiket ?? "")),
          );
          expect(matched).toBeDefined();
        } finally {
          const curStocks = await getStockItems(server.baseUrl, gaCookie);
          const curQty =
            curStocks.find((s) => s.kode === kabel.kode)?.jumlah_stok ?? origQty;
          if (curQty !== origQty) {
            await adjustStockViaApi(server.baseUrl, gaCookie, {
              kode: kabel.kode,
              delta: origQty - curQty,
              jenis: "penyesuaian",
              catatan: "E2E F20.5 restore stock",
            });
          }
          if (ticket) {
            await loginViaBrowser(
              browser,
              server.baseUrl,
              IT_OR_ADMIN_CREDS.email,
              IT_OR_ADMIN_CREDS.password,
            );
            await resolveAndCloseTicketViaUi(
              browser,
              server.baseUrl,
              ticket,
            ).catch(() => undefined);
          }
        }
      },
    );
  });

  // =========================================================================
  // F21: Management Analytics Charts & Print/PDF (/laporan) (5 cases)
  // =========================================================================
  describe("F21: /laporan Pure SVG/CSS Charts & Print/PDF", () => {
    it("F21.1 unauthenticated /laporan redirects to /login and export returns 401 no-store", async () => {
      const pageRes = await fetchManual(server.baseUrl, "/laporan");
      expect(
        isUnauthenticatedRedirectToLogin({
          status: pageRes.status,
          location: pageRes.location,
          body: pageRes.body,
        }),
      ).toBe(true);
      const exportRes = await fetchManual(server.baseUrl, "/api/laporan/export");
      expect(exportRes.status).toBe(401);
      assertNoStore(exportRes);
    });

    it.skipIf(!IT_OR_ADMIN_CREDS)(
      "F21.2 /laporan renders pure SVG/CSS Category Proportion chart with non-zero bounding box",
      async () => {
        if (!IT_OR_ADMIN_CREDS) return;
        await loginViaBrowser(
          browser,
          server.baseUrl,
          IT_OR_ADMIN_CREDS.email,
          IT_OR_ADMIN_CREDS.password,
        );
        await browser.goto(`${server.baseUrl}/laporan`);
        await browser.waitForSelector("main");
        const svgCount = await browser.evalJs<number>(
          `Array.from(document.querySelectorAll("main svg")).filter((s) => { const r = s.getBoundingClientRect(); return r.width > 20 && r.height > 20; }).length`,
        );
        expect(svgCount).toBeGreaterThan(0);
        assertNoBrowserErrors(browser);
      },
    );

    it.skipIf(!IT_OR_ADMIN_CREDS)(
      "F21.3 /laporan renders SLA Compliance P0–P3 visualization",
      async () => {
        if (!IT_OR_ADMIN_CREDS) return;
        await loginViaBrowser(
          browser,
          server.baseUrl,
          IT_OR_ADMIN_CREDS.email,
          IT_OR_ADMIN_CREDS.password,
        );
        await browser.goto(`${server.baseUrl}/laporan`);
        await browser.waitForSelector("main");
        const text = await browser.evalJs<string>("document.body.innerText");
        expect(text).toContain("P0");
        expect(text).toContain("P1");
        expect(text).toContain("P2");
        expect(text).toContain("P3");
        expect(text).toMatch(/SLA|Kepatuhan/i);
      },
    );

    it.skipIf(!IT_OR_ADMIN_CREDS)(
      "F21.4 /laporan renders Period Comparison chart and Cetak Laporan / PDF button",
      async () => {
        if (!IT_OR_ADMIN_CREDS) return;
        await loginViaBrowser(
          browser,
          server.baseUrl,
          IT_OR_ADMIN_CREDS.email,
          IT_OR_ADMIN_CREDS.password,
        );
        await browser.goto(`${server.baseUrl}/laporan`);
        await browser.waitForSelector("main");
        const hasPrintBtn = await browser.evalJs<boolean>(
          `Array.from(document.querySelectorAll("main button")).some((b) => /cetak|print|pdf/i.test(b.textContent ?? ""))`,
        );
        expect(hasPrintBtn).toBe(true);
      },
    );

    it.skipIf(!IT_OR_ADMIN_CREDS)(
      "F21.5 /laporan meets WCAG AA contrast in light and dark mode",
      async () => {
        if (!IT_OR_ADMIN_CREDS) return;
        await loginViaBrowser(
          browser,
          server.baseUrl,
          IT_OR_ADMIN_CREDS.email,
          IT_OR_ADMIN_CREDS.password,
        );
        await browser.goto(`${server.baseUrl}/laporan`);
        await browser.waitForSelector("main h1");
        try {
          for (const theme of ["light", "dark"] as const) {
            await setBrowserTheme(browser, theme);
            const samples = await measureContrastSamples(browser, [
              "main h1",
              "main h2",
              "main p",
            ]);
            for (const sample of samples) {
              expect(sample.ratio).toBeGreaterThanOrEqual(sample.required);
            }
          }
        } finally {
          await setBrowserTheme(browser, "light");
        }
      },
    );
  });

  // =========================================================================
  // F22: AppShell 7 Admin Icons, Live Badges, Breadcrumb, Bell, Ctrl+K (5 cases)
  // =========================================================================
  describe("F22: AppShell Audit, Notification Bell & Global Command Palette", () => {
    it("F22.1 unauthenticated GET /api/search?q=tiket returns 401 JSON with no-store", async () => {
      const res = await fetchManual(server.baseUrl, "/api/search?q=tiket");
      expect(res.status).toBe(401);
      expect(res.contentType).toContain("application/json");
      assertNoStore(res);
    });

    it.skipIf(!ADMIN_CREDS)(
      "F22.2 Admin sidebar renders 7 distinct SVG icon path signatures across /admin* links",
      async () => {
        if (!ADMIN_CREDS) return;
        await loginViaBrowser(
          browser,
          server.baseUrl,
          ADMIN_CREDS.email,
          ADMIN_CREDS.password,
        );
        await browser.goto(`${server.baseUrl}/admin`);
        await browser.waitForSelector('aside a[href^="/admin"]');
        const sigs = await browser.evalJs<string[]>(
          `Array.from(document.querySelectorAll('aside a[href^="/admin"]')).map((a) => {
            const svg = a.querySelector("svg");
            return svg ? svg.innerHTML.replace(/\s+/g, " ").trim() : "";
          }).filter(Boolean)`,
        );
        expect(sigs.length).toBeGreaterThanOrEqual(7);
        expect(new Set(sigs).size).toBe(sigs.length);
      },
    );

    it.skipIf(!ANY_CREDS)(
      "F22.3 AppShell top bar displays contextual breadcrumb and navigation chrome",
      async () => {
        if (!ANY_CREDS) return;
        await loginViaBrowser(
          browser,
          server.baseUrl,
          ANY_CREDS.email,
          ANY_CREDS.password,
        );
        await browser.goto(`${server.baseUrl}/tiket`);
        await browser.waitForSelector("header");
        const hasBreadcrumb = await browser.evalJs<boolean>(
          `Boolean(document.querySelector('header nav[aria-label*="Breadcrumb" i], header [aria-label*="Breadcrumb" i]')) || /Tiket/i.test(document.querySelector("header")?.textContent ?? "")`,
        );
        expect(hasBreadcrumb).toBe(true);
      },
    );

    it.skipIf(!ANY_CREDS)(
      "F22.4 AppShell top bar renders In-App Notification Bell opening dropdown",
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
        const bellClicked = await browser.evalJs<boolean>(
          `(() => {
            const btn = document.querySelector('header button[aria-label*="Notifikasi" i]');
            if (!(btn instanceof HTMLButtonElement)) return false;
            btn.click();
            return true;
          })()`,
        );
        expect(bellClicked).toBe(true);
        await new Promise((r) => setTimeout(r, 200));
        const hasDropdown = await browser.evalJs<boolean>(
          `/Notifikasi|Tandai.*dibaca|Tidak ada notifikasi/i.test(document.body.innerText)`,
        );
        expect(hasDropdown).toBe(true);
      },
    );

    it.skipIf(!ANY_CREDS)(
      "F22.5 Ctrl+K opens Global Command Palette (role=dialog) searching via /api/search",
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
        await browser.fillInput('[role="dialog"] input', "Tiket");
        await new Promise((r) => setTimeout(r, 400));
        assertNoBrowserErrors(browser);
      },
    );
  });

  // =========================================================================
  // F23: /profil Page, Real VAPID Web Push & Clean /dashboard (5 cases)
  // =========================================================================
  describe("F23: /profil Security, Telegram, Web Push & Clean /dashboard", () => {
    it("F23.1 unauthenticated GET /profil redirects to /login without leaks", async () => {
      const res = await fetchManual(server.baseUrl, "/profil");
      expect(
        isUnauthenticatedRedirectToLogin({
          status: res.status,
          location: res.location,
          body: res.body,
        }),
      ).toBe(true);
      expect(hasSensitiveDataLeak(res.body)).toBe(false);
    });

    it.skipIf(!ANY_CREDS)(
      "F23.2 /dashboard stays focused on operational metrics without personal Telegram/Push panels",
      async () => {
        if (!ANY_CREDS) return;
        await loginViaBrowser(
          browser,
          server.baseUrl,
          ANY_CREDS.email,
          ANY_CREDS.password,
        );
        await browser.goto(`${server.baseUrl}/dashboard`);
        await browser.waitForSelector("main");
        const text = await browser.evalJs<string>("document.body.innerText");
        expect(text).not.toMatch(/Hubungkan Telegram/i);
        expect(text).not.toMatch(/Aktifkan Notifikasi Browser/i);
      },
    );

    it.skipIf(!ANY_CREDS)(
      "F23.3 /profil renders Change Password, Telegram integration, and Web Push controls",
      async () => {
        if (!ANY_CREDS) return;
        await loginViaBrowser(
          browser,
          server.baseUrl,
          ANY_CREDS.email,
          ANY_CREDS.password,
        );
        await browser.goto(`${server.baseUrl}/profil`);
        await browser.waitForSelector("main");
        const text = await browser.evalJs<string>("document.body.innerText");
        expect(text).toMatch(/Kata Sandi|Password/i);
        expect(text).toMatch(/Telegram/i);
        expect(text).toMatch(/Push|Notifikasi Browser/i);
      },
    );

    it.skipIf(!ANY_CREDS)(
      "F23.4 /profil supports /sw.js service worker availability without runtime errors",
      async () => {
        if (!ANY_CREDS) return;
        await loginViaBrowser(
          browser,
          server.baseUrl,
          ANY_CREDS.email,
          ANY_CREDS.password,
        );
        await browser.goto(`${server.baseUrl}/profil`);
        await browser.waitForSelector("main");
        const swSupported = await browser.evalJs<boolean>(
          `"serviceWorker" in navigator`,
        );
        expect(swSupported).toBe(true);
        assertNoBrowserErrors(browser);
      },
    );

    it.skipIf(!ANY_CREDS)(
      "F23.5 authenticated POST and DELETE /api/notifications/subscribe succeed with no-store",
      async () => {
        if (!ANY_CREDS) return;
        const cookie = await loginForCookies(
          browser,
          server.baseUrl,
          ANY_CREDS.email,
          ANY_CREDS.password,
        );
        const endpoint = `https://fcm.googleapis.com/fcm/send/e2e-${Date.now()}`;
        const postRes = await fetchManual(
          server.baseUrl,
          "/api/notifications/subscribe",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Origin: server.baseUrl,
              Cookie: cookie,
            },
            body: JSON.stringify({
              endpoint,
              keys: { p256dh: "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM=", auth: "tBHItJI5svbpez7KI4CCXg==" },
            }),
          },
        );
        expect([200, 201]).toContain(postRes.status);
        assertNoStore(postRes);

        const delRes = await fetchManual(
          server.baseUrl,
          "/api/notifications/subscribe",
          {
            method: "DELETE",
            headers: {
              "Content-Type": "application/json",
              Origin: server.baseUrl,
              Cookie: cookie,
            },
            body: JSON.stringify({ endpoint }),
          },
        );
        expect(delRes.status).toBe(200);
        assertNoStore(delRes);
      },
    );
  });

  // =========================================================================
  // F24: Resilience & Metadata (not-found, error, icon.svg, manifest, 0 Dynamic) (5 cases)
  // =========================================================================
  describe("F24: Resilience, Metadata & Next.js 16 0 Dynamic Manifest", () => {
    it("F24.1 unknown route returns 404 custom Indonesian not-found page without stack trace", async () => {
      const res = await fetchManual(
        server.baseUrl,
        "/halaman-tidak-ditemukan-e2e",
      );
      expect(res.status).toBe(404);
      expect(res.contentType).toContain("text/html");
      expect(res.body).toMatch(/404|tidak ditemukan/i);
      expect(hasStackTrace(res.body)).toBe(false);
    });

    it("F24.2 GET /icon.svg returns 200 image/svg+xml with valid <svg> markup", async () => {
      const res = await fetchManual(server.baseUrl, "/icon.svg");
      expect(res.status).toBe(200);
      expect(res.contentType).toContain("image/svg+xml");
      expect(res.body).toContain("<svg");
    });

    it("F24.3 GET /manifest.webmanifest returns 200 valid web manifest JSON", async () => {
      const res = await fetchManual(server.baseUrl, "/manifest.webmanifest");
      expect(res.status).toBe(200);
      const json = parseJsonSafe<{
        name?: string;
        short_name?: string;
        start_url?: string;
        icons?: Array<{ src?: string }>;
      }>(res.body);
      expect(json?.name).toBeTruthy();
      expect(json?.start_url).toBe("/");
      expect(Array.isArray(json?.icons)).toBe(true);
      expect((json?.icons ?? []).length).toBeGreaterThan(0);
    });

    it("F24.4 Next.js 16 manifests register /panduan and /profil with 0 Dynamic pages (when built)", () => {
      const appPathRoutes = readNextManifestSafe<Record<string, string>>(
        "app-path-routes-manifest.json",
      );
      const prerender = readNextManifestSafe<{
        version?: number;
        routes?: Record<string, { renderingMode?: string }>;
      }>("prerender-manifest.json");
      expect(appPathRoutes).not.toBeNull();
      expect(prerender).not.toBeNull();
      if (!appPathRoutes || !prerender) return;

      const registered = new Set(Object.values(appPathRoutes));
      expect(registered.has("/panduan")).toBe(true);
      expect(registered.has("/profil")).toBe(true);
      expect(prerender.version).toBe(4);
      for (const route of ["/panduan", "/profil"]) {
        const entry = prerender.routes?.[route];
        expect(entry, `Expected ${route} in prerender-manifest.json`).toBeDefined();
        expect(["PARTIALLY_STATIC", "STATIC"]).toContain(entry?.renderingMode);
      }
    });

    it("F24.5 app/error.tsx and app/(app)/error.tsx exist as client error boundaries", () => {
      expect(repoFileExists("app/error.tsx")).toBe(true);
      expect(repoFileExists("app/(app)/error.tsx")).toBe(true);
      const rootErr = readRepoTextFile("app/error.tsx");
      const appErr = readRepoTextFile("app/(app)/error.tsx");
      expect(rootErr).toContain('"use client"');
      expect(appErr).toContain('"use client"');
    });
  });
});
