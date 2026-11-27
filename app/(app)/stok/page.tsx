import { Suspense } from "react";
import { redirect } from "next/navigation";
import StokLoading from "@/app/(app)/stok/loading";
import StokClient from "@/components/stok/StokClient";
import { getCurrentUserProfile } from "@/lib/auth";
import { getInventoryStocks } from "@/lib/data/stocks";
import { createClient } from "@/lib/supabase/server";

async function StokContent() {
  const [profile, supabase] = await Promise.all([
    getCurrentUserProfile(),
    createClient(),
  ]);
  if (!profile) redirect("/login");
  if (!["ga", "it", "admin"].includes(profile.peran)) {
    redirect("/dashboard");
  }

  const [stocksResult, { data: movements }, { data: pendingTickets }] =
    await Promise.all([
      getInventoryStocks().then(
        (data) => ({ data, error: null as string | null }),
        (err: unknown) => ({
          data: [],
          error:
            err instanceof Error
              ? err.message
              : "Gagal memuat stok sparepart.",
        }),
      ),
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

  if (stocksResult.error) {
    return (
      <p
        role="alert"
        className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700"
      >
        Gagal memuat stok sparepart: {stocksResult.error}
      </p>
    );
  }

  return (
    <StokClient
      initialStocks={stocksResult.data}
      initialMovements={
        (movements ?? []) as unknown as Parameters<
          typeof StokClient
        >[0]["initialMovements"]
      }
      pendingTickets={pendingTickets ?? []}
      role={profile.peran}
    />
  );
}

export default function StokPage() {
  return (
    <Suspense fallback={<StokLoading />}>
      <StokContent />
    </Suspense>
  );
}
