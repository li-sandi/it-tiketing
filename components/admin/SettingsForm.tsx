"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function SettingsForm({
  initialFlags,
  initialWorkingHours,
  initialRateLimit,
  initialWeeklyReport,
}: {
  initialFlags: {
    sleman_routing_enabled: boolean;
    ai_self_check_enabled: boolean;
    auto_close_follow_sla: boolean;
  };
  initialWorkingHours: {
    timezone: string;
    workdays: number[];
    holidays: string[];
  };
  initialRateLimit: {
    public_limit: number;
    emergency_limit: number;
    window_minutes: number;
  };
  initialWeeklyReport: {
    enabled: boolean;
    chat_ids: string[];
  };
}) {
  const router = useRouter();
  const [flags, setFlags] = useState(initialFlags);
  const [holidaysText, setHolidaysText] = useState(
    initialWorkingHours.holidays.join(", "),
  );
  const [rateLimit, setRateLimit] = useState(initialRateLimit);
  const [weeklyEnabled, setWeeklyEnabled] = useState(initialWeeklyReport.enabled);
  const [weeklyChats, setWeeklyChats] = useState(
    initialWeeklyReport.chat_ids.join(", "),
  );
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function saveSetting(kunci: string, nilai: unknown) {
    setBusy(true);
    setNotice(null);
    setError(null);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kunci, nilai }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Gagal menyimpan pengaturan.");
      setNotice(`Pengaturan "${kunci}" berhasil disimpan.`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menyimpan.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      {error && (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
          {notice}
        </p>
      )}

      <div className="space-y-3 rounded-xl border bg-[var(--surface)] p-5 shadow-xs">
        <h2 className="text-base font-semibold text-[var(--foreground)]">Feature Flags</h2>
        <label className="flex items-center gap-2 text-sm text-[var(--secondary)]">
          <input
            type="checkbox"
            checked={flags.auto_close_follow_sla}
            onChange={(e) =>
              setFlags((prev) => ({
                ...prev,
                auto_close_follow_sla: e.target.checked,
              }))
            }
          />
          Auto-close mengikuti target SLA resolusi tiap level prioritas
        </label>
        <label className="flex items-center gap-2 text-sm text-[var(--secondary)]">
          <input
            type="checkbox"
            checked={flags.ai_self_check_enabled}
            onChange={(e) =>
              setFlags((prev) => ({
                ...prev,
                ai_self_check_enabled: e.target.checked,
              }))
            }
          />
          Aktifkan Cek Mandiri (Wiki/RAG) pada form tiket
        </label>
        <label className="flex items-center gap-2 text-sm text-[var(--secondary)]">
          <input
            type="checkbox"
            checked={flags.sleman_routing_enabled}
            onChange={(e) =>
              setFlags((prev) => ({
                ...prev,
                sleman_routing_enabled: e.target.checked,
              }))
            }
          />
          Aktifkan Routing Kunjungan Multi-Site (Sleman)
        </label>
        <button
          type="button"
          disabled={busy}
          onClick={() => void saveSetting("feature_flags", flags)}
          className="min-h-9 rounded-lg bg-[#1d4ed8] px-4 py-1.5 text-sm font-semibold text-white hover:bg-[#1e40af] disabled:opacity-50"
        >
          Simpan Feature Flags
        </button>
      </div>

      <div className="space-y-3 rounded-xl border bg-[var(--surface)] p-5 shadow-xs">
        <h2 className="text-base font-semibold text-[var(--foreground)]">
          Hari Libur Nasional (SLA P3)
        </h2>
        <p className="text-xs text-[var(--muted)]">
          Pisahkan dengan koma dalam format YYYY-MM-DD (misal: 2026-12-25,
          2027-01-01).
        </p>
        <input
          aria-label="Daftar hari libur nasional YYYY-MM-DD"
          value={holidaysText}
          onChange={(e) => setHolidaysText(e.target.value)}
          className="w-full rounded-lg border px-3 py-2 text-sm"
        />
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            void saveSetting("working_hours", {
              ...initialWorkingHours,
              holidays: holidaysText
                .split(",")
                .map((s) => s.trim())
                .filter((s) => /^\d{4}-\d{2}-\d{2}$/.test(s)),
            })
          }
          className="min-h-9 rounded-lg bg-[#1d4ed8] px-4 py-1.5 text-sm font-semibold text-white hover:bg-[#1e40af] disabled:opacity-50"
        >
          Simpan Hari Libur
        </button>
      </div>

      <div className="space-y-3 rounded-xl border bg-[var(--surface)] p-5 shadow-xs">
        <h2 className="text-base font-semibold text-[var(--foreground)]">
          Rate Limit Form Publik
        </h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label htmlFor="rl-public" className="mb-1 block text-xs font-medium text-[var(--muted)]">
              Batas Umum
            </label>
            <input
              id="rl-public"
              type="number"
              min={1}
              value={rateLimit.public_limit}
              onChange={(e) =>
                setRateLimit((prev) => ({
                  ...prev,
                  public_limit: Number(e.target.value),
                }))
              }
              className="w-full rounded-lg border px-3 py-1.5 text-sm tabular-nums"
            />
          </div>
          <div>
            <label htmlFor="rl-emergency" className="mb-1 block text-xs font-medium text-[var(--muted)]">
              Batas Darurat (P0)
            </label>
            <input
              id="rl-emergency"
              type="number"
              min={1}
              value={rateLimit.emergency_limit}
              onChange={(e) =>
                setRateLimit((prev) => ({
                  ...prev,
                  emergency_limit: Number(e.target.value),
                }))
              }
              className="w-full rounded-lg border px-3 py-1.5 text-sm tabular-nums"
            />
          </div>
          <div>
            <label htmlFor="rl-window" className="mb-1 block text-xs font-medium text-[var(--muted)]">
              Jendela (menit)
            </label>
            <input
              id="rl-window"
              type="number"
              min={1}
              value={rateLimit.window_minutes}
              onChange={(e) =>
                setRateLimit((prev) => ({
                  ...prev,
                  window_minutes: Number(e.target.value),
                }))
              }
              className="w-full rounded-lg border px-3 py-1.5 text-sm tabular-nums"
            />
          </div>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={() => void saveSetting("rate_limit", rateLimit)}
          className="min-h-9 rounded-lg bg-[#1d4ed8] px-4 py-1.5 text-sm font-semibold text-white hover:bg-[#1e40af] disabled:opacity-50"
        >
          Simpan Rate Limit
        </button>
      </div>

      <div className="space-y-3 rounded-xl border bg-[var(--surface)] p-5 shadow-xs">
        <h2 className="text-base font-semibold text-[var(--foreground)]">
          Laporan Mingguan Telegram
        </h2>
        <label className="flex items-center gap-2 text-sm text-[var(--secondary)]">
          <input
            type="checkbox"
            checked={weeklyEnabled}
            onChange={(e) => setWeeklyEnabled(e.target.checked)}
          />
          Aktifkan pengiriman otomatis mingguan (Jumat 14:30 WIB)
        </label>
        <div>
          <label htmlFor="weekly-chats" className="mb-1 block text-xs font-medium text-[var(--muted)]">
            Chat ID tambahan (opsional, pisahkan koma; admin otomatis menerima)
          </label>
          <input
            id="weekly-chats"
            value={weeklyChats}
            onChange={(e) => setWeeklyChats(e.target.value)}
            placeholder="Contoh: -100123456789"
            className="w-full rounded-lg border px-3 py-2 text-sm"
          />
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            void saveSetting("weekly_report", {
              enabled: weeklyEnabled,
              chat_ids: weeklyChats
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean),
            })
          }
          className="min-h-9 rounded-lg bg-[#1d4ed8] px-4 py-1.5 text-sm font-semibold text-white hover:bg-[#1e40af] disabled:opacity-50"
        >
          Simpan Laporan Mingguan
        </button>
      </div>
    </div>
  );
}
