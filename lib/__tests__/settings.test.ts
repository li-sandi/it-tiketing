import { beforeEach, describe, expect, it, vi } from "vitest";

const { cacheLifeMock, cacheTagMock, createAdminClientMock } = vi.hoisted(
  () => ({
    cacheLifeMock: vi.fn(),
    cacheTagMock: vi.fn(),
    createAdminClientMock: vi.fn(),
  }),
);

vi.mock("server-only", () => ({}));

vi.mock("next/cache", () => ({
  cacheLife: cacheLifeMock,
  cacheTag: cacheTagMock,
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: createAdminClientMock,
}));

import {
  getFeatureFlags,
  getRateLimitSetting,
  getSetting,
  getWeeklyReportSetting,
  getWorkingHours,
} from "@/lib/settings";

function mockSettingsQuery(result: {
  data: Array<{ kunci: string; nilai: unknown }> | null;
  error: { message: string } | null;
}) {
  const select = vi.fn().mockResolvedValue(result);
  const from = vi.fn().mockReturnValue({ select });
  createAdminClientMock.mockReturnValue({ from });
  return { from, select };
}

describe("lib/settings.ts consolidated settings cache", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("queries settings with cacheLife('hours') and cacheTag('settings') and merges overrides", async () => {
    const { from, select } = mockSettingsQuery({
      data: [
        {
          kunci: "feature_flags",
          nilai: { sleman_routing_enabled: true },
        },
        {
          kunci: "working_hours",
          nilai: { workdays: [1, 2, 3, 4, 5, 6] },
        },
        {
          kunci: "rate_limit",
          nilai: { public_limit: 50 },
        },
        {
          kunci: "weekly_report",
          nilai: { enabled: false, chat_ids: ["12345"] },
        },
      ],
      error: null,
    });

    expect(await getFeatureFlags()).toEqual({
      sleman_routing_enabled: true,
      ai_self_check_enabled: true,
      auto_close_follow_sla: true,
    });
    expect(await getWorkingHours()).toEqual({
      timezone: "Asia/Jakarta",
      workdays: [1, 2, 3, 4, 5, 6],
      holidays: [],
    });
    expect(await getRateLimitSetting()).toEqual({
      public_limit: 50,
      emergency_limit: 100,
      window_minutes: 15,
    });
    expect(await getWeeklyReportSetting()).toEqual({
      enabled: false,
      chat_ids: ["12345"],
    });

    expect(from).toHaveBeenCalledWith("settings");
    expect(select).toHaveBeenCalledWith("kunci, nilai");
    expect(cacheLifeMock).toHaveBeenCalledWith("hours");
    expect(cacheTagMock).toHaveBeenCalledWith("settings");
  });

  it("ignores non-object nilai values and returns fallback for unknown keys", async () => {
    mockSettingsQuery({
      data: [
        { kunci: "feature_flags", nilai: ["invalid-array"] },
        { kunci: "working_hours", nilai: null },
      ],
      error: null,
    });

    expect(await getFeatureFlags()).toEqual({
      sleman_routing_enabled: false,
      ai_self_check_enabled: true,
      auto_close_follow_sla: true,
    });
    expect(await getWorkingHours()).toEqual({
      timezone: "Asia/Jakarta",
      workdays: [1, 2, 3, 4, 5],
      holidays: [],
    });
    expect(await getSetting("non_existent", { ok: true })).toEqual({ ok: true });
  });

  it("returns fallback defaults when the DB query errors", async () => {
    mockSettingsQuery({
      data: null,
      error: { message: "upstream unavailable" },
    });

    await expect(getFeatureFlags()).resolves.toEqual({
      sleman_routing_enabled: false,
      ai_self_check_enabled: true,
      auto_close_follow_sla: true,
    });
    await expect(getRateLimitSetting()).resolves.toEqual({
      public_limit: 20,
      emergency_limit: 100,
      window_minutes: 15,
    });
  });

  it("ignores JSON __proto__ payloads without polluting Object.prototype", async () => {
    const maliciousJson = JSON.parse(
      '{"__proto__":{"polluted":true},"public_limit":42}',
    ) as Record<string, unknown>;

    mockSettingsQuery({
      data: [
        {
          kunci: "__proto__",
          nilai: { polluted: true },
        },
        {
          kunci: "rate_limit",
          nilai: maliciousJson,
        },
      ],
      error: null,
    });

    const rateLimit = await getRateLimitSetting();
    expect(rateLimit.public_limit).toBe(42);
    expect(({} as { polluted?: unknown }).polluted).toBeUndefined();
    expect(
      (Object.prototype as { polluted?: unknown }).polluted,
    ).toBeUndefined();

    const customSetting = await getSetting("safe_key", { ok: true });
    expect(customSetting).toEqual({ ok: true });
    expect(
      (Object.prototype as { polluted?: unknown }).polluted,
    ).toBeUndefined();
  });
});
