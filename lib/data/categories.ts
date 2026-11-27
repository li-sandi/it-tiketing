import "server-only";

import { cacheLife, cacheTag } from "next/cache";
import type { CategoryOption } from "@/components/tiket/CategoryGroupSelector";
import type { Prioritas } from "@/lib/prioritas";
import { createAdminClient } from "@/lib/supabase/admin";

export type CategoryRecord = {
  id: string;
  nama: string;
  grup: string;
  tipe: "insiden" | "permintaan" | "internal";
  prioritas_default: Prioritas;
  prioritas_naik: unknown;
  butuh_aset: boolean;
  butuh_foto: boolean;
  bisa_remote: boolean;
  butuh_approval: boolean;
  aktif: boolean;
  stock_kode: string | null;
};

export async function getActiveCategories({
  includeInternal = false,
}: { includeInternal?: boolean } = {}): Promise<CategoryOption[]> {
  "use cache";
  cacheLife("hours");
  cacheTag("categories");

  const admin = createAdminClient();
  let query = admin
    .from("categories")
    .select(
      "id, nama, grup, tipe, prioritas_default, prioritas_naik, butuh_aset, butuh_foto, bisa_remote, stock_kode",
    )
    .eq("aktif", true);

  if (!includeInternal) {
    query = query.neq("tipe", "internal");
  }

  const { data, error } = await query.order("grup").order("nama");
  if (error) {
    throw new Error(`Gagal memuat kategori aktif: ${error.message}`);
  }

  return (data ?? []) as CategoryOption[];
}

export async function getAllCategories(): Promise<CategoryRecord[]> {
  "use cache";
  cacheLife("hours");
  cacheTag("categories");

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("categories")
    .select(
      "id, nama, grup, tipe, prioritas_default, prioritas_naik, butuh_aset, butuh_foto, bisa_remote, butuh_approval, aktif, stock_kode",
    )
    .order("grup")
    .order("nama");

  if (error) {
    throw new Error(`Gagal memuat semua kategori: ${error.message}`);
  }

  return (data ?? []) as CategoryRecord[];
}

export async function getCategoryById(
  id: string,
): Promise<CategoryRecord | null> {
  const categories = await getAllCategories();
  return categories.find((category) => category.id === id) ?? null;
}
