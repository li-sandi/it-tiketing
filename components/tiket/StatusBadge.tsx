import {
  isTicketStatus,
  ticketStatusLabels,
  type TicketStatus,
} from "@/lib/tiket-status";

const statusStyles: Record<TicketStatus, { badge: string; dot: string }> = {
  baru: {
    badge: "border-blue-200 bg-blue-50 text-blue-800",
    dot: "bg-blue-600",
  },
  diproses: {
    badge: "border-amber-200 bg-amber-50 text-amber-800",
    dot: "bg-amber-600",
  },
  menunggu_user: {
    badge: "border-orange-200 bg-orange-100 text-orange-800",
    dot: "bg-orange-600",
  },
  dijadwalkan_kunjungan: {
    badge: "border-purple-200 bg-purple-100 text-purple-800",
    dot: "bg-purple-600",
  },
  menunggu_pengadaan: {
    badge: "border-amber-300 bg-amber-100 text-amber-900",
    dot: "bg-amber-700",
  },
  selesai: {
    badge: "border-emerald-200 bg-emerald-50 text-emerald-800",
    dot: "bg-emerald-600",
  },
  ditutup: {
    badge: "border-slate-200 bg-slate-100 text-slate-800",
    dot: "bg-slate-500",
  },
};

const priorityColors: Record<string, string> = {
  P0: "bg-red-700 text-white border border-red-800",
  P1: "bg-orange-700 text-white border border-orange-800",
  P2: "bg-amber-100 text-amber-900 border border-amber-300",
  P3: "bg-slate-100 text-slate-800 border border-slate-300",
};

export function StatusBadge({ status }: { status: string }) {
  const style = isTicketStatus(status)
    ? statusStyles[status]
    : { badge: "border-slate-200 bg-slate-100 text-slate-800", dot: "bg-slate-500" };

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium ${style.badge}`}
    >
      <span aria-hidden="true" className={`size-1.5 rounded-full ${style.dot}`} />
      {isTicketStatus(status) ? ticketStatusLabels[status] : status}
    </span>
  );
}

export function PrioritasBadge({ prioritas }: { prioritas: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-bold tabular-nums ${
        priorityColors[prioritas] ?? "border border-slate-200 bg-slate-100 text-slate-800"
      }`}
    >
      {prioritas}
    </span>
  );
}
