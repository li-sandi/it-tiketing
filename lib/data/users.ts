import "server-only";

import { cacheLife, cacheTag } from "next/cache";
import type { UserRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export type ItStaffRecord = {
  id: string;
  nama: string;
};

export type AdminUserRecord = {
  id: string;
  nama: string;
  email: string;
  peran: UserRole;
  site_id: string | null;
};

export async function getItStaffList(): Promise<ItStaffRecord[]> {
  "use cache";
  cacheLife("hours");
  cacheTag("users");

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("users")
    .select("id, nama")
    .eq("peran", "it")
    .order("nama");

  if (error) {
    throw new Error(`Gagal memuat daftar staf IT: ${error.message}`);
  }

  return (data ?? []) as ItStaffRecord[];
}

export async function getAllUsersAdmin(): Promise<AdminUserRecord[]> {
  "use cache";
  cacheLife("minutes");
  cacheTag("users");

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("users")
    .select("id, nama, email, peran, site_id")
    .order("nama");

  if (error) {
    throw new Error(`Gagal memuat daftar pengguna: ${error.message}`);
  }

  return (data ?? []) as AdminUserRecord[];
}
