export type InventoryStockItem = {
  id: string;
  kode: string;
  nama: string;
  satuan: string;
  jumlah_stok: number;
  stok_minimum: number;
  catatan: string | null;
  updated_at?: string;
};

export type StockAvailabilityStatus = "tersedia" | "menipis" | "habis";

/**
 * Menentukan status ketersediaan stok sparepart.
 */
export function evaluateStockStatus(
  jumlahStok: number,
  stokMinimum: number,
): StockAvailabilityStatus {
  if (jumlahStok <= 0) return "habis";
  if (jumlahStok <= stokMinimum) return "menipis";
  return "tersedia";
}

/**
 * Menghitung tanggal estimasi pengadaan bulan berikutnya (tanggal 1 bulan depan dalam WIB, YYYY-MM-DD).
 */
export function getNextMonthProcurementDate(now: Date = new Date()): string {
  const wibDateStr = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);

  const [yearStr, monthStr] = wibDateStr.split("-");
  let year = Number(yearStr);
  let month = Number(monthStr);

  if (month === 12) {
    year += 1;
    month = 1;
  } else {
    month += 1;
  }

  return `${year}-${String(month).padStart(2, "0")}-01`;
}

/**
 * Memformat tanggal YYYY-MM-DD (atau ISO timestamp) menjadi format bulan & tahun Indonesia yang mudah dibaca.
 */
export function formatProcurementEstimate(dateValue: string | null | undefined): string | null {
  if (!dateValue) return null;
  const parsed = dateValue.length === 10 ? new Date(`${dateValue}T00:00:00+07:00`) : new Date(dateValue);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Jakarta",
  }).format(parsed);
}

/**
 * Menentukan status awal tiket & apakah butuh approval GA berdasarkan kategori & stok sparepart saat ini.
 */
export function resolveInitialTicketStockState(
  stockKode: string | null | undefined,
  stocksByKode: Record<string, Pick<InventoryStockItem, "jumlah_stok" | "nama">>,
  now: Date = new Date(),
): {
  needsProcurement: boolean;
  status: "baru" | "menunggu_pengadaan";
  estimasiPengadaan: string | null;
  stockNama: string | null;
  availableCount: number | null;
} {
  if (!stockKode) {
    return {
      needsProcurement: false,
      status: "baru",
      estimasiPengadaan: null,
      stockNama: null,
      availableCount: null,
    };
  }

  const entry = stocksByKode[stockKode];
  const available = entry ? entry.jumlah_stok : 0;
  const stockNama = entry?.nama ?? stockKode;

  if (available <= 0) {
    return {
      needsProcurement: true,
      status: "menunggu_pengadaan",
      estimasiPengadaan: getNextMonthProcurementDate(now),
      stockNama,
      availableCount: 0,
    };
  }

  return {
    needsProcurement: false,
    status: "baru",
    estimasiPengadaan: null,
    stockNama,
    availableCount: available,
  };
}
