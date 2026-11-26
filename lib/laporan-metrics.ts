export type ReportPeriod = "mingguan" | "bulanan" | "kuartalan";

export type ReportTicketRow = {
  id: string;
  nomor_tiket: string;
  prioritas: string;
  status: string;
  it_id: string | null;
  category_id: string;
  poin_kesulitan: number | null;
  rating: number | null;
  dibuat_pada: string;
  diproses_pada: string | null;
  selesai_pada: string | null;
  sla_respon_batas: string | null;
  sla_resolusi_batas: string | null;
};

export type ItWorkloadRow = {
  itId: string;
  nama: string;
  tiketAktif: number;
  tiketSelesai: number;
  totalPoin: number;
  rataPoin: number | null;
  rataResponMenit: number | null;
  rataResolusiMenit: number | null;
  slaPatuhPersen: number | null;
  rataRating: number | null;
};

export function escapeCsvCell(value: unknown): string {
  const raw = value === null || value === undefined ? "" : String(value);
  const formulaSafe = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  if (/[",\n\r]/.test(formulaSafe)) {
    return `"${formulaSafe.replace(/"/g, '""')}"`;
  }
  return formulaSafe;
}

export function formatPeriodRange(params: {
  periode: ReportPeriod;
  tahun: number;
  kuartal?: number;
  now?: Date;
}): { start: Date; end: Date; label: string } {
  const now = params.now ?? new Date();
  if (params.periode === "mingguan") {
    const end = new Date(now.getTime());
    const start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    return {
      start,
      end,
      label: "7 Hari Terakhir",
    };
  }
  if (params.periode === "bulanan") {
    const wib = new Date(now.getTime() + 7 * 60 * 60 * 1000);
    const year = params.tahun || wib.getUTCFullYear();
    const month = wib.getUTCMonth();
    const start = new Date(Date.UTC(year, month, 1, -7, 0, 0));
    const end = new Date(Date.UTC(year, month + 1, 1, -7, 0, 0));
    return {
      start,
      end,
      label: new Intl.DateTimeFormat("id-ID", {
        month: "long",
        year: "numeric",
        timeZone: "Asia/Jakarta",
      }).format(now),
    };
  }

  const q = Math.min(4, Math.max(1, params.kuartal ?? 1));
  const startMonth = (q - 1) * 3;
  const start = new Date(Date.UTC(params.tahun, startMonth, 1, -7, 0, 0));
  const end = new Date(Date.UTC(params.tahun, startMonth + 3, 1, -7, 0, 0));
  return {
    start,
    end,
    label: `Q${q} ${params.tahun}`,
  };
}

export function computeWorkloadMetrics(
  tickets: ReportTicketRow[],
  staffList: Array<{ id: string; nama: string }>,
): {
  summary: {
    totalTiket: number;
    tiketAktif: number;
    tiketSelesai: number;
    rataResponMenit: number | null;
    rataResolusiMenit: number | null;
    slaPatuhPersen: number | null;
    rataRating: number | null;
    totalPoinKesulitan: number;
  };
  workloadByIt: ItWorkloadRow[];
} {
  const activeStatuses = new Set([
    "baru",
    "diproses",
    "menunggu_user",
    "dijadwalkan_kunjungan",
    "menunggu_pengadaan",
  ]);

  let responseSum = 0;
  let responseCount = 0;
  let resolutionSum = 0;
  let resolutionCount = 0;
  let slaEligible = 0;
  let slaMet = 0;
  let ratingSum = 0;
  let ratingCount = 0;
  let totalPoints = 0;
  let totalActive = 0;
  let totalDone = 0;

  type Acc = {
    active: number;
    done: number;
    points: number;
    pointCount: number;
    respSum: number;
    respCount: number;
    resSum: number;
    resCount: number;
    slaEligible: number;
    slaMet: number;
    ratingSum: number;
    ratingCount: number;
  };

  const accByIt = new Map<string, Acc>();
  for (const staff of staffList) {
    accByIt.set(staff.id, {
      active: 0,
      done: 0,
      points: 0,
      pointCount: 0,
      respSum: 0,
      respCount: 0,
      resSum: 0,
      resCount: 0,
      slaEligible: 0,
      slaMet: 0,
      ratingSum: 0,
      ratingCount: 0,
    });
  }

  for (const t of tickets) {
    const isActive = activeStatuses.has(t.status);
    const isDone = t.status === "selesai" || t.status === "ditutup";
    if (isActive) totalActive++;
    if (isDone) totalDone++;
    if (t.poin_kesulitan !== null) totalPoints += t.poin_kesulitan;
    if (t.rating !== null) {
      ratingSum += t.rating;
      ratingCount++;
    }

    const createdMs = new Date(t.dibuat_pada).getTime();
    const respMins =
      t.diproses_pada && Number.isFinite(createdMs)
        ? Math.max(0, (new Date(t.diproses_pada).getTime() - createdMs) / 60000)
        : null;
    if (respMins !== null) {
      responseSum += respMins;
      responseCount++;
    }

    const resMins =
      t.selesai_pada && Number.isFinite(createdMs)
        ? Math.max(0, (new Date(t.selesai_pada).getTime() - createdMs) / 60000)
        : null;
    if (resMins !== null) {
      resolutionSum += resMins;
      resolutionCount++;
    }

    let ticketSlaMet: boolean | null = null;
    if (isDone && t.selesai_pada && t.sla_resolusi_batas) {
      slaEligible++;
      const met =
        new Date(t.selesai_pada).getTime() <=
        new Date(t.sla_resolusi_batas).getTime();
      if (met) slaMet++;
      ticketSlaMet = met;
    }

    if (t.it_id) {
      let acc = accByIt.get(t.it_id);
      if (!acc) {
        acc = {
          active: 0,
          done: 0,
          points: 0,
          pointCount: 0,
          respSum: 0,
          respCount: 0,
          resSum: 0,
          resCount: 0,
          slaEligible: 0,
          slaMet: 0,
          ratingSum: 0,
          ratingCount: 0,
        };
        accByIt.set(t.it_id, acc);
      }
      if (isActive) acc.active++;
      if (isDone) acc.done++;
      if (t.poin_kesulitan !== null) {
        acc.points += t.poin_kesulitan;
        acc.pointCount++;
      }
      if (respMins !== null) {
        acc.respSum += respMins;
        acc.respCount++;
      }
      if (resMins !== null) {
        acc.resSum += resMins;
        acc.resCount++;
      }
      if (ticketSlaMet !== null) {
        acc.slaEligible++;
        if (ticketSlaMet) acc.slaMet++;
      }
      if (t.rating !== null) {
        acc.ratingSum += t.rating;
        acc.ratingCount++;
      }
    }
  }

  const nameMap = new Map(staffList.map((s) => [s.id, s.nama]));
  // Workload view sorted alphabetically by name (never ranked!)
  const workloadByIt: ItWorkloadRow[] = Array.from(accByIt.entries())
    .map(([itId, acc]) => ({
      itId,
      nama: nameMap.get(itId) ?? "IT",
      tiketAktif: acc.active,
      tiketSelesai: acc.done,
      totalPoin: acc.points,
      rataPoin:
        acc.pointCount > 0 ? Number((acc.points / acc.pointCount).toFixed(1)) : null,
      rataResponMenit:
        acc.respCount > 0 ? Math.round(acc.respSum / acc.respCount) : null,
      rataResolusiMenit:
        acc.resCount > 0 ? Math.round(acc.resSum / acc.resCount) : null,
      slaPatuhPersen:
        acc.slaEligible > 0
          ? Math.round((acc.slaMet / acc.slaEligible) * 100)
          : null,
      rataRating:
        acc.ratingCount > 0
          ? Number((acc.ratingSum / acc.ratingCount).toFixed(2))
          : null,
    }))
    .sort((a, b) => a.nama.localeCompare(b.nama, "id"));

  return {
    summary: {
      totalTiket: tickets.length,
      tiketAktif: totalActive,
      tiketSelesai: totalDone,
      rataResponMenit:
        responseCount > 0 ? Math.round(responseSum / responseCount) : null,
      rataResolusiMenit:
        resolutionCount > 0 ? Math.round(resolutionSum / resolutionCount) : null,
      slaPatuhPersen:
        slaEligible > 0 ? Math.round((slaMet / slaEligible) * 100) : null,
      rataRating:
        ratingCount > 0 ? Number((ratingSum / ratingCount).toFixed(2)) : null,
      totalPoinKesulitan: totalPoints,
    },
    workloadByIt,
  };
}
