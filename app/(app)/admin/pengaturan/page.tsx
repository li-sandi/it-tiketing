import { Suspense } from "react";
import { redirect } from "next/navigation";
import SettingsForm from "@/components/admin/SettingsForm";
import { getCurrentUserProfile } from "@/lib/auth";
import {
  getFeatureFlags,
  getRateLimitSetting,
  getWeeklyReportSetting,
  getWorkingHours,
} from "@/lib/settings";

function AdminPengaturanSkeleton() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="h-44 rounded-xl border bg-[var(--surface)]" />
      <div className="h-44 rounded-xl border bg-[var(--surface)]" />
    </div>
  );
}

async function AdminPengaturanContent() {
  const profile = await getCurrentUserProfile();
  if (!profile) redirect("/login");
  if (profile.peran !== "admin") redirect("/dashboard");

  const [featureFlags, workingHours, rateLimit, weeklyReport] =
    await Promise.all([
      getFeatureFlags(),
      getWorkingHours(),
      getRateLimitSetting(),
      getWeeklyReportSetting(),
    ]);

  return (
    <SettingsForm
      initialFlags={featureFlags}
      initialWorkingHours={workingHours}
      initialRateLimit={rateLimit}
      initialWeeklyReport={weeklyReport}
    />
  );
}

export default function AdminPengaturanPage() {
  return (
    <section>
      <h1 className="mb-2 text-2xl font-bold">Pengaturan Sistem</h1>
      <p className="mb-6 text-sm text-gray-600">
        Kelola feature flag, daftar hari libur untuk SLA P3, batas rate limit,
        dan penerima laporan mingguan.
      </p>
      <Suspense fallback={<AdminPengaturanSkeleton />}>
        <AdminPengaturanContent />
      </Suspense>
    </section>
  );
}
