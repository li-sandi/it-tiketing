import { describe, expect, it } from "vitest";
import { buildAssetCsvTemplate, parseAssetsCsv } from "@/lib/aset-csv";

describe("aset-csv parser", () => {
  it("parses template CSV cleanly with valid rows and zero errors", () => {
    const csv = buildAssetCsvTemplate();
    const { rows, errors } = parseAssetsCsv(csv);

    expect(errors).toEqual([]);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({
      nomor_aset: "DJ-LPT-001",
      nama_perangkat: "Lenovo ThinkPad T14 Gen 2",
      tipe: "laptop",
      ram_gb: 8,
      pemegang_nama: "Budi Santoso",
      anydesk_id: "123456789",
      uv_id: "98765432",
      status: "aktif",
    });
    expect(rows[1].ram_gb).toBe(4);
    expect(rows[1].uv_id).toBeNull();
  });

  it("supports BOM, semicolon delimiter, quoted cells, and deduplication", () => {
    const csv = `\uFEFFno_aset;model;ram;pemegang
"DJ-01";"Laptop \"Rent\" 14";8 GB;Andi
DJ-01;Laptop Rent 14 Rev;16;Andi`;

    const { rows, errors } = parseAssetsCsv(csv);
    expect(errors).toEqual([]);
    expect(rows).toHaveLength(1);
    expect(rows[0].nama_perangkat).toBe("Laptop Rent 14 Rev");
    expect(rows[0].ram_gb).toBe(16);
  });

  it("rejects invalid RAM and missing required fields", () => {
    const csv = [
      "nomor_aset,nama_perangkat,ram_gb",
      "X,Valid Laptop,8",
      "DJ-003,Laptop Valid,2048",
      "DJ-004,Laptop Oke,8",
    ].join("\n");

    const { rows, errors } = parseAssetsCsv(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0].nomor_aset).toBe("DJ-004");
    expect(errors).toHaveLength(2);
  });

  it("requires nomor_aset and nama_perangkat headers", () => {
    const { rows, errors } = parseAssetsCsv("kode,ram\nA1,8");
    expect(rows).toEqual([]);
    expect(errors[0]).toContain("nomor_aset");
  });
});
