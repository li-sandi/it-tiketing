import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

export type FeatureFlags = {
  sleman_routing_enabled: boolean;
  ai_self_check_enabled: boolean;
  auto_close_follow_sla: boolean;
};

export type WorkingHoursSetting = {
  timezone: string;
  workdays: number[];
  holidays: string[];
};

export type RateLimitSetting = {
  public_limit: number;
  emergency_limit: number;
  window_minutes: number;
};

export type WeeklyReportSetting = {
  enabled: boolean;
  chat_ids: string[];
};

const DEFAULT_FEATURE_FLAGS: FeatureFlags = {
  sleman_routing_enabled: false,
  ai_self_check_enabled: true,
  auto_close_follow_sla: true,
};

const DEFAULT_WORKING_HOURS: WorkingHoursSetting = {
  timezone: "Asia/Jakarta",
  workdays: [1, 2, 3, 4, 5],
  holidays: [],
};

const DEFAULT_RATE_LIMIT: RateLimitSetting = {
  public_limit: 20,
  emergency_limit: 100,
  window_minutes: 15,
};

const DEFAULT_WEEKLY_REPORT: WeeklyReportSetting = {
  enabled: true,
  chat_ids: [],
};

export async function getSetting<T extends Record<string, unknown>>(
  kunci: string,
  fallback: T,
): Promise<T> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("settings")
      .select("nilai")
      .eq("kunci", kunci)
      .maybeSingle();
    if (error || !data?.nilai || typeof data.nilai !== "object") {
      return fallback;
    }
    return { ...fallback, ...(data.nilai as Partial<T>) };
  } catch {
    return fallback;
  }
}

export function getFeatureFlags() {
  return getSetting<FeatureFlags>("feature_flags", DEFAULT_FEATURE_FLAGS);
}

export function getWorkingHours() {
  return getSetting<WorkingHoursSetting>("working_hours", DEFAULT_WORKING_HOURS);
}

export function getRateLimitSetting() {
  return getSetting<RateLimitSetting>("rate_limit", DEFAULT_RATE_LIMIT);
}

export function getWeeklyReportSetting() {
  return getSetting<WeeklyReportSetting>("weekly_report", DEFAULT_WEEKLY_REPORT);
}
