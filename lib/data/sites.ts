import "server-only";

import { cacheLife, cacheTag } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";

export type SiteRecord = {
  id: string;
  nama: string;
  jumlah_user: number;
  punya_it: boolean;
  aktif: boolean;
};

export async function getActiveSites(): Promise<SiteRecord[]> {
  "use cache";
  cacheLife("hours");
  cacheTag("sites");

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("sites")
    .select("id, nama, jumlah_user, punya_it, aktif")
    .eq("aktif", true)
    .order("nama");

  if (error) {
    throw new Error(`Gagal memuat daftar site aktif: ${error.message}`);
  }

  return (data ?? []) as SiteRecord[];
}

export async function getAllSites(): Promise<SiteRecord[]> {
  "use cache";
  cacheLife("hours");
  cacheTag("sites");

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("sites")
    .select("id, nama, jumlah_user, punya_it, aktif")
    .order("nama");

  if (error) {
    throw new Error(`Gagal memuat semua site: ${error.message}`);
  }

  return (data ?? []) as SiteRecord[];
}

export async function getSiteById(id: string): Promise<SiteRecord | null> {
  const sites = await getAllSites();
  return sites.find((site) => site.id === id) ?? null;
}
