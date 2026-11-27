import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  cacheLifeMock,
  cacheTagMock,
  createClientMock,
  createAdminClientMock,
  getClaimsMock,
  getUserMock,
} = vi.hoisted(() => ({
  cacheLifeMock: vi.fn(),
  cacheTagMock: vi.fn(),
  createClientMock: vi.fn(),
  createAdminClientMock: vi.fn(),
  getClaimsMock: vi.fn(),
  getUserMock: vi.fn(),
}));

vi.mock("server-only", () => ({}));

vi.mock("next/cache", () => ({
  cacheLife: cacheLifeMock,
  cacheTag: cacheTagMock,
  revalidateTag: vi.fn(),
  updateTag: vi.fn(),
}));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    cache: <T extends (...args: never[]) => unknown>(fn: T) => fn,
  };
});

vi.mock("@/lib/supabase/server", () => ({
  createClient: createClientMock,
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: createAdminClientMock,
}));

import {
  getCurrentUserProfile,
  getCurrentUserSession,
  requireAuthUser,
  requireStrictAuthProfile,
  requireStrictAuthUser,
} from "@/lib/auth";

function createUsersQueryMock(result: { data: unknown; error: { message: string } | null }) {
  const maybeSingle = vi.fn().mockResolvedValue(result);
  const eq = vi.fn().mockReturnValue({ maybeSingle });
  const select = vi.fn().mockReturnValue({ eq });
  const from = vi.fn().mockReturnValue({ select });
  return { from, select, eq, maybeSingle };
}

describe("lib/auth.ts centralized auth & profile DAL", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createClientMock.mockResolvedValue({
      auth: {
        getClaims: getClaimsMock,
        getUser: getUserMock,
      },
      from: vi.fn(),
    });
  });

  it("getCurrentUserSession returns null when claims are missing or errored", async () => {
    getClaimsMock.mockResolvedValueOnce({
      data: null,
      error: { message: "No session" },
    });
    expect(await getCurrentUserSession()).toBeNull();
    expect(cacheLifeMock).toHaveBeenCalledWith({
      stale: 60,
      revalidate: 60,
      expire: 300,
    });

    getClaimsMock.mockResolvedValueOnce({
      data: { claims: {} },
      error: null,
    });
    expect(await getCurrentUserSession()).toBeNull();
  });

  it("getCurrentUserSession rejects non-string/empty sub and coerces non-string email to null", async () => {
    getClaimsMock.mockResolvedValueOnce({
      data: { claims: { sub: 12345, email: "user@example.com" } },
      error: null,
    });
    expect(await getCurrentUserSession()).toBeNull();

    getClaimsMock.mockResolvedValueOnce({
      data: { claims: { sub: "", email: "user@example.com" } },
      error: null,
    });
    expect(await getCurrentUserSession()).toBeNull();

    getClaimsMock.mockResolvedValueOnce({
      data: { claims: { sub: "user-789", email: 999 } },
      error: null,
    });
    expect(await getCurrentUserSession()).toEqual({ id: "user-789", email: null });

    getClaimsMock.mockResolvedValueOnce({
      data: { claims: { sub: "user-789", email: { nested: true } } },
      error: null,
    });
    expect(await getCurrentUserSession()).toEqual({ id: "user-789", email: null });
  });

  it("getCurrentUserSession returns narrow AuthSession for valid claims", async () => {
    getClaimsMock.mockResolvedValueOnce({
      data: { claims: { sub: "user-123", email: "user@example.com" } },
      error: null,
    });

    const session = await getCurrentUserSession();
    expect(session).toEqual({ id: "user-123", email: "user@example.com" });

    getClaimsMock.mockResolvedValueOnce({
      data: { claims: { sub: "user-456" } },
      error: null,
    });

    const sessionNoEmail = await getCurrentUserSession();
    expect(sessionNoEmail).toEqual({ id: "user-456", email: null });
  });

  it("getCurrentUserProfile skips DB query when unauthenticated", async () => {
    getClaimsMock.mockResolvedValueOnce({
      data: { claims: null },
      error: null,
    });

    const profile = await getCurrentUserProfile();
    expect(profile).toBeNull();
    expect(createAdminClientMock).not.toHaveBeenCalled();
  });

  it("getCurrentUserProfile loads profile row via cookie-free admin client with opaque userId tag", async () => {
    getClaimsMock.mockResolvedValueOnce({
      data: { claims: { sub: "user-123", email: "budi@example.com" } },
      error: null,
    });

    const query = createUsersQueryMock({
      data: {
        id: "user-123",
        nama: "Budi",
        peran: "it",
        site_id: "site-1",
        telegram_id: "998877",
      },
      error: null,
    });
    createAdminClientMock.mockReturnValue({ from: query.from });

    const profile = await getCurrentUserProfile();

    expect(profile).toEqual({
      id: "user-123",
      nama: "Budi",
      email: "budi@example.com",
      peran: "it",
      site_id: "site-1",
      telegram_id: "998877",
    });
    expect(query.from).toHaveBeenCalledWith("users");
    expect(query.select).toHaveBeenCalledWith(
      "id, nama, peran, site_id, telegram_id",
    );
    expect(query.eq).toHaveBeenCalledWith("id", "user-123");
    expect(cacheTagMock).toHaveBeenCalledWith("users", "user-profile:user-123");
    expect(cacheLifeMock).toHaveBeenCalledWith("minutes");
    for (const call of cacheTagMock.mock.calls) {
      expect(call.join("|")).not.toContain("budi@example.com");
    }
  });

  it("getCurrentUserProfile returns null when DB row does not exist and throws on DB error", async () => {
    getClaimsMock.mockResolvedValue({
      data: { claims: { sub: "user-123", email: "budi@example.com" } },
      error: null,
    });

    const missingQuery = createUsersQueryMock({ data: null, error: null });
    createAdminClientMock.mockReturnValueOnce({ from: missingQuery.from });
    expect(await getCurrentUserProfile()).toBeNull();

    const errorQuery = createUsersQueryMock({
      data: null,
      error: { message: "connection timeout" },
    });
    createAdminClientMock.mockReturnValueOnce({ from: errorQuery.from });
    await expect(getCurrentUserProfile()).rejects.toThrow(
      /Gagal memuat profil user: connection timeout/,
    );

    const recoveryQuery = createUsersQueryMock({
      data: {
        id: "user-123",
        nama: "Budi",
        peran: "it",
        site_id: null,
        telegram_id: null,
      },
      error: null,
    });
    createAdminClientMock.mockReturnValueOnce({ from: recoveryQuery.from });
    expect(await getCurrentUserProfile()).toMatchObject({
      id: "user-123",
      nama: "Budi",
    });
  });

  it("requireAuthUser enforces live getUser() and never uses getClaims()", async () => {
    expect(requireStrictAuthUser).toBe(requireAuthUser);

    getUserMock.mockResolvedValueOnce({
      data: { user: null },
      error: { message: "invalid jwt" },
    });
    expect(await requireAuthUser()).toBeNull();
    expect(getClaimsMock).not.toHaveBeenCalled();

    const userObj = { id: "user-1", email: "admin@example.com" };
    getUserMock.mockResolvedValueOnce({
      data: { user: userObj },
      error: null,
    });
    const result = await requireAuthUser();
    expect(result?.user).toEqual(userObj);
    expect(getUserMock).toHaveBeenCalledTimes(2);
  });

  it("requireStrictAuthProfile returns live role and throws on DB error", async () => {
    const queryOk = createUsersQueryMock({
      data: { peran: "admin" },
      error: null,
    });
    createClientMock.mockResolvedValueOnce({
      auth: { getClaims: getClaimsMock, getUser: getUserMock },
      from: queryOk.from,
    });
    getUserMock.mockResolvedValueOnce({
      data: { user: { id: "user-1" } },
      error: null,
    });

    const res = await requireStrictAuthProfile();
    expect(res?.peran).toBe("admin");
    expect(queryOk.select).toHaveBeenCalledWith("peran");

    const queryErr = createUsersQueryMock({
      data: null,
      error: { message: "db error" },
    });
    createClientMock.mockResolvedValueOnce({
      auth: { getClaims: getClaimsMock, getUser: getUserMock },
      from: queryErr.from,
    });
    getUserMock.mockResolvedValueOnce({
      data: { user: { id: "user-1" } },
      error: null,
    });

    await expect(requireStrictAuthProfile()).rejects.toThrow(
      /Gagal memeriksa peran akun: db error/,
    );
  });
});
