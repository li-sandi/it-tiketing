"use client";

import { useEffect, useRef, useState } from "react";

const MAX_REMOTE_FILE_SIZE = 5 * 1024 * 1024;
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

export default function RemoteCredentialFields({
  assetNumber,
  anydeskId,
  anydeskPassword,
  uvId,
  uvPassword,
  remoteFile,
  onAnydeskIdChange,
  onAnydeskPasswordChange,
  onUvIdChange,
  onUvPasswordChange,
  onRemoteFileChange,
  onAssetDetected,
}: {
  assetNumber: string;
  anydeskId: string;
  anydeskPassword: string;
  uvId: string;
  uvPassword: string;
  remoteFile: File | null;
  onAnydeskIdChange: (value: string) => void;
  onAnydeskPasswordChange: (value: string) => void;
  onUvIdChange: (value: string) => void;
  onUvPasswordChange: (value: string) => void;
  onRemoteFileChange: (file: File | null) => void;
  onAssetDetected?: (info: { ramGb: number | null; assetName: string | null }) => void;
}) {
  const [lookupMessage, setLookupMessage] = useState<string | null>(null);
  const [showAnydeskPass, setShowAnydeskPass] = useState(false);
  const [showUvPass, setShowUvPass] = useState(false);
  const [remoteFileError, setRemoteFileError] = useState<string | null>(null);
  const lastLookup = useRef("");

  useEffect(() => {
    const asset = assetNumber.trim();
    if (asset.length < 4) {
      lastLookup.current = "";
      onAssetDetected?.({ ramGb: null, assetName: null });
      return;
    }
    if (lastLookup.current === asset) {
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      lastLookup.current = asset;
      setLookupMessage("Mencari ID remote & data aset…");
      try {
        const accessToken = window.localStorage.getItem(
          "public-ticket-access-token",
        );
        const response = await fetch("/api/tiket/remote-ids", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
          signal: controller.signal,
          body: JSON.stringify({ nomorAset: asset, accessToken }),
        });
        const result = (await response.json()) as {
          anydeskId?: string | null;
          uvId?: string | null;
          ramGb?: number | null;
          assetName?: string | null;
          hasSavedRemoteId?: boolean;
          error?: string;
        };
        if (!response.ok) {
          setLookupMessage(result.error ?? "ID tersimpan belum dapat dicari.");
          return;
        }

        if (asset !== assetNumber.trim()) return;
        if (result.anydeskId && !anydeskId) {
          onAnydeskIdChange(result.anydeskId);
        }
        if (result.uvId && !uvId) onUvIdChange(result.uvId);
        onAssetDetected?.({
          ramGb: result.ramGb ?? null,
          assetName: result.assetName ?? null,
        });
        setLookupMessage(
          result.anydeskId || result.uvId
            ? "ID statis untuk aset ini diisi otomatis."
            : result.hasSavedRemoteId
              ? "ID remote statis aset terdaftar dan akan ditautkan otomatis saat tiket dikirim."
              : "Belum ada ID remote tersimpan untuk aset ini.",
        );
      } catch (error) {
        if (controller.signal.aborted) return;
        setLookupMessage(
          error instanceof Error
            ? error.message
            : "ID tersimpan belum dapat dicari.",
        );
      }
    }, 500);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [
    assetNumber,
    anydeskId,
    onAnydeskIdChange,
    onUvIdChange,
    onAssetDetected,
    uvId,
  ]);

  return (
    <fieldset className="space-y-3 rounded-xl border bg-[var(--surface-muted)] p-4">
      <legend className="px-1 text-sm font-semibold text-[var(--foreground)]">
        Akses Remote (AnyDesk &amp; UltraViewer)
      </legend>
      <p className="text-xs text-[var(--secondary)]">
        ID bersifat statis dan akan disimpan per aset untuk pengisian otomatis.
        Password yang berubah-ubah dienkripsi sementara hingga tiket selesai,
        atau Anda bisa melampirkan foto/screenshot layar AnyDesk/UltraViewer.
      </p>
      {lookupMessage && assetNumber.trim().length >= 4 && (
        <p role="status" className="text-xs font-medium text-blue-700">
          {lookupMessage}
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="remote-anydesk-id" className="mb-1 block text-xs font-medium text-[var(--foreground)]">
            ID AnyDesk (statis)
          </label>
          <input
            id="remote-anydesk-id"
            value={anydeskId}
            onChange={(event) => onAnydeskIdChange(event.target.value)}
            maxLength={120}
            autoComplete="off"
            placeholder="Contoh: 123 456 789"
            className="w-full rounded-lg border px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label
            htmlFor="remote-anydesk-pass"
            className="mb-1 block text-xs font-medium text-[var(--foreground)]"
          >
            Password AnyDesk (opsional)
          </label>
          <div className="flex gap-2">
            <input
              id="remote-anydesk-pass"
              type={showAnydeskPass ? "text" : "password"}
              value={anydeskPassword}
              onChange={(event) => onAnydeskPasswordChange(event.target.value)}
              maxLength={200}
              autoComplete="new-password"
              className="w-full rounded-lg border px-3 py-2 text-sm"
            />
            <button
              type="button"
              onClick={() => setShowAnydeskPass((v) => !v)}
              className="rounded-lg border bg-[var(--surface)] px-3 text-xs font-medium hover:bg-[var(--surface-muted)]"
            >
              {showAnydeskPass ? "Tutup" : "Lihat"}
            </button>
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="remote-uv-id" className="mb-1 block text-xs font-medium text-[var(--foreground)]">
            ID UltraViewer / UV (statis)
          </label>
          <input
            id="remote-uv-id"
            value={uvId}
            onChange={(event) => onUvIdChange(event.target.value)}
            maxLength={120}
            autoComplete="off"
            placeholder="Contoh: 12 345 678"
            className="w-full rounded-lg border px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label htmlFor="remote-uv-pass" className="mb-1 block text-xs font-medium text-[var(--foreground)]">
            Password UltraViewer (opsional)
          </label>
          <div className="flex gap-2">
            <input
              id="remote-uv-pass"
              type={showUvPass ? "text" : "password"}
              value={uvPassword}
              onChange={(event) => onUvPasswordChange(event.target.value)}
              maxLength={200}
              autoComplete="new-password"
              className="w-full rounded-lg border px-3 py-2 text-sm"
            />
            <button
              type="button"
              onClick={() => setShowUvPass((v) => !v)}
              className="rounded-lg border bg-[var(--surface)] px-3 text-xs font-medium hover:bg-[var(--surface-muted)]"
            >
              {showUvPass ? "Tutup" : "Lihat"}
            </button>
          </div>
        </div>
      </div>

      <div>
        <label htmlFor="remote-photo" className="mb-1 block text-xs font-medium text-[var(--foreground)]">
          Foto / Screenshot AnyDesk atau UltraViewer (opsional, maks 5 MB)
        </label>
        <input
          id="remote-photo"
          type="file"
          accept={IMAGE_TYPES.join(",")}
          onChange={(event) => {
            const selected = event.target.files?.[0] ?? null;
            if (!selected) {
              setRemoteFileError(null);
              onRemoteFileChange(null);
              return;
            }
            if (!IMAGE_TYPES.includes(selected.type)) {
              setRemoteFileError("File harus berupa gambar JPEG, PNG, WebP, atau GIF.");
              onRemoteFileChange(null);
              return;
            }
            if (selected.size === 0 || selected.size > MAX_REMOTE_FILE_SIZE) {
              setRemoteFileError("Ukuran foto remote maksimal 5 MB.");
              onRemoteFileChange(null);
              return;
            }
            setRemoteFileError(null);
            onRemoteFileChange(selected);
          }}
          className="w-full rounded-lg border bg-[var(--surface)] px-3 py-2 text-sm"
        />
        {remoteFile && (
          <div className="mt-1.5 flex items-center gap-3 text-xs text-[var(--muted)]">
            <span>
              Terpilih: {remoteFile.name} ({(remoteFile.size / 1024).toFixed(0)} KB)
            </span>
            <button
              type="button"
              onClick={() => onRemoteFileChange(null)}
              className="font-medium text-blue-700 underline"
            >
              Hapus
            </button>
          </div>
        )}
        {remoteFileError && (
          <p role="alert" className="mt-1 text-xs text-red-700">
            {remoteFileError}
          </p>
        )}
      </div>
    </fieldset>
  );
}
