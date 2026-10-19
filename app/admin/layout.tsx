import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
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
      <nav className="flex gap-6 border-b bg-white px-8 py-4">
        <Link href="/dashboard" className="font-semibold text-gray-500 hover:text-black">
          ← Dashboard
        </Link>
        <Link href="/admin/kategori" className="font-semibold hover:text-blue-600">
          Kategori
        </Link>
        <Link href="/admin/users" className="font-semibold hover:text-blue-600">
          Users
        </Link>
      </nav>
      <main className="mx-auto max-w-5xl p-8">{children}</main>
    </div>
  );
}
