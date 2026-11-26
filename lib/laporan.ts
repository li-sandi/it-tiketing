import "server-only";

import {
  computeWorkloadMetrics,
  formatPeriodRange,
  type ReportPeriod,
  type ReportTicketRow,
} from "@/lib/laporan-metrics";
import { createAdminClient } from "@/lib/supabase/admin";

export async function loadReportData(params: {
  periode: ReportPeriod;
  tahun: number;
  kuartal: number;
}) {
  const range = formatPeriodRange(params);
  const admin = createAdminClient();

  const [
    { data: tickets, error: ticketsError },
    { data: staff, error: staffError },
    { data: categories, error: catError },
  ] = await Promise.all([
    admin
      .from("tickets")
      .select(
        "id, nomor_tiket, prioritas, status, it_id, category_id, poin_kesulitan, rating, dibuat_pada, diproses_pada, selesai_pada, sla_respon_batas, sla_resolusi_batas",
      )
      .gte("dibuat_pada", range.start.toISOString())
      .lt("dibuat_pada", range.end.toISOString())
      .order("dibuat_pada", { ascending: false }),
    admin
      .from("users")
      .select("id, nama")
      .eq("peran", "it")
      .order("nama"),
    admin
      .from("categories")
      .select("id, nama, grup"),
  ]);

  if (ticketsError) throw new Error(`Gagal memuat data tiket: ${ticketsError.message}`);
  if (staffError) throw new Error(`Gagal memuat data staf IT: ${staffError.message}`);
  if (catError) throw new Error(`Gagal memuat data kategori: ${catError.message}`);

  const rows = (tickets ?? []) as ReportTicketRow[];
  const metrics = computeWorkloadMetrics(rows, staff ?? []);
  const categoryMap = new Map(
    (categories ?? []).map((c) => [c.id, { nama: c.nama, grup: c.grup ?? "Lainnya" }]),
  );

  const byGroup = new Map<string, number>();
  const byCategory = new Map<string, { nama: string; grup: string; count: number }>();
  const byPriority = new Map<string, number>([
    ["P0", 0],
    ["P1", 0],
    ["P2", 0],
    ["P3", 0],
  ]);

  for (const row of rows) {
    byPriority.set(row.prioritas, (byPriority.get(row.prioritas) ?? 0) + 1);
    const cat = categoryMap.get(row.category_id) ?? { nama: "Lainnya", grup: "Lainnya" };
    byGroup.set(cat.grup, (byGroup.get(cat.grup) ?? 0) + 1);
    const current = byCategory.get(row.category_id) ?? {
      nama: cat.nama,
      grup: cat.grup,
      count: 0,
    };
    current.count++;
    byCategory.set(row.category_id, current);
  }

  return {
    rangeLabel: range.label,
    startIso: range.start.toISOString(),
    endIso: range.end.toISOString(),
    tickets: rows,
    ...metrics,
    byPriority: Array.from(byPriority.entries()).map(([prioritas, jumlah]) => ({
      prioritas,
      jumlah,
    })),
    byGroup: Array.from(byGroup.entries())
      .map(([grup, jumlah]) => ({ grup, jumlah }))
      .sort((a, b) => b.jumlah - a.jumlah),
    byCategory: Array.from(byCategory.values()).sort((a, b) => b.count - a.count),
  };
}
