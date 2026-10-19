import "server-only";

import { createClient } from "@/lib/supabase/server";

export async function getAdminUser() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) return null;

  const { data: profile, error: profileError } = await supabase
    .from("users")
    .select("peran")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) {
    console.error("Gagal memeriksa akses admin:", profileError.message);
    throw new Error("Gagal memeriksa akses admin.");
  }

  if (profile?.peran !== "admin") return null;
  return { user, supabase };
}
