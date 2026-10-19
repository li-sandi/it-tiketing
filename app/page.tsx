import Link from "next/link";

export default function Home() {
  return (
    <main className="flex flex-1 items-center justify-center bg-gray-50 px-4 py-16">
      <section className="w-full max-w-xl rounded-lg border bg-white p-8 text-center shadow-sm">
        <h1 className="text-3xl font-semibold">Layanan IT</h1>
        <p className="mt-3 text-gray-600">
          Laporkan gangguan atau permintaan bantuan IT melalui formulir tiket.
        </p>
        <Link
          href="/lapor"
          className="mt-6 inline-flex rounded bg-black px-5 py-3 text-white hover:bg-gray-800"
        >
          Buat tiket
        </Link>
        <p className="mt-4 text-sm text-gray-500">
          Setelah mengirim laporan, simpan link rahasia untuk memantau tiket.
        </p>
      </section>
    </main>
  );
}
