import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  createClientMock,
  createAdminClientMock,
  revalidateTagMock,
  revalidatePathMock,
  getAdminUserMock,
  logAdminActionMock,
  getFeatureFlagsMock,
} = vi.hoisted(() => ({
  createClientMock: vi.fn(),
  createAdminClientMock: vi.fn(),
  revalidateTagMock: vi.fn(),
  revalidatePathMock: vi.fn(),
  getAdminUserMock: vi.fn(),
  logAdminActionMock: vi.fn(),
  getFeatureFlagsMock: vi.fn(),
}));

vi.mock("server-only", () => ({}));

vi.mock("next/cache", () => ({
  revalidateTag: revalidateTagMock,
  revalidatePath: revalidatePathMock,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: createClientMock,
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: createAdminClientMock,
}));

vi.mock("@/lib/admin-auth", () => ({
  getAdminUser: getAdminUserMock,
}));

vi.mock("@/lib/admin-audit", () => ({
  logAdminAction: logAdminActionMock,
}));

vi.mock("@/lib/settings", () => ({
  getFeatureFlags: getFeatureFlagsMock,
}));

vi.mock("@/lib/laporan", () => ({
  loadReportData: vi.fn(),
}));

import { GET as stokGet, POST as stokPost } from "@/app/api/stok/route";
import { GET as laporanExportGet } from "@/app/api/laporan/export/route";
import { POST as generateJadwalPost } from "@/app/api/admin/generate-jadwal/route";
import { POST as wikiSelfCheckPost } from "@/app/api/wiki/self-check/route";

describe("M1 API bug fixes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("GET /api/stok returns Cache-Control: no-store on 401, 500, and 200; POST rejects invalid stokMinimum", async () => {
    createClientMock.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
    });
    const res401 = await stokGet();
    expect(res401.status).toBe(401);
    expect(res401.headers.get("cache-control")).toBe("no-store");

    createClientMock.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: "u-1" } } }),
      },
      from: vi.fn((table: string) => {
        if (table === "users") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi
                  .fn()
                  .mockResolvedValue({ data: { peran: "it" }, error: null }),
              }),
            }),
          };
        }
        return {
          select: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({
              data: null,
              error: { message: "db fail" },
            }),
          }),
        };
      }),
    });
    const res500 = await stokGet();
    expect(res500.status).toBe(500);
    expect(res500.headers.get("cache-control")).toBe("no-store");

    createClientMock.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: "u-1" } } }),
      },
      from: vi.fn((table: string) => {
        if (table === "users") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi
                  .fn()
                  .mockResolvedValue({ data: { peran: "user" }, error: null }),
              }),
            }),
          };
        }
        return {
          select: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({
              data: [{ id: "st-1", kode: "ssd_256", nama: "SSD" }],
              error: null,
            }),
          }),
        };
      }),
    });
    const res200 = await stokGet();
    expect(res200.status).toBe(200);
    expect(res200.headers.get("cache-control")).toBe("no-store");

    createClientMock.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: "u-1" } } }),
      },
      from: vi.fn(() => ({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi
              .fn()
              .mockResolvedValue({ data: { peran: "it" }, error: null }),
          }),
        }),
      })),
    });
    const badPostReq = new NextRequest("http://localhost:3000/api/stok", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kode: "ssd_256",
        nama: "SSD 256",
        stokMinimum: "bukan-angka",
      }),
    });
    const res400 = await stokPost(badPostReq);
    expect(res400.status).toBe(400);
    expect(res400.headers.get("cache-control")).toBe("no-store");

    for (const invalidValue of [-5, "", true, 1.5]) {
      const coercedReq = new NextRequest("http://localhost:3000/api/stok", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kode: "ssd_256",
          nama: "SSD 256",
          stokMinimum: invalidValue,
        }),
      });
      const coercedRes = await stokPost(coercedReq);
      expect(coercedRes.status).toBe(400);
      expect(coercedRes.headers.get("cache-control")).toBe("no-store");
    }
  });

  it("GET /api/laporan/export sets Cache-Control: no-store on 401 and 403", async () => {
    createClientMock.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
    });
    const res401 = await laporanExportGet(
      new Request("http://localhost:3000/api/laporan/export"),
    );
    expect(res401.status).toBe(401);
    expect(res401.headers.get("cache-control")).toBe("no-store");

    createClientMock.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: "u-1" } } }),
      },
      from: vi.fn(() => ({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi
              .fn()
              .mockResolvedValue({ data: { peran: "user" }, error: null }),
          }),
        }),
      })),
    });
    const res403 = await laporanExportGet(
      new Request("http://localhost:3000/api/laporan/export"),
    );
    expect(res403.status).toBe(403);
    expect(res403.headers.get("cache-control")).toBe("no-store");
  });

  it("POST /api/admin/generate-jadwal records admin audit log via logAdminAction", async () => {
    const adminId = "11111111-1111-1111-1111-111111111111";
    const it1 = "22222222-2222-2222-2222-222222222222";
    const it2 = "33333333-3333-3333-3333-333333333333";
    const siteId = "44444444-4444-4444-4444-444444444444";

    getAdminUserMock.mockResolvedValue({ user: { id: adminId } });

    createAdminClientMock.mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === "users") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                in: vi.fn().mockResolvedValue({
                  data: [{ id: it1 }, { id: it2 }],
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === "sites") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { id: siteId },
                  error: null,
                }),
              }),
            }),
          };
        }
        throw new Error(`Unexpected table: ${table}`);
      }),
      rpc: vi.fn().mockResolvedValue({ data: 16, error: null }),
    });

    const req = new Request("http://localhost:3000/api/admin/generate-jadwal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ staffIds: [it1, it2], siteId }),
    });
    const res = await generateJadwalPost(req);
    expect(res.status).toBe(200);
    expect(revalidateTagMock).toHaveBeenCalledWith("schedule", { expire: 0 });
    expect(logAdminActionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        aktorId: adminId,
        aksi: "create",
        entitas: "jadwal",
        entitasId: siteId,
      }),
    );
  });

  it("POST /api/wiki/self-check validates categoryId UUID and enforces is_internal = false on both queries", async () => {
    getFeatureFlagsMock.mockResolvedValue({ ai_self_check_enabled: true });

    const invalidReq = new Request("http://localhost:3000/api/wiki/self-check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        deskripsi: "Printer kantor macet",
        categoryId: "bukan-uuid",
      }),
    });
    const invalidRes = await wikiSelfCheckPost(invalidReq);
    expect(invalidRes.status).toBe(400);
    expect(invalidRes.headers.get("cache-control")).toBe("no-store");

    const eqCalls: Array<[string, unknown]> = [];
    const makeBuilder = (data: unknown[]) => {
      const builder: Record<string, unknown> = {
        select: vi.fn(() => builder),
        eq: vi.fn((col: string, val: unknown) => {
          eqCalls.push([col, val]);
          return builder;
        }),
        textSearch: vi.fn(() => builder),
        limit: vi.fn(() => builder),
        then: (
          onFulfilled?: (val: { data: unknown[]; error: null }) => unknown,
          onRejected?: (err: unknown) => unknown,
        ) => Promise.resolve({ data, error: null }).then(onFulfilled, onRejected),
      };
      return builder;
    };

    createAdminClientMock.mockReturnValue({
      from: vi.fn(() => makeBuilder([])),
    });

    const validCategoryId = "55555555-5555-5555-5555-555555555555";
    const validReq = new Request("http://localhost:3000/api/wiki/self-check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        deskripsi: "Koneksi internet lambat",
        categoryId: validCategoryId,
      }),
    });
    const validRes = await wikiSelfCheckPost(validReq);
    expect(validRes.status).toBe(200);
    expect(validRes.headers.get("cache-control")).toBe("no-store");

    const internalFilters = eqCalls.filter(
      ([col, val]) => col === "is_internal" && val === false,
    );
    expect(internalFilters.length).toBe(2);
  });
});
