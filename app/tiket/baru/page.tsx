import Link from "next/link";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import TicketForm from "@/components/tiket/TicketForm";
import { createClient } from "@/lib/supabase/server";

export const instant = false;

export default async function TiketBaruPage() {
  await connection();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profil, error: profileError } = await supabase
    .from("users")
    .select("id, nama, site_id")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) {
    return (
      <main className="mx-auto w-full max-w-2xl p-8">
        <p role="alert" className="text-red-700">
          Gagal memuat profil: {profileError.message}
        </p>
      </main>
    );
  }

  let jumlahUserSite = 0;
  if (profil?.site_id) {
    const { data: site, error: siteError } = await supabase
      .from("sites")
      .select("jumlah_user")
      .eq("id", profil.site_id)
      .maybeSingle();

    if (siteError) {
      return (
        <main className="mx-auto w-full max-w-2xl p-8">
          <p role="alert" className="text-red-700">
            Gagal memuat data site: {siteError.message}
          </p>
        </main>
      );
    }
    jumlahUserSite = site?.jumlah_user ?? 0;
  }

  const { data: categories, error: categoriesError } = await supabase
    .from("categories")
    .select(
      "id, nama, tipe, prioritas_default, prioritas_naik, butuh_aset, bisa_remote",
    )
    .eq("aktif", true)
    .order("nama");

  return (
    <main className="mx-auto w-full max-w-2xl p-8">
      <div className="mb-6 flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">Buat Tiket Baru</h1>
        <Link href="/tiket" className="text-sm underline">
          Kembali ke tiket
        </Link>
      </div>

      {categoriesError ? (
        <p role="alert" className="rounded border border-red-300 p-4 text-red-700">
          Gagal memuat kategori: {categoriesError.message}
        </p>
      ) : !categories?.length ? (
        <p className="rounded border p-4 text-gray-700">
          Belum ada kategori aktif. Tambahkan kategori aktif di Supabase
          sebelum membuat tiket.
        </p>
      ) : (
        <TicketForm
          categories={categories}
          userId={user.id}
          siteId={profil?.site_id ?? null}
          jumlahUserSite={jumlahUserSite}
        />
      )}
    </main>
  );
}
