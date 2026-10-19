"use client";

import { useEffect, useRef, useState } from "react";

export default function RemoteCredentialFields({
  assetNumber,
  anydeskId,
  uvId,
  onAnydeskIdChange,
  onUvIdChange,
}: {
  assetNumber: string;
  anydeskId: string;
  uvId: string;
  onAnydeskIdChange: (value: string) => void;
  onUvIdChange: (value: string) => void;
}) {
  const [lookupMessage, setLookupMessage] = useState<string | null>(null);
  const lastLookup = useRef("");

  useEffect(() => {
    const asset = assetNumber.trim();
    if (asset.length < 4) {
      lastLookup.current = "";
      return;
    }
    if (lastLookup.current === asset) {
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      lastLookup.current = asset;
      setLookupMessage("Mencari ID remote untuk nomor aset…");
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
        setLookupMessage(
          result.anydeskId || result.uvId
            ? "ID tersimpan untuk aset ini diisi otomatis."
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
    uvId,
  ]);

  return (
    <fieldset className="space-y-3 border-l-4 border-blue-200 pl-4">
      <legend className="font-medium">Akses remote (opsional)</legend>
      <p className="text-sm text-gray-600">
        ID akan disimpan bersama nomor aset agar dapat diisi otomatis pada
        tiket berikutnya. Password tidak disimpan; berikan langsung ke IT
        melalui kanal komunikasi yang disepakati.
      </p>
      {lookupMessage && assetNumber.trim().length >= 4 && (
        <p role="status" className="text-xs text-gray-600">
          {lookupMessage}
        </p>
      )}
      <div>
        <label htmlFor="remote-anydesk-id" className="mb-1 block text-sm font-medium">
          ID AnyDesk
        </label>
        <input
          id="remote-anydesk-id"
          value={anydeskId}
          onChange={(event) => onAnydeskIdChange(event.target.value)}
          maxLength={120}
          autoComplete="off"
          className="w-full rounded border px-3 py-2"
        />
      </div>
      <div>
        <label htmlFor="remote-uv-id" className="mb-1 block text-sm font-medium">
          ID UV (UltraViewer)
        </label>
        <input
          id="remote-uv-id"
          value={uvId}
          onChange={(event) => onUvIdChange(event.target.value)}
          maxLength={120}
          autoComplete="off"
          className="w-full rounded border px-3 py-2"
        />
      </div>
    </fieldset>
  );
}
