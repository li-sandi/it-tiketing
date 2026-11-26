"use client";

import { useEffect, useState } from "react";

type ArticleMatch = {
  id: string;
  judul: string;
  grup: string;
  masalah: string;
  solusi: string;
};

export default function SelfCheckPanel({
  categoryId,
  grup,
  deskripsi,
  onResolved,
}: {
  categoryId: string;
  grup?: string | null;
  deskripsi: string;
  onResolved?: () => void;
}) {
  const [articles, setArticles] = useState<ArticleMatch[]>([]);
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [resolved, setResolved] = useState(false);

  const hasQuery = deskripsi.trim().length >= 10 || Boolean(categoryId);

  useEffect(() => {
    if (!hasQuery) return;

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch("/api/wiki/self-check", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            categoryId,
            grup: grup ?? "",
            deskripsi,
          }),
        });
        if (!res.ok) return;
        const data = (await res.json()) as {
          articles?: ArticleMatch[];
          aiSummary?: string | null;
        };
        setArticles(data.articles ?? []);
        setAiSummary(data.aiSummary ?? null);
        setDismissed(false);
      } catch {
        // Ignore abort / offline error
      }
    }, 650);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [hasQuery, categoryId, grup, deskripsi]);

  if (resolved) {
    return (
      <div className="rounded border border-green-200 bg-green-50 p-4 text-sm text-green-800">
        <p className="font-medium">
          Bagus! Masalah berhasil diselesaikan secara mandiri.
        </p>
        <button
          type="button"
          onClick={() => setResolved(false)}
          className="mt-2 text-xs underline"
        >
          Masih butuh bantuan? Lanjutkan buat tiket
        </button>
      </div>
    );
  }

  if (!hasQuery || dismissed || (!aiSummary && articles.length === 0)) {
    return null;
  }

  return (
    <aside
      aria-label="Cek Mandiri Sebelum Membuat Tiket"
      className="space-y-3 rounded border border-blue-200 bg-blue-50 p-4 text-sm"
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="font-semibold text-blue-800">
            Cek Mandiri — Solusi Cepat dari Wiki IT
          </h3>
          <p className="text-xs text-gray-600">
            Coba langkah berikut sebelum mengirim tiket:
          </p>
        </div>
      </div>

      {aiSummary && (
        <div className="rounded border bg-white p-3 text-xs whitespace-pre-wrap">
          {aiSummary}
        </div>
      )}

      {articles.length > 0 && (
        <ul className="space-y-2">
          {articles.map((article) => (
            <li key={article.id} className="rounded border bg-white p-3">
              <p className="font-medium">{article.judul}</p>
              <p className="mt-1 text-xs whitespace-pre-wrap text-gray-700">
                {article.solusi}
              </p>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap gap-2 pt-1">
        <button
          type="button"
          onClick={() => {
            setResolved(true);
            onResolved?.();
          }}
          className="rounded bg-green-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-800"
        >
          Masalah sudah teratasi
        </button>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="rounded border bg-white px-3 py-1.5 text-xs font-medium hover:bg-gray-50"
        >
          Tetap buat tiket
        </button>
      </div>
    </aside>
  );
}
