import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import AppShell from "@/components/layout/AppShell";
import TicketForm from "@/components/tiket/TicketForm";
import { createClient } from "@/lib/supabase/server";

export const instant = false;

export default async function NewTicketPage() {
  await connection();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profil, error: profileError } = await supabase
    .from("users")
    .select("id, nama, site_id, peran")
    .eq("id", user.id)
    .maybeSingle();

  const userName = profil?.nama ?? user.email ?? "Pengguna";
  const role = profil?.peran ?? "user";

  if (profileError) {
    return (
      <AppShell
        userName={userName}
        userEmail={user.email}
        role={role}
        pageTitle="Buat Tiket Baru"
      >
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Gagal memuat profil: {profileError.message}
        </p>
      </AppShell>
    );
  }

  let siteId = profil?.site_id ?? null;
  let jumlahUserSite = 400;

  if (siteId) {
    const { data: site } = await supabase
      .from("sites")
      .select("jumlah_user")
      .eq("id", siteId)
      .maybeSingle();
    if (site) jumlahUserSite = site.jumlah_user;
  } else {
    const { data: defaultSite } = await supabase
      .from("sites")
      .select("id, jumlah_user")
      .eq("aktif", true)
      .limit(1)
      .maybeSingle();
    if (defaultSite) {
      siteId = defaultSite.id;
      jumlahUserSite = defaultSite.jumlah_user;
    }
  }

  const isItOrAdmin = role === "it" || role === "admin";
  let categoriesQuery = supabase
    .from("categories")
    .select(
      "id, nama, grup, tipe, prioritas_default, prioritas_naik, butuh_aset, butuh_foto, bisa_remote, stock_kode",
    )
    .eq("aktif", true);

  if (!isItOrAdmin) {
    categoriesQuery = categoriesQuery.neq("tipe", "internal");
  }

  const [{ data: categories, error: categoriesError }, { data: stocks }] =
    await Promise.all([
      categoriesQuery.order("grup").order("nama"),
      supabase
        .from("inventory_stocks")
        .select("id, kode, nama, satuan, jumlah_stok, stok_minimum, catatan")
        .order("nama"),
    ]);

  return (
    <AppShell
      userName={userName}
      userEmail={user.email}
      role={role}
      pageTitle="Buat Tiket Baru"
      pageSubtitle="Pilih kelompok kategori dan jelaskan kendala agar tim IT dapat segera menindaklanjuti."
      headerAction={
        <Link
          href="/tiket"
          className="inline-flex min-h-9 items-center rounded-lg border bg-[var(--surface)] px-3 py-1.5 text-xs font-medium text-[var(--foreground)] hover:bg-[var(--surface-muted)]"
        >
          Daftar Tiket
        </Link>
      }
    >
      <div className="mx-auto w-full max-w-3xl rounded-xl border bg-[var(--surface)] p-5 shadow-xs sm:p-7">
        {categoriesError ? (
          <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            Gagal memuat kategori: {categoriesError.message}
          </p>
        ) : !categories?.length ? (
          <p className="rounded-lg border bg-[var(--surface-muted)] p-4 text-sm text-[var(--secondary)]">
            Belum ada kategori aktif. Hubungi admin untuk mengaktifkan kategori.
          </p>
        ) : (
          <TicketForm
            categories={categories}
            stocks={stocks ?? []}
            userId={user.id}
            siteId={siteId}
            jumlahUserSite={jumlahUserSite}
          />
        )}
      </div>
    </AppShell>
  );
}
