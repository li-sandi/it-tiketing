import Link from "next/link";

const adminSections = [
  {
    href: "/admin/kategori",
    title: "Kelola Kategori",
    description:
      "Atur kategori tiket yang tersedia dan aktif di form pelaporan.",
  },
  {
    href: "/admin/users",
    title: "Kelola User",
    description: "Ubah peran dan site untuk akun yang terdaftar.",
  },
  {
    href: "/admin/jadwal",
    title: "Jadwal Kunjungan",
    description:
      "Lihat dan generate jadwal kunjungan Sleman untuk delapan minggu.",
  },
];

export default function AdminPage() {
  return (
    <section>
      <h1 className="mb-2 text-2xl font-bold">Admin Panel</h1>
      <p className="mb-6 text-sm text-gray-600">
        Pilih bagian yang ingin dikelola.
      </p>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {adminSections.map((section) => (
          <Link
            key={section.href}
            href={section.href}
            className="group rounded-lg border bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-md focus-visible:outline-offset-4"
          >
            <h2 className="mb-2 font-semibold text-blue-700 group-hover:text-blue-800">
              {section.title}
            </h2>
            <p className="text-sm text-gray-600">{section.description}</p>
            <span className="mt-4 inline-block text-sm font-medium text-blue-700">
              Buka halaman <span aria-hidden="true">→</span>
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
