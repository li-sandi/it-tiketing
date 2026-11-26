"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type LinkResponse = { url?: string; error?: string };
type SyncResponse = {
  terhubung?: number;
  error?: string;
};

export default function HubungkanTelegram({
  botUsername,
  sudahTerhubung,
}: {
  botUsername: string;
  sudahTerhubung: boolean;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [telegramUrl, setTelegramUrl] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  if (sudahTerhubung) {
    return (
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm font-medium text-emerald-800">
        Telegram sudah terhubung untuk notifikasi instan.
      </div>
    );
  }

  if (!botUsername) {
    return (
      <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
        TELEGRAM_BOT_USERNAME belum diset di environment server.
      </div>
    );
  }

  async function createLink() {
    setLoading(true);
    setMessage(null);
    setTelegramUrl(null);

    try {
      const response = await fetch("/api/telegram/link", { method: "POST" });
      const data = (await response.json()) as LinkResponse;
      if (!response.ok || !data.url) {
        setMessage(data.error ?? "Gagal membuat tautan Telegram.");
        return;
      }
      setTelegramUrl(data.url);
      setMessage("Tautan berlaku 10 menit. Buka bot lalu tekan Start.");
    } catch {
      setMessage("Tidak dapat menghubungi server. Coba lagi.");
    } finally {
      setLoading(false);
    }
  }

  async function checkConnection() {
    setLoading(true);
    setMessage(null);

    try {
      const response = await fetch("/api/telegram/sync", { method: "POST" });
      const data = (await response.json()) as SyncResponse;
      if (!response.ok) {
        setMessage(data.error ?? "Gagal memeriksa koneksi Telegram.");
        return;
      }

      if ((data.terhubung ?? 0) > 0) {
        setMessage("Berhasil terhubung. Memuat ulang...");
        router.refresh();
      } else {
        setMessage(
          "Belum terdeteksi. Tekan Start di bot melalui tautan di atas, lalu cek lagi.",
        );
      }
    } catch {
      setMessage("Tidak dapat menghubungi server. Coba lagi.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="space-y-2.5">
      <h2 className="text-sm font-semibold text-[var(--foreground)]">
        Hubungkan Telegram
      </h2>
      <p className="text-xs text-[var(--muted)]">
        Terima notifikasi pembaruan tiket, approval, dan peringatan SLA langsung via Telegram.
      </p>
      <div className="flex flex-wrap gap-2">
        {!telegramUrl ? (
          <button
            type="button"
            onClick={() => void createLink()}
            disabled={loading}
            className="min-h-9 rounded-lg bg-[#1d4ed8] px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-[#1e40af] disabled:opacity-50"
          >
            {loading ? "Membuat tautan..." : "1. Buat tautan Telegram"}
          </button>
        ) : (
          <>
            <a
              href={telegramUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-9 items-center rounded-lg bg-[#1d4ed8] px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-[#1e40af]"
            >
              1. Buka Bot
            </a>
            <button
              type="button"
              onClick={() => void checkConnection()}
              disabled={loading}
              className="min-h-9 rounded-lg border bg-[var(--surface)] px-3.5 py-1.5 text-xs font-medium hover:bg-[var(--surface-muted)] disabled:opacity-50"
            >
              {loading ? "Mengecek..." : "2. Cek Koneksi"}
            </button>
          </>
        )}
      </div>
      {message && (
        <p role="status" className="text-xs text-[var(--secondary)]">
          {message}
        </p>
      )}
    </section>
  );
}
