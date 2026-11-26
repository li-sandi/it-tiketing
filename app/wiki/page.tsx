import { redirect } from "next/navigation";
import { connection } from "next/server";
import AppShell from "@/components/layout/AppShell";
import WikiClient from "@/components/wiki/WikiClient";
import { createClient } from "@/lib/supabase/server";

export const instant = false;

export default async function WikiPage() {
  await connection();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("users")
    .select("nama, peran")
    .eq("id", user.id)
    .maybeSingle();

  const role = profile?.peran ?? "user";
  const isStaff = role === "it" || role === "admin";
  const { data: articles, error } = await supabase
    .from("knowledge_articles")
    .select("id, judul, grup, masalah, solusi, kata_kunci, status, diperbarui_pada")
    .order("diperbarui_pada", { ascending: false })
    .limit(100);

  return (
    <AppShell
      userName={profile?.nama ?? user.email ?? "Pengguna"}
      userEmail={user.email}
      role={role}
      pageTitle="Wiki & SOP Layanan IT"
      pageSubtitle="Panduan penyelesaian mandiri dan dokumentasi solusi standar operasional."
    >
      {error ? (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Gagal memuat Wiki: {error.message}
        </p>
      ) : (
        <WikiClient initialArticles={articles ?? []} isStaff={isStaff} />
      )}
    </AppShell>
  );
}
