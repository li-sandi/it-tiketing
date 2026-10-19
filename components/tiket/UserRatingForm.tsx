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
      className="space-y-4 rounded border bg-gray-50 p-4"
    >
      <div>
        <h3 className="font-medium">Tiket sudah selesai. Beri rating:</h3>
        <p className="text-sm text-gray-500">
          Rating membantu kami meningkatkan layanan IT.
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
                ? "text-yellow-400"
                : "text-gray-300 hover:text-yellow-200"
            }`}
          >
            ★
          </button>
        ))}
      </div>

      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="text-sm text-green-700">
          {notice}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="rounded bg-black px-4 py-2 text-white disabled:opacity-50"
      >
        {pending ? "Menutup..." : "Tutup Tiket & Kirim Rating"}
      </button>
    </form>
  );
}
