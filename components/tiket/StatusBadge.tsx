import {
  isTicketStatus,
  ticketStatusLabels,
  type TicketStatus,
} from "@/lib/tiket-status";

const statusColors: Record<TicketStatus, string> = {
  baru: "bg-blue-100 text-blue-800",
  diproses: "bg-yellow-100 text-yellow-800",
  menunggu_user: "bg-orange-100 text-orange-800",
  dijadwalkan_kunjungan: "bg-purple-100 text-purple-800",
  menunggu_pengadaan: "bg-pink-100 text-pink-800",
  selesai: "bg-green-100 text-green-800",
  ditutup: "bg-gray-100 text-gray-800",
};

const priorityColors: Record<string, string> = {
  P0: "bg-red-700 text-white",
  P1: "bg-orange-700 text-white",
  P2: "bg-yellow-200 text-yellow-950",
  P3: "bg-gray-200 text-gray-800",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`rounded px-2 py-1 text-xs font-medium ${
        isTicketStatus(status)
          ? statusColors[status]
          : "bg-gray-100 text-gray-800"
      }`}
    >
      {isTicketStatus(status) ? ticketStatusLabels[status] : status}
    </span>
  );
}

export function PrioritasBadge({ prioritas }: { prioritas: string }) {
  return (
    <span
      className={`rounded px-2 py-1 text-xs font-bold ${
        priorityColors[prioritas] ?? "bg-gray-100 text-gray-800"
      }`}
    >
      {prioritas}
    </span>
  );
}
