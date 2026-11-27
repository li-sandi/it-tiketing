"use client";

import { useEffect, useRef, useState } from "react";

export type LightboxImage = {
  url: string;
  alt?: string;
  caption?: string;
};

type ImageLightboxProps = {
  images: LightboxImage[];
  initialIndex?: number;
  open: boolean;
  onClose: () => void;
};

function normalizeLightboxIndex(initialIndex: number, length: number): number {
  if (length <= 0 || !Number.isFinite(initialIndex)) return 0;
  return Math.min(Math.max(0, Math.floor(initialIndex)), length - 1);
}

function getSafeLightboxHref(rawUrl: string): string | null {
  const trimmed = rawUrl.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("/") && !trimmed.startsWith("//")) {
    return trimmed;
  }
  try {
    const parsed = new URL(trimmed);
    if (
      parsed.protocol === "http:" ||
      parsed.protocol === "https:" ||
      parsed.protocol === "blob:"
    ) {
      return trimmed;
    }
    if (
      parsed.protocol === "data:" &&
      /^data:image\/(?!svg\+xml)/i.test(trimmed)
    ) {
      return trimmed;
    }
    return null;
  } catch {
    return null;
  }
}

function LightboxDialog({
  images,
  initialIndex,
  onClose,
}: {
  images: LightboxImage[];
  initialIndex: number;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(() =>
    normalizeLightboxIndex(initialIndex, images.length),
  );
  const [zoomed, setZoomed] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  const hasMultiple = images.length > 1;
  const current = images[index] ?? images[0];
  const safeExternalHref = getSafeLightboxHref(current.url);

  useEffect(() => {
    previousFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (hasMultiple && e.key === "ArrowLeft") {
        e.preventDefault();
        setZoomed(false);
        setIndex((prev) => (prev - 1 + images.length) % images.length);
      } else if (hasMultiple && e.key === "ArrowRight") {
        e.preventDefault();
        setZoomed(false);
        setIndex((prev) => (prev + 1) % images.length);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prevOverflow;
      previousFocusRef.current?.focus();
    };
  }, [hasMultiple, images.length, onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={current.alt || "Pratinjau gambar"}
      className="fixed inset-0 z-50 flex flex-col bg-slate-950/85 text-slate-100 backdrop-blur-xs"
    >
      <div
        className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 bg-slate-900/95 px-4 py-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex min-w-0 items-center gap-3">
          {hasMultiple && (
            <span className="tabular-nums rounded-md border border-slate-700 bg-slate-800 px-2 py-0.5 text-xs font-medium text-slate-200">
              {index + 1} / {images.length}
            </span>
          )}
          <p className="truncate text-sm font-medium text-slate-100">
            {current.caption || current.alt || "Lampiran gambar"}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setZoomed((prev) => !prev)}
            aria-pressed={zoomed}
            className="min-h-8 rounded-lg border border-slate-700 bg-slate-800 px-3 py-1 text-xs font-medium text-slate-100 hover:bg-slate-700"
          >
            {zoomed ? "Ukuran Normal (1x)" : "Perbesar (1.75x)"}
          </button>
          {safeExternalHref && (
            <a
              href={safeExternalHref}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-8 items-center rounded-lg border border-slate-700 bg-slate-800 px-3 py-1 text-xs font-medium text-slate-100 hover:bg-slate-700"
            >
              Buka tab baru
            </a>
          )}
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="Tutup pratinjau"
            className="inline-flex min-h-8 items-center gap-1.5 rounded-lg bg-[#1d4ed8] px-3 py-1 text-xs font-semibold text-white hover:bg-[#1e40af]"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="h-4 w-4"
            >
              <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
            </svg>
            Tutup
          </button>
        </div>
      </div>

      <div
        className={`relative flex flex-1 overflow-auto p-4 sm:p-6 ${
          zoomed ? "items-start justify-start" : "items-center justify-center"
        }`}
        onClick={onClose}
      >
        {hasMultiple && (
          <button
            type="button"
            aria-label="Gambar sebelumnya"
            onClick={(e) => {
              e.stopPropagation();
              setZoomed(false);
              setIndex((prev) => (prev - 1 + images.length) % images.length);
            }}
            className="absolute left-3 z-10 inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-700 bg-slate-900/90 text-white hover:bg-slate-800"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="h-5 w-5"
            >
              <path
                fillRule="evenodd"
                d="M11.78 5.22a.75.75 0 0 1 0 1.06L8.06 10l3.72 3.72a.75.75 0 1 1-1.06 1.06l-4.25-4.25a.75.75 0 0 1 0-1.06l4.25-4.25a.75.75 0 0 1 1.06 0Z"
                clipRule="evenodd"
              />
            </svg>
          </button>
        )}

        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={current.url}
          alt={current.alt || "Pratinjau lampiran"}
          onClick={(e) => {
            e.stopPropagation();
            setZoomed((prev) => !prev);
          }}
          className={`rounded-lg border border-slate-700 bg-slate-900 object-contain shadow-2xl transition-transform duration-150 ${
            zoomed
              ? "max-h-none max-w-none cursor-zoom-out"
              : "max-h-[76vh] max-w-[90vw] cursor-zoom-in"
          }`}
          style={
            zoomed
              ? { transform: "scale(1.75)", transformOrigin: "top left" }
              : undefined
          }
        />

        {hasMultiple && (
          <button
            type="button"
            aria-label="Gambar berikutnya"
            onClick={(e) => {
              e.stopPropagation();
              setZoomed(false);
              setIndex((prev) => (prev + 1) % images.length);
            }}
            className="absolute right-3 z-10 inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-700 bg-slate-900/90 text-white hover:bg-slate-800"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="h-5 w-5"
            >
              <path
                fillRule="evenodd"
                d="M8.22 5.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06-1.06L11.94 10 8.22 6.28a.75.75 0 0 1 0-1.06Z"
                clipRule="evenodd"
              />
            </svg>
          </button>
        )}
      </div>

      {hasMultiple && (
        <div
          className="flex items-center justify-center gap-2 overflow-x-auto border-t border-slate-800 bg-slate-900/95 px-4 py-2.5"
          onClick={(e) => e.stopPropagation()}
        >
          {images.map((img, idx) => (
            <button
              key={`${img.url}-${idx}`}
              type="button"
              aria-label={`Pilih gambar ${idx + 1}`}
              aria-current={idx === index}
              onClick={() => {
                setZoomed(false);
                setIndex(idx);
              }}
              className={`h-12 w-12 shrink-0 overflow-hidden rounded-lg border-2 ${
                idx === index
                  ? "border-[#3b82f6]"
                  : "border-slate-700 opacity-70 hover:opacity-100"
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={img.url}
                alt={img.alt || `Thumbnail ${idx + 1}`}
                className="h-full w-full object-cover"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ImageLightbox({
  images,
  initialIndex = 0,
  open,
  onClose,
}: ImageLightboxProps) {
  if (!open || images.length === 0) return null;

  const safeInitialIndex = normalizeLightboxIndex(initialIndex, images.length);

  return (
    <LightboxDialog
      key={`${safeInitialIndex}-${images.length}`}
      images={images}
      initialIndex={safeInitialIndex}
      onClose={onClose}
    />
  );
}
