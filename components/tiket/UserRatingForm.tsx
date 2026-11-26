"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { tutupTiketOlehUser } from "@/app/tiket/[id]/actions";

export default function UserRatingForm({
  ticketId,
}: {
  ticketId: string;
}) {
  const router = useRouter();
  const [rating, setRating] = useState(5);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNotice(null);

    startTransition(async () => {
      const result = await tutupTiketOlehUser(ticketId, rating);
      if (result.error) {
        setError(result.error);
        return;
      }

      setNotice(result.notice ?? "Tiket berhasil ditutup.");
      router.refresh();
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4 rounded-xl border bg-[var(--surface-muted)] p-4"
    >
      <div>
        <h3 className="text-sm font-semibold text-[var(--foreground)]">
          Tiket sudah selesai. Beri rating layanan:
        </h3>
        <p className="text-xs text-[var(--muted)]">
          Rating membantu kami meningkatkan kualitas penanganan IT.
        </p>
      </div>

      <div className="flex gap-2" aria-label={`Rating ${rating} dari 5`}>
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            aria-label={`${star} bintang`}
            aria-pressed={rating === star}
            disabled={pending}
            onClick={() => setRating(star)}
            className={`text-3xl transition-colors disabled:opacity-50 ${
              rating >= star
                ? "text-amber-400"
                : "text-slate-300 hover:text-amber-300"
            }`}
          >
            ★
          </button>
        ))}
      </div>

      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="text-sm text-emerald-700">
          {notice}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="min-h-10 rounded-lg bg-[#1d4ed8] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1e40af] disabled:opacity-50"
      >
        {pending ? "Menutup..." : "Tutup Tiket & Kirim Rating"}
      </button>
    </form>
  );
}
