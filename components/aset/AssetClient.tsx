"use client";

import { useState, type ChangeEvent, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { buildAssetCsvTemplate } from "@/lib/aset-csv";

type AssetRow = {
  id: string;
  nomor_aset: string;
  nama_perangkat: string;
  tipe: string;
  ram_gb: number | null;
  site_id: string | null;
  pemegang_nama: string | null;
  anydesk_id: string | null;
  uv_id: string | null;
  status: string;
  sites?: { nama: string } | { nama: string }[] | null;
};

type SiteOption = { id: string; nama: string };

export default function AssetClient({
  assets,
  sites,
}: {
  assets: AssetRow[];
  sites: SiteOption[];
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [nomorAset, setNomorAset] = useState("");
  const [namaPerangkat, setNamaPerangkat] = useState("");
  const [tipe, setTipe] = useState("laptop");
  const [ramGb, setRamGb] = useState("");
  const [siteId, setSiteId] = useState(sites[0]?.id ?? "");
  const [pemegangNama, setPemegangNama] = useState("");
  const [anydeskId, setAnydeskId] = useState("");
  const [uvId, setUvId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [csvOpen, setCsvOpen] = useState(false);
  const [csvText, setCsvText] = useState("");
  const [csvImporting, setCsvImporting] = useState(false);
  const [csvNotice, setCsvNotice] = useState<string | null>(null);
  const [csvErrors, setCsvErrors] = useState<string[]>([]);

  const visible = assets.filter((a) => {
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    return (
      a.nomor_aset.toLowerCase().includes(q) ||
      a.nama_perangkat.toLowerCase().includes(q) ||
      (a.pemegang_nama ?? "").toLowerCase().includes(q)
    );
  });

  async function handleCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/aset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nomor_aset: nomorAset,
          nama_perangkat: namaPerangkat,
          tipe,
          ram_gb: ramGb === "" ? null : Number(ramGb),
          site_id: siteId || null,
          pemegang_nama: pemegangNama || null,
          anydesk_id: anydeskId || null,
          uv_id: uvId || null,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Gagal menambah aset.");
      setNomorAset("");
      setNamaPerangkat("");
      setRamGb("");
      setPemegangNama("");
      setAnydeskId("");
      setUvId("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menambah aset.");
    } finally {
      setBusy(false);
    }
  }

  async function updateStatus(id: string, status: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/aset/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Gagal mengubah status aset.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal mengubah status.");
    } finally {
      setBusy(false);
    }
  }

  function handleDownloadTemplate() {
    const blob = new Blob([buildAssetCsvTemplate()], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "template-aset-debito-jogja.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  async function handleCsvFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setCsvText(text);
    setCsvNotice(null);
    setCsvErrors([]);
  }

  async function handleCsvImport(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setCsvImporting(true);
    setError(null);
    setCsvNotice(null);
    setCsvErrors([]);
    try {
      const res = await fetch("/api/aset/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          csv: csvText,
          site_id: siteId || null,
        }),
      });
      const data = (await res.json()) as {
        error?: string;
        importedCount?: number;
        errors?: string[];
      };
      if (!res.ok) {
        if (data.errors?.length) setCsvErrors(data.errors);
        throw new Error(data.error ?? "Gagal mengimpor CSV aset.");
      }
      setCsvNotice(
        `Berhasil mengimpor atau memperbarui ${data.importedCount ?? 0} data aset.`,
      );
      if (data.errors?.length) {
        setCsvErrors(data.errors);
      } else {
        setCsvText("");
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal mengimpor CSV.");
    } finally {
      setCsvImporting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-[var(--muted)] tabular-nums">
          Total terdaftar: <strong>{assets.length}</strong> aset perangkat
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleDownloadTemplate}
            className="min-h-9 rounded-lg border bg-[var(--surface)] px-3 py-1.5 text-xs font-medium text-[var(--foreground)] hover:bg-[var(--surface-muted)]"
          >
            Unduh Template CSV
          </button>
          <button
            type="button"
            onClick={() => setCsvOpen((prev) => !prev)}
            className="min-h-9 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-800 hover:bg-blue-100"
          >
            {csvOpen ? "Tutup Import CSV" : "Import Massal CSV"}
          </button>
        </div>
      </div>

      {csvOpen && (
        <form
          onSubmit={handleCsvImport}
          className="space-y-3 rounded-xl border border-blue-200 bg-[var(--surface)] p-5 shadow-xs"
        >
          <div>
            <h2 className="text-base font-semibold text-[var(--foreground)]">
              Import Massal Inventaris Aset (CSV)
            </h2>
            <p className="mt-0.5 text-xs text-[var(--muted)]">
              Unggah file .csv atau tempel langsung isi CSV (maksimal 500 baris per batch). Nomor aset yang sudah ada akan diperbarui otomatis.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="aset-csv-file" className="mb-1 block text-xs font-medium text-[var(--muted)]">
                Pilih Berkas CSV
              </label>
              <input
                id="aset-csv-file"
                type="file"
                accept=".csv,text/csv"
                onChange={(e) => void handleCsvFileChange(e)}
                className="w-full rounded-lg border px-3 py-1.5 text-xs"
              />
            </div>
            <div>
              <label htmlFor="aset-csv-site" className="mb-1 block text-xs font-medium text-[var(--muted)]">
                Site Default Import
              </label>
              <select
                id="aset-csv-site"
                value={siteId}
                onChange={(e) => setSiteId(e.target.value)}
                className="w-full rounded-lg border px-3 py-1.5 text-sm"
              >
                {sites.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nama}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label htmlFor="aset-csv-text" className="mb-1 block text-xs font-medium text-[var(--muted)]">
              Pratinjau / Konten CSV
            </label>
            <textarea
              id="aset-csv-text"
              rows={5}
              value={csvText}
              onChange={(e) => setCsvText(e.target.value)}
              placeholder="nomor_aset,nama_perangkat,tipe,ram_gb,pemegang_nama,anydesk_id,uv_id,status"
              required
              className="w-full rounded-lg border px-3 py-2 font-mono text-xs"
            />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={csvImporting || !csvText.trim()}
              className="min-h-9 rounded-lg bg-[#1d4ed8] px-4 py-1.5 text-xs font-semibold text-white hover:bg-[#1e40af] disabled:opacity-50"
            >
              {csvImporting ? "Mengimpor..." : "Proses Import CSV"}
            </button>
            {csvNotice && (
              <span role="status" className="text-xs font-medium text-emerald-800">
                {csvNotice}
              </span>
            )}
          </div>
          {csvErrors.length > 0 && (
            <ul className="space-y-1 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
              {csvErrors.slice(0, 8).map((errMsg, idx) => (
                <li key={idx}>{errMsg}</li>
              ))}
            </ul>
          )}
        </form>
      )}

      <form
        onSubmit={handleCreate}
        className="space-y-3 rounded-xl border bg-[var(--surface)] p-5 shadow-xs"
      >
        <h2 className="text-base font-semibold text-[var(--foreground)]">
          Tambah Aset Baru
        </h2>
        <div className="grid gap-3 sm:grid-cols-4">
          <input
            aria-label="Nomor aset baru"
            value={nomorAset}
            onChange={(e) => setNomorAset(e.target.value)}
            placeholder="Nomor Aset (unik)"
            required
            className="rounded-lg border px-3 py-2 text-sm"
          />
          <input
            aria-label="Model atau nama perangkat baru"
            value={namaPerangkat}
            onChange={(e) => setNamaPerangkat(e.target.value)}
            placeholder="Model / Nama Perangkat"
            required
            className="rounded-lg border px-3 py-2 text-sm sm:col-span-2"
          />
          <select
            aria-label="Tipe perangkat"
            value={tipe}
            onChange={(e) => setTipe(e.target.value)}
            className="rounded-lg border px-3 py-2 text-sm"
          >
            <option value="laptop">Laptop</option>
            <option value="pc">PC</option>
            <option value="hp">Handphone</option>
            <option value="printer">Printer</option>
            <option value="jaringan">Jaringan</option>
            <option value="lainnya">Lainnya</option>
          </select>
        </div>
        <div className="grid gap-3 sm:grid-cols-5">
          <input
            aria-label="Kapasitas RAM dalam GB"
            type="number"
            min={1}
            max={1024}
            value={ramGb}
            onChange={(e) => setRamGb(e.target.value)}
            placeholder="RAM (GB)"
            className="rounded-lg border px-3 py-2 text-sm tabular-nums"
          />
          <input
            aria-label="Nama pemegang perangkat"
            value={pemegangNama}
            onChange={(e) => setPemegangNama(e.target.value)}
            placeholder="Pemegang"
            className="rounded-lg border px-3 py-2 text-sm"
          />
          <input
            aria-label="ID AnyDesk statis"
            value={anydeskId}
            onChange={(e) => setAnydeskId(e.target.value)}
            placeholder="ID AnyDesk"
            className="rounded-lg border px-3 py-2 text-sm"
          />
          <input
            aria-label="ID UltraViewer statis"
            value={uvId}
            onChange={(e) => setUvId(e.target.value)}
            placeholder="ID UV"
            className="rounded-lg border px-3 py-2 text-sm"
          />
          <select
            aria-label="Site perangkat"
            value={siteId}
            onChange={(e) => setSiteId(e.target.value)}
            className="rounded-lg border px-3 py-2 text-sm"
          >
            {sites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nama}
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          disabled={busy}
          className="min-h-9 rounded-lg bg-[#1d4ed8] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1e40af] disabled:opacity-50"
        >
          {busy ? "Menyimpan..." : "Tambah Aset"}
        </button>
      </form>

      {error && (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      )}

      <input
        aria-label="Cari aset"
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Cari nomor aset, perangkat, atau pemegang..."
        className="w-full rounded-lg border px-3 py-2 text-sm"
      />

      <div className="overflow-x-auto rounded-xl border bg-[var(--surface)] shadow-xs">
        <table className="w-full text-left text-sm">
          <thead className="border-b bg-slate-50 text-xs uppercase text-[var(--muted)]">
            <tr>
              <th className="px-4 py-3 font-medium">Nomor Aset</th>
              <th className="px-4 py-3 font-medium">Perangkat</th>
              <th className="px-4 py-3 font-medium">RAM</th>
              <th className="px-4 py-3 font-medium">Pemegang</th>
              <th className="px-4 py-3 font-medium">Remote ID</th>
              <th className="px-4 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {visible.map((a) => (
              <tr key={a.id} className="hover:bg-[var(--surface-muted)]">
                <td className="px-4 py-3 font-mono text-xs font-medium text-[var(--foreground)]">
                  {a.nomor_aset}
                </td>
                <td className="px-4 py-3">
                  <div className="font-medium text-[var(--foreground)]">
                    {a.nama_perangkat}
                  </div>
                  <div className="text-xs capitalize text-[var(--muted)]">
                    {a.tipe}
                  </div>
                </td>
                <td className="px-4 py-3 tabular-nums">
                  {a.ram_gb != null ? `${a.ram_gb} GB` : "-"}
                  {a.ram_gb != null && a.ram_gb <= 4 && (
                    <span className="ml-1.5 rounded-md border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-xs font-medium text-amber-800">
                      Upgrade RAM
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-[var(--secondary)]">
                  {a.pemegang_nama ?? "-"}
                </td>
                <td className="px-4 py-3 font-mono text-xs text-[var(--muted)]">
                  {a.anydesk_id ? `AD: ${a.anydesk_id}` : ""}
                  {a.anydesk_id && a.uv_id ? " · " : ""}
                  {a.uv_id ? `UV: ${a.uv_id}` : ""}
                  {!a.anydesk_id && !a.uv_id ? "-" : ""}
                </td>
                <td className="px-4 py-3">
                  <select
                    aria-label={`Status aset ${a.nomor_aset}`}
                    value={a.status}
                    disabled={busy}
                    onChange={(e) => void updateStatus(a.id, e.target.value)}
                    className="rounded-lg border px-2 py-1 text-xs"
                  >
                    <option value="aktif">Aktif</option>
                    <option value="perbaikan">Perbaikan</option>
                    <option value="nonaktif">Nonaktif</option>
                  </select>
                </td>
              </tr>
            ))}
            {visible.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-[var(--muted)]">
                  Belum ada data aset yang cocok.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
