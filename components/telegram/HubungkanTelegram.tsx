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
      <div className="rounded border border-green-200 bg-green-50 p-2 text-sm text-green-700">
        Telegram sudah terhubung.
      </div>
    );
  }

  if (!botUsername) {
    return (
      <div role="alert" className="rounded border border-red-200 bg-red-50 p-2 text-sm text-red-700">
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
    <section className="space-y-2 rounded border p-3">
      <h2 className="text-sm font-medium">Hubungkan Telegram</h2>
      <div className="flex flex-wrap gap-2">
        {!telegramUrl ? (
          <button
            type="button"
            onClick={() => void createLink()}
            disabled={loading}
            className="rounded bg-blue-600 px-3 py-1 text-sm text-white disabled:opacity-50"
          >
            {loading ? "Membuat tautan..." : "1. Buat tautan Telegram"}
          </button>
        ) : (
          <>
            <a
              href={telegramUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded bg-blue-600 px-3 py-1 text-sm text-white"
            >
              1. Buka Bot
            </a>
            <button
              type="button"
              onClick={() => void checkConnection()}
              disabled={loading}
              className="rounded border px-3 py-1 text-sm disabled:opacity-50"
            >
              {loading ? "Mengecek..." : "2. Cek Koneksi"}
            </button>
          </>
        )}
      </div>
      {message && (
        <p role="status" className="text-xs text-gray-700">
          {message}
        </p>
      )}
    </section>
  );
}
