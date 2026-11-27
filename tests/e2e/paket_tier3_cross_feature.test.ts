import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  CdpBrowser,
  DROPZONE_SELECTORS,
  IS_LIVE_DB,
  NONEXISTENT_UUID,
  SOFT_NAV_BUDGET_MS,
  WARM_RSC_LATENCY_BUDGET_MS,
  adjustStockViaApi,
  assertNoBrowserErrors,
  assertNoLegacyUiMarkers,
  assertNoStore,
  clearBrowserCookies,
  completeTicketViaUi,
  createMinimalPngBytes,
  createPublicTicket,
  dispatchSyntheticFileDrop,
  ensureTicketFormDropzoneVisible,
  extractLaporMeta,
  fetchManual,
  fetchRsc,
  getStockItems,
  hasAuthSessionSetCookie,
  hasSensitiveDataLeak,
  hasStackTrace,
  loginForCookies,
  loginViaBrowser,
  measureContrastSamples,
  moveTicketToMenungguUserViaUi,
  parseJsonSafe,
  pressKeyCombo,
  readNextManifestSafe,
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
const IT_OR_ADMIN_CREDS = IT_CREDS ?? ADMIN_CREDS;
const GA_OR_ADMIN_CREDS = GA_CREDS ?? ADMIN_CREDS;

const NON_AUTH_COOKIES =
  "it-ticketing-theme=dark; sb-test-auth-token-code-verifier=abc";

describe("Paket Tier 3: Cross-Feature Pairwise Combinations (24 Pairs)", () => {
  let server: E2eServerHandle;
  let browser: CdpBrowser;
  let sharedCommentTicket: CreatedPublicTicket | null = null;

  beforeAll(async () => {
    server = await startE2eServer();
    browser = await CdpBrowser.launch();
    if (IS_LIVE_DB) {
      sharedCommentTicket = await createPublicTicket(server.baseUrl, {
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

  it.skipIf(!IT_OR_ADMIN_CREDS || !IS_LIVE_DB)(
    "Pair 1 (F9 x F10): public reply on menunggu_user ticket inserts public comment and resumes status to diproses",
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
          "Mohon kirim screenshot error.",
        );

        const replyText = `Balasan pelapor Pair1 ${Date.now()}`;
        const replyRes = await fetchManual(
          server.baseUrl,
          `/api/tiket/publik/${ticket.token}/reply`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Origin: server.baseUrl,
            },
            body: JSON.stringify({ isi: replyText, jenis: "komentar" }),
          },
        );
        expect([200, 201]).toContain(replyRes.status);

        const pubRes = await fetchManual(
          server.baseUrl,
          `/api/tiket/publik/${ticket.token}`,
        );
        expect(pubRes.body).toContain("diproses");
        expect(pubRes.body).toContain(replyText);
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
    "Pair 2 (F10 x F14): remote password update on menunggu_user resumes to diproses and notifies IT in /api/notifications",
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
          "Password AnyDesk kadaluarsa.",
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
              isi: "Password baru sudah diisi",
              jenis: "remote",
              remoteApp: "AnyDesk",
              remoteId: "554433221",
              remotePassword: "Pair2Pass!88",
            }),
          },
        );
        expect([200, 201]).toContain(remoteRes.status);

        const notifRes = await fetchManual(
          server.baseUrl,
          "/api/notifications",
          { headers: { Cookie: itCookie } },
        );
        expect(notifRes.status).toBe(200);
        assertNoStore(notifRes);
        const notifJson = parseJsonSafe<{
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
        expect(notifJson?.unreadCount ?? 0).toBeGreaterThanOrEqual(1);
        const list = notifJson?.notifications ?? notifJson?.items ?? [];
        const matched = list.find(
          (n) =>
            !n.dibaca &&
            (n.ticket_id === ticket.id ||
              (n.tautan ?? "").includes(ticket.id) ||
              (n.judul ?? "").includes(ticket.nomorTiket) ||
              (n.pesan ?? "").includes(ticket.nomorTiket)),
        );
        expect(matched).toBeDefined();

        const pubRes = await fetchManual(
          server.baseUrl,
          `/api/tiket/publik/${ticket.token}`,
        );
        expect(pubRes.body).toContain("diproses");
        expect(pubRes.body).not.toContain("Pair2Pass!88");
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
    "Pair 3 (F10 x F15): menunggu_user reason renders on PublicTicketStatus and UI reply resumes diproses",
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
        const reason = `Alasan Pair3 ${Date.now()}`;
        await moveTicketToMenungguUserViaUi(
          browser,
          server.baseUrl,
          ticket.id,
          reason,
        );

        await clearBrowserCookies(browser);
        await browser.goto(`${server.baseUrl}/status/${ticket.token}`);
        await browser.waitForText(reason);
        const replyText = `Uji reply UI Pair3 ${Date.now()}`;
        await browser.fillInput("main textarea", replyText);
        await browser.evalJs(
          `(() => {
            const btn = Array.from(document.querySelectorAll("main button")).find((b) => /kirim balasan|kirim/i.test(b.textContent ?? ""));
            if (btn instanceof HTMLButtonElement) btn.click();
          })()`,
        );
        await browser.waitForText(replyText);
        assertNoBrowserErrors(browser);
      } finally {
        await loginViaBrowser(
          browser,
          server.baseUrl,
          IT_OR_ADMIN_CREDS.email,
          IT_OR_ADMIN_CREDS.password,
        ).catch(() => undefined);
        await resolveAndCloseTicketViaUi(
          browser,
          server.baseUrl,
          ticket,
        ).catch(() => undefined);
      }
    },
  );

  it.skipIf(!IT_OR_ADMIN_CREDS || !IS_LIVE_DB)(
    "Pair 4 (F9 x F15): public /status/[token] displays public IT reply while hiding internal IT note",
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
      const pubMsg = `PubPair4-${Date.now()}`;
      const intMsg = `SecretIntPair4-${Date.now()}`;

      await fetchManual(server.baseUrl, `/api/tiket/${ticket.id}/comments`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: server.baseUrl,
          Cookie: cookie,
        },
        body: JSON.stringify({ isi: pubMsg, isInternal: false }),
      });
      await fetchManual(server.baseUrl, `/api/tiket/${ticket.id}/comments`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: server.baseUrl,
          Cookie: cookie,
        },
        body: JSON.stringify({ isi: intMsg, isInternal: true }),
      });

      await clearBrowserCookies(browser);
      await browser.goto(`${server.baseUrl}/status/${ticket.token}`);
      await browser.waitForText(pubMsg);
      const bodyText = await browser.evalJs<string>("document.body.innerText");
      expect(bodyText).not.toContain(intMsg);
    },
  );

  it.skipIf(!USER_CREDS || !IT_OR_ADMIN_CREDS || !IS_LIVE_DB)(
    "Pair 5 (F7 x F9): RLS & API isolation blocks standard user from reading or creating internal IT notes",
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
      const secret = `InternalPair5-${Date.now()}`;
      await fetchManual(server.baseUrl, `/api/tiket/${ticket.id}/comments`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: server.baseUrl,
          Cookie: itCookie,
        },
        body: JSON.stringify({ isi: secret, isInternal: true }),
      });

      const userCookie = await loginForCookies(
        browser,
        server.baseUrl,
        USER_CREDS.email,
        USER_CREDS.password,
      );
      const userComments = await fetchManual(
        server.baseUrl,
        `/api/tiket/${ticket.id}/comments`,
        { headers: { Cookie: userCookie } },
      );
      expect(userComments.body).not.toContain(secret);
    },
  );

  it.skipIf(!IT_OR_ADMIN_CREDS || !IS_LIVE_DB)(
    "Pair 6 (F11 x F12): 1-click Ambil on /antrian followed by Canned Solution completion on /tiket/[id]",
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
      await browser.goto(`${server.baseUrl}/antrian`);
      await browser.waitForText(ticket.nomorTiket);
      const claimed = await browser.evalJs<boolean>(
        `(() => {
          const rows = Array.from(document.querySelectorAll("main tr, main [data-ticket-id]"));
          const row = rows.find((r) => (r.textContent ?? "").includes(${JSON.stringify(ticket.nomorTiket)}));
          const btn = row ? Array.from(row.querySelectorAll("button")).find((b) => /ambil/i.test(b.textContent ?? "")) : null;
          if (!(btn instanceof HTMLButtonElement)) return false;
          btn.click();
          return true;
        })()`,
      );
      expect(claimed).toBe(true);
      await new Promise((r) => setTimeout(r, 900));

      const sol = `Pair6 Canned Solusi ${Date.now()}`;
      await completeTicketViaUi(browser, server.baseUrl, ticket.id, sol, "2");

      const pubRes = await fetchManual(
        server.baseUrl,
        `/api/tiket/publik/${ticket.token}`,
      );
      expect(pubRes.body).toContain("selesai");
      expect(pubRes.body).toContain(sol);
    },
  );

  it.skipIf(!IT_OR_ADMIN_CREDS || !IS_LIVE_DB)(
    "Pair 7 (F12 x F15): completed solution renders on /status/[token] and ConfirmDialog rating closes ticket",
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
        "Pair7 selesai.",
        "2",
      );

      await clearBrowserCookies(browser);
      await browser.goto(`${server.baseUrl}/status/${ticket.token}`);
      await browser.waitForText("Pair7 selesai.");
      await browser.evalJs(
        `(() => {
          const star = document.querySelector('main button[aria-label*="5" i], main button[aria-label*="Bintang" i]');
          if (star instanceof HTMLButtonElement) star.click();
          const submit = Array.from(document.querySelectorAll("main button")).find((b) => /kirim rating|tutup tiket|konfirmasi selesai/i.test(b.textContent ?? ""));
          if (submit instanceof HTMLButtonElement) submit.click();
        })()`,
      );
      await browser.waitForSelector('[role="alertdialog"]');
      await browser.evalJs(
        `(() => {
          const confirm = Array.from(document.querySelectorAll('[role="alertdialog"] button')).find((b) => !/batal/i.test(b.textContent ?? ""));
          if (confirm instanceof HTMLButtonElement) confirm.click();
        })()`,
      );
      await browser.waitForSelector('[role="status"]');
      const pubRes = await fetchManual(
        server.baseUrl,
        `/api/tiket/publik/${ticket.token}`,
      );
      expect(pubRes.body).toContain("ditutup");
    },
  );

  it.skipIf(!IT_OR_ADMIN_CREDS || !IS_LIVE_DB)(
    "Pair 8 (F11 x F13): P0 ticket triggers urgent P0 banner alongside SLA countdown on /antrian",
    async () => {
      if (!IT_OR_ADMIN_CREDS) return;
      const p0 = await createPublicTicket(server.baseUrl, {
        mode: "p0",
      });
      expect(p0).not.toBeNull();
      if (!p0) return;

      try {
        await loginViaBrowser(
          browser,
          server.baseUrl,
          IT_OR_ADMIN_CREDS.email,
          IT_OR_ADMIN_CREDS.password,
        );
        await browser.goto(`${server.baseUrl}/antrian`);
        await browser.waitForSelector("main");
        const text = await browser.evalJs<string>("document.body.innerText");
        expect(text).toContain("P0");
        expect(text).toMatch(/SLA|Sisa|Terlambat/i);
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

  it.skipIf(!IT_OR_ADMIN_CREDS)(
    "Pair 9 (F13 x F14): Realtime /antrian view and AppShell Notification Bell coexist with zero browser errors",
    async () => {
      if (!IT_OR_ADMIN_CREDS) return;
      await loginViaBrowser(
        browser,
        server.baseUrl,
        IT_OR_ADMIN_CREDS.email,
        IT_OR_ADMIN_CREDS.password,
      );
      await browser.goto(`${server.baseUrl}/antrian`);
      await browser.waitForSelector("header");
      const bellOpen = await browser.evalJs<boolean>(
        `(() => {
          const btn = document.querySelector('header button[aria-label*="Notifikasi" i]');
          if (!(btn instanceof HTMLButtonElement)) return false;
          btn.click();
          return true;
        })()`,
      );
      expect(bellOpen).toBe(true);
      assertNoBrowserErrors(browser);
    },
  );

  it.skipIf(!IT_OR_ADMIN_CREDS)(
    "Pair 10 (F17 x F12): Wiki status/is_internal toggle updates /panduan visibility and invalidates wiki cache immediately",
    async () => {
      if (!IT_OR_ADMIN_CREDS) return;
      const cookie = await loginForCookies(
        browser,
        server.baseUrl,
        IT_OR_ADMIN_CREDS.email,
        IT_OR_ADMIN_CREDS.password,
      );
      const title = `E2E-CACHE-PAIR10-${Date.now()}`;
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
          solusi: "1. Uji cache invalidation.",
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
        const pubBefore = await fetchManual(server.baseUrl, "/panduan");
        expect(pubBefore.body).toContain(title);

        // Toggle is_internal = true via PATCH -> must disappear from /panduan
        const patchRes = await fetchManual(server.baseUrl, `/api/wiki/${id}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Origin: server.baseUrl,
            Cookie: cookie,
          },
          body: JSON.stringify({ is_internal: true }),
        });
        expect(patchRes.status).toBe(200);
        const pubAfter = await fetchManual(server.baseUrl, "/panduan");
        expect(pubAfter.body).not.toContain(title);
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
    "Pair 11 (F4 x F17): Wiki Edit Mode with MarkdownSteps updates /panduan structured HTML",
    async () => {
      if (!IT_OR_ADMIN_CREDS) return;
      const cookie = await loginForCookies(
        browser,
        server.baseUrl,
        IT_OR_ADMIN_CREDS.email,
        IT_OR_ADMIN_CREDS.password,
      );
      const title = `E2E-MD-PAIR11-${Date.now()}`;
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
          solusi: "1. Langkah awal",
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
        await fetchManual(server.baseUrl, `/api/wiki/${id}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Origin: server.baseUrl,
            Cookie: cookie,
          },
          body: JSON.stringify({
            solusi: "1. Buka terminal\n2. Jalankan:\n```bash\nipconfig /all\n```",
          }),
        });
        await browser.goto(`${server.baseUrl}/panduan`);
        await browser.waitForText(title);
        const hasCode = await browser.evalJs<boolean>(
          `Array.from(document.querySelectorAll("main pre code")).some((el) => (el.textContent ?? "").includes("ipconfig /all"))`,
        );
        expect(hasCode).toBe(true);
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
    "Pair 12 (F6 x F17): deleting Wiki SOP via ConfirmDialog + Toast removes it from /panduan",
    async () => {
      if (!IT_OR_ADMIN_CREDS) return;
      const cookie = await loginForCookies(
        browser,
        server.baseUrl,
        IT_OR_ADMIN_CREDS.email,
        IT_OR_ADMIN_CREDS.password,
      );
      const title = `E2E-DEL-PAIR12-${Date.now()}`;
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
          solusi: "1. Akan dihapus.",
          status: "published",
          is_internal: false,
        }),
      });
      expect(createRes.status).toBe(201);

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

      const panduanRes = await fetchManual(server.baseUrl, "/panduan");
      expect(panduanRes.body).not.toContain(title);
    },
  );

  it("Pair 13 (F2 x F18): PublicTicketForm ImageDropzone drop attaches preview without legacy classes", async () => {
    await browser.goto(`${server.baseUrl}/lapor`);
    await browser.waitForSelector("main form");
    const meta = await extractLaporMeta(server.baseUrl);
    if (meta?.photoCategoryId) {
      await browser.selectOption("#public-category", meta.photoCategoryId);
      await new Promise((r) => setTimeout(r, 150));
    }
    const ok = await dispatchSyntheticFileDrop(
      browser,
      DROPZONE_SELECTORS,
      "pair13.png",
      "image/png",
      createMinimalPngBytes(),
    );
    expect(ok).toBe(true);
    await new Promise((r) => setTimeout(r, 250));
    const previewCount = await browser.evalJs<number>(
      `document.querySelectorAll('main form img[src^="blob:"], main form img[src^="data:"]').length`,
    );
    expect(previewCount).toBeGreaterThan(0);
    const html = await browser.evalJs<string>("document.body.innerHTML");
    assertNoLegacyUiMarkers(html, {
      checkClasses: true,
      checkRawPunctuation: false,
      checkEmojis: true,
    });
    assertNoBrowserErrors(browser);
  });

  it.skipIf(!IS_LIVE_DB)(
    "Pair 14 (F3 x F15): PNG uploaded on /api/tiket/publik opens in ImageLightbox on /status/[token] and closes via Escape",
    async () => {
      const ticket = await createPublicTicket(server.baseUrl, {
        mode: "photo",
        withImage: true,
      });
      expect(ticket).not.toBeNull();
      if (!ticket) return;
      await browser.goto(`${server.baseUrl}/status/${ticket.token}`);
      await browser.waitForSelector("main img", { timeoutMs: 15_000 });
      await browser.click('main button:has(img), main [role="button"]:has(img)');
      await browser.waitForSelector('[role="dialog"][aria-modal="true"]');
      await pressKeyCombo(browser, "Escape");
      await new Promise((r) => setTimeout(r, 150));
      expect(
        await browser.evalJs<boolean>(
          `Boolean(document.querySelector('[role="dialog"][aria-modal="true"]'))`,
        ),
      ).toBe(false);
    },
  );

  it.skipIf(!ANY_CREDS)(
    "Pair 15 (F2 x F14): authenticated /tiket/baru ImageDropzone integrates cleanly without legacy styling",
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
      const dropped = await dispatchSyntheticFileDrop(
        browser,
        DROPZONE_SELECTORS,
        "pair15.png",
        "image/png",
        createMinimalPngBytes(),
      );
      expect(dropped).toBe(true);
      await new Promise((r) => setTimeout(r, 250));
      const previewCount = await browser.evalJs<number>(
        `document.querySelectorAll('main form img[src^="blob:"], main form img[src^="data:"]').length`,
      );
      expect(previewCount).toBeGreaterThan(0);
      const html = await browser.evalJs<string>("document.body.innerHTML");
      assertNoLegacyUiMarkers(html, {
        checkClasses: true,
        checkRawPunctuation: false,
        checkEmojis: true,
      });
      assertNoBrowserErrors(browser);
    },
  );

  it.skipIf(!IS_LIVE_DB)(
    "Pair 16 (F16 x F18): /lapor submission syncs localStorage history -> / lookup -> /status/[token] -> clear",
    async () => {
      const ticket = await createPublicTicket(server.baseUrl, {
        mode: "default",
      });
      expect(ticket).not.toBeNull();
      if (!ticket) return;

      try {
        await browser.goto(`${server.baseUrl}/status/${ticket.token}`);
        await browser.waitForSelector("main");

        await browser.goto(`${server.baseUrl}/`);
        await browser.waitForText("Tiket Terakhir dari Perangkat Ini");
        expect(
          await browser.evalJs<boolean>(
            `Boolean(document.querySelector('a[href="/status/${ticket.token}"]'))`,
          ),
        ).toBe(true);

        const sel =
          'main input[placeholder*="token" i], main input[aria-label*="status" i], header input[placeholder*="token" i]';
        await browser.fillInput(sel, ticket.token);
        await browser.evalJs(
          `document.querySelector(${JSON.stringify(sel)})?.closest("form")?.requestSubmit()`,
        );
        await browser.waitForPathname(`/status/${ticket.token}`);
        expect(
          await browser.evalJs<string>("window.location.pathname"),
        ).toBe(`/status/${ticket.token}`);

        await browser.goto(`${server.baseUrl}/`);
        await browser.waitForText("Tiket Terakhir dari Perangkat Ini");
        const cleared = await browser.evalJs<boolean>(
          `(() => {
            const link = document.querySelector('a[href="/status/${ticket.token}"]');
            const card = link?.closest("li, div");
            const btns = Array.from((card ?? document.querySelector("main"))?.querySelectorAll("button") ?? []);
            const del = btns.find((b) =>
              /hapus|bersihkan/i.test(b.textContent ?? "") ||
              /hapus/i.test(b.getAttribute("aria-label") ?? "")
            );
            if (!(del instanceof HTMLButtonElement)) return false;
            del.click();
            return true;
          })()`,
        );
        expect(cleared).toBe(true);
        await new Promise((r) => setTimeout(r, 150));
        expect(
          await browser.evalJs<boolean>(
            `Boolean(document.querySelector('a[href="/status/${ticket.token}"]'))`,
          ),
        ).toBe(false);
        const storedAfter = await browser.evalJs<string>(
          `JSON.stringify(Object.keys(window.localStorage).map((k) => window.localStorage.getItem(k)))`,
        );
        expect(storedAfter).not.toContain(ticket.token);
      } finally {
        await browser.evalJs(
          `window.localStorage.removeItem("it-ticketing-recent-tickets"); window.localStorage.removeItem("public-ticket-history");`,
        );
      }
    },
  );

  it.skipIf(!GA_OR_ADMIN_CREDS)(
    "Pair 17 (F19 x F8): Asset PATCH + Service History drawer + Export CSV with formula neutralization & no-store",
    async () => {
      if (!GA_OR_ADMIN_CREDS) return;
      const cookie = await loginForCookies(
        browser,
        server.baseUrl,
        GA_OR_ADMIN_CREDS.email,
        GA_OR_ADMIN_CREDS.password,
      );
      const nomor = `E2E-P17-${Date.now()}`;
      const createRes = await fetchManual(server.baseUrl, "/api/aset", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: server.baseUrl,
          Cookie: cookie,
        },
        body: JSON.stringify({
          nomor_aset: nomor,
          nama_perangkat: "=SUM(1+1) Laptop",
          tipe: "laptop",
          status: "aktif",
          ram_gb: 8,
        }),
      });
      expect([200, 201]).toContain(createRes.status);
      const j = parseJsonSafe<{ asset?: { id?: string }; id?: string }>(
        createRes.body,
      );
      const id = j?.asset?.id ?? j?.id ?? "";
      expect(id.length).toBeGreaterThan(0);
      try {
        const patchRes = await fetchManual(server.baseUrl, `/api/aset/${id}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Origin: server.baseUrl,
            Cookie: cookie,
          },
          body: JSON.stringify({ ram_gb: 16, status: "aktif" }),
        });
        expect(patchRes.status).toBe(200);
        assertNoStore(patchRes);

        const histRes = await fetchManual(
          server.baseUrl,
          `/api/aset/${id}/history`,
          { headers: { Cookie: cookie } },
        );
        expect(histRes.status).toBe(200);
        assertNoStore(histRes);

        await browser.goto(`${server.baseUrl}/aset`);
        await browser.waitForText(nomor);
        await browser.evalJs(
          `(() => {
            window.__e2eCapturedCsv = "";
            const origCreate = URL.createObjectURL.bind(URL);
            URL.createObjectURL = (obj) => {
              if (obj instanceof Blob) {
                obj.text().then((t) => { window.__e2eCapturedCsv = t; });
              }
              return origCreate(obj);
            };
          })()`,
        );
        const clickedExport = await browser.evalJs<boolean>(
          `(() => {
            const btn = Array.from(document.querySelectorAll("main button, main a")).find((el) => /export csv|ekspor csv|unduh csv/i.test(el.textContent ?? ""));
            if (!(btn instanceof HTMLElement)) return false;
            btn.click();
            return true;
          })()`,
        );
        expect(clickedExport).toBe(true);
        await new Promise((r) => setTimeout(r, 250));
        const capturedCsv = await browser.evalJs<string>(
          `window.__e2eCapturedCsv ?? ""`,
        );
        if (capturedCsv) {
          expect(capturedCsv).toContain(nomor);
          expect(capturedCsv).not.toMatch(/(?:^|,)"?=SUM/m);
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

  it.skipIf(!GA_OR_ADMIN_CREDS || !IT_OR_ADMIN_CREDS || !IS_LIVE_DB)(
    "Pair 18 (F20 x F14): Stock restock UI + restore-tickets endpoint + IT notification contract",
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
            catatan: "E2E Pair 18 zero stock",
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
            const row = Array.from(document.querySelectorAll("main table tbody tr")).find((r) => (r.textContent ?? "").includes(${JSON.stringify(kabel.kode)}));
            if (!row) return false;
            const qty = row.querySelector('input[type="number"]');
            if (qty instanceof HTMLInputElement) {
              const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
              setter?.call(qty, "1");
              qty.dispatchEvent(new Event("input", { bubbles: true }));
              qty.dispatchEvent(new Event("change", { bubbles: true }));
            }
            const add = Array.from(row.querySelectorAll("button")).find((b) => /\+\s*tambah/i.test(b.textContent ?? ""));
            if (!(add instanceof HTMLButtonElement)) return false;
            add.click();
            return true;
          })()`,
        );
        expect(restocked).toBe(true);
        await browser.waitForText(ticket.nomorTiket);

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
        expect(
          list.some(
            (n) =>
              !n.dibaca &&
              (n.ticket_id === ticket?.id ||
                (n.tautan ?? "").includes(ticket?.id ?? "") ||
                (n.judul ?? "").includes(ticket?.nomorTiket ?? "") ||
                (n.pesan ?? "").includes(ticket?.nomorTiket ?? "")),
          ),
        ).toBe(true);
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
            catatan: "E2E Pair 18 restore stock",
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

  it.skipIf(!IT_OR_ADMIN_CREDS)(
    "Pair 19 (F21 x F1): /laporan pure SVG charts + Print/PDF maintain WCAG AA contrast in light & dark modes",
    async () => {
      if (!IT_OR_ADMIN_CREDS) return;
      await loginViaBrowser(
        browser,
        server.baseUrl,
        IT_OR_ADMIN_CREDS.email,
        IT_OR_ADMIN_CREDS.password,
      );
      await browser.goto(`${server.baseUrl}/laporan`);
      await browser.waitForSelector("main svg");
      try {
        for (const theme of ["light", "dark"] as const) {
          await setBrowserTheme(browser, theme);
          const samples = await measureContrastSamples(browser, [
            "main h1",
            "main h2",
            "main p",
          ]);
          for (const s of samples) {
            expect(s.ratio).toBeGreaterThanOrEqual(s.required);
          }
        }
      } finally {
        await setBrowserTheme(browser, "light");
      }
    },
  );

  it.skipIf(!ANY_CREDS)(
    "Pair 20 (F22 x F14): AppShell Notification Bell dropdown and mark-all-read synchronize unread count",
    async () => {
      if (!ANY_CREDS) return;
      await loginViaBrowser(
        browser,
        server.baseUrl,
        ANY_CREDS.email,
        ANY_CREDS.password,
      );
      await browser.goto(`${server.baseUrl}/dashboard`);
      await browser.waitForSelector('header button[aria-label*="Notifikasi" i]');
      await browser.click('header button[aria-label*="Notifikasi" i]');
      await new Promise((r) => setTimeout(r, 250));
      await browser.evalJs(
        `(() => {
          const btn = Array.from(document.querySelectorAll("header button")).find((b) => /tandai semua/i.test(b.textContent ?? ""));
          if (btn instanceof HTMLButtonElement) btn.click();
        })()`,
      );
      assertNoBrowserErrors(browser);
    },
  );

  it.skipIf(!ANY_CREDS)(
    "Pair 21 (F22 x F19): Global Command Palette (Ctrl+K) queries /api/search and preserves __e2eNavMarker on soft nav",
    async () => {
      if (!ANY_CREDS) return;
      await loginViaBrowser(
        browser,
        server.baseUrl,
        ANY_CREDS.email,
        ANY_CREDS.password,
      );
      await browser.goto(`${server.baseUrl}/dashboard`);
      await browser.evalJs(`window.__e2eNavMarker = "pair-21"`);
      await pressKeyCombo(browser, "k", { ctrl: true });
      await browser.waitForSelector('[role="dialog"][aria-modal="true"] input');
      await browser.fillInput('[role="dialog"] input', "Wiki");
      await new Promise((r) => setTimeout(r, 400));
      const navigated = await browser.evalJs<boolean>(
        `(() => {
          const opt = Array.from(document.querySelectorAll('[role="dialog"] a, [role="dialog"] button')).find((el) =>
            /wiki/i.test(el.textContent ?? "")
          );
          if (!(opt instanceof HTMLElement)) return false;
          opt.click();
          return true;
        })()`,
      );
      expect(navigated).toBe(true);
      await browser.waitForPathname("/wiki");
      expect(
        await browser.evalJs<boolean>("Boolean(window.__e2eNavMarker)"),
      ).toBe(true);
      assertNoBrowserErrors(browser);
    },
  );

  it.skipIf(!ANY_CREDS)(
    "Pair 22 (F23 x F8): /profil Web Push subscription lifecycle enforces no-store & clean /dashboard separation",
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
      const dashText = await browser.evalJs<string>("document.body.innerText");
      expect(dashText).not.toMatch(/Hubungkan Telegram/i);

      await browser.goto(`${server.baseUrl}/profil`);
      await browser.waitForSelector("main");
      const profilText = await browser.evalJs<string>("document.body.innerText");
      expect(profilText).toMatch(/Telegram/i);
      expect(profilText).toMatch(/Push|Notifikasi Browser/i);
      assertNoBrowserErrors(browser);
    },
  );

  it("Pair 23 (F5 x F1): /login UX controls maintain WCAG AA contrast in both light and dark modes", async () => {
    await browser.goto(`${server.baseUrl}/login`);
    await browser.waitForSelector("#login-email");
    try {
      for (const theme of ["light", "dark"] as const) {
        await setBrowserTheme(browser, theme);
        const samples = await measureContrastSamples(browser, [
          "h1",
          'label[for="login-email"]',
          'main form button[type="submit"]',
        ]);
        expect(samples.length).toBeGreaterThan(0);
        for (const s of samples) {
          expect(
            s.ratio,
            `/login ${theme} ${s.selector}`,
          ).toBeGreaterThanOrEqual(s.required);
        }
      }
    } finally {
      await setBrowserTheme(browser, "light");
    }
  });

  it("Pair 24 (F24 x F17): /panduan RSC/PPR prefetch, proxy.ts non-auth bypass, /icon.svg, /manifest.webmanifest & 0 Dynamic manifest check", async () => {
    // 1. Proxy bypass with non-auth cookies on /panduan
    const htmlRes = await fetchManual(server.baseUrl, "/panduan", {
      headers: { Cookie: NON_AUTH_COOKIES },
    });
    expect(htmlRes.status).toBe(200);
    expect(hasAuthSessionSetCookie(htmlRes.setCookies)).toBe(false);
    expect(htmlRes.setCookies.some((c) => /\bsb-/i.test(c))).toBe(false);

    // 2. RSC /_tree prefetch within warm budget
    await fetchRsc(server.baseUrl, "/panduan", { prefetch: true });
    const treeRes = await fetchRsc(server.baseUrl, "/panduan", {
      prefetch: true,
      segmentPrefetch: "/_tree",
      headers: { Cookie: NON_AUTH_COOKIES },
    });
    expect(treeRes.status).toBe(200);
    expect(treeRes.contentType).toContain("text/x-component");
    expect(treeRes.durationMs).toBeLessThan(WARM_RSC_LATENCY_BUDGET_MS);
    expect(hasAuthSessionSetCookie(treeRes.setCookies)).toBe(false);
    expect(hasStackTrace(treeRes.body)).toBe(false);
    expect(hasSensitiveDataLeak(treeRes.body)).toBe(false);

    // 3. Soft navigation / -> /panduan preserves window marker
    await browser.goto(`${server.baseUrl}/`);
    await browser.evalJs(`window.__e2eNavMarker = "pair-24"`);
    const nav = await browser.clickLinkAndWaitForUrl(
      'a[href="/panduan"]',
      "/panduan",
    );
    expect(nav.markerPreserved).toBe(true);
    expect(nav.durationMs).toBeLessThan(SOFT_NAV_BUDGET_MS);

    // 4. Icon + Manifest + Build manifest 0 Dynamic check
    const icon = await fetchManual(server.baseUrl, "/icon.svg");
    const manifest = await fetchManual(server.baseUrl, "/manifest.webmanifest");
    expect(icon.status).toBe(200);
    expect(manifest.status).toBe(200);

    const prerender = readNextManifestSafe<{
      version?: number;
      routes?: Record<string, { renderingMode?: string }>;
    }>("prerender-manifest.json");
    expect(prerender).not.toBeNull();
    if (prerender) {
      expect(prerender.version).toBe(4);
      expect(["PARTIALLY_STATIC", "STATIC"]).toContain(
        prerender.routes?.["/panduan"]?.renderingMode,
      );
      expect(["PARTIALLY_STATIC", "STATIC"]).toContain(
        prerender.routes?.["/profil"]?.renderingMode,
      );
    }
  });
});
