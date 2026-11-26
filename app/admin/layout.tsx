import { redirect } from "next/navigation";
import { connection } from "next/server";
import type { ReactNode } from "react";
import AppShell from "@/components/layout/AppShell";
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

  const { data: profile, error } = await supabase
    .from("users")
    .select("nama, peran")
    .eq("id", user.id)
    .maybeSingle();
  if (error) throw new Error(`Gagal memeriksa akses admin: ${error.message}`);
  if (profile?.peran !== "admin") redirect("/dashboard");

  return (
    <AppShell
      userName={profile.nama ?? user.email ?? "Administrator"}
      userEmail={user.email}
      role={profile.peran}
      pageTitle="Admin Panel"
      pageSubtitle="Pengelolaan konfigurasi sistem, kategori layanan, site, pengguna, dan jadwal."
    >
      {children}
    </AppShell>
  );
}
