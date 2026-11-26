import Link from "next/link";
import PublicHeader from "@/components/layout/PublicHeader";

const SLA_ROWS = [
  { level: "P0", label: "Kritis / Down", respon: "5 menit", resolusi: "30 menit", tone: "bg-red-700 text-white" },
  { level: "P1", label: "Tinggi", respon: "15 menit", resolusi: "2 jam", tone: "bg-orange-700 text-white" },
  { level: "P2", label: "Sedang", respon: "30 menit", resolusi: "4 jam", tone: "bg-blue-100 text-blue-800 border border-blue-300" },
  { level: "P3", label: "Normal", respon: "2 jam", resolusi: "1 hari kerja", tone: "bg-slate-100 text-slate-800 border border-slate-300" },
];

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col bg-[var(--background)]">
      <PublicHeader />

      <main className="mx-auto flex w-full max-w-6xl flex-1 items-center px-4 py-10 sm:px-6 sm:py-16 lg:px-8">
        <div className="grid w-full items-center gap-8 lg:grid-cols-12 lg:gap-12">
          <section className="space-y-6 lg:col-span-7">
            <div className="inline-flex items-center gap-2 rounded-md border bg-[var(--surface)] px-2.5 py-1 text-xs font-medium text-[var(--secondary)]">
              <span aria-hidden="true" className="size-2 rounded-full bg-emerald-600" />
              Portal Layanan Aktif: Debito Jogja
            </div>

            <div className="space-y-3">
              <h1 className="text-3xl font-bold tracking-tight text-[var(--foreground)] sm:text-4xl">
                Layanan Bantuan IT Debito Jogja
              </h1>
              <p className="max-w-xl text-base leading-relaxed text-[var(--secondary)]">
                Laporkan gangguan perangkat, jaringan, VPN, aplikasi kerja, atau permintaan
                penggantian sparepart melalui satu sistem tiket terpadu dengan pemantauan SLA
                real-time.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Link
                href="/lapor"
                className="inline-flex min-h-11 items-center justify-center rounded-lg bg-[#1d4ed8] px-5 py-2.5 text-sm font-semibold text-white shadow-xs hover:bg-[#1e40af]"
              >
                Buat Tiket Gangguan
              </Link>
              <Link
                href="/login"
                className="inline-flex min-h-11 items-center justify-center rounded-lg border bg-[var(--surface)] px-5 py-2.5 text-sm font-medium text-[var(--foreground)] hover:bg-[var(--surface-muted)]"
              >
                Masuk Akun Staf
              </Link>
            </div>

            <p className="text-sm text-[var(--muted)]">
              Pelapor tanpa akun langsung menerima tautan pelacakan privat begitu tiket dikirim.
            </p>

            <div className="grid gap-3 border-t pt-5 sm:grid-cols-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                  Jam Layanan IT
                </p>
                <p className="mt-1 text-sm font-medium text-[var(--foreground)]">
                  Senin s.d. Jumat, 08.00 - 17.00 WIB
                </p>
                <p className="text-xs text-[var(--muted)]">
                  Insiden kritis P0 diprioritaskan segera.
                </p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                  Cakupan Bantuan
                </p>
                <div className="mt-1.5 flex flex-wrap gap-1.5 text-xs">
                  {["Jaringan & VPN", "Perangkat & Sparepart", "Genesys, MicroSIP & WPS", "Setup Laptop & Akses"].map((item) => (
                    <span
                      key={item}
                      className="rounded-md border bg-[var(--surface)] px-2 py-0.5 text-[var(--secondary)]"
                    >
                      {item}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </section>

          <aside className="rounded-xl border bg-[var(--surface)] p-5 shadow-xs sm:p-6 lg:col-span-5">
            <div className="mb-4 flex items-center justify-between gap-2 border-b pb-3">
              <div>
                <h2 className="text-sm font-semibold text-[var(--foreground)]">
                  Target SLA Penanganan
                </h2>
                <p className="text-xs text-[var(--muted)]">
                  Acuan waktu respon awal dan penyelesaian (WIB)
                </p>
              </div>
              <span className="rounded-md bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
                WIB
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs sm:text-sm">
                <thead className="border-b text-[var(--muted)]">
                  <tr>
                    <th className="py-2 pr-3 font-medium">Level</th>
                    <th className="py-2 pr-3 font-medium">Respon</th>
                    <th className="py-2 font-medium">Resolusi</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {SLA_ROWS.map((row) => (
                    <tr key={row.level}>
                      <td className="py-2.5 pr-3">
                        <div className="flex items-center gap-2">
                          <span
                            className={`inline-flex min-w-8 items-center justify-center rounded-md px-1.5 py-0.5 text-xs font-bold tabular-nums ${row.tone}`}
                          >
                            {row.level}
                          </span>
                          <span className="text-xs text-[var(--secondary)]">
                            {row.label}
                          </span>
                        </div>
                      </td>
                      <td className="py-2.5 pr-3 font-medium tabular-nums text-[var(--foreground)]">
                        {row.respon}
                      </td>
                      <td className="py-2.5 tabular-nums text-[var(--secondary)]">
                        {row.resolusi}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-4 rounded-lg border bg-[var(--surface-muted)] p-3 text-xs text-[var(--secondary)]">
              Permintaan sparepart (RAM, headset, mouse, kabel power, charger laptop) otomatis
              mengecek ketersediaan stok gudang secara langsung.
            </div>
          </aside>
        </div>
      </main>

      <footer className="border-t bg-[var(--surface)]">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-4 text-xs text-[var(--muted)] sm:px-6 lg:px-8">
          <span>IT Ticketing System · Debito Jogja</span>
          <div className="flex items-center gap-4">
            <Link href="/lapor" className="hover:text-[var(--foreground)] hover:underline">
              Form Publik
            </Link>
            <Link href="/login" className="hover:text-[var(--foreground)] hover:underline">
              Portal Staf
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
