const JAKARTA_DATE_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Jakarta",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function getJakartaDate(date = new Date()) {
  const parts = JAKARTA_DATE_FORMATTER.formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  if (!year || !month || !day) {
    throw new Error("Gagal menentukan tanggal saat ini.");
  }

  return `${year}-${month}-${day}`;
}

export function getNextScheduleStartDate(jakartaDate = getJakartaDate()) {
  const date = new Date(`${jakartaDate}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    throw new Error("Tanggal jadwal tidak valid.");
  }

  const weekday = date.getUTCDay();
  const daysUntilTuesday = weekday <= 2 ? 2 - weekday : 9 - weekday;
  date.setUTCDate(date.getUTCDate() + daysUntilTuesday);

  return date.toISOString().slice(0, 10);
}

export function addDaysToDate(dateString: string, days: number) {
  const date = new Date(`${dateString}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    throw new Error("Tanggal jadwal tidak valid.");
  }

  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
