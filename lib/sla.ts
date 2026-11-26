import type { Prioritas } from "@/lib/prioritas";

export function ambangWarningMenit(prioritas: string): number {
  switch (prioritas) {
    case "P0":
      return 2;
    case "P1":
      return 5;
    case "P2":
    case "P3":
    default:
      return 15;
  }
}

export function slaMinutesForPriority(prioritas: string): {
  responMinutes: number;
  resolusiMinutes: number;
  resolusiWorkingDays: number | null;
} {
  switch (prioritas) {
    case "P0":
      return { responMinutes: 5, resolusiMinutes: 30, resolusiWorkingDays: null };
    case "P1":
      return { responMinutes: 15, resolusiMinutes: 120, resolusiWorkingDays: null };
    case "P2":
      return { responMinutes: 30, resolusiMinutes: 240, resolusiWorkingDays: null };
    case "P3":
    default:
      return { responMinutes: 120, resolusiMinutes: 1440, resolusiWorkingDays: 1 };
  }
}

export function nextAgedPriority(prioritas: string): Prioritas | null {
  switch (prioritas) {
    case "P3":
      return "P2";
    case "P2":
      return "P1";
    case "P1":
      return "P0";
    default:
      return null;
  }
}

const JAKARTA_OFFSET_MS = 7 * 60 * 60 * 1000;

export function addWorkingDaysWib(
  start: Date,
  days: number,
  holidays: readonly string[] = [],
): Date {
  if (days <= 0) return new Date(start.getTime());

  const holidaySet = new Set(holidays);
  // Shift to UTC+7 wall clock representation inside UTC getters
  const shifted = new Date(start.getTime() + JAKARTA_OFFSET_MS);
  let remaining = days;

  while (remaining > 0) {
    shifted.setUTCDate(shifted.getUTCDate() + 1);
    const dayOfWeek = shifted.getUTCDay();
    const dateKey = shifted.toISOString().slice(0, 10);
    if (dayOfWeek !== 0 && dayOfWeek !== 6 && !holidaySet.has(dateKey)) {
      remaining--;
    }
  }

  return new Date(shifted.getTime() - JAKARTA_OFFSET_MS);
}

export function autoCloseDeadline(
  selesaiPada: Date,
  prioritas: string,
  holidays: readonly string[] = [],
): Date {
  const target = slaMinutesForPriority(prioritas);
  if (target.resolusiWorkingDays !== null) {
    return addWorkingDaysWib(selesaiPada, target.resolusiWorkingDays, holidays);
  }
  return new Date(selesaiPada.getTime() + target.resolusiMinutes * 60 * 1000);
}
