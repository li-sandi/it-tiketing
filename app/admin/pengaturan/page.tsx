import SettingsForm from "@/components/admin/SettingsForm";
import {
  getFeatureFlags,
  getRateLimitSetting,
  getWeeklyReportSetting,
  getWorkingHours,
} from "@/lib/settings";

export default async function AdminPengaturanPage() {
  const [featureFlags, workingHours, rateLimit, weeklyReport] =
    await Promise.all([
      getFeatureFlags(),
      getWorkingHours(),
      getRateLimitSetting(),
      getWeeklyReportSetting(),
    ]);

  return (
    <section>
      <h1 className="mb-2 text-2xl font-bold">Pengaturan Sistem</h1>
      <p className="mb-6 text-sm text-gray-600">
        Kelola feature flag, daftar hari libur untuk SLA P3, batas rate limit,
        dan penerima laporan mingguan.
      </p>
      <SettingsForm
        initialFlags={featureFlags}
        initialWorkingHours={workingHours}
        initialRateLimit={rateLimit}
        initialWeeklyReport={weeklyReport}
      />
    </section>
  );
}
