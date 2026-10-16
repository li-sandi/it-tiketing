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

export default function SlaTimer({
  label,
  batas,
  berhenti = false,
}: {
  label: string;
  batas: string | null;
  berhenti?: boolean;
}) {
  const [remaining, setRemaining] = useState("—");

  useEffect(() => {
    if (!batas) return;
    const target = new Date(batas).getTime();
    if (!Number.isFinite(target)) return;

    const tick = () => setRemaining(formatRemaining(target - Date.now()));
    tick();
    if (berhenti) return;

    const intervalId = window.setInterval(tick, 1000);
    return () => window.clearInterval(intervalId);
  }, [batas, berhenti]);

  if (!batas) return null;

  const late = remaining === "LEWAT";
  return (
    <div className="text-sm">
      <span className="text-gray-600">{label}: </span>
      <span className={late ? "font-bold text-red-600" : "font-medium"}>
        {remaining}
        {berhenti ? " (berhenti)" : ""}
      </span>
    </div>
  );
}
