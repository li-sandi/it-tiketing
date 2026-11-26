"use client";

import { useState } from "react";
import Link from "next/link";

export default function PromoteWikiButton({
  ticketId,
  categoryId,
  grup,
  defaultTitle,
  masalah,
  solusi,
}: {
  ticketId: string;
  categoryId: string;
  grup: string;
  defaultTitle: string;
  masalah: string;
  solusi: string;
}) {
  const [busy, setBusy] = useState(false);
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handlePromote() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/wiki", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          judul: defaultTitle.slice(0, 200),
          grup,
          category_id: categoryId,
          masalah,
          solusi,
          sumber_ticket_id: ticketId,
          status: "draft",
        }),
      });
      const data = (await res.json()) as {
        article?: { id: string };
        error?: string;
      };
      if (!res.ok || !data.article) {
        throw new Error(data.error ?? "Gagal membuat draf Wiki SOP.");
      }
      setCreatedId(data.article.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal membuat draf Wiki.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="pt-2">
      {createdId ? (
        <p className="text-xs text-green-700">
          Draf SOP dibuat!{" "}
          <Link href="/wiki" className="underline">
            Buka Wiki SOP →
          </Link>
        </p>
      ) : (
        <button
          type="button"
          disabled={busy}
          onClick={() => void handlePromote()}
          className="rounded border px-3 py-1.5 text-xs font-medium hover:bg-gray-50 disabled:opacity-50"
        >
          {busy ? "Menyimpan..." : "Jadikan Artikel Wiki / SOP"}
        </button>
      )}
      {error && (
        <p role="alert" className="mt-1 text-xs text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
