import { createClient } from "@/lib/supabase/server";
import { connection } from "next/server";
import Link from "next/link";
import { redirect } from "next/navigation";

export const instant = false;

export default async function DashboardPage() {
  await connection();

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profil, error: profileError } = await supabase
    .from("users")
    .select("nama, peran, site_id")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) {
    return (
      <main className="p-8">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p role="alert" className="mt-4 text-red-700">
          Gagal memuat profil: {profileError.message}
        </p>
      </main>
    );
  }

  const isStaff = profil?.peran === "it" || profil?.peran === "admin";

  return (
    <main className="p-8">
      <h1 className="text-2xl font-semibold">Dashboard</h1>
      <p className="mt-2">Halo, {profil?.nama ?? user.email}</p>
      <p className="text-sm text-gray-600">
        Peran: {profil?.peran ?? "Belum diatur"}
      </p>
      <div className="mt-6 flex gap-3">
        <Link href="/tiket" className="rounded border px-4 py-2">
          Tiket Saya
        </Link>
        <Link href="/tiket/baru" className="rounded bg-black px-4 py-2 text-white">
          Buat Tiket
        </Link>
        {isStaff && (
          <Link
            href="/antrian"
            className="rounded bg-black px-4 py-2 text-sm text-white"
          >
            Buka Antrian IT
          </Link>
        )}
      </div>
    </main>
  );
}
