"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type StaffItem = { id: string; nama: string };
type SiteItem = { id: string; nama: string };

export default function GenerateJadwalClient({
  itStaff,
  sites,
}: {
  itStaff: StaffItem[];
  sites: SiteItem[];
}) {
  const router = useRouter();
  const [selectedStaff, setSelectedStaff] = useState<string[]>(() =>
    itStaff.slice(0, 2).map((s) => s.id),
  );
  const [siteId, setSiteId] = useState(sites[0]?.id ?? "");
  const [loading, setLoading] = useState(false);
  const [pesan, setPesan] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  function toggleStaff(id: string) {
    setSelectedStaff((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  async function handleGenerate() {
    if (selectedStaff.length < 2) {
      setPesan({
        type: "error",
        text: "Pilih minimal 2 petugas IT untuk rotasi jadwal.",
      });
      return;
    }
    if (
      !window.confirm(
        "Jadwal kunjungan dalam periode 8 minggu ke depan akan diganti. Lanjutkan?",
      )
    ) {
      return;
    }

    setLoading(true);
    setPesan(null);
    try {
      const response = await fetch("/api/admin/generate-jadwal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ staffIds: selectedStaff, siteId }),
      });
      const result = (await response.json()) as {
        error?: string;
        jumlah?: number;
        mulai?: string;
        sampai?: string;
      };
      if (!response.ok) {
        throw new Error(result.error ?? "Gagal membuat jadwal.");
      }

      setPesan({
        type: "success",
        text: `Berhasil membuat ${result.jumlah} jadwal (${result.mulai} sampai ${result.sampai}).`,
      });
      router.refresh();
    } catch (error) {
      setPesan({
        type: "error",
        text: error instanceof Error ? error.message : "Gagal membuat jadwal.",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mb-6 space-y-4 rounded-xl border border-blue-200 bg-blue-50 p-5 shadow-xs">
      {sites.length > 0 && (
        <div>
          <label
            htmlFor="jadwal-site"
            className="mb-1 block text-xs font-medium text-blue-900"
          >
            Site Tujuan
          </label>
          <select
            id="jadwal-site"
            value={siteId}
            onChange={(e) => setSiteId(e.target.value)}
            className="rounded-lg border px-3 py-2 text-sm"
          >
            {sites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nama}
              </option>
            ))}
          </select>
        </div>
      )}

      <div>
        <span className="mb-2 block text-xs font-medium text-blue-900">
          Petugas IT dalam Rotasi (pilih minimal 2):
        </span>
        {itStaff.length < 2 ? (
          <p className="text-xs text-red-700">
            Dibutuhkan minimal 2 user berperan IT untuk membuat rotasi jadwal.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2.5">
            {itStaff.map((staff) => (
              <label
                key={staff.id}
                className="flex cursor-pointer items-center gap-2 rounded-lg border bg-[var(--surface)] px-3 py-1.5 text-sm shadow-xs"
              >
                <input
                  type="checkbox"
                  checked={selectedStaff.includes(staff.id)}
                  onChange={() => toggleStaff(staff.id)}
                />
                {staff.nama}
              </label>
            ))}
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={() => void handleGenerate()}
        disabled={loading || selectedStaff.length < 2 || !siteId}
        className="min-h-10 rounded-lg bg-[#1d4ed8] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1e40af] disabled:opacity-50"
      >
        {loading ? "Memproses..." : "Generate 8 Minggu ke Depan"}
      </button>

      {pesan && (
        <p
          role={pesan.type === "error" ? "alert" : "status"}
          className={`text-sm font-medium ${
            pesan.type === "error" ? "text-red-700" : "text-emerald-800"
          }`}
        >
          {pesan.text}
        </p>
      )}
    </div>
  );
}
