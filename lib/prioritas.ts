export type Prioritas = "P0" | "P1" | "P2" | "P3";

export type Kenaikan =
  | { tipe: "persen_site"; threshold: number; naik_ke: "P0" }
  | { tipe: "jumlah_user"; threshold: number; naik_ke: "P0" }
  | {
      tipe: "jumlah_task";
      threshold: number;
      operator: ">" | ">=";
      naik_ke: "P0";
    };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function parseAturanKenaikan(value: unknown): Kenaikan | null {
  if (!isRecord(value)) return null;

  const { tipe, threshold, naik_ke } = value;
  if (
    typeof threshold !== "number" ||
    !Number.isFinite(threshold) ||
    threshold < 0 ||
    naik_ke !== "P0"
  ) {
    return null;
  }

  if (tipe === "persen_site" || tipe === "jumlah_user") {
    return { tipe, threshold, naik_ke };
  }

  if (
    tipe === "jumlah_task" &&
    (value.operator === ">" || value.operator === ">=")
  ) {
    return { tipe, threshold, operator: value.operator, naik_ke };
  }

  return null;
}

export function hitungPrioritas(params: {
  prioritasDefault: Prioritas;
  aturan?: Kenaikan | null;
  jumlahUserTerdampak?: number;
  jumlahUserSite?: number;
  jumlahTaskVendor?: number;
}): Prioritas {
  const { prioritasDefault, aturan } = params;
  if (!aturan) return prioritasDefault;

  if (aturan.tipe === "persen_site") {
    const total = params.jumlahUserSite ?? 0;
    const dampak = params.jumlahUserTerdampak ?? 0;
    if (total > 0 && dampak / total > aturan.threshold) return aturan.naik_ke;
  }

  if (aturan.tipe === "jumlah_user") {
    if ((params.jumlahUserTerdampak ?? 0) > aturan.threshold) {
      return aturan.naik_ke;
    }
  }

  if (aturan.tipe === "jumlah_task") {
    const jumlahTask = params.jumlahTaskVendor ?? 0;
    const lolos =
      aturan.operator === ">"
        ? jumlahTask > aturan.threshold
        : jumlahTask >= aturan.threshold;
    if (lolos) return aturan.naik_ke;
  }

  return prioritasDefault;
}
