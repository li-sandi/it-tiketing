"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

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

  return (
    <div className="space-y-6">
      <form
        onSubmit={handleCreate}
        className="space-y-3 rounded border bg-white p-5"
      >
        <h2 className="font-semibold">Tambah Aset Baru</h2>
        <div className="grid gap-3 sm:grid-cols-4">
          <input
            value={nomorAset}
            onChange={(e) => setNomorAset(e.target.value)}
            placeholder="Nomor Aset (unik)"
            required
            className="rounded border px-3 py-2 text-sm"
          />
          <input
            value={namaPerangkat}
            onChange={(e) => setNamaPerangkat(e.target.value)}
            placeholder="Model / Nama Perangkat"
            required
            className="rounded border px-3 py-2 text-sm sm:col-span-2"
          />
          <select
            value={tipe}
            onChange={(e) => setTipe(e.target.value)}
            className="rounded border px-3 py-2 text-sm"
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
            type="number"
            min={1}
            max={1024}
            value={ramGb}
            onChange={(e) => setRamGb(e.target.value)}
            placeholder="RAM (GB)"
            className="rounded border px-3 py-2 text-sm"
          />
          <input
            value={pemegangNama}
            onChange={(e) => setPemegangNama(e.target.value)}
            placeholder="Pemegang"
            className="rounded border px-3 py-2 text-sm"
          />
          <input
            value={anydeskId}
            onChange={(e) => setAnydeskId(e.target.value)}
            placeholder="ID AnyDesk"
            className="rounded border px-3 py-2 text-sm"
          />
          <input
            value={uvId}
            onChange={(e) => setUvId(e.target.value)}
            placeholder="ID UV"
            className="rounded border px-3 py-2 text-sm"
          />
          <select
            value={siteId}
            onChange={(e) => setSiteId(e.target.value)}
            className="rounded border px-3 py-2 text-sm"
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
          className="rounded bg-black px-4 py-2 text-sm text-white disabled:opacity-50"
        >
          {busy ? "Menyimpan..." : "+ Tambah Aset"}
        </button>
      </form>

      {error && (
        <p role="alert" className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      )}

      <input
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Cari nomor aset, perangkat, atau pemegang..."
        className="w-full rounded border bg-white px-3 py-2 text-sm"
      />

      <div className="overflow-x-auto rounded border bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b bg-gray-100">
            <tr>
              <th className="px-4 py-3">Nomor Aset</th>
              <th className="px-4 py-3">Perangkat</th>
              <th className="px-4 py-3">RAM</th>
              <th className="px-4 py-3">Pemegang</th>
              <th className="px-4 py-3">Remote ID</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {visible.map((a) => (
              <tr key={a.id}>
                <td className="px-4 py-3 font-mono text-xs">{a.nomor_aset}</td>
                <td className="px-4 py-3">
                  <div className="font-medium">{a.nama_perangkat}</div>
                  <div className="text-xs capitalize text-gray-500">
                    {a.tipe}
                  </div>
                </td>
                <td className="px-4 py-3">
                  {a.ram_gb != null ? `${a.ram_gb} GB` : "—"}
                  {a.ram_gb != null && a.ram_gb <= 4 && (
                    <span className="ml-1.5 rounded bg-yellow-100 px-1.5 py-0.5 text-xs text-yellow-800">
                      Upgrade RAM
                    </span>
                  )}
                </td>
                <td className="px-4 py-3">{a.pemegang_nama ?? "—"}</td>
                <td className="px-4 py-3 font-mono text-xs">
                  {a.anydesk_id ? `AD: ${a.anydesk_id}` : ""}
                  {a.anydesk_id && a.uv_id ? " · " : ""}
                  {a.uv_id ? `UV: ${a.uv_id}` : ""}
                  {!a.anydesk_id && !a.uv_id ? "—" : ""}
                </td>
                <td className="px-4 py-3">
                  <select
                    value={a.status}
                    disabled={busy}
                    onChange={(e) => void updateStatus(a.id, e.target.value)}
                    className="rounded border px-2 py-1 text-xs"
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
                <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                  Belum ada data aset.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
