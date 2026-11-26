import { redirect } from "next/navigation";
import { connection } from "next/server";
import AssetClient from "@/components/aset/AssetClient";
import AppShell from "@/components/layout/AppShell";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const instant = false;

export default async function AsetPage() {
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

  if (
    profile?.peran !== "it" &&
    profile?.peran !== "admin" &&
    profile?.peran !== "ga"
  ) {
    redirect("/dashboard");
  }

  const admin = createAdminClient();
  const [{ data: assets, error: assetsError }, { data: sites }] =
    await Promise.all([
      admin.from("assets").select("*, sites(nama)").order("nomor_aset"),
      admin.from("sites").select("id, nama").eq("aktif", true).order("nama"),
    ]);

  return (
    <AppShell
      userName={profile.nama ?? user.email ?? "Pengguna"}
      userEmail={user.email}
      role={profile.peran}
      pageTitle="Inventaris Aset IT"
      pageSubtitle="Kelola nomor aset, kapasitas RAM (deteksi kandidat upgrade ≤4 GB), dan ID remote statis."
    >
      {assetsError ? (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Gagal memuat data aset: {assetsError.message}
        </p>
      ) : (
        <AssetClient assets={assets ?? []} sites={sites ?? []} />
      )}
    </AppShell>
  );
}
