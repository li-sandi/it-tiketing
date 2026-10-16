import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export const instant = false;

export default async function DashboardPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profil } = await supabase
    .from("users")
    .select("nama, peran, site_id")
    .eq("id", user.id)
    .single();

  return (
    <div className="p-8">
      <h1 className="text-2xl font-semibold">Dashboard</h1>
      <p className="mt-2">Halo, {profil?.nama ?? user.email}</p>
      <p className="text-sm text-gray-600">Peran: {profil?.peran}</p>
    </div>
  );
}
