import { redirect } from "next/navigation";
import { connection } from "next/server";
import AppShell from "@/components/layout/AppShell";
import { loadReportData } from "@/lib/laporan";
import type { ReportPeriod } from "@/lib/laporan-metrics";
import { createClient } from "@/lib/supabase/server";

export const instant = false;

export default async function LaporanPage({
  searchParams,
}: {
  searchParams: Promise<{ periode?: string; tahun?: string; kuartal?: string }>;
}) {
  await connection();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("users")
    .select("nama, peran")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.peran !== "it" && profile?.peran !== "admin") {
    redirect("/dashboard");
  }

  const sp = await searchParams;
  const periode: ReportPeriod =
    sp.periode === "mingguan" ||
    sp.periode === "bulanan" ||
    sp.periode === "kuartalan"
      ? sp.periode
      : "bulanan";
  const currentYear = new Date().getUTCFullYear();
  const tahun = Number(sp.tahun) || currentYear;
  const kuartal = Number(sp.kuartal) || 1;

  const report = await loadReportData({ periode, tahun, kuartal });
  const exportHref = `/api/laporan/export?periode=${encodeURIComponent(periode)}&tahun=${tahun}&kuartal=${kuartal}`;

  return (
    <AppShell
      userName={profile.nama ?? user.email ?? "Pengguna"}
      userEmail={user.email}
      role={profile.peran}
      pageTitle="Laporan & Beban Kerja IT"
      pageSubtitle={`Periode laporan: ${report.rangeLabel}`}
      headerAction={
        <a
          href={exportHref}
          className="inline-flex min-h-9 items-center rounded-lg border bg-[var(--surface)] px-3.5 py-1.5 text-xs font-medium text-[var(--foreground)] hover:bg-[var(--surface-muted)]"
        >
          Unduh CSV
        </a>
      }
    >
      <form
        action="/laporan"
        method="get"
        className="flex flex-wrap items-end gap-3 rounded-xl border bg-[var(--surface)] p-4 text-sm shadow-xs"
      >
        <div>
          <label htmlFor="periode" className="mb-1 block text-xs font-medium text-[var(--muted)]">
            Periode
          </label>
          <select
            id="periode"
            name="periode"
            defaultValue={periode}
            className="rounded-lg border px-3 py-1.5 text-sm"
          >
            <option value="mingguan">Mingguan (7 Hari)</option>
            <option value="bulanan">Bulanan</option>
            <option value="kuartalan">Kuartalan</option>
          </select>
        </div>
        <div>
          <label htmlFor="tahun" className="mb-1 block text-xs font-medium text-[var(--muted)]">
            Tahun
          </label>
          <input
            id="tahun"
            name="tahun"
            type="number"
            defaultValue={tahun}
            className="w-24 rounded-lg border px-3 py-1.5 text-sm tabular-nums"
          />
        </div>
        <div>
          <label htmlFor="kuartal" className="mb-1 block text-xs font-medium text-[var(--muted)]">
            Kuartal
          </label>
          <select
            id="kuartal"
            name="kuartal"
            defaultValue={String(kuartal)}
            className="rounded-lg border px-3 py-1.5 text-sm"
          >
            <option value="1">Q1 (Jan-Mar)</option>
            <option value="2">Q2 (Apr-Jun)</option>
            <option value="3">Q3 (Jul-Sep)</option>
            <option value="4">Q4 (Okt-Des)</option>
          </select>
        </div>
        <button
          type="submit"
          className="min-h-10 rounded-lg bg-[#1d4ed8] px-4 py-1.5 text-sm font-medium text-white hover:bg-[#1e40af]"
        >
          Tampilkan
        </button>
      </form>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border bg-[var(--surface)] p-4 shadow-xs">
          <p className="text-xs font-medium text-[var(--muted)]">Total Tiket</p>
          <p className="mt-1.5 text-2xl font-bold tabular-nums text-[var(--foreground)]">
            {report.summary.totalTiket}
          </p>
          <p className="mt-1 text-xs tabular-nums text-[var(--muted)]">
            Aktif {report.summary.tiketAktif} · Selesai{" "}
            {report.summary.tiketSelesai}
          </p>
        </div>
        <div className="rounded-xl border bg-[var(--surface)] p-4 shadow-xs">
          <p className="text-xs font-medium text-[var(--muted)]">Kepatuhan SLA</p>
          <p className="mt-1.5 text-2xl font-bold tabular-nums text-[var(--foreground)]">
            {report.summary.slaPatuhPersen ?? "-"}%
          </p>
        </div>
        <div className="rounded-xl border bg-[var(--surface)] p-4 shadow-xs">
          <p className="text-xs font-medium text-[var(--muted)]">
            Rata-rata Respon / Resolusi
          </p>
          <p className="mt-1.5 text-lg font-bold tabular-nums text-[var(--foreground)]">
            {report.summary.rataResponMenit ?? "-"}m /{" "}
            {report.summary.rataResolusiMenit ?? "-"}m
          </p>
        </div>
        <div className="rounded-xl border bg-[var(--surface)] p-4 shadow-xs">
          <p className="text-xs font-medium text-[var(--muted)]">
            Total Poin &amp; Rating
          </p>
          <p className="mt-1.5 text-lg font-bold tabular-nums text-[var(--foreground)]">
            {report.summary.totalPoinKesulitan} poin ·{" "}
            {report.summary.rataRating ?? "-"} ★
          </p>
        </div>
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-base font-semibold text-[var(--foreground)]">
            Distribusi Beban Kerja Tim IT (Urut Nama)
          </h2>
          <p className="text-xs text-[var(--muted)]">
            Menampilkan beban kerja aktual per staf IT tanpa peringkat.
          </p>
        </div>
        <div className="overflow-x-auto rounded-xl border bg-[var(--surface)] shadow-xs">
          <table className="w-full text-left text-sm">
            <thead className="border-b bg-slate-50 text-xs uppercase text-[var(--muted)]">
              <tr>
                <th className="px-4 py-3 font-medium">Nama IT</th>
                <th className="px-4 py-3 font-medium">Aktif</th>
                <th className="px-4 py-3 font-medium">Selesai</th>
                <th className="px-4 py-3 font-medium">Total Poin</th>
                <th className="px-4 py-3 font-medium">Rata Poin</th>
                <th className="px-4 py-3 font-medium">Respon</th>
                <th className="px-4 py-3 font-medium">Resolusi</th>
                <th className="px-4 py-3 font-medium">SLA %</th>
                <th className="px-4 py-3 font-medium">Rating</th>
              </tr>
            </thead>
            <tbody className="divide-y tabular-nums">
              {report.workloadByIt.map((row) => (
                <tr key={row.itId} className="hover:bg-[var(--surface-muted)]">
                  <td className="px-4 py-3 font-medium text-[var(--foreground)]">
                    {row.nama}
                  </td>
                  <td className="px-4 py-3">{row.tiketAktif}</td>
                  <td className="px-4 py-3">{row.tiketSelesai}</td>
                  <td className="px-4 py-3">{row.totalPoin}</td>
                  <td className="px-4 py-3">{row.rataPoin ?? "-"}</td>
                  <td className="px-4 py-3">
                    {row.rataResponMenit != null ? `${row.rataResponMenit}m` : "-"}
                  </td>
                  <td className="px-4 py-3">
                    {row.rataResolusiMenit != null
                      ? `${row.rataResolusiMenit}m`
                      : "-"}
                  </td>
                  <td className="px-4 py-3">
                    {row.slaPatuhPersen != null ? `${row.slaPatuhPersen}%` : "-"}
                  </td>
                  <td className="px-4 py-3">{row.rataRating ?? "-"}</td>
                </tr>
              ))}
              {report.workloadByIt.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-6 text-center text-[var(--muted)]">
                    Belum ada data staf IT.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border bg-[var(--surface)] p-5 shadow-xs">
          <h3 className="mb-3 text-sm font-semibold text-[var(--foreground)]">
            Per Kelompok Kategori
          </h3>
          <ul className="space-y-2 text-sm tabular-nums">
            {report.byGroup.map((g) => (
              <li key={g.grup} className="flex justify-between gap-3">
                <span className="text-[var(--secondary)]">{g.grup}</span>
                <strong className="font-semibold text-[var(--foreground)]">{g.jumlah}</strong>
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-xl border bg-[var(--surface)] p-5 shadow-xs">
          <h3 className="mb-3 text-sm font-semibold text-[var(--foreground)]">
            Per Prioritas
          </h3>
          <ul className="space-y-2 text-sm tabular-nums">
            {report.byPriority.map((p) => (
              <li key={p.prioritas} className="flex justify-between gap-3">
                <span className="text-[var(--secondary)]">{p.prioritas}</span>
                <strong className="font-semibold text-[var(--foreground)]">{p.jumlah}</strong>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </AppShell>
  );
}
