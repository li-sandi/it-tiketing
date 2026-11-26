import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import AppShell from "@/components/layout/AppShell";
import StokClient from "@/components/stok/StokClient";
import { createClient } from "@/lib/supabase/server";

export const instant = false;

export default async function StokPage() {
  await connection();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile, error: profileError } = await supabase
    .from("users")
    .select("id, nama, peran")
    .eq("id", user.id)
    .maybeSingle();

  const userName = profile?.nama ?? user.email ?? "Pengguna";

  if (profileError) {
    return (
      <AppShell
        userName={user.email ?? "Pengguna"}
        userEmail={user.email}
        role="user"
        pageTitle="Stok Sparepart & Pengadaan"
      >
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Gagal memuat profil: {profileError.message}
        </p>
      </AppShell>
    );
  }

  if (!profile || !["ga", "it", "admin"].includes(profile.peran)) {
    redirect("/dashboard");
  }

  const [
    { data: stocks, error: stocksError },
    { data: movements },
    { data: pendingTickets },
  ] = await Promise.all([
    supabase
      .from("inventory_stocks")
      .select("id, kode, nama, satuan, jumlah_stok, stok_minimum, catatan, updated_at")
      .order("nama"),
    supabase
      .from("stock_movements")
      .select(
        "id, jenis, perubahan, stok_sebelum, stok_sesudah, catatan, dibuat_pada, stock_id, ticket_id, inventory_stocks(kode, nama, satuan), users:aktor_id(nama), tickets:ticket_id(nomor_tiket)",
      )
      .order("dibuat_pada", { ascending: false })
      .limit(50),
    supabase
      .from("tickets")
      .select(
        "id, nomor_tiket, stock_kode, estimasi_pengadaan, prioritas, dibuat_pada, categories(nama)",
      )
      .eq("status", "menunggu_pengadaan")
      .order("dibuat_pada", { ascending: true }),
  ]);

  return (
    <AppShell
      userName={userName}
      userEmail={user.email}
      role={profile.peran}
      pageTitle="Stok Sparepart & Pengadaan"
      pageSubtitle="Pantau dan perbarui stok RAM, Headset, Mouse, Kabel Power, serta Charger Laptop."
      headerAction={
        (profile.peran === "it" || profile.peran === "admin") && (
          <Link
            href="/antrian"
            className="inline-flex min-h-9 items-center rounded-lg border bg-[var(--surface)] px-3 py-1.5 text-xs font-medium text-[var(--foreground)] hover:bg-[var(--surface-muted)]"
          >
            Antrian IT
          </Link>
        )
      }
    >
      {stocksError ? (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Gagal memuat stok sparepart: {stocksError.message}
        </p>
      ) : (
        <StokClient
          initialStocks={stocks ?? []}
          initialMovements={
            (movements ?? []) as unknown as Parameters<
              typeof StokClient
            >[0]["initialMovements"]
          }
          pendingTickets={pendingTickets ?? []}
          role={profile.peran}
        />
      )}
    </AppShell>
  );
}
