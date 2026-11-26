import { NextResponse } from "next/server";
import { cekCronSecret } from "@/lib/cron-auth";
import { loadReportData } from "@/lib/laporan";
import { getWeeklyReportSetting } from "@/lib/settings";
import { createAdminClient } from "@/lib/supabase/admin";
import { escapeHtml, kirimPesan } from "@/lib/telegram";

function currentIsoWeekKey(date = new Date()): string {
  const wib = new Date(date.getTime() + 7 * 60 * 60 * 1000);
  const yearStart = new Date(Date.UTC(wib.getUTCFullYear(), 0, 1));
  const diffDays = Math.floor(
    (wib.getTime() - yearStart.getTime()) / (24 * 60 * 60 * 1000),
  );
  const week = Math.ceil((diffDays + yearStart.getUTCDay() + 1) / 7);
  return `${wib.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export async function GET(request: Request) {
  if (!cekCronSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const setting = await getWeeklyReportSetting();
    if (!setting.enabled) {
      return NextResponse.json({ ok: true, skipped: "disabled" });
    }

    const admin = createAdminClient();
    const weekKey = currentIsoWeekKey();
    const force = new URL(request.url).searchParams.get("force") === "1";

    if (!force) {
      const { data: existing } = await admin
        .from("bot_state")
        .select("value")
        .eq("key", "weekly_report_last_week")
        .maybeSingle();
      if (existing?.value === weekKey) {
        return NextResponse.json({ ok: true, skipped: "already_sent", weekKey });
      }
    }

    const report = await loadReportData({
      periode: "mingguan",
      tahun: new Date().getUTCFullYear(),
      kuartal: 1,
    });

    const { data: admins } = await admin
      .from("users")
      .select("telegram_id")
      .eq("peran", "admin")
      .not("telegram_id", "is", null);

    const chatIds = Array.from(
      new Set([
        ...(admins ?? [])
          .map((a) => a.telegram_id)
          .filter((id): id is string => Boolean(id)),
        ...setting.chat_ids,
      ]),
    );

    const topCategories = report.byCategory
      .slice(0, 5)
      .map((c) => `• ${escapeHtml(c.nama)}: ${c.count}`)
      .join("\n");

    const workloadLines = report.workloadByIt
      .map(
        (w) =>
          `• ${escapeHtml(w.nama)}: ${w.tiketSelesai} selesai, ${w.tiketAktif} aktif, ${w.totalPoin} poin`,
      )
      .join("\n");

    const message = `📊 <b>Laporan Mingguan Layanan IT (${escapeHtml(weekKey)})</b>
Periode: ${escapeHtml(report.rangeLabel)}

<b>Ringkasan:</b>
• Total tiket: ${report.summary.totalTiket} (Aktif: ${report.summary.tiketAktif}, Selesai: ${report.summary.tiketSelesai})
• Kepatuhan SLA: ${report.summary.slaPatuhPersen ?? "-"}%
• Rata-rata respon: ${report.summary.rataResponMenit ?? "-"} menit
• Rata-rata resolusi: ${report.summary.rataResolusiMenit ?? "-"} menit
• Rata-rata rating: ${report.summary.rataRating ?? "-"} / 5

<b>Kategori Terbanyak:</b>
${topCategories || "• Belum ada tiket"}

<b>Beban Kerja Tim IT:</b>
${workloadLines || "• Belum ada data"}`;

    let sent = 0;
    for (const chatIdRaw of chatIds) {
      const chatId = Number(chatIdRaw);
      if (!Number.isSafeInteger(chatId)) continue;
      try {
        await kirimPesan(chatId, message);
        sent++;
      } catch (err) {
        console.error(`Gagal kirim weekly report ke ${chatId}:`, err);
      }
    }

    await admin
      .from("bot_state")
      .upsert(
        { key: "weekly_report_last_week", value: weekKey },
        { onConflict: "key" },
      );

    return NextResponse.json({ ok: true, weekKey, sent });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Gagal membuat laporan mingguan.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
