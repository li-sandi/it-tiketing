import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  revalidateTagMock,
  revalidatePathMock,
  createClientMock,
  createAdminClientMock,
  ambilUpdateMock,
  kirimPesanMock,
  checkEndpointRateLimitMock,
  checkPublicTicketRateLimitMock,
  getFeatureFlagsMock,
  getRateLimitSettingMock,
} = vi.hoisted(() => ({
  revalidateTagMock: vi.fn(),
  revalidatePathMock: vi.fn(),
  createClientMock: vi.fn(),
  createAdminClientMock: vi.fn(),
  ambilUpdateMock: vi.fn(),
  kirimPesanMock: vi.fn(),
  checkEndpointRateLimitMock: vi.fn(),
  checkPublicTicketRateLimitMock: vi.fn(),
  getFeatureFlagsMock: vi.fn(),
  getRateLimitSettingMock: vi.fn(),
}));

vi.mock("server-only", () => ({}));

vi.mock("next/cache", () => ({
  cacheLife: vi.fn(),
  cacheTag: vi.fn(),
  revalidateTag: revalidateTagMock,
  revalidatePath: revalidatePathMock,
}));

vi.mock("next/navigation", () => ({
  notFound: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: createClientMock,
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: createAdminClientMock,
}));

vi.mock("@/lib/telegram", () => ({
  ambilUpdate: ambilUpdateMock,
  escapeHtml: (val: string) => val,
  kirimPesan: kirimPesanMock,
}));

vi.mock("@/lib/rate-limit", () => ({
  checkEndpointRateLimit: checkEndpointRateLimitMock,
  checkPublicTicketRateLimit: checkPublicTicketRateLimitMock,
  resolveRateLimitNumbers: vi.fn(() => ({
    publicLimit: 20,
    emergencyLimit: 100,
    windowMinutes: 15,
  })),
}));

vi.mock("@/lib/settings", () => ({
  getFeatureFlags: getFeatureFlagsMock,
  getRateLimitSetting: getRateLimitSettingMock,
}));

vi.mock("@/lib/data/categories", () => ({
  getCategoryById: vi.fn(),
}));

vi.mock("@/lib/data/sites", () => ({
  getSiteById: vi.fn(),
}));

vi.mock("@/lib/sleman", () => ({
  prosesNotifikasiTiketBaru: vi.fn(),
}));

import PublicTicketStatusPage from "@/app/status/[token]/page";
import { POST as telegramLinkPost } from "@/app/api/telegram/link/route";
import { POST as telegramSyncPost } from "@/app/api/telegram/sync/route";
import { GET as publicTicketGet } from "@/app/api/tiket/publik/[token]/route";
import { POST as publicRatingPost } from "@/app/api/tiket/publik/[token]/rating/route";
import { POST as publicTicketPost } from "@/app/api/tiket/publik/route";
import { POST as remoteIdsPost } from "@/app/api/tiket/remote-ids/route";
import { POST as wikiSelfCheckPost } from "@/app/api/wiki/self-check/route";
import { DELETE as subscribeDelete } from "@/app/api/notifications/subscribe/route";
import { POST as stokPost } from "@/app/api/stok/route";
import { POST as stokAdjustPost } from "@/app/api/stok/adjust/route";
import { POST as lampiranPost } from "@/app/api/tiket/lampiran/route";
import { POST as notifTiketBaruPost } from "@/app/api/notif/tiket-baru/route";
import { proxy } from "@/proxy";

const VALID_UUID = "11111111-1111-4111-8111-111111111111";

describe("API, page, and proxy Tier-5 hardening", () => {
  const originalSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const originalSupabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const originalTelegramUsername = process.env.TELEGRAM_BOT_USERNAME;

  beforeEach(() => {
    vi.clearAllMocks();
    checkEndpointRateLimitMock.mockResolvedValue({ success: true });
    checkPublicTicketRateLimitMock.mockResolvedValue({
      success: true,
      limit: 20,
      remaining: 19,
      reset: Date.now() + 60_000,
    });
    getFeatureFlagsMock.mockResolvedValue({
      sleman_routing_enabled: false,
      ai_self_check_enabled: true,
      auto_close_follow_sla: true,
    });
    getRateLimitSettingMock.mockResolvedValue({
      public_limit: 20,
      emergency_limit: 100,
      window_minutes: 15,
    });
    createClientMock.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: null },
          error: null,
        }),
      },
    });
  });

  afterEach(() => {
    if (originalSupabaseUrl === undefined) {
      delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    } else {
      process.env.NEXT_PUBLIC_SUPABASE_URL = originalSupabaseUrl;
    }
    if (originalSupabaseAnon === undefined) {
      delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    } else {
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = originalSupabaseAnon;
    }
    if (originalTelegramUsername === undefined) {
      delete process.env.TELEGRAM_BOT_USERNAME;
    } else {
      process.env.TELEGRAM_BOT_USERNAME = originalTelegramUsername;
    }
  });

  it("/api/telegram/sync invalidates user-profile & users tags immediately after linked redemption even if kirimPesan rejects", async () => {
    createClientMock.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: "user-tg-1" } },
          error: null,
        }),
      },
    });

    const maybeSingle = vi.fn().mockResolvedValue({
      data: { value: "10" },
      error: null,
    });
    const eq = vi.fn().mockReturnValue({ maybeSingle });
    const select = vi.fn().mockReturnValue({ eq });
    const upsert = vi.fn().mockResolvedValue({ error: null });

    const rpc = vi.fn(async (fnName: string) => {
      if (fnName === "claim_telegram_poll") return { data: true, error: null };
      if (fnName === "redeem_telegram_link") {
        return {
          data: [{ result: "linked", user_name: "Budi" }],
          error: null,
        };
      }
      if (fnName === "release_telegram_poll") return { error: null };
      return { data: null, error: null };
    });

    createAdminClientMock.mockReturnValue({
      rpc,
      from: vi.fn().mockReturnValue({ select, upsert }),
    });

    const validStartToken = "A".repeat(43);
    ambilUpdateMock.mockResolvedValue([
      {
        update_id: 10,
        message: {
          chat: { id: 987654, type: "private" },
          text: `/start ${validStartToken}`,
        },
      },
    ]);
    kirimPesanMock.mockRejectedValueOnce(new Error("Telegram API timeout"));

    const res = await telegramSyncPost(
      new Request("http://localhost:3000/api/telegram/sync", {
        method: "POST",
      }),
    );
    expect(res.status).toBe(500);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(revalidateTagMock).toHaveBeenCalledWith(
      "user-profile:user-tg-1",
      { expire: 0 },
    );
    expect(revalidateTagMock).toHaveBeenCalledWith("users", { expire: 0 });
  });

  it("handles missing SUPABASE_SERVICE_ROLE_KEY gracefully in status/[token], publik/[token], rating, and remote-ids", async () => {
    createAdminClientMock.mockImplementation(() => {
      throw new Error("SUPABASE_SERVICE_ROLE_KEY belum diset.");
    });

    const pageEl = PublicTicketStatusPage({
      params: Promise.resolve({ token: VALID_UUID }),
      searchParams: Promise.resolve({}),
    }) as { props: { children: unknown[] } };
    const suspenseEl = pageEl.props.children[1] as {
      props: { children: { type: (p: unknown) => Promise<unknown>; props: unknown } };
    };
    const loaderEl = suspenseEl.props.children;
    const renderedStatus = (await loaderEl.type(loaderEl.props)) as {
      props: { token: string; initialDetail: unknown; initialError: string };
    };
    expect(renderedStatus.props).toEqual({
      token: VALID_UUID,
      initialDetail: null,
      initialError: "Gagal memuat status tiket.",
    });

    const getRes = await publicTicketGet(
      new Request(`http://localhost:3000/api/tiket/publik/${VALID_UUID}`),
      { params: Promise.resolve({ token: VALID_UUID }) },
    );
    expect(getRes.status).toBe(500);
    expect(getRes.headers.get("cache-control")).toBe("no-store, private");
    expect(await getRes.json()).toEqual({ error: "Gagal memuat status tiket." });

    const ratingRes = await publicRatingPost(
      new Request(
        `http://localhost:3000/api/tiket/publik/${VALID_UUID}/rating`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rating: 5 }),
        },
      ),
      { params: Promise.resolve({ token: VALID_UUID }) },
    );
    expect(ratingRes.status).toBe(500);
    expect(ratingRes.headers.get("cache-control")).toBe("no-store, private");
    expect(await ratingRes.json()).toEqual({
      error: "Gagal menutup tiket. Silakan coba lagi.",
    });

    const remoteRes = await remoteIdsPost(
      new Request("http://localhost:3000/api/tiket/remote-ids", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nomorAset: "AST-0001" }),
      }),
    );
    expect(remoteRes.status).toBe(500);
    expect(remoteRes.headers.get("cache-control")).toBe("no-store, private");
    expect(await remoteRes.json()).toEqual({
      error: "Gagal mencari ID remote untuk aset.",
    });
  });

  it("rejects cross-origin Origin with 403 and Cache-Control: no-store on hardened mutation routes", async () => {
    const crossHeaders = {
      Origin: "https://evil.example.com",
      "Content-Type": "application/json",
    };

    const deleteSubRes = await subscribeDelete(
      new Request("http://localhost:3000/api/notifications/subscribe", {
        method: "DELETE",
        headers: { Origin: "https://evil.example.com" },
      }),
    );
    expect(deleteSubRes.status).toBe(403);
    expect(deleteSubRes.headers.get("cache-control")).toBe("no-store");

    const stokRes = await stokPost(
      new NextRequest("http://localhost:3000/api/stok", {
        method: "POST",
        headers: crossHeaders,
        body: "{}",
      }),
    );
    expect(stokRes.status).toBe(403);
    expect(stokRes.headers.get("cache-control")).toBe("no-store");

    const stokAdjustRes = await stokAdjustPost(
      new NextRequest("http://localhost:3000/api/stok/adjust", {
        method: "POST",
        headers: crossHeaders,
        body: "{}",
      }),
    );
    expect(stokAdjustRes.status).toBe(403);
    expect(stokAdjustRes.headers.get("cache-control")).toBe("no-store");

    const lampiranRes = await lampiranPost(
      new Request("http://localhost:3000/api/tiket/lampiran", {
        method: "POST",
        headers: { Origin: "https://evil.example.com" },
      }),
    );
    expect(lampiranRes.status).toBe(403);
    expect(lampiranRes.headers.get("cache-control")).toBe("no-store");

    const notifRes = await notifTiketBaruPost(
      new Request("http://localhost:3000/api/notif/tiket-baru", {
        method: "POST",
        headers: crossHeaders,
        body: "{}",
      }),
    );
    expect(notifRes.status).toBe(403);
    expect(notifRes.headers.get("cache-control")).toBe("no-store");

    const tgLinkCrossRes = await telegramLinkPost(
      new Request("http://localhost:3000/api/telegram/link", {
        method: "POST",
        headers: crossHeaders,
        body: "{}",
      }),
    );
    expect(tgLinkCrossRes.status).toBe(403);
    expect(tgLinkCrossRes.headers.get("cache-control")).toBe("no-store");

    const tgSyncCrossRes = await telegramSyncPost(
      new Request("http://localhost:3000/api/telegram/sync", {
        method: "POST",
        headers: crossHeaders,
      }),
    );
    expect(tgSyncCrossRes.status).toBe(403);
    expect(tgSyncCrossRes.headers.get("cache-control")).toBe("no-store");
  });

  it("sets Cache-Control: no-store on all responses of /api/telegram/link and /api/telegram/sync", async () => {
    const linkUnauth = await telegramLinkPost(
      new Request("http://localhost:3000/api/telegram/link", {
        method: "POST",
        headers: { Origin: "http://localhost:3000" },
      }),
    );
    expect(linkUnauth.status).toBe(401);
    expect(linkUnauth.headers.get("cache-control")).toBe("no-store");

    const syncUnauth = await telegramSyncPost(
      new Request("http://localhost:3000/api/telegram/sync", {
        method: "POST",
        headers: { Origin: "http://localhost:3000" },
      }),
    );
    expect(syncUnauth.status).toBe(401);
    expect(syncUnauth.headers.get("cache-control")).toBe("no-store");

    createClientMock.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: "user-tg-2" } },
          error: null,
        }),
      },
    });
    process.env.TELEGRAM_BOT_USERNAME = "debito_test_bot";
    const insert = vi.fn().mockResolvedValue({ error: null });
    createAdminClientMock.mockReturnValue({
      from: vi.fn().mockReturnValue({ insert }),
    });

    const linkOk = await telegramLinkPost(
      new Request("http://localhost:3000/api/telegram/link", {
        method: "POST",
        headers: { Origin: "http://localhost:3000" },
      }),
    );
    expect(linkOk.status).toBe(200);
    expect(linkOk.headers.get("cache-control")).toBe("no-store");
  });

  it("returns structured JSON 500 with Cache-Control: no-store when SUPABASE_SERVICE_ROLE_KEY is missing in /api/wiki/self-check and /api/tiket/publik", async () => {
    createAdminClientMock.mockImplementation(() => {
      throw new Error("SUPABASE_SERVICE_ROLE_KEY belum diset.");
    });

    const selfCheckRes = await wikiSelfCheckPost(
      new Request("http://localhost:3000/api/wiki/self-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deskripsi: "laptop tidak bisa connect wifi" }),
      }),
    );
    expect(selfCheckRes.status).toBe(500);
    expect(selfCheckRes.headers.get("cache-control")).toBe("no-store");
    expect(await selfCheckRes.json()).toEqual({
      error: "Gagal mencari artikel bantuan.",
    });

    const form = new FormData();
    form.set("nama", "Pelapor Uji");
    form.set("siteId", VALID_UUID);
    form.set("categoryId", VALID_UUID);
    form.set("deskripsi", "laptop tidak bisa connect wifi");
    form.set("penanganan", "remote");

    const publicRes = await publicTicketPost(
      new Request("http://localhost:3000/api/tiket/publik", {
        method: "POST",
        body: form,
      }),
    );
    expect(publicRes.status).toBe(500);
    expect(publicRes.headers.get("cache-control")).toBe("no-store");
    expect(await publicRes.json()).toEqual({
      error: "Gagal membuat tiket. Silakan coba lagi.",
    });
  });

  it("proxy.ts falls back cleanly when public Supabase env vars are missing even with sb-* cookie", async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    const req = new NextRequest("http://localhost:3000/dashboard", {
      headers: {
        cookie: "sb-proj-auth-token=stale-jwt",
      },
    });

    const res = await proxy(req);
    expect(res.status).toBe(200);
  });
});
