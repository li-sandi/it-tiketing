import { describe, expect, it } from "vitest";
import {
  computeWorkloadMetrics,
  escapeCsvCell,
  formatPeriodRange,
} from "@/lib/laporan-metrics";

describe("laporan metrics and CSV escaping", () => {
  it("neutralizes CSV formula injection characters", () => {
    expect(escapeCsvCell("=CMD('calc')")).toBe("'=CMD('calc')");
    expect(escapeCsvCell("+1+1")).toBe("'+1+1");
    expect(escapeCsvCell("-1")).toBe("'-1");
    expect(escapeCsvCell("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(escapeCsvCell('halo, "dunia"')).toBe('"halo, ""dunia"""');
  });

  it("aggregates workload metrics and sorts IT staff alphabetically", () => {
    const metrics = computeWorkloadMetrics(
      [
        {
          id: "1",
          nomor_tiket: "TKT-1",
          prioritas: "P1",
          status: "selesai",
          it_id: "it-b",
          category_id: "cat-1",
          poin_kesulitan: 4,
          rating: 5,
          dibuat_pada: "2026-11-26T01:00:00.000Z",
          diproses_pada: "2026-11-26T01:10:00.000Z",
          selesai_pada: "2026-11-26T02:00:00.000Z",
          sla_respon_batas: "2026-11-26T01:15:00.000Z",
          sla_resolusi_batas: "2026-11-26T03:00:00.000Z",
        },
        {
          id: "2",
          nomor_tiket: "TKT-2",
          prioritas: "P2",
          status: "diproses",
          it_id: "it-a",
          category_id: "cat-1",
          poin_kesulitan: null,
          rating: null,
          dibuat_pada: "2026-11-26T02:00:00.000Z",
          diproses_pada: "2026-11-26T02:20:00.000Z",
          selesai_pada: null,
          sla_respon_batas: "2026-11-26T02:30:00.000Z",
          sla_resolusi_batas: "2026-11-26T06:00:00.000Z",
        },
      ],
      [
        { id: "it-b", nama: "Zaki" },
        { id: "it-a", nama: "Andi" },
      ],
    );

    expect(metrics.summary.totalTiket).toBe(2);
    expect(metrics.summary.tiketAktif).toBe(1);
    expect(metrics.summary.tiketSelesai).toBe(1);
    expect(metrics.summary.slaPatuhPersen).toBe(100);
    expect(metrics.summary.totalPoinKesulitan).toBe(4);
    expect(metrics.workloadByIt.map((r) => r.nama)).toEqual(["Andi", "Zaki"]);
    expect(metrics.workloadByIt[1].totalPoin).toBe(4);
  });

  it("clamps/fallbacks extreme tahun and kuartal values in formatPeriodRange without RangeError", () => {
    const fixedNow = new Date("2026-11-26T10:00:00.000Z");

    for (const badYear of [99999999, -1, Infinity, -Infinity, NaN, 2026.5]) {
      const monthly = formatPeriodRange({
        periode: "bulanan",
        tahun: badYear,
        now: fixedNow,
      });
      expect(monthly.start.toISOString()).toBe("2026-10-31T17:00:00.000Z");
      expect(monthly.end.toISOString()).toBe("2026-11-30T17:00:00.000Z");

      const quarterly = formatPeriodRange({
        periode: "kuartalan",
        tahun: badYear,
        kuartal: 99,
        now: fixedNow,
      });
      expect(quarterly.start.toISOString()).toBe("2026-12-31T17:00:00.000Z".replace("2026-12-31", "2025-12-31"));
      expect(() => quarterly.end.toISOString()).not.toThrow();
      expect(quarterly.label).toBe("Q1 2026");
    }

    const validQ3 = formatPeriodRange({
      periode: "kuartalan",
      tahun: 2025,
      kuartal: 3,
      now: fixedNow,
    });
    expect(validQ3.start.toISOString()).toBe("2025-06-30T17:00:00.000Z");
    expect(validQ3.end.toISOString()).toBe("2025-09-30T17:00:00.000Z");
    expect(validQ3.label).toBe("Q3 2025");
  });
});
