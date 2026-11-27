import "server-only";

import { cache } from "react";
import { cacheLife, cacheTag } from "next/cache";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type UserRole = "user" | "it" | "admin" | "ga";

export type AuthSession = {
  id: string;
  email: string | null;
};

export type UserProfile = {
  id: string;
  nama: string;
  email: string | null;
  peran: UserRole;
  site_id: string | null;
  telegram_id: string | null;
};

export type StrictAuthResult = {
  supabase: SupabaseClient;
  user: User;
};

export type StrictAuthProfileResult = StrictAuthResult & {
  peran: UserRole | null;
};

export const getCurrentUserSession = cache(
  async (): Promise<AuthSession | null> => {
    "use cache: private";
    cacheLife({ stale: 60, revalidate: 60, expire: 300 });

    const supabase = await createClient();
    const { data, error } = await supabase.auth.getClaims();
    const sub = data?.claims?.sub;
    if (error || typeof sub !== "string" || !sub) {
      return null;
    }

    return {
      id: sub,
      email: typeof data.claims.email === "string" ? data.claims.email : null,
    };
  },
);

async function getUserProfileRow(userId: string) {
  "use cache";
  cacheTag("users", `user-profile:${userId}`);
  cacheLife("minutes");

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("users")
    .select("id, nama, peran, site_id, telegram_id")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(`Gagal memuat profil user: ${error.message}`);
  }

  return data;
}

export const getCurrentUserProfile = cache(
  async (): Promise<UserProfile | null> => {
    "use cache: private";
    cacheLife({ stale: 60, revalidate: 60, expire: 300 });

    const session = await getCurrentUserSession();
    if (!session) return null;

    const row = await getUserProfileRow(session.id);
    if (!row) return null;

    return {
      id: row.id,
      nama: row.nama,
      email: session.email,
      peran: row.peran as UserRole,
      site_id: row.site_id ?? null,
      telegram_id: row.telegram_id ?? null,
    };
  },
);

export async function requireAuthUser(): Promise<StrictAuthResult | null> {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) return null;
  return { supabase, user };
}

export const requireStrictAuthUser = requireAuthUser;

export async function requireStrictAuthProfile(): Promise<StrictAuthProfileResult | null> {
  const auth = await requireAuthUser();
  if (!auth) return null;

  const { data: profile, error } = await auth.supabase
    .from("users")
    .select("peran")
    .eq("id", auth.user.id)
    .maybeSingle();

  if (error) {
    throw new Error(`Gagal memeriksa peran akun: ${error.message}`);
  }

  return {
    ...auth,
    peran: (profile?.peran as UserRole | undefined) ?? null,
  };
}
