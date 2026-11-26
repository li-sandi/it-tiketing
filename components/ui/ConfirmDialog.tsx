"use client";

import { useEffect, useRef } from "react";

export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Lanjutkan",
  cancelLabel = "Batal",
  danger = false,
  busy = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const cancelRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) return;
    cancelRef.current?.focus();
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && !busy) {
        onCancel();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, busy, onCancel]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      aria-describedby="confirm-dialog-message"
    >
      <div
        className="fixed inset-0 bg-slate-900/50 backdrop-blur-[1px]"
        onClick={() => {
          if (!busy) onCancel();
        }}
      />
      <div className="relative z-10 w-full max-w-md rounded-xl border bg-[var(--surface)] p-5 shadow-xl">
        <h3
          id="confirm-dialog-title"
          className="text-base font-semibold text-[var(--foreground)]"
        >
          {title}
        </h3>
        <p
          id="confirm-dialog-message"
          className="mt-2 text-sm text-[var(--secondary)]"
        >
          {message}
        </p>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button
            ref={cancelRef}
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="min-h-9 rounded-lg border bg-[var(--surface)] px-3.5 py-1.5 text-sm font-medium text-[var(--foreground)] hover:bg-[var(--surface-muted)] disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onConfirm}
            className={`min-h-9 rounded-lg px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-50 ${
              danger
                ? "bg-red-700 hover:bg-red-800"
                : "bg-[#1d4ed8] hover:bg-[#1e40af]"
            }`}
          >
            {busy ? "Memproses..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
