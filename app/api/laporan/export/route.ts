import { NextResponse } from "next/server";
import { loadReportData } from "@/lib/laporan";
import { escapeCsvCell, type ReportPeriod } from "@/lib/laporan-metrics";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Belum login." }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("users")
    .select("peran")
    .eq("id", user.id)
    .maybeSingle();
  if (profile?.peran !== "it" && profile?.peran !== "admin") {
    return NextResponse.json({ error: "Akses staf IT/admin diperlukan." }, { status: 403 });
  }

  const params = new URL(request.url).searchParams;
  const rawPeriod = params.get("periode");
  const periode: ReportPeriod =
    rawPeriod === "mingguan" || rawPeriod === "bulanan" || rawPeriod === "kuartalan"
      ? rawPeriod
      : "bulanan";
  const tahun = Number(params.get("tahun")) || new Date().getUTCFullYear();
  const kuartal = Number(params.get("kuartal")) || 1;

  const report = await loadReportData({ periode, tahun, kuartal });
  const header = [
    "Nomor Tiket",
    "Prioritas",
    "Status",
    "Poin Kesulitan",
    "Rating",
    "Dibuat Pada",
    "Diproses Pada",
    "Selesai Pada",
    "Batas Resolusi",
  ].join(",");

  const lines = report.tickets.map((t) =>
    [
      escapeCsvCell(t.nomor_tiket),
      escapeCsvCell(t.prioritas),
      escapeCsvCell(t.status),
      escapeCsvCell(t.poin_kesulitan),
      escapeCsvCell(t.rating),
      escapeCsvCell(t.dibuat_pada),
      escapeCsvCell(t.diproses_pada),
      escapeCsvCell(t.selesai_pada),
      escapeCsvCell(t.sla_resolusi_batas),
    ].join(","),
  );

  const csv = `${header}\n${lines.join("\n")}\n`;
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="laporan-it-${periode}-${tahun}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
