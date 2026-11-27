import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import AdminLoading from "@/app/(app)/admin/loading";
import { getCurrentUserProfile } from "@/lib/auth";
import { getFeatureFlags } from "@/lib/settings";

const adminSections = [
  {
    href: "/admin/kategori",
    title: "Kelola Kategori",
    description:
      "Tambah, kelompokkan, hubungkan stok sparepart, dan atur prioritas tiap kategori.",
  },
  {
    href: "/admin/sites",
    title: "Kelola Site",
    description:
      "Atur site aktif (Debito Jogja), jumlah user untuk ambang P0, dan ketersediaan IT.",
  },
  {
    href: "/admin/users",
    title: "Kelola User",
    description: "Ubah peran (User, IT, GA, Admin) dan site untuk akun terdaftar.",
  },
  {
    href: "/aset",
    title: "Inventaris Aset",
    description:
      "Kelola nomor aset perangkat, kapasitas RAM, import CSV, serta ID AnyDesk/UV statis.",
  },
  {
    href: "/stok",
    title: "Stok Sparepart & Pengadaan",
    description:
      "Kelola stok RAM, Headset, Mouse, Kabel Power, dan Charger Laptop (GA + IT/Admin).",
  },
  {
    href: "/admin/pengaturan",
    title: "Pengaturan & Hari Libur",
    description:
      "Atur tanggal libur hari kerja P3, batas rate limit, feature flag, dan laporan mingguan.",
  },
  {
    href: "/admin/audit",
    title: "Audit Log",
    description:
      "Pantau riwayat perubahan kategori, site, peran pengguna, dan pengaturan sistem.",
  },
  {
    href: "/admin/jadwal",
    title: "Jadwal Kunjungan",
    description:
      "Kelola jadwal kunjungan dinamis saat routing multi-site diaktifkan.",
    requiresSlemanFlag: true,
  },
];

async function AdminModulesGrid() {
  const profile = await getCurrentUserProfile();
  if (!profile) redirect("/login");
  if (profile.peran !== "admin") redirect("/dashboard");

  const flags = await getFeatureFlags();
  const visibleSections = adminSections.filter(
    (s) => !s.requiresSlemanFlag || flags.sleman_routing_enabled,
  );

  return (
    <section className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {visibleSections.map((section) => (
          <Link
            key={section.href}
            href={section.href}
            className="group flex flex-col justify-between rounded-xl border bg-[var(--surface)] p-5 shadow-xs hover:border-blue-300 hover:bg-[var(--surface-muted)]"
          >
            <div>
              <h2 className="text-base font-semibold text-[var(--foreground)] group-hover:text-blue-700">
                {section.title}
              </h2>
              <p className="mt-1.5 text-sm text-[var(--secondary)]">
                {section.description}
              </p>
            </div>
            <span className="mt-4 inline-block text-xs font-semibold text-blue-700">
              Buka modul
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}

export default function AdminPage() {
  return (
    <Suspense fallback={<AdminLoading />}>
      <AdminModulesGrid />
    </Suspense>
  );
}
