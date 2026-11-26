import { describe, expect, it } from "vitest";
import { computeWorkloadMetrics, escapeCsvCell } from "@/lib/laporan-metrics";

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
});
