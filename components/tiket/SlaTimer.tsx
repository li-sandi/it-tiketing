"use client";

import { useEffect, useState } from "react";

function formatRemaining(milliseconds: number) {
  if (milliseconds <= 0) return "LEWAT";

  const totalSeconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return `${hours}j ${remainingMinutes}m`;
  }
  return `${minutes}m ${seconds}s`;
}

function computeProgress(
  startIso: string | null | undefined,
  targetMs: number,
  nowMs: number,
): number | null {
  if (!startIso) return null;
  const startMs = new Date(startIso).getTime();
  if (!Number.isFinite(startMs) || targetMs <= startMs) return null;
  const raw = ((nowMs - startMs) / (targetMs - startMs)) * 100;
  return Math.min(100, Math.max(0, Math.round(raw)));
}

export default function SlaTimer({
  label,
  batas,
  mulai,
  berhenti = false,
}: {
  label: string;
  batas: string | null;
  mulai?: string | null;
  berhenti?: boolean;
}) {
  const [state, setState] = useState<{
    remaining: string;
    percent: number | null;
  }>({ remaining: "-", percent: null });

  useEffect(() => {
    if (!batas) return;
    const target = new Date(batas).getTime();
    if (!Number.isFinite(target)) return;

    const tick = () => {
      const now = Date.now();
      setState({
        remaining: formatRemaining(target - now),
        percent: computeProgress(mulai, target, now),
      });
    };
    tick();
    if (berhenti) return;

    const intervalId = window.setInterval(tick, 1000);
    return () => window.clearInterval(intervalId);
  }, [batas, mulai, berhenti]);

  if (!batas) return null;

  const late = state.remaining === "LEWAT";
  const barTone =
    late || (state.percent ?? 0) >= 100
      ? "bg-red-600"
      : (state.percent ?? 0) >= 70
        ? "bg-amber-500"
        : "bg-emerald-600";

  return (
    <div className="space-y-1.5 text-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[var(--muted)]">{label}</span>
        <span
          className={`tabular-nums ${
            late ? "font-bold text-red-700" : "font-semibold text-[var(--foreground)]"
          }`}
        >
          {state.remaining}
          {berhenti ? " (berhenti)" : ""}
        </span>
      </div>
      {state.percent !== null && (
        <div
          role="progressbar"
          aria-label={`Progres ${label}`}
          aria-valuenow={state.percent}
          aria-valuemin={0}
          aria-valuemax={100}
          className="h-2 w-full overflow-hidden rounded-full bg-[var(--surface-muted)]"
        >
          <div
            className={`h-full rounded-full transition-[width] duration-300 ${barTone}`}
            style={{ width: `${state.percent}%` }}
          />
        </div>
      )}
    </div>
  );
}
