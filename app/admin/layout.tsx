import { redirect } from "next/navigation";
import { connection } from "next/server";
import type { ReactNode } from "react";
import AppShell from "@/components/layout/AppShell";
import { getFeatureFlags } from "@/lib/settings";
import { createClient } from "@/lib/supabase/server";

export const instant = false;

export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  await connection();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile, error }, flags] = await Promise.all([
    supabase
      .from("users")
      .select("nama, peran")
      .eq("id", user.id)
      .maybeSingle(),
    getFeatureFlags(),
  ]);
  if (error) throw new Error(`Gagal memeriksa akses admin: ${error.message}`);
  if (profile?.peran !== "admin") redirect("/dashboard");

  return (
    <AppShell
      userName={profile.nama ?? user.email ?? "Administrator"}
      userEmail={user.email}
      role={profile.peran}
      pageTitle="Admin Panel"
      pageSubtitle="Pengelolaan konfigurasi sistem, kategori layanan, site, pengguna, dan audit."
      showSchedule={flags.sleman_routing_enabled}
    >
      {children}
    </AppShell>
  );
}
