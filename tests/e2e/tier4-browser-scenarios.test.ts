import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { CdpBrowser } from "./helpers/browser";
import {
  NONEXISTENT_UUID,
  hasSensitiveDataLeak,
  hasStackTrace,
} from "./helpers/routes";
import { startE2eServer, type E2eServerHandle } from "./helpers/server";

const SOFT_NAV_BUDGET_MS = 3_000;
const TEST_EMAIL = process.env.E2E_TEST_EMAIL?.trim() ?? "";
const TEST_PASSWORD = process.env.E2E_TEST_PASSWORD?.trim() ?? "";
const HAS_AUTH_CREDENTIALS = Boolean(TEST_EMAIL && TEST_PASSWORD);

describe("Tier 4: Real-World Headless Browser Scenarios (CDP)", () => {
  let server: E2eServerHandle;
  let browser: CdpBrowser;

  beforeAll(async () => {
    server = await startE2eServer();
    browser = await CdpBrowser.launch();
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

  it("Scenario 1: / -> /lapor soft navigation preserves window marker, verifies SLA table, active nav, and client form validation", async () => {
    await browser.goto(`${server.baseUrl}/`);
    await browser.waitForSelector("h1");
    expect(await browser.getText("h1")).toContain(
      "Layanan Bantuan IT Debito Jogja",
    );

    const bodyText = await browser.evalJs<string>("document.body.innerText");
    expect(bodyText).toContain("Target SLA Penanganan");
    expect(bodyText).toContain("P0");
    expect(bodyText).toContain("P1");
    expect(bodyText).toContain("P2");
    expect(bodyText).toContain("P3");

    await browser.evalJs(`window.__e2eNavMarker = "scenario-1"`);

    const nav = await browser.clickLinkAndWaitForUrl(
      'main a[href="/lapor"]',
      "/lapor",
    );
    console.info(
      `[Tier 4] / -> /lapor soft nav duration: ${nav.durationMs.toFixed(1)}ms`,
    );

    expect(nav.markerPreserved).toBe(true);
    expect(nav.durationMs).toBeLessThan(SOFT_NAV_BUDGET_MS);

    await browser.waitForSelector("h1");
    expect(await browser.getText("h1")).toContain("Buat Tiket Layanan IT");

    const laporButtonState = await browser.evalJs<{
      exists: boolean;
      disabled: boolean;
      text: string;
    }>(
      `(() => {
        const btn = document.querySelector('main form button[type="submit"]');
        if (!(btn instanceof HTMLButtonElement)) {
          return { exists: false, disabled: false, text: "" };
        }
        return {
          exists: true,
          disabled: btn.disabled,
          text: (btn.textContent ?? "").trim(),
        };
      })()`,
    );
    if (laporButtonState.exists) {
      expect(laporButtonState.disabled).toBe(false);
      expect(laporButtonState.text).not.toBe("Mengirim...");
      expect(laporButtonState.text).toBe("Kirim Tiket");
      const nameEnabled = await browser.evalJs<boolean>(
        `(() => {
          const input = document.querySelector("#public-name");
          return input instanceof HTMLInputElement && !input.disabled;
        })()`,
      );
      expect(nameEnabled).toBe(true);
    }

    const laporAriaCurrent = await browser.evalJs<string | null>(
      `document.querySelector('nav[aria-label="Navigasi Publik"] a[href="/lapor"]')?.getAttribute("aria-current") ?? null`,
    );
    expect(laporAriaCurrent).toBe("page");

    // Exercise /lapor client validation cleanly without mutating DB.
    const hasPublicForm = await browser.evalJs<boolean>(
      `Boolean(document.querySelector("#public-name") && document.querySelector("#public-description"))`,
    );
    if (hasPublicForm) {
      const formValidWhenEmpty = await browser.evalJs<boolean>(
        `Boolean(document.querySelector("main form")?.checkValidity())`,
      );
      expect(formValidWhenEmpty).toBe(false);
      await browser.click('main form button[type="submit"]');
      expect(await browser.evalJs<string>("window.location.pathname")).toBe(
        "/lapor",
      );
      expect(
        await browser.evalJs<boolean>("Boolean(window.__e2eNavMarker)"),
      ).toBe(true);
    }

    expect(browser.pageErrors).toEqual([]);
    expect(browser.consoleErrors).toEqual([]);
    expect(browser.serverErrors).toEqual([]);
  });

  it("Scenario 2: /lapor -> /login -> /lapor -> / multi-hop soft navigation & empty login validation without hard reload", async () => {
    await browser.goto(`${server.baseUrl}/lapor`);
    await browser.waitForSelector("h1");
    await browser.evalJs(`window.__e2eNavMarker = "scenario-2"`);

    const hop1 = await browser.clickLinkAndWaitForUrl(
      'nav[aria-label="Navigasi Publik"] a[href="/login"]',
      "/login",
    );
    console.info(
      `[Tier 4] /lapor -> /login soft nav duration: ${hop1.durationMs.toFixed(1)}ms`,
    );
    expect(hop1.markerPreserved).toBe(true);
    expect(hop1.durationMs).toBeLessThan(SOFT_NAV_BUDGET_MS);
    await browser.waitForSelector("#login-email");
    expect(
      await browser.evalJs<string | null>(
        `document.querySelector('nav[aria-label="Navigasi Publik"] a[href="/login"]')?.getAttribute("aria-current") ?? null`,
      ),
    ).toBe("page");

    // Verify empty /login submit is blocked by HTML5 validation without reload or auth mutation.
    const loginValidWhenEmpty = await browser.evalJs<boolean>(
      `Boolean(document.querySelector("main form")?.checkValidity())`,
    );
    expect(loginValidWhenEmpty).toBe(false);
    await browser.click('main form button[type="submit"]');
    expect(await browser.evalJs<string>("window.location.pathname")).toBe(
      "/login",
    );

    const hop2 = await browser.clickLinkAndWaitForUrl(
      'main a[href="/lapor"]',
      "/lapor",
    );
    console.info(
      `[Tier 4] /login -> /lapor soft nav duration: ${hop2.durationMs.toFixed(1)}ms`,
    );
    expect(hop2.markerPreserved).toBe(true);
    expect(hop2.durationMs).toBeLessThan(SOFT_NAV_BUDGET_MS);
    await browser.waitForSelector("h1");
    expect(await browser.getText("h1")).toContain("Buat Tiket Layanan IT");

    const laporButtonState = await browser.evalJs<{
      exists: boolean;
      disabled: boolean;
      text: string;
    }>(
      `(() => {
        const btn = document.querySelector('main form button[type="submit"]');
        if (!(btn instanceof HTMLButtonElement)) {
          return { exists: false, disabled: false, text: "" };
        }
        return {
          exists: true,
          disabled: btn.disabled,
          text: (btn.textContent ?? "").trim(),
        };
      })()`,
    );
    if (laporButtonState.exists) {
      expect(laporButtonState.disabled).toBe(false);
      expect(laporButtonState.text).not.toBe("Mengirim...");
      expect(laporButtonState.text).toBe("Kirim Tiket");
      const nameEnabled = await browser.evalJs<boolean>(
        `(() => {
          const input = document.querySelector("#public-name");
          return input instanceof HTMLInputElement && !input.disabled;
        })()`,
      );
      expect(nameEnabled).toBe(true);
    }

    const hop3 = await browser.clickLinkAndWaitForUrl(
      'header a[href="/"]',
      "/",
    );
    console.info(
      `[Tier 4] /lapor -> / soft nav duration: ${hop3.durationMs.toFixed(1)}ms`,
    );
    expect(hop3.markerPreserved).toBe(true);
    expect(hop3.durationMs).toBeLessThan(SOFT_NAV_BUDGET_MS);
    await browser.waitForSelector("h1");
    expect(await browser.getText("h1")).toContain(
      "Layanan Bantuan IT Debito Jogja",
    );

    expect(browser.pageErrors).toEqual([]);
    expect(browser.consoleErrors).toEqual([]);
    expect(browser.serverErrors).toEqual([]);
  });

  it("Scenario 3: ThemeToggle updates data-theme + localStorage and persists across / -> /lapor -> /login soft navigations", async () => {
    await browser.goto(`${server.baseUrl}/`);
    await browser.waitForSelector('button[aria-label^="Ubah ke mode "]');
    await browser.evalJs(`window.__e2eNavMarker = "scenario-3"`);

    const initialState = await browser.evalJs<{
      theme: "dark" | "light";
      stored: string | null;
    }>(
      `({
        theme: document.documentElement.dataset.theme === "dark" ? "dark" : "light",
        stored: window.localStorage.getItem("it-ticketing-theme"),
      })`,
    );
    const expectedTheme = initialState.theme === "light" ? "dark" : "light";

    try {
      await browser.click('button[aria-label^="Ubah ke mode "]');
      await new Promise((resolve) => setTimeout(resolve, 100));

      const toggledState = await browser.evalJs<{
        theme: string | undefined;
        stored: string | null;
      }>(
        `({ theme: document.documentElement.dataset.theme, stored: window.localStorage.getItem("it-ticketing-theme") })`,
      );
      expect(toggledState.theme).toBe(expectedTheme);
      expect(toggledState.stored).toBe(expectedTheme);

      const nav1 = await browser.clickLinkAndWaitForUrl(
        'nav[aria-label="Navigasi Publik"] a[href="/lapor"]',
        "/lapor",
      );
      expect(nav1.markerPreserved).toBe(true);
      expect(
        await browser.evalJs<string | undefined>(
          `document.documentElement.dataset.theme`,
        ),
      ).toBe(expectedTheme);

      const nav2 = await browser.clickLinkAndWaitForUrl(
        'nav[aria-label="Navigasi Publik"] a[href="/login"]',
        "/login",
      );
      expect(nav2.markerPreserved).toBe(true);
      expect(
        await browser.evalJs<string | undefined>(
          `document.documentElement.dataset.theme`,
        ),
      ).toBe(expectedTheme);

      expect(browser.pageErrors).toEqual([]);
      expect(browser.consoleErrors).toEqual([]);
      expect(browser.serverErrors).toEqual([]);
    } finally {
      // Restore original theme & localStorage cleanly even if an assertion fails.
      await browser.evalJs(
        `(() => {
          const initialTheme = ${JSON.stringify(initialState.theme)};
          const initialStored = ${JSON.stringify(initialState.stored)};
          if (initialStored === null) {
            window.localStorage.removeItem("it-ticketing-theme");
          } else {
            window.localStorage.setItem("it-ticketing-theme", initialStored);
          }
          document.documentElement.dataset.theme = initialTheme;
          document.documentElement.style.colorScheme = initialTheme;
        })()`,
      );
    }
  });

  it("Scenario 4: /status/invalid-token and /status/[nonexistent-uuid] settle cleanly without console/server/page errors", async () => {
    await browser.goto(`${server.baseUrl}/status/invalid-token`);
    await browser.waitForSelector("body");
    const invalidText = await browser.evalJs<string>(
      "document.body.innerText",
    );
    expect(invalidText.length).toBeGreaterThan(0);
    expect(browser.pageErrors).toEqual([]);
    expect(browser.consoleErrors).toEqual([]);
    expect(browser.serverErrors).toEqual([]);

    browser.clearErrors();

    await browser.goto(`${server.baseUrl}/status/${NONEXISTENT_UUID}`);
    await browser.waitForSelector('main p[role="alert"], main h1', {
      timeoutMs: 15_000,
    });
    const settledText = await browser.evalJs<string>(
      "document.body ? document.body.innerText : ''",
    );

    expect(settledText).not.toContain("Memuat status tiket");
    expect(hasStackTrace(settledText)).toBe(false);
    expect(hasSensitiveDataLeak(settledText)).toBe(false);
    expect(browser.consoleErrors).toEqual([]);
    expect(browser.serverErrors).toEqual([]);

    expect(settledText).toMatch(/tidak ditemukan|gagal memuat|404/i);
    expect(browser.pageErrors).toEqual([]);
  });

  it("Scenario 5: Unauthenticated browser visits to /dashboard, /tiket, and /admin redirect to /login with #login-email visible", async () => {
    for (const protectedPath of ["/dashboard", "/tiket", "/admin"]) {
      browser.clearErrors();
      await browser.goto(`${server.baseUrl}${protectedPath}`);
      await browser.waitForPathname("/login", 15_000);
      await browser.waitForSelector("#login-email", { visible: true });
      await browser.waitForSelector("h1", { visible: true });

      expect(await browser.getText("h1")).toContain("Masuk ke IT Service Desk");
      expect(browser.pageErrors).toEqual([]);
      expect(browser.consoleErrors).toEqual([]);
      expect(browser.serverErrors).toEqual([]);
    }
  });

  it.skipIf(!HAS_AUTH_CREDENTIALS)(
    "Scenario 6 (Authenticated): real login -> AppShell sidebar soft nav -> <Form> soft filter -> logout full-reload <Activity> reset",
    async () => {
      await browser.goto(`${server.baseUrl}/login`);
      await browser.fillInput("#login-email", TEST_EMAIL);
      await browser.fillInput("#login-password", TEST_PASSWORD);
      await browser.click('button[type="submit"]');

      await browser.waitForPathname("/dashboard", 20_000);
      await browser.waitForSelector('nav[aria-label="Menu Utama"]', {
        visible: true,
      });

      await browser.evalJs(`window.__e2eNavMarker = "auth-shell"`);

      // Mandatory operational links for all authenticated roles + conditional role-gated links.
      const candidatePaths = [
        "/tiket",
        "/tiket/baru",
        "/wiki",
        "/aset",
        "/stok",
        "/laporan",
        "/dashboard",
      ];
      for (const nextPath of candidatePaths) {
        const hasLink = await browser.evalJs<boolean>(
          `Boolean(document.querySelector('nav[aria-label="Menu Utama"] a[href="${nextPath}"]'))`,
        );
        if (!hasLink) {
          expect(["/aset", "/stok", "/laporan"]).toContain(nextPath);
          continue;
        }
        const nav = await browser.clickLinkAndWaitForUrl(
          `nav[aria-label="Menu Utama"] a[href="${nextPath}"]`,
          nextPath,
        );
        console.info(
          `[Tier 4 Auth] -> ${nextPath} soft nav duration: ${nav.durationMs.toFixed(1)}ms`,
        );
        expect(nav.markerPreserved).toBe(true);
        expect(nav.durationMs).toBeLessThan(SOFT_NAV_BUDGET_MS);
        if (nextPath === "/tiket/baru") {
          const ticketFormEnabled = await browser.evalJs<{
            hasSubmit: boolean;
            submitDisabled: boolean;
            submitText: string;
            descEnabled: boolean;
          }>(
            `(() => {
              const btn = document.querySelector('main form button[type="submit"]');
              const desc = document.querySelector('#description');
              return {
                hasSubmit: btn instanceof HTMLButtonElement,
                submitDisabled: btn instanceof HTMLButtonElement ? btn.disabled : false,
                submitText: btn instanceof HTMLButtonElement ? (btn.textContent ?? "").trim() : "",
                descEnabled: desc instanceof HTMLTextAreaElement ? !desc.disabled : true,
              };
            })()`,
          );
          if (ticketFormEnabled.hasSubmit) {
            expect(ticketFormEnabled.submitDisabled).toBe(false);
            expect(ticketFormEnabled.submitText).toBe("Kirim Tiket");
            expect(ticketFormEnabled.descEnabled).toBe(true);
          }
        }
      }

      // Exercise next/form <Form> soft filter navigation without full page reload.
      const hasLaporanLink = await browser.evalJs<boolean>(
        `Boolean(document.querySelector('nav[aria-label="Menu Utama"] a[href="/laporan"]'))`,
      );
      if (hasLaporanLink) {
        await browser.clickLinkAndWaitForUrl(
          'nav[aria-label="Menu Utama"] a[href="/laporan"]',
          "/laporan",
        );
        await browser.waitForSelector("#periode");
        await browser.selectOption("#periode", "kuartalan");
        await browser.click('main form button[type="submit"]');

        const deadline = Date.now() + 10_000;
        let search = "";
        while (Date.now() < deadline) {
          search = await browser.evalJs<string>("window.location.search");
          if (search.includes("periode=kuartalan")) break;
          await new Promise((resolve) => setTimeout(resolve, 50));
        }
        expect(search).toContain("periode=kuartalan");
        expect(
          await browser.evalJs<boolean>("Boolean(window.__e2eNavMarker)"),
        ).toBe(true);
      } else {
        await browser.clickLinkAndWaitForUrl(
          'nav[aria-label="Menu Utama"] a[href="/tiket"]',
          "/tiket",
        );
        await browser
          .waitForSelector("#site-filter", { timeoutMs: 3_000 })
          .catch(() => undefined);
        const siteOptionValue = await browser.evalJs<string | null>(
          `(() => {
            const select = document.querySelector("#site-filter");
            if (!(select instanceof HTMLSelectElement)) return null;
            const opt = Array.from(select.options).find((o) => o.value);
            return opt ? opt.value : "";
          })()`,
        );
        if (siteOptionValue !== null && siteOptionValue !== "") {
          await browser.selectOption("#site-filter", siteOptionValue);
          await browser.click('main form button[type="submit"]');
          const deadline = Date.now() + 10_000;
          let search = "";
          while (Date.now() < deadline) {
            search = await browser.evalJs<string>("window.location.search");
            if (search.includes(siteOptionValue)) break;
            await new Promise((resolve) => setTimeout(resolve, 50));
          }
          expect(search).toContain(siteOptionValue);
          expect(
            await browser.evalJs<boolean>("Boolean(window.__e2eNavMarker)"),
          ).toBe(true);
        }
      }

      // Logout must perform a full page reload (Feature F5 <Activity> state reset).
      const clickedLogout = await browser.evalJs<boolean>(
        `(() => {
          const buttons = Array.from(document.querySelectorAll("aside button"));
          const btn = buttons.find((el) => (el.textContent ?? "").includes("Keluar"));
          if (!(btn instanceof HTMLElement)) return false;
          btn.click();
          return true;
        })()`,
      );
      expect(clickedLogout).toBe(true);

      await browser.waitForPathname("/login", 20_000);
      await browser.waitForSelector("#login-email", { visible: true });

      const markerAfterLogout = await browser.evalJs<boolean>(
        "Boolean(window.__e2eNavMarker)",
      );
      expect(markerAfterLogout).toBe(false);

      await browser.goto(`${server.baseUrl}/dashboard`);
      await browser.waitForPathname("/login", 15_000);

      expect(browser.pageErrors).toEqual([]);
      expect(browser.consoleErrors).toEqual([]);
      expect(browser.serverErrors).toEqual([]);
    },
  );
});
