"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { PrioritasBadge, StatusBadge } from "@/components/tiket/StatusBadge";
import { formatProcurementEstimate } from "@/lib/stok";
import { ticketStatusLabels } from "@/lib/tiket-status";

export type TicketStatusData = {
  nomor_tiket: string;
  status: string;
  prioritas: string;
  prioritas_awal?: string | null;
  aging_level?: number;
  approval_status?: string;
  estimasi_pengadaan?: string | null;
  stock_kode?: string | null;
  kunjungan_pada?: string | null;
  deskripsi: string;
  penanganan: string;
  dibuat_pada: string;
  selesai_pada: string | null;
  poin_kesulitan: number | null;
  catatan_solusi: string | null;
  rating: number | null;
  kategori: string | null;
  site: string | null;
  it: string | null;
};

export type TicketDetail = {
  tiket: TicketStatusData;
  events: Array<{
    jenis: string;
    dari: string | null;
    ke: string | null;
    waktu: string;
    aktor: string;
  }>;
  attachments: Array<{ id: string; url: string | null; error: string | null }>;
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Jakarta",
  }).format(new Date(value));
}

function describeEvent(event: TicketDetail["events"][number]) {
  if (event.jenis === "status") {
    const from =
      event.dari && event.dari in ticketStatusLabels
        ? ticketStatusLabels[event.dari as keyof typeof ticketStatusLabels]
        : event.dari ?? "—";
    const to =
      event.ke && event.ke in ticketStatusLabels
        ? ticketStatusLabels[event.ke as keyof typeof ticketStatusLabels]
        : event.ke ?? "—";
    return `Status berubah: ${from} → ${to}`;
  }
  if (event.jenis === "assign") return "Tiket ditugaskan ke IT";
  if (event.jenis === "aging") return `Prioritas naik otomatis (${event.dari} → ${event.ke})`;
  if (event.jenis === "merge") return `Digabungkan ke tiket induk ${event.ke}`;
  if (event.jenis === "approval") return `Status persetujuan: ${event.ke}`;
  return "Pembaruan tiket";
}

export default function PublicTicketStatus({
  token,
  initialDetail,
  initialError,
}: {
  token: string;
  initialDetail?: TicketDetail | null;
  initialError?: string | null;
}) {
  const hasInitialState =
    initialDetail !== undefined || initialError !== undefined;
  const [detail, setDetail] = useState<TicketDetail | null>(
    initialDetail ?? null,
  );
  const [error, setError] = useState<string | null>(initialError ?? null);
  const [rating, setRating] = useState(5);
  const [ratingError, setRatingError] = useState<string | null>(null);
  const [ratingPending, setRatingPending] = useState(false);

  useEffect(() => {
    if (hasInitialState) return;
    const controller = new AbortController();

    async function loadTicket() {
      try {
        const response = await fetch(
          `/api/tiket/publik/${encodeURIComponent(token)}`,
          { cache: "no-store", signal: controller.signal },
        );
        const result = (await response.json()) as TicketDetail & {
          error?: string;
        };
        if (!response.ok) {
          setError(result.error ?? "Gagal memuat tiket.");
          return;
        }
        setDetail(result);
      } catch (loadError) {
        if (controller.signal.aborted) return;
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Tidak dapat menghubungi layanan tiket.",
        );
      }
    }

    void loadTicket();
    return () => controller.abort();
  }, [token, hasInitialState]);

  async function refreshTicket() {
    const response = await fetch(
      `/api/tiket/publik/${encodeURIComponent(token)}`,
      { cache: "no-store" },
    );
    const result = (await response.json()) as TicketDetail & { error?: string };
    if (!response.ok) {
      throw new Error(result.error ?? "Gagal memuat status tiket.");
    }
    setDetail(result);
  }

  async function submitRating(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setRatingError(null);
    setRatingPending(true);

    try {
      const response = await fetch(
        `/api/tiket/publik/${encodeURIComponent(token)}/rating`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rating }),
        },
      );
      const result = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(result.error ?? "Gagal mengirim rating.");
      }
      await refreshTicket();
    } catch (submitError) {
      setRatingError(
        submitError instanceof Error
          ? submitError.message
          : "Gagal mengirim rating.",
      );
    } finally {
      setRatingPending(false);
    }
  }

  if (error) {
    return (
      <main className="mx-auto w-full max-w-3xl flex-1 p-8">
        <p role="alert" className="text-red-700">
          {error}
        </p>
        <Link href="/lapor" className="mt-4 inline-block underline">
          Buat tiket baru
        </Link>
      </main>
    );
  }

  if (!detail) {
    return (
      <main className="mx-auto w-full max-w-3xl flex-1 p-8">
        <p role="status">Memuat status tiket…</p>
      </main>
    );
  }

  const { tiket } = detail;
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 space-y-6 px-4 py-8 sm:px-6">
      <div className="rounded-xl border bg-[var(--surface)] p-5 shadow-xs sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="font-mono text-sm font-semibold tabular-nums text-[var(--foreground)]">
              {tiket.nomor_tiket}
            </h1>
            <PrioritasBadge prioritas={tiket.prioritas} />
            <StatusBadge status={tiket.status} />
          </div>
          <Link
            href="/lapor"
            className="text-xs font-medium text-blue-700 hover:underline"
          >
            Buat tiket baru
          </Link>
        </div>
        <h2 className="mt-3 text-xl font-bold text-[var(--foreground)]">
          {tiket.kategori ?? "Tiket Layanan"}
        </h2>
      </div>

      <section className="grid gap-4 rounded-xl border bg-[var(--surface)] p-5 shadow-xs sm:grid-cols-2">
        <div>
          <p className="text-xs font-medium text-[var(--muted)]">Site</p>
          <p className="mt-0.5 text-sm font-medium">{tiket.site ?? "-"}</p>
        </div>
        <div>
          <p className="text-xs font-medium text-[var(--muted)]">Penanganan</p>
          <p className="mt-0.5 text-sm font-medium">
            {tiket.penanganan === "remote" ? "Remote" : "Onsite"}
          </p>
        </div>
        <div>
          <p className="text-xs font-medium text-[var(--muted)]">Waktu Lapor</p>
          <p className="mt-0.5 text-sm font-medium">{formatDate(tiket.dibuat_pada)}</p>
        </div>
        <div>
          <p className="text-xs font-medium text-[var(--muted)]">Petugas IT</p>
          <p className="mt-0.5 text-sm font-medium">
            {tiket.it ?? "Belum ditugaskan"}
          </p>
        </div>
        {tiket.kunjungan_pada && (
          <p className="sm:col-span-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-medium text-blue-800">
            Jadwal Kunjungan:{" "}
            {new Date(`${tiket.kunjungan_pada}T00:00:00.000Z`).toLocaleDateString(
              "id-ID",
              { weekday: "long", dateStyle: "long", timeZone: "UTC" },
            )}
          </p>
        )}
        {tiket.approval_status && tiket.approval_status !== "tidak_perlu" && (
          <p className="sm:col-span-2 text-sm text-[var(--secondary)]">
            Status Persetujuan GA:{" "}
            <strong className="capitalize text-[var(--foreground)]">
              {tiket.approval_status}
            </strong>
          </p>
        )}
        {tiket.status === "menunggu_pengadaan" && (
          <div className="sm:col-span-2 rounded-lg border border-amber-300 bg-amber-50 p-3.5 text-sm text-amber-950">
            <p className="font-semibold">
              Menunggu Pengadaan Sparepart Bulan Depan
            </p>
            <p className="mt-0.5 text-xs">
              Stok sparepart ({tiket.stock_kode ?? "terkait"}) sedang kosong.
              Estimasi pengadaan:{" "}
              <strong>
                {formatProcurementEstimate(tiket.estimasi_pengadaan) ??
                  "Awal bulan depan"}
              </strong>
              .
            </p>
          </div>
        )}
      </section>

      <section className="rounded-xl border bg-[var(--surface)] p-5 shadow-xs">
        <h2 className="mb-2 text-sm font-semibold text-[var(--foreground)]">
          Deskripsi Masalah
        </h2>
        <p className="whitespace-pre-wrap text-sm text-[var(--secondary)]">
          {tiket.deskripsi}
        </p>
      </section>

      {(tiket.poin_kesulitan != null || tiket.catatan_solusi) && (
        <section className="space-y-2 rounded border p-4">
          <h2 className="font-medium">Penyelesaian</h2>
          {tiket.poin_kesulitan != null && (
            <p>Poin kesulitan: {tiket.poin_kesulitan} dari 5</p>
          )}
          {tiket.catatan_solusi && (
            <p className="whitespace-pre-wrap text-sm">
              {tiket.catatan_solusi}
            </p>
          )}
        </section>
      )}

      {tiket.status === "selesai" && (
        <form
          onSubmit={submitRating}
          className="space-y-4 rounded border bg-yellow-50 p-4"
        >
          <div>
            <h2 className="font-medium">Tiket sudah selesai. Beri rating:</h2>
            <p className="text-sm text-gray-600">
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
                disabled={ratingPending}
                onClick={() => setRating(star)}
                className={`text-3xl disabled:opacity-50 ${
                  rating >= star
                    ? "text-yellow-500"
                    : "text-gray-300 hover:text-yellow-300"
                }`}
              >
                ★
              </button>
            ))}
          </div>
          {ratingError && (
            <p role="alert" className="text-sm text-red-700">
              {ratingError}
            </p>
          )}
          <button
            type="submit"
            disabled={ratingPending}
            className="rounded bg-black px-4 py-2 text-white disabled:opacity-50"
          >
            {ratingPending ? "Menutup..." : "Tutup Tiket & Kirim Rating"}
          </button>
        </form>
      )}

      {tiket.status === "ditutup" && tiket.rating != null && (
        <section className="rounded border bg-gray-50 p-4">
          Rating kamu:{" "}
          <span
            aria-label={`${tiket.rating} dari 5 bintang`}
            className="text-lg text-yellow-500"
          >
            {"★".repeat(tiket.rating)}
          </span>
        </section>
      )}

      {detail.attachments.length > 0 && (
        <section className="rounded border p-4">
          <h2 className="mb-3 font-medium">Lampiran</h2>
          <div className="grid grid-cols-2 gap-3">
            {detail.attachments.map((attachment) =>
              attachment.url ? (
                <a
                  key={attachment.id}
                  href={attachment.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="overflow-hidden rounded border"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={attachment.url}
                    alt="Lampiran foto tiket"
                    className="h-40 w-full object-cover"
                  />
                </a>
              ) : (
                <p key={attachment.id} role="alert" className="text-sm text-red-700">
                  {attachment.error ?? "Lampiran tidak dapat dimuat."}
                </p>
              ),
            )}
          </div>
        </section>
      )}

      <section className="rounded border p-4">
        <h2 className="mb-3 font-medium">Riwayat</h2>
        {detail.events.length ? (
          <ul className="space-y-2 text-sm">
            {detail.events.map((event, index) => (
              <li key={`${event.waktu}-${index}`} className="flex flex-wrap gap-2">
                <span className="text-gray-500">{formatDate(event.waktu)}</span>
                <span>
                  <strong>{event.aktor}</strong> — {describeEvent(event)}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-gray-500">Belum ada aktivitas.</p>
        )}
      </section>
    </main>
  );
}
