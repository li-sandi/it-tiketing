"use client";

import { useState } from "react";

type RevealedCred = {
  id: string;
  aplikasi: string;
  remoteId: string;
  password: string | null;
  expired: boolean;
};

type RemotePhoto = {
  id: string;
  url: string | null;
};

export default function RemoteCredentialPanel({
  ticketId,
  initialCount,
  remotePhotoCount,
}: {
  ticketId: string;
  initialCount: number;
  remotePhotoCount: number;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [credentials, setCredentials] = useState<RevealedCred[] | null>(null);
  const [photos, setPhotos] = useState<RemotePhoto[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  async function handleReveal() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/tiket/${encodeURIComponent(ticketId)}/remote-reveal`,
        { method: "POST", cache: "no-store" },
      );
      const data = (await response.json()) as {
        credentials?: RevealedCred[];
        remotePhotos?: RemotePhoto[];
        error?: string;
      };
      if (!response.ok) {
        throw new Error(data.error ?? "Gagal membuka kredensial remote.");
      }
      setCredentials(data.credentials ?? []);
      setPhotos(data.remotePhotos ?? []);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Gagal membuka kredensial remote.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function copyText(id: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1500);
    } catch {
      // Clipboard blocked
    }
  }

  return (
    <section className="space-y-3 rounded-xl border bg-[var(--surface)] p-5 shadow-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-[var(--foreground)]">
          Kredensial Remote (AnyDesk &amp; UV)
        </h2>
        {!credentials && (initialCount > 0 || remotePhotoCount > 0) && (
          <button
            type="button"
            disabled={loading}
            onClick={() => void handleReveal()}
            className="min-h-9 rounded-lg bg-[#1d4ed8] px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-[#1e40af] disabled:opacity-50"
          >
            {loading ? "Membuka..." : "Tampilkan Kredensial Remote"}
          </button>
        )}
      </div>

      {!credentials ? (
        <p className="text-sm text-[var(--muted)]">
          {initialCount === 0 && remotePhotoCount === 0
            ? "Tidak ada ID atau foto remote tersimpan."
            : `Tersimpan ${initialCount} entri kredensial dan ${remotePhotoCount} foto layar remote (tersembunyi; setiap pembukaan dicatat di riwayat tiket).`}
        </p>
      ) : (
        <div className="space-y-3">
          {credentials.length > 0 && (
            <ul className="space-y-2 text-sm">
              {credentials.map((cred) => (
                <li
                  key={cred.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-[var(--surface-muted)] p-3 font-mono"
                >
                  <div>
                    <span className="font-semibold uppercase text-[var(--foreground)]">
                      {cred.aplikasi}
                    </span>
                    : {cred.remoteId}
                    {cred.password ? (
                      <span className="ml-3 text-blue-700">
                        · Pass: {cred.password}
                      </span>
                    ) : cred.expired ? (
                      <span className="ml-3 text-xs text-[var(--muted)]">
                        (password dibersihkan/kedaluwarsa)
                      </span>
                    ) : (
                      <span className="ml-3 text-xs text-[var(--muted)]">
                        (tanpa password)
                      </span>
                    )}
                  </div>
                  <div className="flex gap-2">
                    {cred.remoteId !== "-" && (
                      <button
                        type="button"
                        onClick={() =>
                          void copyText(`${cred.id}-id`, cred.remoteId)
                        }
                        className="rounded-lg border bg-[var(--surface)] px-2.5 py-1 font-sans text-xs font-medium hover:bg-[var(--surface-muted)]"
                      >
                        {copiedId === `${cred.id}-id` ? "Tersalin" : "Salin ID"}
                      </button>
                    )}
                    {cred.password && (
                      <button
                        type="button"
                        onClick={() =>
                          void copyText(`${cred.id}-pw`, cred.password!)
                        }
                        className="rounded-lg border bg-[var(--surface)] px-2.5 py-1 font-sans text-xs font-medium hover:bg-[var(--surface-muted)]"
                      >
                        {copiedId === `${cred.id}-pw`
                          ? "Tersalin"
                          : "Salin Pass"}
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}

          {photos.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-medium text-gray-600">
                Foto / Screenshot Layar Remote (otomatis terhapus saat tiket
                selesai):
              </p>
              <div className="grid grid-cols-2 gap-3">
                {photos.map((photo) =>
                  photo.url ? (
                    <a
                      key={photo.id}
                      href={photo.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="overflow-hidden rounded border"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={photo.url}
                        alt="Foto kredensial remote"
                        className="h-40 w-full object-cover"
                      />
                    </a>
                  ) : null,
                )}
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={() => {
              setCredentials(null);
              setPhotos([]);
            }}
            className="text-xs underline"
          >
            Sembunyikan lagi
          </button>
        </div>
      )}

      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
    </section>
  );
}
