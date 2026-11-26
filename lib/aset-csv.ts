export type ParsedAssetRow = {
  nomor_aset: string;
  nama_perangkat: string;
  tipe: "laptop" | "pc" | "hp" | "printer" | "jaringan" | "lainnya";
  ram_gb: number | null;
  pemegang_nama: string | null;
  anydesk_id: string | null;
  uv_id: string | null;
  status: "aktif" | "perbaikan" | "nonaktif";
};

const VALID_TYPES = new Set([
  "laptop",
  "pc",
  "hp",
  "printer",
  "jaringan",
  "lainnya",
]);
const VALID_STATUSES = new Set(["aktif", "perbaikan", "nonaktif"]);

const HEADER_ALIASES: Record<string, keyof ParsedAssetRow> = {
  nomor_aset: "nomor_aset",
  no_aset: "nomor_aset",
  asset_number: "nomor_aset",
  kode_aset: "nomor_aset",
  nama_perangkat: "nama_perangkat",
  perangkat: "nama_perangkat",
  model: "nama_perangkat",
  device: "nama_perangkat",
  tipe: "tipe",
  type: "tipe",
  jenis: "tipe",
  ram_gb: "ram_gb",
  ram: "ram_gb",
  pemegang_nama: "pemegang_nama",
  pemegang: "pemegang_nama",
  user: "pemegang_nama",
  holder: "pemegang_nama",
  anydesk_id: "anydesk_id",
  anydesk: "anydesk_id",
  uv_id: "uv_id",
  uv: "uv_id",
  ultraviewer_id: "uv_id",
  ultraviewer: "uv_id",
  status: "status",
};

function parseCsvLine(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      cells.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  cells.push(current.trim());
  return cells;
}

export function parseAssetsCsv(csvText: string): {
  rows: ParsedAssetRow[];
  errors: string[];
} {
  const cleaned = csvText.replace(/^\uFEFF/, "").trim();
  if (!cleaned) {
    return { rows: [], errors: ["Konten CSV kosong."] };
  }

  const lines = cleaned
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length < 2) {
    return {
      rows: [],
      errors: ["CSV harus berisi baris header dan minimal 1 baris data aset."],
    };
  }

  if (lines.length - 1 > 500) {
    return {
      rows: [],
      errors: ["Maksimal 500 baris aset per sekali import."],
    };
  }

  const headerLine = lines[0];
  const commaCount = (headerLine.match(/,/g) ?? []).length;
  const semiCount = (headerLine.match(/;/g) ?? []).length;
  const delimiter = semiCount > commaCount ? ";" : ",";

  const rawHeaders = parseCsvLine(headerLine, delimiter).map((h) =>
    h.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, ""),
  );
  const mappedHeaders = rawHeaders.map((h) => HEADER_ALIASES[h] ?? null);

  if (
    !mappedHeaders.includes("nomor_aset") ||
    !mappedHeaders.includes("nama_perangkat")
  ) {
    return {
      rows: [],
      errors: [
        "Header wajib memuat kolom 'nomor_aset' dan 'nama_perangkat'.",
      ],
    };
  }

  const errors: string[] = [];
  const deduped = new Map<string, ParsedAssetRow>();

  for (let i = 1; i < lines.length; i++) {
    const lineNum = i + 1;
    const cells = parseCsvLine(lines[i], delimiter);
    const raw: Partial<Record<keyof ParsedAssetRow, string>> = {};

    mappedHeaders.forEach((field, idx) => {
      if (field && idx < cells.length) {
        raw[field] = cells[idx];
      }
    });

    const nomorAset = (raw.nomor_aset ?? "").trim();
    const namaPerangkat = (raw.nama_perangkat ?? "").trim();

    if (nomorAset.length < 2 || nomorAset.length > 120) {
      errors.push(`Baris ${lineNum}: nomor_aset harus 2-120 karakter.`);
      continue;
    }
    if (namaPerangkat.length < 2 || namaPerangkat.length > 200) {
      errors.push(`Baris ${lineNum}: nama_perangkat harus 2-200 karakter.`);
      continue;
    }

    const tipeRaw = (raw.tipe ?? "laptop").trim().toLowerCase();
    const tipe = (
      VALID_TYPES.has(tipeRaw) ? tipeRaw : "laptop"
    ) as ParsedAssetRow["tipe"];

    const statusRaw = (raw.status ?? "aktif").trim().toLowerCase();
    const status = (
      VALID_STATUSES.has(statusRaw) ? statusRaw : "aktif"
    ) as ParsedAssetRow["status"];

    let ramGb: number | null = null;
    const ramRaw = (raw.ram_gb ?? "").trim().replace(/\s*gb$/i, "");
    if (ramRaw !== "") {
      const parsedRam = Number(ramRaw);
      if (
        !Number.isSafeInteger(parsedRam) ||
        parsedRam < 1 ||
        parsedRam > 1024
      ) {
        errors.push(`Baris ${lineNum}: kapasitas RAM '${raw.ram_gb}' tidak valid.`);
        continue;
      }
      ramGb = parsedRam;
    }

    deduped.set(nomorAset.toLowerCase(), {
      nomor_aset: nomorAset,
      nama_perangkat: namaPerangkat,
      tipe,
      ram_gb: ramGb,
      pemegang_nama: raw.pemegang_nama?.trim() || null,
      anydesk_id: raw.anydesk_id?.trim() || null,
      uv_id: raw.uv_id?.trim() || null,
      status,
    });
  }

  return { rows: Array.from(deduped.values()), errors };
}

export function buildAssetCsvTemplate(): string {
  return [
    "nomor_aset,nama_perangkat,tipe,ram_gb,pemegang_nama,anydesk_id,uv_id,status",
    "DJ-LPT-001,Lenovo ThinkPad T14 Gen 2,laptop,8,Budi Santoso,123456789,98765432,aktif",
    "DJ-LPT-002,ASUS VivoBook 14 (Kebo),laptop,4,Siti Aminah,234567890,,aktif",
  ].join("\n");
}
