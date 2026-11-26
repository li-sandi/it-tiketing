import { describe, expect, it } from "vitest";
import {
  evaluateStockStatus,
  formatProcurementEstimate,
  getNextMonthProcurementDate,
  resolveInitialTicketStockState,
} from "@/lib/stok";

describe("stok helper & auto-procurement", () => {
  it("evaluates stock status thresholds correctly", () => {
    expect(evaluateStockStatus(0, 2)).toBe("habis");
    expect(evaluateStockStatus(2, 2)).toBe("menipis");
    expect(evaluateStockStatus(1, 3)).toBe("menipis");
    expect(evaluateStockStatus(5, 2)).toBe("tersedia");
  });

  it("calculates 1st day of next month in WIB", () => {
    expect(getNextMonthProcurementDate(new Date("2026-11-26T04:00:00Z"))).toBe(
      "2026-12-01",
    );
    expect(getNextMonthProcurementDate(new Date("2026-12-31T20:00:00Z"))).toBe(
      "2027-02-01",
    ); // 20:00Z on Dec 31 is already Jan 1 03:00 WIB -> next month is Feb 1!
    expect(getNextMonthProcurementDate(new Date("2026-12-15T10:00:00Z"))).toBe(
      "2027-01-01",
    );
  });

  it("formats procurement dates in Indonesian locale", () => {
    const formatted = formatProcurementEstimate("2026-12-01");
    expect(formatted).toContain("2026");
    expect(formatProcurementEstimate(null)).toBeNull();
  });

  it("resolves immediate action when stock > 0 and auto-procurement when stock = 0", () => {
    const stocks = {
      ram: { nama: "RAM Laptop", jumlah_stok: 3 },
      kabel_power: { nama: "Kabel Power", jumlah_stok: 0 },
    };

    const available = resolveInitialTicketStockState(
      "ram",
      stocks,
      new Date("2026-11-26T04:00:00Z"),
    );
    expect(available.needsProcurement).toBe(false);
    expect(available.status).toBe("baru");
    expect(available.estimasiPengadaan).toBeNull();
    expect(available.availableCount).toBe(3);

    const outOfStock = resolveInitialTicketStockState(
      "kabel_power",
      stocks,
      new Date("2026-11-26T04:00:00Z"),
    );
    expect(outOfStock.needsProcurement).toBe(true);
    expect(outOfStock.status).toBe("menunggu_pengadaan");
    expect(outOfStock.estimasiPengadaan).toBe("2026-12-01");
    expect(outOfStock.availableCount).toBe(0);

    const unlinked = resolveInitialTicketStockState(null, stocks);
    expect(unlinked.needsProcurement).toBe(false);
    expect(unlinked.status).toBe("baru");
  });
});
