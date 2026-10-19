"use client";

import { useEffect, useState } from "react";

type RemoteSecret = {
  anydeskPassword?: string;
  uvPassword?: string;
};

export default function RemoteSecretButton({
  ticketId,
}: {
  ticketId: string;
}) {
  const [secret, setSecret] = useState<RemoteSecret | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!secret) return;
    const timer = setTimeout(() => setSecret(null), 5 * 60 * 1000);
    return () => clearTimeout(timer);
  }, [secret]);

  async function revealSecret() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/tiket/${encodeURIComponent(ticketId)}/remote-secret/retrieve`,
        { method: "POST", cache: "no-store" },
      );
      const result = (await response.json()) as RemoteSecret & { error?: string };
      if (!response.ok) {
        throw new Error(result.error ?? "Password sementara tidak tersedia.");
      }
      setSecret(result);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Gagal mengambil password sementara.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-4 space-y-2">
      {!secret ? (
        <button
          type="button"
          onClick={() => void revealSecret()}
          disabled={loading}
          className="rounded border px-3 py-2 text-sm hover:bg-gray-100 disabled:opacity-50"
        >
          {loading ? "Mengambil password..." : "Ambil password sementara"}
        </button>
      ) : (
        <div className="space-y-1 rounded border bg-amber-50 p-3 font-mono text-sm">
          {secret.anydeskPassword && (
            <p>Password AnyDesk: {secret.anydeskPassword}</p>
          )}
          {secret.uvPassword && <p>Password UV: {secret.uvPassword}</p>}
          <p className="font-sans text-xs text-gray-600">
            Password dihapus dari penyimpanan sementara setelah dibuka.
          </p>
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
