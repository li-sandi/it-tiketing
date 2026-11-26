import { describe, expect, it } from "vitest";
import { hitungPrioritas, parseAturanKenaikan } from "@/lib/prioritas";

describe("hitungPrioritas (Debito Jogja 400 user)", () => {
  it("keeps Internet lambat at P1 for <= 50% (200/400) and escalates at 201/400", () => {
    const rule = parseAturanKenaikan({
      tipe: "persen_site",
      threshold: 0.5,
      naik_ke: "P0",
    });

    expect(
      hitungPrioritas({
        prioritasDefault: "P1",
        aturan: rule,
        jumlahUserTerdampak: 200,
        jumlahUserSite: 400,
      }),
    ).toBe("P1");

    expect(
      hitungPrioritas({
        prioritasDefault: "P1",
        aturan: rule,
        jumlahUserTerdampak: 201,
        jumlahUserSite: 400,
      }),
    ).toBe("P0");
  });

  it("keeps Masalah VPN at P1 for 5 users and escalates to P0 for 6 users", () => {
    const rule = parseAturanKenaikan({
      tipe: "jumlah_user",
      threshold: 5,
      naik_ke: "P0",
    });

    expect(
      hitungPrioritas({
        prioritasDefault: "P1",
        aturan: rule,
        jumlahUserTerdampak: 5,
      }),
    ).toBe("P1");

    expect(
      hitungPrioritas({
        prioritasDefault: "P1",
        aturan: rule,
        jumlahUserTerdampak: 6,
      }),
    ).toBe("P0");
  });

  it("keeps Aktivasi VPN at P1 for 10 tasks and escalates to P0 for 11 tasks", () => {
    const rule = parseAturanKenaikan({
      tipe: "jumlah_task",
      threshold: 10,
      operator: ">",
      naik_ke: "P0",
    });

    expect(
      hitungPrioritas({
        prioritasDefault: "P1",
        aturan: rule,
        jumlahTaskVendor: 10,
      }),
    ).toBe("P1");

    expect(
      hitungPrioritas({
        prioritasDefault: "P1",
        aturan: rule,
        jumlahTaskVendor: 11,
      }),
    ).toBe("P0");
  });

  it("returns null for malformed escalation rules", () => {
    expect(parseAturanKenaikan({ tipe: "persen_site", threshold: -1, naik_ke: "P0" })).toBeNull();
    expect(parseAturanKenaikan({ tipe: "jumlah_task", threshold: 10, operator: "==", naik_ke: "P0" })).toBeNull();
  });
});
