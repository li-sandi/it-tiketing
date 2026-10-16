import Link from "next/link";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PrioritasBadge, StatusBadge } from "@/components/tiket/StatusBadge";

export const instant = false;

export default async function TiketPage() {
  await connection();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile, error: profileError } = await supabase
    .from("users")
    .select("peran")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) {
    return (
      <main className="mx-auto w-full max-w-3xl p-8">
        <p role="alert" className="text-red-700">
          Gagal memeriksa profil: {profileError.message}
        </p>
      </main>
    );
  }

  const isStaff = profile?.peran === "it" || profile?.peran === "admin";
  let query = supabase
    .from("tickets")
    .select(
      "id, nomor_tiket, deskripsi, status, prioritas, dibuat_pada, categories(nama)",
    );
  if (!isStaff) query = query.eq("pembuat_id", user.id);
  const { data: tickets, error } = await query.order("dibuat_pada", {
    ascending: false,
  });

  return (
    <main className="mx-auto w-full max-w-3xl p-8">
      <div className="mb-6 flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">Tiket Saya</h1>
        <Link
          href="/tiket/baru"
          className="rounded bg-black px-4 py-2 text-white hover:bg-gray-800"
        >
          + Tiket Baru
        </Link>
      </div>

      {error ? (
        <p role="alert" className="rounded border border-red-300 p-4 text-red-700">
          Gagal memuat tiket: {error.message}
        </p>
      ) : !tickets?.length ? (
        <p className="text-gray-500">Belum ada tiket.</p>
      ) : (
        <ul className="space-y-2">
          {tickets.map((ticket) => {
            const category = Array.isArray(ticket.categories)
              ? ticket.categories[0]
              : ticket.categories;

            return (
              <li key={ticket.id} className="rounded border p-4">
                <Link href={`/tiket/${ticket.id}`} className="block">
                <p className="font-mono text-xs text-gray-500">
                  {ticket.nomor_tiket ?? "Nomor tiket belum tersedia"}
                </p>
                  <p className="font-medium">{category?.nama ?? "Kategori"}</p>
                  <p className="truncate text-sm text-gray-700">
                    {ticket.deskripsi}
                  </p>
                  <div className="mt-2 flex gap-2">
                    <PrioritasBadge prioritas={ticket.prioritas} />
                    <StatusBadge status={ticket.status} />
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
