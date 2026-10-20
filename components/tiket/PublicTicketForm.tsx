"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { parseAturanKenaikan, type Prioritas } from "@/lib/prioritas";
import RemoteCredentialFields from "@/components/tiket/RemoteCredentialFields";

type Category = {
  id: string;
  nama: string;
  tipe: "insiden" | "permintaan" | "internal";
  prioritas_default: Prioritas;
  prioritas_naik: unknown;
  butuh_aset: boolean;
  butuh_foto: boolean;
  bisa_remote: boolean;
};

type Site = { id: string; nama: string; jumlah_user: number };
const MAX_FILE_SIZE = 5 * 1024 * 1024;
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

export default function PublicTicketForm({
  categories,
  sites,
}: {
  categories: Category[];
  sites: Site[];
}) {
  const router = useRouter();
  const [nama, setNama] = useState("");
  const [kontak, setKontak] = useState("");
  const [siteId, setSiteId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [deskripsi, setDeskripsi] = useState("");
  const [jumlahUser, setJumlahUser] = useState("");
  const [jumlahTask, setJumlahTask] = useState("");
  const [nomorAset, setNomorAset] = useState("");
  const [penanganan, setPenanganan] = useState<"onsite" | "remote">("onsite");
  const [anydeskId, setAnydeskId] = useState("");
  const [uvId, setUvId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const category = categories.find((item) => item.id === categoryId);
  const rule = parseAturanKenaikan(category?.prioritas_naik);
  const needsAffectedUsers =
    rule?.tipe === "persen_site" ||
    rule?.tipe === "jumlah_user" ||
    ["Internet lambat", "Masalah VPN"].includes(category?.nama ?? "");
  const needsTaskCount = rule?.tipe === "jumlah_task";

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!category) return setError("Pilih kategori terlebih dahulu.");
    if (!siteId) return setError("Pilih site terlebih dahulu.");
    if (needsAffectedUsers && (!jumlahUser || Number(jumlahUser) < 1)) {
      return setError("Masukkan jumlah user terdampak (minimal 1).");
    }
    if (
      needsTaskCount &&
      (!jumlahTask ||
        !Number.isSafeInteger(Number(jumlahTask)) ||
        Number(jumlahTask) < 1 ||
        Number(jumlahTask) > 100_000)
    ) {
      return setError("Masukkan jumlah task antara 1 sampai 100.000.");
    }
    if (category.butuh_aset && !nomorAset.trim()) {
      return setError("Kategori ini mewajibkan nomor aset.");
    }
    if (category.butuh_foto && !file) {
      return setError("Kategori ini wajib melampirkan foto.");
    }
    if (file && !IMAGE_TYPES.includes(file.type)) {
      return setError("File harus berupa gambar JPEG, PNG, WebP, atau GIF.");
    }
    if (file && (file.size === 0 || file.size > MAX_FILE_SIZE)) {
      return setError("Ukuran file harus lebih dari 0 dan maksimal 5 MB.");
    }

    setLoading(true);
    const formData = new FormData();
    formData.set("nama", nama);
    formData.set("kontak", kontak);
    formData.set("siteId", siteId);
    formData.set("categoryId", categoryId);
    formData.set("deskripsi", deskripsi);
    formData.set("penanganan", penanganan);
    formData.set("jumlahUser", jumlahUser);
    formData.set("jumlahTask", jumlahTask);
    formData.set("nomorAset", nomorAset);
    formData.set("anydeskId", anydeskId);
    formData.set("uvId", uvId);
    if (file) formData.set("file", file);

    try {
      const response = await fetch("/api/tiket/publik", {
        method: "POST",
        body: formData,
      });
      const result = (await response.json()) as {
        error?: string;
        token?: string;
        warnings?: string[];
        kunjungan?: { tanggalLabel: string; itNama: string | null } | null;
      };
      if (!response.ok || !result.token) {
        throw new Error(result.error ?? "Gagal membuat tiket.");
      }
      if (result.warnings?.length) {
        console.error("Tiket dibuat dengan peringatan:", result.warnings);
      }
      if (result.kunjungan) {
        console.info(
          `Tiket diarahkan ke kunjungan ${result.kunjungan.tanggalLabel}.`,
        );
      }
      try {
        window.localStorage.setItem("public-ticket-access-token", result.token);
      } catch (storageError) {
        console.warn("Token tiket publik tidak dapat disimpan untuk auto-fill:", storageError);
      }
      router.push(`/status/${result.token}`);
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Gagal membuat tiket. Silakan coba lagi.",
      );
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="public-name" className="mb-1 block text-sm font-medium">
          Nama
        </label>
        <input
          id="public-name"
          value={nama}
          onChange={(event) => setNama(event.target.value)}
          maxLength={120}
          required
          autoComplete="name"
          className="w-full rounded border px-3 py-2"
        />
      </div>

      <div>
        <label htmlFor="public-contact" className="mb-1 block text-sm font-medium">
          Kontak (opsional)
        </label>
        <input
          id="public-contact"
          value={kontak}
          onChange={(event) => setKontak(event.target.value)}
          maxLength={200}
          autoComplete="email"
          className="w-full rounded border px-3 py-2"
        />
      </div>

      <div>
        <label htmlFor="public-site" className="mb-1 block text-sm font-medium">
          Site
        </label>
        <select
          id="public-site"
          value={siteId}
          onChange={(event) => setSiteId(event.target.value)}
          required
          className="w-full rounded border px-3 py-2"
        >
          <option value="">— pilih site —</option>
          {sites.map((site) => (
            <option key={site.id} value={site.id}>
              {site.nama}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="public-category" className="mb-1 block text-sm font-medium">
          Kategori
        </label>
        <select
          id="public-category"
          value={categoryId}
          onChange={(event) => {
            setCategoryId(event.target.value);
            setJumlahUser("");
            setJumlahTask("");
            setNomorAset("");
            setFile(null);
            setPenanganan("onsite");
            setAnydeskId("");
            setUvId("");
          }}
          required
          className="w-full rounded border px-3 py-2"
        >
          <option value="">— pilih kategori —</option>
          {categories.map((item) => (
            <option key={item.id} value={item.id}>
              {item.nama} ({item.prioritas_default})
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="public-description" className="mb-1 block text-sm font-medium">
          Deskripsi masalah
        </label>
        <textarea
          id="public-description"
          value={deskripsi}
          onChange={(event) => setDeskripsi(event.target.value)}
          minLength={5}
          maxLength={5000}
          rows={4}
          required
          className="w-full rounded border px-3 py-2"
        />
      </div>

      {needsAffectedUsers && (
        <div>
          <label htmlFor="public-impact" className="mb-1 block text-sm font-medium">
            Berapa user yang terdampak?
          </label>
          <input
            id="public-impact"
            type="number"
            min={1}
            max={1_000_000}
            value={jumlahUser}
            onChange={(event) => setJumlahUser(event.target.value)}
            required
            className="w-full rounded border px-3 py-2"
          />
        </div>
      )}

      {needsTaskCount && (
        <div>
          <label
            htmlFor="public-task-count"
            className="mb-1 block text-sm font-medium"
          >
            Berapa jumlah task (akun) yang diaktifkan atau dinonaktifkan?
          </label>
          <input
            id="public-task-count"
            type="number"
            min={1}
            max={100_000}
            value={jumlahTask}
            onChange={(event) => setJumlahTask(event.target.value)}
            required
            className="w-full rounded border px-3 py-2"
          />
        </div>
      )}

      {category?.butuh_aset && (
        <div>
          <label htmlFor="public-asset" className="mb-1 block text-sm font-medium">
            Nomor aset
          </label>
          <input
            id="public-asset"
            value={nomorAset}
            onChange={(event) => setNomorAset(event.target.value)}
            maxLength={120}
            required
            className="w-full rounded border px-3 py-2"
          />
        </div>
      )}

      {category?.butuh_foto && (
        <div>
          <label htmlFor="public-photo" className="mb-1 block text-sm font-medium">
            Foto / screenshot (wajib, maksimal 5 MB)
          </label>
          <input
            key={categoryId}
            id="public-photo"
            type="file"
            accept={IMAGE_TYPES.join(",")}
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            required
            className="w-full text-sm"
          />
          {file && (
            <p className="mt-1 text-xs text-gray-600">
              Terpilih: {file.name} ({(file.size / 1024).toFixed(0)} KB)
            </p>
          )}
        </div>
      )}

      <fieldset>
        <legend className="mb-1 block text-sm font-medium">Penanganan</legend>
        <div className="flex gap-4">
          {category?.bisa_remote && (
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="public-handling"
                checked={penanganan === "remote"}
                onChange={() => setPenanganan("remote")}
              />
              Remote
            </label>
          )}
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="public-handling"
              checked={penanganan === "onsite"}
              onChange={() => setPenanganan("onsite")}
            />
            Onsite
          </label>
        </div>
      </fieldset>

      <RemoteCredentialFields
        assetNumber={nomorAset}
        anydeskId={anydeskId}
        uvId={uvId}
        onAnydeskIdChange={setAnydeskId}
        onUvIdChange={setUvId}
      />

      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={loading || categories.length === 0 || sites.length === 0}
        className="w-full rounded bg-black py-2 text-white hover:bg-gray-800 disabled:opacity-50"
      >
        {loading ? "Mengirim..." : "Kirim Tiket"}
      </button>
    </form>
  );
}
