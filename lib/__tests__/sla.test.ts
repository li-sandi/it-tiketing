import { describe, expect, it } from "vitest";
import {
  addWorkingDaysWib,
  ambangWarningMenit,
  autoCloseDeadline,
  nextAgedPriority,
} from "@/lib/sla";

describe("SLA & Working Day WIB helpers", () => {
  it("computes warning thresholds per priority", () => {
    expect(ambangWarningMenit("P0")).toBe(2);
    expect(ambangWarningMenit("P1")).toBe(5);
    expect(ambangWarningMenit("P2")).toBe(15);
    expect(ambangWarningMenit("P3")).toBe(15);
  });

  it("skips Saturday and Sunday in Asia/Jakarta for P3 1 working day", () => {
    // Friday 2026-11-27 10:00 WIB = 2026-11-27T03:00:00.000Z
    const friday = new Date("2026-11-27T03:00:00.000Z");
    const nextWorkday = addWorkingDaysWib(friday, 1);
    // Monday 2026-11-30 10:00 WIB = 2026-11-30T03:00:00.000Z
    expect(nextWorkday.toISOString()).toBe("2026-11-30T03:00:00.000Z");
  });

  it("skips configured national holidays", () => {
    // Thursday 2026-12-24 09:00 WIB = 2026-12-24T02:00:00.000Z
    const dec24 = new Date("2026-12-24T02:00:00.000Z");
    const result = addWorkingDaysWib(dec24, 1, ["2026-12-25"]);
    // Skips 25 (holiday), 26 (Sat), 27 (Sun) -> lands Monday 2026-12-28 09:00 WIB
    expect(result.toISOString()).toBe("2026-12-28T02:00:00.000Z");
  });

  it("computes auto-close deadline matching each priority SLA", () => {
    const selesai = new Date("2026-11-26T02:00:00.000Z"); // Thursday 09:00 WIB
    expect(autoCloseDeadline(selesai, "P0").toISOString()).toBe("2026-11-26T02:30:00.000Z");
    expect(autoCloseDeadline(selesai, "P1").toISOString()).toBe("2026-11-26T04:00:00.000Z");
    expect(autoCloseDeadline(selesai, "P2").toISOString()).toBe("2026-11-26T06:00:00.000Z");
    expect(autoCloseDeadline(selesai, "P3").toISOString()).toBe("2026-11-27T02:00:00.000Z");
  });

  it("progresses aging priority one step at a time", () => {
    expect(nextAgedPriority("P3")).toBe("P2");
    expect(nextAgedPriority("P2")).toBe("P1");
    expect(nextAgedPriority("P1")).toBe("P0");
    expect(nextAgedPriority("P0")).toBeNull();
  });
});
