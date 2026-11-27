import "server-only";

import { cacheLife, cacheTag } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";

export type AssetListRecord = {
  id: string;
  nomor_aset: string;
  nama_perangkat: string;
  tipe: string;
  ram_gb: number | null;
  site_id: string | null;
  pemegang_nama: string | null;
  anydesk_id: string | null;
  uv_id: string | null;
  status: string;
  sites?: { nama: string } | { nama: string }[] | null;
};

export async function getAssetsList(): Promise<AssetListRecord[]> {
  "use cache";
  cacheLife("minutes");
  cacheTag("assets");

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("assets")
    .select("*, sites(nama)")
    .order("nomor_aset");

  if (error) {
    throw new Error(`Gagal memuat data aset: ${error.message}`);
  }

  return (data ?? []) as AssetListRecord[];
}
