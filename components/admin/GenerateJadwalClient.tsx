"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type MulaiDengan = "Miko" | "Fuad";

export default function GenerateJadwalClient() {
  const router = useRouter();
  const [mulaiDengan, setMulaiDengan] = useState<MulaiDengan>("Miko");
  const [loading, setLoading] = useState(false);
  const [pesan, setPesan] = useState<{ type: "success" | "error"; text: string } | null>(
    null,
  );

  async function handleGenerate() {
    if (
      !window.confirm(
        "Jadwal kunjungan Sleman dalam periode 8 minggu ke depan akan diganti. Lanjutkan?",
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
        body: JSON.stringify({ mulaiDengan }),
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
      if (typeof result.jumlah !== "number" || !result.mulai || !result.sampai) {
        throw new Error("Respons generate jadwal tidak lengkap.");
      }

      setPesan({
        type: "success",
        text: `Berhasil membuat ${result.jumlah} jadwal (${result.mulai}–${result.sampai}).`,
      });
      router.refresh();
    } catch (error) {
      setPesan({
        type: "error",
        text:
          error instanceof Error ? error.message : "Gagal membuat jadwal.",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mb-6 flex flex-wrap items-end gap-4 rounded-lg border border-blue-200 bg-blue-50 p-4">
      <div>
        <label
          htmlFor="jadwal-mulai-dengan"
          className="mb-1 block text-sm font-medium text-blue-900"
        >
          Mulai rotasi dengan
        </label>
        <select
          id="jadwal-mulai-dengan"
          value={mulaiDengan}
          onChange={(event) =>
            setMulaiDengan(event.target.value === "Fuad" ? "Fuad" : "Miko")
          }
          className="rounded border px-3 py-2"
        >
          <option value="Miko">Miko</option>
          <option value="Fuad">Fuad</option>
        </select>
      </div>
      <button
        type="button"
        onClick={() => void handleGenerate()}
        disabled={loading}
        className="rounded bg-blue-600 px-4 py-2 font-medium text-white disabled:opacity-50"
      >
        {loading ? "Memproses..." : "Generate 8 Minggu ke Depan"}
      </button>
      {pesan && (
        <p
          role={pesan.type === "error" ? "alert" : "status"}
          className={`text-sm font-medium ${
            pesan.type === "error" ? "text-red-700" : "text-green-700"
          }`}
        >
          {pesan.text}
        </p>
      )}
    </div>
  );
}
