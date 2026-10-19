export const ticketStatusLabels = {
  baru: "Baru",
  diproses: "Diproses",
  menunggu_user: "Menunggu user",
  dijadwalkan_kunjungan: "Dijadwalkan kunjungan",
  menunggu_pengadaan: "Menunggu pengadaan",
  selesai: "Selesai",
  ditutup: "Ditutup",
} as const;

export type TicketStatus = keyof typeof ticketStatusLabels;

export function isTicketStatus(status: string): status is TicketStatus {
  return Object.hasOwn(ticketStatusLabels, status);
}

const statusTransitions: Record<TicketStatus, readonly TicketStatus[]> = {
  baru: ["diproses"],
  diproses: [
    "selesai",
    "menunggu_user",
    "dijadwalkan_kunjungan",
    "menunggu_pengadaan",
  ],
  menunggu_user: ["diproses"],
  dijadwalkan_kunjungan: ["diproses"],
  menunggu_pengadaan: ["diproses"],
  selesai: [],
  ditutup: [],
};

export function getNextTicketStatuses(status: TicketStatus) {
  return statusTransitions[status];
}
