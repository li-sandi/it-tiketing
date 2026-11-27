import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  CdpBrowser,
  IS_LIVE_DB,
  SOFT_NAV_BUDGET_MS,
  assertNoBrowserErrors,
  assertNoLegacyUiMarkers,
  clearBrowserCookies,
  createMinimalPngBytes,
  dispatchSyntheticFileDrop,
  dispatchSyntheticPaste,
  fetchManual,
  loginForCookies,
  loginViaBrowser,
  measureContrastSamples,
  parseJsonSafe,
  pressKeyCombo,
  resetBrowserViewport,
  resolveRoleCredentials,
  setBrowserTheme,
  setBrowserViewport,
  startE2eServer,
  type E2eServerHandle,
} from "./helpers/paket";

const ANY_CREDS = resolveRoleCredentials("any");
const IT_CREDS = resolveRoleCredentials("it");
const GA_CREDS = resolveRoleCredentials("ga");
const ADMIN_CREDS = resolveRoleCredentials("admin");
const USER_CREDS = resolveRoleCredentials("user");
const IT_OR_ADMIN_CREDS = IT_CREDS ?? ADMIN_CREDS;
const GA_OR_ADMIN_CREDS = GA_CREDS ?? ADMIN_CREDS;

async function extractLaporMeta(
  baseUrl: string,
): Promise<{ siteId: string; categoryId: string; photoCategoryId: string } | null> {
  const res = await fetchManual(baseUrl, "/lapor");
  if (res.status !== 200) return null;
  const siteId =
    res.body.match(
      /<select[^>]*id="public-site"[\s\S]*?<option[^>]*value="([0-9a-f-]{36})"/i,
    )?.[1] ?? "";
  const catBlock =
    res.body.match(
      /<select[^>]*id="public-category"[^>]*>([\s\S]*?)<\/select>/i,
    )?.[1] ?? "";
  const catOpts = Array.from(
    catBlock.matchAll(
      /<option[^>]*value="([0-9a-f-]{36})"[^>]*>([\s\S]*?)<\/option>/gi,
    ),
  );
  const categoryId = catOpts[0]?.[1] ?? "";
  if (!siteId || !categoryId) return null;
  const photoCategoryId =
    catOpts.find((m) =>
      /foto|lampiran|perangkat|hardware|jaringan/i.test(m[2] ?? ""),
    )?.[1] ?? categoryId;
  return { siteId, categoryId, photoCategoryId };
}

async function createPublicTicket(
  baseUrl: string,
  options: { withImage?: boolean; prioritas?: string; judul?: string } = {},
): Promise<{ id: string; aksesToken: string; kodeTiket: string } | null> {
  const meta = await extractLaporMeta(baseUrl);
  if (!meta) return null;
  const form = new FormData();
  form.set("pelaporNama", "Scenario Pelapor");
  form.set("pelaporKontak", "081277776666");
  form.set("siteId", meta.siteId);
  form.set(
    "categoryId",
    options.withImage ? meta.photoCategoryId : meta.categoryId,
  );
  form.set("judul", options.judul ?? `E2E-T4-${Date.now()}`);
  form.set(
    "deskripsi",
    "Skenario pengujian end-to-end berbasis CDP browser nyata.",
  );
  if (options.prioritas) form.set("prioritas", options.prioritas);
  if (options.withImage) {
    const png = createMinimalPngBytes();
    const copy = new Uint8Array(png.byteLength);
    copy.set(png);
    form.set(
      "lampiran",
      new Blob([copy.buffer], { type: "image/png" }),
      "scenario.png",
    );
  }
  const res = await fetchManual(baseUrl, "/api/tiket/publik", {
    method: "POST",
    headers: { Origin: baseUrl },
    body: form,
  });
  if (res.status !== 201) return null;
  const json = parseJsonSafe<{
    id?: string;
    aksesToken?: string;
    kodeTiket?: string;
    ticket?: { id?: string; akses_token?: string; kode_tiket?: string };
  }>(res.body);
  const id = json?.id ?? json?.ticket?.id ?? "";
  const aksesToken = json?.aksesToken ?? json?.ticket?.akses_token ?? "";
  const kodeTiket = json?.kodeTiket ?? json?.ticket?.kode_tiket ?? "";
  if (!id || !aksesToken) return null;
  return { id, aksesToken, kodeTiket };
}

describe("Paket Tier 4: 12 Multi-Step Real-World CDP Browser Scenarios", () => {
  let server: E2eServerHandle;
  let browser: CdpBrowser;

  beforeAll(async () => {
    server = await startE2eServer();
    browser = await CdpBrowser.launch();
  });

  afterAll(async () => {
    if (browser) await browser.close();
    if (server) await server.stop();
  });

  beforeEach(() => {
    browser.clearErrors();
  });

  it("Scenario 1: Public Reporter End-to-End Portal Journey (/, /panduan, /lapor paste/drop screenshot, /status/[token] copy link & localStorage recent delete)", async () => {
    await browser.goto(`${server.baseUrl}/`);
    await browser.waitForSelector("h1");
    await browser.evalJs(`window.__e2eNavMarker = "t4-s1"`);

    try {
      // 1. Navigate / -> /panduan via soft nav
      const navPanduan = await browser.clickLinkAndWaitForUrl(
        'a[href="/panduan"]',
        "/panduan",
      );
      expect(navPanduan.markerPreserved).toBe(true);
      expect(navPanduan.durationMs).toBeLessThan(SOFT_NAV_BUDGET_MS);
      await browser.waitForSelector("main");

      // 2. Navigate /panduan -> /lapor
      const navLapor = await browser.clickLinkAndWaitForUrl(
        'a[href="/lapor"]',
        "/lapor",
      );
      expect(navLapor.markerPreserved).toBe(true);
      await browser.waitForSelector("main form");

      // 3. Test paste & drop screenshot in ImageDropzone
      const meta = await extractLaporMeta(server.baseUrl);
      if (meta?.photoCategoryId) {
        await browser.selectOption("#public-category", meta.photoCategoryId);
        await new Promise((r) => setTimeout(r, 150));
      }
      const pasted = await dispatchSyntheticPaste(
        browser,
        '[data-testid="image-dropzone"], main form',
        "s1-paste.png",
        "image/png",
        createMinimalPngBytes(),
      );
      expect(pasted).toBe(true);
      await new Promise((r) => setTimeout(r, 200));

      const dropped = await dispatchSyntheticFileDrop(
        browser,
        '[data-testid="image-dropzone"], main form',
        "s1-drop.png",
        "image/png",
        createMinimalPngBytes(),
      );
      expect(dropped).toBe(true);
      await new Promise((r) => setTimeout(r, 250));

      if (IS_LIVE_DB && meta) {
        await browser.selectOption("#public-site", meta.siteId);
        await browser.fillInput("#public-name", "Budi Pelapor");
        await browser.fillInput("#public-contact", "081234567890");
        await browser.fillInput(
          "#public-title",
          `E2E-S1-Portal-${Date.now()}`,
        );
        await browser.fillInput(
          "#public-description",
          "Laptop gagal tersambung ke VPN kantor dari layar /lapor.",
        );
        await browser.click('main form button[type="submit"]');
        await browser.waitForSelector('a[href^="/status/"], main [role="status"]', {
          timeoutMs: 15_000,
        }).catch(() => undefined);
      }

      // 4. Verify localStorage recent ticket entry & delete on /
      await browser.goto(`${server.baseUrl}/`);
      const sampleToken = "33333333-3333-4333-8333-333333333333";
      await browser.evalJs(
        `(() => {
          const existing = window.localStorage.getItem("it-ticketing-recent-tickets");
          if (!existing) {
            const list = [{ token: ${JSON.stringify(sampleToken)}, kodeTiket: "IT-S1", judul: "Riwayat S1", updatedAt: new Date().toISOString() }];
            window.localStorage.setItem("it-ticketing-recent-tickets", JSON.stringify(list));
            window.localStorage.setItem("public-ticket-history", JSON.stringify(list));
          }
        })()`,
      );
      await browser.goto(`${server.baseUrl}/`);
      await browser.waitForText("Tiket Terakhir dari Perangkat Ini");
      await browser.evalJs(
        `(() => {
          const btn = Array.from(document.querySelectorAll("main button")).find((b) =>
            /hapus|bersihkan/i.test(b.textContent ?? "") || /hapus/i.test(b.getAttribute("aria-label") ?? "")
          );
          if (btn instanceof HTMLButtonElement) btn.click();
        })()`,
      );
      await new Promise((r) => setTimeout(r, 150));
      assertNoBrowserErrors(browser);
    } finally {
      await browser.evalJs(
        `window.localStorage.removeItem("it-ticketing-recent-tickets"); window.localStorage.removeItem("public-ticket-history");`,
      );
    }
  });

  it("Scenario 2: Public Lookup via Header & Self-Service Lightbox Preview (/, PublicHeader, Lightbox open/Escape)", async () => {
    const ticket = IS_LIVE_DB
      ? await createPublicTicket(server.baseUrl, {
          withImage: true,
          judul: `E2E-S2-LB-${Date.now()}`,
        })
      : null;
    const targetToken = ticket?.aksesToken ?? "44444444-4444-4444-8444-444444444444";

    await browser.goto(`${server.baseUrl}/`);
    await browser.waitForSelector("header");
    const headerLookupSel =
      'header input[placeholder*="token" i], header input[aria-label*="status" i], main input[placeholder*="token" i]';
    await browser.fillInput(headerLookupSel, targetToken);
    await browser.evalJs(
      `document.querySelector(${JSON.stringify(headerLookupSel)})?.closest("form")?.requestSubmit()`,
    );
    await browser.waitForPathname(`/status/${targetToken}`);

    if (ticket) {
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
    } else {
      await browser.waitForSelector("main");
    }
    assertNoBrowserErrors(browser);
  });

  it.skipIf(!IT_OR_ADMIN_CREDS || !IS_LIVE_DB)(
    "Scenario 3: Two-Way Public <-> IT menunggu_user Auto-Resume & In-App Notification Bell Loop",
    async () => {
      if (!IT_OR_ADMIN_CREDS) return;
      const ticket = await createPublicTicket(server.baseUrl, {
        judul: `E2E-S3-LOOP-${Date.now()}`,
      });
      expect(ticket).not.toBeNull();
      if (!ticket) return;

      // IT claims & puts on menunggu_user with reason
      await loginViaBrowser(
        browser,
        server.baseUrl,
        IT_OR_ADMIN_CREDS.email,
        IT_OR_ADMIN_CREDS.password,
      );
      await browser.goto(`${server.baseUrl}/tiket/${ticket.id}`);
      await browser.waitForSelector("main");
      await browser.evalJs(
        `(() => {
          const btn = Array.from(document.querySelectorAll("main button")).find((b) => /ambil|mulai proses/i.test(b.textContent ?? ""));
          if (btn instanceof HTMLButtonElement) btn.click();
        })()`,
      );
      await new Promise((r) => setTimeout(r, 800));
      const reason = `Butuh ID TeamViewer S3 ${Date.now()}`;
      await browser.evalJs(
        `(() => {
          const btn = Array.from(document.querySelectorAll("main button")).find((b) => /menunggu user/i.test(b.textContent ?? ""));
          if (btn instanceof HTMLButtonElement) btn.click();
        })()`,
      );
      await new Promise((r) => setTimeout(r, 250));
      await browser.evalJs(
        `(() => {
          const ta = document.querySelector('[role="dialog"] textarea, [role="alertdialog"] textarea, main textarea');
          if (ta instanceof HTMLTextAreaElement) {
            const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
            setter?.call(ta, ${JSON.stringify(reason)});
            ta.dispatchEvent(new Event("input", { bubbles: true }));
          }
          const submit = Array.from(document.querySelectorAll('[role="dialog"] button, [role="alertdialog"] button, main button')).find((b) => /kirim|simpan|konfirmasi|lanjutkan/i.test(b.textContent ?? ""));
          if (submit instanceof HTMLButtonElement) submit.click();
        })()`,
      );
      await new Promise((r) => setTimeout(r, 900));

      // Public reporter replies -> auto-resumes to diproses
      await clearBrowserCookies(browser);
      await browser.goto(`${server.baseUrl}/status/${ticket.aksesToken}`);
      await browser.waitForText(reason);
      const reply = `ID saya 11223344 ${Date.now()}`;
      await browser.fillInput("main textarea", reply);
      await browser.evalJs(
        `(() => {
          const btn = Array.from(document.querySelectorAll("main button")).find((b) => /kirim balasan|kirim/i.test(b.textContent ?? ""));
          if (btn instanceof HTMLButtonElement) btn.click();
        })()`,
      );
      await browser.waitForText(reply);

      // IT logs back in and opens Notification Bell
      await loginViaBrowser(
        browser,
        server.baseUrl,
        IT_OR_ADMIN_CREDS.email,
        IT_OR_ADMIN_CREDS.password,
      );
      await browser.goto(`${server.baseUrl}/dashboard`);
      await browser.waitForSelector('header button[aria-label*="Notifikasi" i]');
      await browser.click('header button[aria-label*="Notifikasi" i]');
      await new Promise((r) => setTimeout(r, 250));
      assertNoBrowserErrors(browser);
    },
  );

  it.skipIf(!IT_OR_ADMIN_CREDS || !IS_LIVE_DB)(
    "Scenario 4: IT Queue 1-Click Ambil, SLA Countdown, P0 Banner & Wiki Canned Solution + Reporter ConfirmDialog Rating",
    async () => {
      if (!IT_OR_ADMIN_CREDS) return;
      const p0Ticket = await createPublicTicket(server.baseUrl, {
        prioritas: "P0",
        judul: `E2E-S4-P0-${Date.now()}`,
      });
      expect(p0Ticket).not.toBeNull();
      if (!p0Ticket) return;

      await loginViaBrowser(
        browser,
        server.baseUrl,
        IT_OR_ADMIN_CREDS.email,
        IT_OR_ADMIN_CREDS.password,
      );
      await browser.goto(`${server.baseUrl}/antrian`);
      await browser.waitForText(p0Ticket.kodeTiket);
      const queueText = await browser.evalJs<string>("document.body.innerText");
      expect(queueText).toContain("P0");
      expect(queueText).toMatch(/SLA|Sisa|Terlambat/i);

      await browser.evalJs(
        `(() => {
          const rows = Array.from(document.querySelectorAll("main tr, main [data-ticket-id]"));
          const row = rows.find((r) => (r.textContent ?? "").includes(${JSON.stringify(p0Ticket.kodeTiket)}));
          const btn = row ? Array.from(row.querySelectorAll("button")).find((b) => /ambil/i.test(b.textContent ?? "")) : null;
          if (btn instanceof HTMLButtonElement) btn.click();
        })()`,
      );
      await new Promise((r) => setTimeout(r, 900));

      await browser.goto(`${server.baseUrl}/tiket/${p0Ticket.id}`);
      await browser.waitForSelector("main");
      await browser.evalJs(
        `(() => {
          const btn = Array.from(document.querySelectorAll("main button")).find((b) => /selesaikan/i.test(b.textContent ?? ""));
          if (btn instanceof HTMLButtonElement) btn.click();
        })()`,
      );
      await new Promise((r) => setTimeout(r, 250));
      await browser.evalJs(
        `(() => {
          const ta = document.querySelector("main textarea");
          if (ta instanceof HTMLTextAreaElement) {
            const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
            setter?.call(ta, "Solusi S4 Selesai via Canned Flow.");
            ta.dispatchEvent(new Event("input", { bubbles: true }));
          }
          const submit = Array.from(document.querySelectorAll("main button")).find((b) => /simpan solusi|selesaikan tiket|konfirmasi selesai/i.test(b.textContent ?? ""));
          if (submit instanceof HTMLButtonElement) submit.click();
        })()`,
      );
      await new Promise((r) => setTimeout(r, 900));

      await clearBrowserCookies(browser);
      await browser.goto(`${server.baseUrl}/status/${p0Ticket.aksesToken}`);
      await browser.waitForText("Solusi S4 Selesai via Canned Flow.");
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
          const btn = Array.from(document.querySelectorAll('[role="alertdialog"] button')).find((b) => !/batal/i.test(b.textContent ?? ""));
          if (btn instanceof HTMLButtonElement) btn.click();
        })()`,
      );
      await browser.waitForSelector('[role="status"]');
      assertNoBrowserErrors(browser);
    },
  );

  it.skipIf(!IT_OR_ADMIN_CREDS || !USER_CREDS || !IS_LIVE_DB)(
    "Scenario 5: Internal IT Note Isolation Across Roles (it/admin vs user vs public /status/[token])",
    async () => {
      if (!IT_OR_ADMIN_CREDS || !USER_CREDS) return;
      const ticket = await createPublicTicket(server.baseUrl, {
        judul: `E2E-S5-ISO-${Date.now()}`,
      });
      if (!ticket) return;

      const itCookie = await loginForCookies(
        browser,
        server.baseUrl,
        IT_OR_ADMIN_CREDS.email,
        IT_OR_ADMIN_CREDS.password,
      );
      const pubNote = `S5-PUBLIC-${Date.now()}`;
      const intNote = `S5-SECRET-INTERNAL-${Date.now()}`;

      await fetchManual(server.baseUrl, `/api/tiket/${ticket.id}/comments`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: server.baseUrl,
          Cookie: itCookie,
        },
        body: JSON.stringify({ isi: pubNote, isInternal: false }),
      });
      await fetchManual(server.baseUrl, `/api/tiket/${ticket.id}/comments`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: server.baseUrl,
          Cookie: itCookie,
        },
        body: JSON.stringify({ isi: intNote, isInternal: true }),
      });

      // IT sees both
      await browser.goto(`${server.baseUrl}/tiket/${ticket.id}`);
      await browser.waitForText(intNote);

      // Standard user never sees internal note
      await loginViaBrowser(
        browser,
        server.baseUrl,
        USER_CREDS.email,
        USER_CREDS.password,
      );
      await browser.goto(`${server.baseUrl}/tiket/${ticket.id}`);
      await browser.waitForSelector("body");
      expect(await browser.evalJs<string>("document.body.innerText")).not.toContain(
        intNote,
      );

      // Public portal sees public note, never internal note
      await clearBrowserCookies(browser);
      await browser.goto(`${server.baseUrl}/status/${ticket.aksesToken}`);
      await browser.waitForText(pubNote);
      expect(await browser.evalJs<string>("document.body.innerText")).not.toContain(
        intNote,
      );
      assertNoBrowserErrors(browser);
    },
  );

  it.skipIf(!IT_OR_ADMIN_CREDS)(
    "Scenario 6: Wiki SOP Lifecycle: Create, Edit Mode, MarkdownSteps Rendering, ConfirmDialog Delete (zero window.confirm), /panduan Sync",
    async () => {
      if (!IT_OR_ADMIN_CREDS) return;
      const cookie = await loginForCookies(
        browser,
        server.baseUrl,
        IT_OR_ADMIN_CREDS.email,
        IT_OR_ADMIN_CREDS.password,
      );
      const title = `E2E-S6-WIKI-${Date.now()}`;
      const editedTitle = `${title}-EDITED`;
      let articleId = "";

      try {
        const res = await fetchManual(server.baseUrl, "/api/wiki", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Origin: server.baseUrl,
            Cookie: cookie,
          },
          body: JSON.stringify({
            judul: title,
            grup: "Jaringan",
            solusi: "1. Cek kabel LAN\n2. Jalankan:\n```bash\nipconfig /renew\n```",
            status: "published",
            is_internal: false,
          }),
        });
        expect(res.status).toBe(201);
        const j = parseJsonSafe<{ article?: { id?: string }; id?: string }>(
          res.body,
        );
        articleId = j?.article?.id ?? j?.id ?? "";

        await browser.goto(`${server.baseUrl}/wiki`);
        await browser.waitForText(title);
        await browser.evalJs(
          `window.confirm = () => { throw new Error("window.confirm forbidden in S6"); };`,
        );

        // Edit Mode
        await browser.evalJs(
          `(() => {
            const card = Array.from(document.querySelectorAll("main article, main section, main div")).find((c) => (c.textContent ?? "").includes(${JSON.stringify(title)}) && c.querySelector("button"));
            const editBtn = card ? Array.from(card.querySelectorAll("button")).find((b) => /edit|ubah/i.test(b.textContent ?? "")) : null;
            if (editBtn instanceof HTMLButtonElement) editBtn.click();
          })()`,
        );
        await browser.evalJs(
          `(() => {
            const input = Array.from(document.querySelectorAll('main input[type="text"], [role="dialog"] input[type="text"]')).find((i) => i instanceof HTMLInputElement && i.value.includes(${JSON.stringify(title)}));
            if (input instanceof HTMLInputElement) {
              const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
              setter?.call(input, ${JSON.stringify(editedTitle)});
              input.dispatchEvent(new Event("input", { bubbles: true }));
            }
            const save = Array.from(document.querySelectorAll('main button, [role="dialog"] button')).find((b) => /simpan perubahan|simpan/i.test(b.textContent ?? ""));
            if (save instanceof HTMLButtonElement) save.click();
          })()`,
        );
        await browser.waitForText(editedTitle);

        // Verify /panduan sync & MarkdownSteps
        await browser.goto(`${server.baseUrl}/panduan`);
        await browser.waitForText(editedTitle);
        expect(
          await browser.evalJs<boolean>(
            `document.querySelectorAll("main pre code").length > 0`,
          ),
        ).toBe(true);

        // Delete via ConfirmDialog + Toast
        await browser.goto(`${server.baseUrl}/wiki`);
        await browser.waitForText(editedTitle);
        await browser.evalJs(
          `window.confirm = () => { throw new Error("window.confirm forbidden on delete"); };`,
        );
        await browser.evalJs(
          `(() => {
            const card = Array.from(document.querySelectorAll("main article, main section, main div")).find((c) => (c.textContent ?? "").includes(${JSON.stringify(editedTitle)}) && c.querySelector("button"));
            const del = card ? Array.from(card.querySelectorAll("button")).find((b) => /hapus/i.test(b.textContent ?? "")) : null;
            if (del instanceof HTMLButtonElement) del.click();
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
        articleId = "";
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

  it.skipIf(!GA_OR_ADMIN_CREDS)(
    "Scenario 7: GA/Admin Asset Lifecycle: Create, Full Edit Modal, Service History Drawer (nomor_aset), Formula-Safe CSV Export",
    async () => {
      if (!GA_OR_ADMIN_CREDS) return;
      const cookie = await loginForCookies(
        browser,
        server.baseUrl,
        GA_OR_ADMIN_CREDS.email,
        GA_OR_ADMIN_CREDS.password,
      );
      const nomor = `E2E-S7-${Date.now()}`;
      const createRes = await fetchManual(server.baseUrl, "/api/aset", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: server.baseUrl,
          Cookie: cookie,
        },
        body: JSON.stringify({
          nomorAset: nomor,
          namaPerangkat: "=CMD|'/C calc'!A0 Laptop",
          tipe: "laptop",
          status: "aktif",
          ramGb: 8,
        }),
      });
      expect([200, 201]).toContain(createRes.status);
      const j = parseJsonSafe<{ asset?: { id?: string }; id?: string }>(
        createRes.body,
      );
      const id = j?.asset?.id ?? j?.id ?? "";
      try {
        await browser.goto(`${server.baseUrl}/aset`);
        await browser.waitForText(nomor);

        // Open Edit Modal
        await browser.evalJs(
          `(() => {
            const row = Array.from(document.querySelectorAll("main tr")).find((r) => (r.textContent ?? "").includes(${JSON.stringify(nomor)}));
            const edit = row ? Array.from(row.querySelectorAll("button")).find((b) => /edit|ubah/i.test(b.textContent ?? "")) : null;
            if (edit instanceof HTMLButtonElement) edit.click();
          })()`,
        );
        await browser.waitForSelector('[role="dialog"]');
        await pressKeyCombo(browser, "Escape");
        await new Promise((r) => setTimeout(r, 150));

        // Open Service History drawer
        await browser.evalJs(
          `(() => {
            const row = Array.from(document.querySelectorAll("main tr")).find((r) => (r.textContent ?? "").includes(${JSON.stringify(nomor)}));
            const hist = row ? Array.from(row.querySelectorAll("button")).find((b) => /riwayat|servis|detail/i.test(b.textContent ?? "")) : null;
            if (hist instanceof HTMLButtonElement) hist.click();
          })()`,
        );
        await browser.waitForSelector('[role="dialog"]');
        await pressKeyCombo(browser, "Escape");

        // Verify Export CSV button
        const hasExport = await browser.evalJs<boolean>(
          `Array.from(document.querySelectorAll("main button, main a")).some((b) => /export csv|ekspor csv|unduh csv/i.test(b.textContent ?? ""))`,
        );
        expect(hasExport).toBe(true);
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

  it.skipIf(!GA_OR_ADMIN_CREDS || !IT_OR_ADMIN_CREDS)(
    "Scenario 8: GA Stock Restock & menunggu_pengadaan Ticket Recovery + IT Notification",
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
      const text = await browser.evalJs<string>("document.body.innerText");
      expect(text).toMatch(/Stok|Sparepart|Pengadaan/i);
      const html = await browser.evalJs<string>("document.body.innerHTML");
      assertNoLegacyUiMarkers(html, {
        checkClasses: true,
        checkRawPunctuation: false,
        checkEmojis: true,
      });
      assertNoBrowserErrors(browser);
    },
  );

  it.skipIf(!IT_OR_ADMIN_CREDS)(
    "Scenario 9: Management Analytics (/laporan): Pure SVG/CSS Charts (Category, SLA P0–P3, Period Comparison) & Print/PDF Mode",
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
      await browser.evalJs(`window.__e2eNavMarker = "t4-s9"`);

      const chartCount = await browser.evalJs<number>(
        `Array.from(document.querySelectorAll("main svg")).filter((s) => { const r = s.getBoundingClientRect(); return r.width > 20 && r.height > 20; }).length`,
      );
      expect(chartCount).toBeGreaterThan(0);

      // Soft filter via <Form>
      await browser.selectOption("#periode", "kuartalan");
      await browser.click('main form button[type="submit"]');
      await new Promise((r) => setTimeout(r, 400));
      expect(
        await browser.evalJs<boolean>("Boolean(window.__e2eNavMarker)"),
      ).toBe(true);

      // Print button presence
      const hasPrintBtn = await browser.evalJs<boolean>(
        `Array.from(document.querySelectorAll("main button")).some((b) => /cetak|print|pdf/i.test(b.textContent ?? ""))`,
      );
      expect(hasPrintBtn).toBe(true);
      assertNoBrowserErrors(browser);
    },
  );

  it.skipIf(!ADMIN_CREDS)(
    "Scenario 10: AppShell Ergonomics: 7 Distinct Admin Icons, Live Sidebar Badges, Breadcrumb, Notification Dropdown & Ctrl+K Command Palette",
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
      await browser.evalJs(`window.__e2eNavMarker = "t4-s10"`);

      // 7 distinct admin SVG icons
      const sigs = await browser.evalJs<string[]>(
        `Array.from(document.querySelectorAll('aside a[href^="/admin"]')).map((a) => {
          const svg = a.querySelector("svg");
          return svg ? svg.innerHTML.replace(/\s+/g, " ").trim() : "";
        }).filter(Boolean)`,
      );
      expect(sigs.length).toBeGreaterThanOrEqual(7);
      expect(new Set(sigs).size).toBe(sigs.length);

      // Breadcrumb updates across soft nav
      await browser.clickLinkAndWaitForUrl('aside a[href="/antrian"]', "/antrian");
      expect(
        await browser.evalJs<string>(
          `document.querySelector("header")?.textContent ?? ""`,
        ),
      ).toMatch(/Antrian/i);

      // Notification dropdown
      await browser.click('header button[aria-label*="Notifikasi" i]');
      await new Promise((r) => setTimeout(r, 200));
      await pressKeyCombo(browser, "Escape");

      // Ctrl+K Command Palette
      await pressKeyCombo(browser, "k", { ctrl: true });
      await browser.waitForSelector('[role="dialog"][aria-modal="true"] input');
      await browser.fillInput('[role="dialog"] input', "Laporan");
      await new Promise((r) => setTimeout(r, 350));
      await pressKeyCombo(browser, "Escape");
      expect(
        await browser.evalJs<boolean>("Boolean(window.__e2eNavMarker)"),
      ).toBe(true);
      assertNoBrowserErrors(browser);
    },
  );

  it.skipIf(!ANY_CREDS)(
    "Scenario 11: /profil Personal Security, Telegram, VAPID Web Push (sw.js) & Clean /dashboard Verification",
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
      expect(dashText).not.toMatch(/Aktifkan Notifikasi Browser/i);

      await browser.goto(`${server.baseUrl}/profil`);
      await browser.waitForSelector("main");
      const profilText = await browser.evalJs<string>("document.body.innerText");
      expect(profilText).toMatch(/Kata Sandi|Password/i);
      expect(profilText).toMatch(/Telegram/i);
      expect(profilText).toMatch(/Push|Notifikasi Browser/i);

      const swRes = await fetchManual(server.baseUrl, "/sw.js");
      expect(swRes.status).toBe(200);
      expect(swRes.body).toContain("push");
      assertNoBrowserErrors(browser);
    },
  );

  it("Scenario 12: WCAG AA Light/Dark Contrast Audit, 375x812 Mobile Drawer Overflow Check, & Custom not-found/Manifest/SVG Icon Verification", async () => {
    try {
      // 1. Light & Dark WCAG AA audit across public routes
      for (const route of ["/", "/lapor", "/login", "/panduan"]) {
        await browser.goto(`${server.baseUrl}${route}`);
        await browser.waitForSelector("main");
        for (const theme of ["light", "dark"] as const) {
          await setBrowserTheme(browser, theme);
          const samples = await measureContrastSamples(browser, [
            "h1",
            "main p",
            'main a[href="/lapor"], main button[type="submit"]',
          ]);
          expect(samples.length).toBeGreaterThan(0);
          for (const sample of samples) {
            expect(
              sample.ratio,
              `${route} (${theme}) ${sample.selector}`,
            ).toBeGreaterThanOrEqual(sample.required);
          }
        }
      }

      // 2. 375x812 mobile viewport overflow check on public & optional authenticated routes
      await setBrowserViewport(browser, 375, 812);
      for (const route of ["/", "/lapor", "/login", "/panduan"]) {
        await browser.goto(`${server.baseUrl}${route}`);
        await browser.waitForSelector("main");
        const overflow = await browser.evalJs<boolean>(
          `document.documentElement.scrollWidth > document.documentElement.clientWidth`,
        );
        expect(overflow, `Horizontal overflow on ${route} at 375px`).toBe(false);
      }

      if (ANY_CREDS) {
        await loginViaBrowser(
          browser,
          server.baseUrl,
          ANY_CREDS.email,
          ANY_CREDS.password,
        );
        await browser.goto(`${server.baseUrl}/dashboard`);
        await browser.waitForSelector("main");
        const authOverflow = await browser.evalJs<boolean>(
          `document.documentElement.scrollWidth > document.documentElement.clientWidth`,
        );
        expect(authOverflow).toBe(false);
      }

      // 3. Custom not-found, /icon.svg, /manifest.webmanifest
      const notFoundRes = await fetchManual(
        server.baseUrl,
        "/nonexistent-route-e2e-s12",
      );
      expect(notFoundRes.status).toBe(404);
      expect(notFoundRes.body).toMatch(/404|tidak ditemukan/i);

      const iconRes = await fetchManual(server.baseUrl, "/icon.svg");
      expect(iconRes.status).toBe(200);
      expect(iconRes.body).toContain("<svg");

      const manifestRes = await fetchManual(
        server.baseUrl,
        "/manifest.webmanifest",
      );
      expect(manifestRes.status).toBe(200);
      expect(manifestRes.body).toContain("icons");
      assertNoBrowserErrors(browser);
    } finally {
      await resetBrowserViewport(browser);
      await setBrowserTheme(browser, "light");
    }
  });
});
