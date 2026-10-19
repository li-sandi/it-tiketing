import UserTable from "@/components/admin/UserTable";
import { createAdminClient } from "@/lib/supabase/admin";

export default async function AdminUsersPage() {
  const supabase = createAdminClient();
  const [{ data: users, error: usersError }, { data: sites, error: sitesError }] =
    await Promise.all([
      supabase
        .from("users")
        .select("id, nama, email, peran, site_id")
        .order("nama"),
      supabase.from("sites").select("id, nama").order("nama"),
    ]);

  if (usersError || sitesError) {
    const error = usersError ?? sitesError;
    console.error("Gagal memuat data user admin:", error?.message);
    return (
      <section>
        <h1 className="mb-6 text-2xl font-bold">Kelola User</h1>
        <p role="alert" className="text-red-700">
          Gagal memuat user atau site. Silakan muat ulang halaman.
        </p>
      </section>
    );
  }

  return (
    <section>
      <h1 className="mb-2 text-2xl font-bold">Kelola User</h1>
      <p className="mb-6 text-sm text-gray-600">
        Perubahan peran dan site langsung berlaku pada akun.
      </p>
      <UserTable users={users ?? []} sites={sites ?? []} />
    </section>
  );
}
