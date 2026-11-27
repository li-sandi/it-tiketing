import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  cacheLifeMock,
  cacheTagMock,
  createAdminClientMock,
  cookiesSpy,
  headersSpy,
} = vi.hoisted(() => ({
  cacheLifeMock: vi.fn(),
  cacheTagMock: vi.fn(),
  createAdminClientMock: vi.fn(),
  cookiesSpy: vi.fn(() => {
    throw new Error("cookies() must not be called inside use cache");
  }),
  headersSpy: vi.fn(() => {
    throw new Error("headers() must not be called inside use cache");
  }),
}));

vi.mock("server-only", () => ({}));

vi.mock("next/cache", () => ({
  cacheLife: cacheLifeMock,
  cacheTag: cacheTagMock,
}));

vi.mock("next/headers", () => ({
  cookies: cookiesSpy,
  headers: headersSpy,
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: createAdminClientMock,
}));

import { getAssetsList } from "@/lib/data/assets";
import {
  getActiveCategories,
  getAllCategories,
  getCategoryById,
} from "@/lib/data/categories";
import { getUpcomingSlemanSchedule } from "@/lib/data/schedule";
import { getActiveSites, getAllSites, getSiteById } from "@/lib/data/sites";
import { getInventoryStocks, getStockByKode } from "@/lib/data/stocks";
import { getAllUsersAdmin, getItStaffList } from "@/lib/data/users";
import { getPublishedPublicWikiArticles, getWikiArticles } from "@/lib/data/wiki";

function makeChainBuilder(result: { data: unknown; error: { message: string } | null }) {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const builder: Record<string, unknown> = {
    select: (...args: unknown[]) => {
      calls.push({ method: "select", args });
      return builder;
    },
    eq: (...args: unknown[]) => {
      calls.push({ method: "eq", args });
      return builder;
    },
    neq: (...args: unknown[]) => {
      calls.push({ method: "neq", args });
      return builder;
    },
    gte: (...args: unknown[]) => {
      calls.push({ method: "gte", args });
      return builder;
    },
    order: (...args: unknown[]) => {
      calls.push({ method: "order", args });
      return builder;
    },
    limit: (...args: unknown[]) => {
      calls.push({ method: "limit", args });
      return builder;
    },
    then: (
      onFulfilled?: (val: typeof result) => unknown,
      onRejected?: (err: unknown) => unknown,
    ) => Promise.resolve(result).then(onFulfilled, onRejected),
  };

  const from = vi.fn().mockReturnValue(builder);
  createAdminClientMock.mockReturnValue({ from });
  return { from, calls };
}

describe("lib/data/* cached reference DAL", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("categories: enforces includeInternal scoping, cache tags/life, and throws on error", async () => {
    const publicChain = makeChainBuilder({
      data: [{ id: "cat-1", nama: "WiFi", tipe: "insiden" }],
      error: null,
    });
    const publicCats = await getActiveCategories();
    expect(publicCats).toHaveLength(1);
    expect(publicChain.from).toHaveBeenCalledWith("categories");
    expect(publicChain.calls).toContainEqual({ method: "eq", args: ["aktif", true] });
    expect(publicChain.calls).toContainEqual({
      method: "neq",
      args: ["tipe", "internal"],
    });
    expect(cacheLifeMock).toHaveBeenCalledWith("hours");
    expect(cacheTagMock).toHaveBeenCalledWith("categories");

    const staffChain = makeChainBuilder({
      data: [
        { id: "cat-1", nama: "WiFi", tipe: "insiden" },
        { id: "cat-2", nama: "Server Maintenance", tipe: "internal" },
      ],
      error: null,
    });
    const staffCats = await getActiveCategories({ includeInternal: true });
    expect(staffCats).toHaveLength(2);
    expect(
      staffChain.calls.some((call) => call.method === "neq"),
    ).toBe(false);

    makeChainBuilder({
      data: [
        { id: "cat-1", nama: "WiFi", aktif: true },
        { id: "cat-3", nama: "Legacy", aktif: false },
      ],
      error: null,
    });
    expect((await getAllCategories())).toHaveLength(2);
    expect(await getCategoryById("cat-3")).toMatchObject({ id: "cat-3" });
    expect(await getCategoryById("missing")).toBeNull();

    makeChainBuilder({ data: null, error: { message: "cat db err" } });
    await expect(getActiveCategories()).rejects.toThrow(/cat db err/);
    expect(cookiesSpy).not.toHaveBeenCalled();
    expect(headersSpy).not.toHaveBeenCalled();
  });

  it("sites: caches active/all sites and resolves getSiteById", async () => {
    const activeChain = makeChainBuilder({
      data: [{ id: "site-1", nama: "Jogja", jumlah_user: 50, punya_it: true, aktif: true }],
      error: null,
    });
    expect(await getActiveSites()).toHaveLength(1);
    expect(activeChain.calls).toContainEqual({ method: "eq", args: ["aktif", true] });
    expect(cacheLifeMock).toHaveBeenCalledWith("hours");
    expect(cacheTagMock).toHaveBeenCalledWith("sites");

    makeChainBuilder({
      data: [
        { id: "site-1", nama: "Jogja", aktif: true },
        { id: "site-2", nama: "Sleman", aktif: false },
      ],
      error: null,
    });
    expect(await getAllSites()).toHaveLength(2);
    expect(await getSiteById("site-2")).toMatchObject({ nama: "Sleman" });
    expect(await getSiteById("unknown")).toBeNull();

    makeChainBuilder({ data: null, error: { message: "sites err" } });
    await expect(getAllSites()).rejects.toThrow(/sites err/);
  });

  it("stocks: caches inventory_stocks with 'minutes' and resolves getStockByKode", async () => {
    const chain = makeChainBuilder({
      data: [{ id: "st-1", kode: "ssd_256", nama: "SSD 256GB", jumlah_stok: 4 }],
      error: null,
    });

    const stocks = await getInventoryStocks();
    expect(stocks).toHaveLength(1);
    expect(chain.from).toHaveBeenCalledWith("inventory_stocks");
    expect(cacheLifeMock).toHaveBeenCalledWith("minutes");
    expect(cacheTagMock).toHaveBeenCalledWith("stocks");
    expect(await getStockByKode("ssd_256")).toMatchObject({ id: "st-1" });
    expect(await getStockByKode("missing")).toBeNull();

    makeChainBuilder({ data: null, error: { message: "stock err" } });
    await expect(getInventoryStocks()).rejects.toThrow(/stock err/);
  });

  it("wiki: enforces includeDrafts/includeInternal scoping, getPublishedPublicWikiArticles, and caches with 'wiki' tag", async () => {
    const pubChain = makeChainBuilder({
      data: [{ id: "w-1", judul: "Reset VPN", status: "published", is_internal: false }],
      error: null,
    });
    expect(await getWikiArticles()).toHaveLength(1);
    expect(pubChain.from).toHaveBeenCalledWith("knowledge_articles");
    expect(pubChain.calls).toContainEqual({
      method: "eq",
      args: ["status", "published"],
    });
    expect(pubChain.calls).toContainEqual({
      method: "eq",
      args: ["is_internal", false],
    });
    expect(pubChain.calls).toContainEqual({ method: "limit", args: [100] });
    expect(cacheLifeMock).toHaveBeenCalledWith("hours");
    expect(cacheTagMock).toHaveBeenCalledWith("wiki");

    const staffChain = makeChainBuilder({
      data: [
        { id: "w-1", status: "published", is_internal: false },
        { id: "w-2", status: "draft", is_internal: true },
      ],
      error: null,
    });
    expect(await getWikiArticles({ includeDrafts: true })).toHaveLength(2);
    expect(
      staffChain.calls.some(
        (call) => call.method === "eq" && call.args[0] === "status",
      ),
    ).toBe(false);
    expect(
      staffChain.calls.some(
        (call) => call.method === "eq" && call.args[0] === "is_internal",
      ),
    ).toBe(false);

    const publicPortalChain = makeChainBuilder({
      data: [{ id: "w-3", judul: "Panduan Printer", status: "published", is_internal: false }],
      error: null,
    });
    expect(await getPublishedPublicWikiArticles()).toHaveLength(1);
    expect(publicPortalChain.calls).toContainEqual({
      method: "eq",
      args: ["status", "published"],
    });
    expect(publicPortalChain.calls).toContainEqual({
      method: "eq",
      args: ["is_internal", false],
    });
    expect(cacheTagMock).toHaveBeenCalledWith("wiki");

    makeChainBuilder({ data: null, error: { message: "wiki err" } });
    await expect(getWikiArticles()).rejects.toThrow(/wiki err/);

    makeChainBuilder({ data: null, error: { message: "public wiki err" } });
    await expect(getPublishedPublicWikiArticles()).rejects.toThrow(/public wiki err/);
    expect(cookiesSpy).not.toHaveBeenCalled();
    expect(headersSpy).not.toHaveBeenCalled();
  });

  it("assets, users, and schedule: use cookie-free admin client with explicit tags and error propagation", async () => {
    const assetsChain = makeChainBuilder({
      data: [{ id: "a-1", nomor_aset: "IT-001" }],
      error: null,
    });
    expect(await getAssetsList()).toHaveLength(1);
    expect(assetsChain.from).toHaveBeenCalledWith("assets");
    expect(cacheLifeMock).toHaveBeenCalledWith("minutes");
    expect(cacheTagMock).toHaveBeenCalledWith("assets");

    const itChain = makeChainBuilder({
      data: [{ id: "u-1", nama: "Teknisi A" }],
      error: null,
    });
    expect(await getItStaffList()).toHaveLength(1);
    expect(itChain.calls).toContainEqual({ method: "eq", args: ["peran", "it"] });
    expect(cacheTagMock).toHaveBeenCalledWith("users");

    const usersChain = makeChainBuilder({
      data: [{ id: "u-1", nama: "Teknisi A", peran: "it" }],
      error: null,
    });
    expect(await getAllUsersAdmin()).toHaveLength(1);
    expect(usersChain.from).toHaveBeenCalledWith("users");

    const schedChain = makeChainBuilder({
      data: [{ id: "sc-1", tanggal: "2026-11-27", it_id: "u-1" }],
      error: null,
    });
    expect(await getUpcomingSlemanSchedule("2026-11-26")).toHaveLength(1);
    expect(schedChain.from).toHaveBeenCalledWith("it_schedule");
    expect(schedChain.calls).toContainEqual({
      method: "eq",
      args: ["jenis", "kunjungan_sleman"],
    });
    expect(schedChain.calls).toContainEqual({
      method: "gte",
      args: ["tanggal", "2026-11-26"],
    });
    expect(cacheTagMock).toHaveBeenCalledWith("schedule");

    makeChainBuilder({ data: null, error: { message: "sched err" } });
    await expect(getUpcomingSlemanSchedule("2026-11-26")).rejects.toThrow(
      /sched err/,
    );
    expect(cookiesSpy).not.toHaveBeenCalled();
    expect(headersSpy).not.toHaveBeenCalled();
  });
});
