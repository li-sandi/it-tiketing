import "server-only";

import { cacheLife, cacheTag } from "next/cache";
import type { InventoryStockItem } from "@/lib/stok";
import { createAdminClient } from "@/lib/supabase/admin";

export async function getInventoryStocks(): Promise<InventoryStockItem[]> {
  "use cache";
  cacheLife("minutes");
  cacheTag("stocks");

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("inventory_stocks")
    .select(
      "id, kode, nama, satuan, jumlah_stok, stok_minimum, catatan, updated_at",
    )
    .order("nama");

  if (error) {
    throw new Error(`Gagal memuat stok sparepart: ${error.message}`);
  }

  return (data ?? []) as InventoryStockItem[];
}

export async function getStockByKode(
  kode: string,
): Promise<InventoryStockItem | null> {
  const stocks = await getInventoryStocks();
  return stocks.find((stock) => stock.kode === kode) ?? null;
}
