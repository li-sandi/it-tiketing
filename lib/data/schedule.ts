import "server-only";

import { cacheLife, cacheTag } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";

export type SlemanScheduleRecord = {
  id: string;
  tanggal: string;
  it_id: string;
};

export async function getUpcomingSlemanSchedule(
  fromDate: string,
): Promise<SlemanScheduleRecord[]> {
  "use cache";
  cacheLife("minutes");
  cacheTag("schedule");

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("it_schedule")
    .select("id, tanggal, it_id")
    .eq("jenis", "kunjungan_sleman")
    .gte("tanggal", fromDate)
    .order("tanggal", { ascending: true });

  if (error) {
    throw new Error(`Gagal memuat jadwal kunjungan: ${error.message}`);
  }

  return (data ?? []) as SlemanScheduleRecord[];
}
