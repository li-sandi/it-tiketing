import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import AdminNavigation from "@/components/admin/AdminNavigation";
import { createClient } from "@/lib/supabase/server";

export const instant = false;

export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile, error } = await supabase
    .from("users")
    .select("peran")
    .eq("id", user.id)
    .maybeSingle();
  if (error) throw new Error(`Gagal memeriksa akses admin: ${error.message}`);
  if (profile?.peran !== "admin") redirect("/dashboard");

  return (
    <div className="min-h-screen bg-gray-50">
      <AdminNavigation />
      <main className="mx-auto w-full max-w-5xl p-4 sm:p-8">{children}</main>
    </div>
  );
}
