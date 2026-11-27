import { Suspense, type ReactNode } from "react";
import { redirect } from "next/navigation";
import { getCurrentUserProfile } from "@/lib/auth";

async function AdminAuthGate() {
  const profile = await getCurrentUserProfile();
  if (!profile) redirect("/login");
  if (profile.peran !== "admin") redirect("/dashboard");
  return null;
}

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <Suspense fallback={null}>
        <AdminAuthGate />
      </Suspense>
      {children}
    </>
  );
}
