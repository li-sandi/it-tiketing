"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import CategoryGroupSelector, {
  type CategoryOption,
} from "@/components/tiket/CategoryGroupSelector";
import PriorityPreviewBanner from "@/components/tiket/PriorityPreviewBanner";
import RemoteCredentialFields from "@/components/tiket/RemoteCredentialFields";
import SelfCheckPanel from "@/components/tiket/SelfCheckPanel";
import { hitungPrioritas, parseAturanKenaikan } from "@/lib/prioritas";
import {
  formatProcurementEstimate,
  resolveInitialTicketStockState,
  type InventoryStockItem,
} from "@/lib/stok";
import { createClient } from "@/lib/supabase/client";

const MAX_ATTACHMENT_SIZE = 5 * 1024 * 1024;
const IMAGE_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

async function hasSupportedImageSignature(file: File) {
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  if (
    file.type === "image/jpeg" &&
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    return true;
  }
  if (
    file.type === "image/png" &&
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return true;
  }
  if (file.type === "image/gif" && bytes.length >= 6) {
    const signature = String.fromCharCode(...bytes.subarray(0, 6));
    return signature === "GIF87a" || signature === "GIF89a";
  }
  return (
    file.type === "image/webp" &&
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.subarray(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.subarray(8, 12)) === "WEBP"
  );
}

export default function TicketForm({
  categories,
  userId,
  siteId,
  jumlahUserSite,
  stocks = [],
}: {
  categories: CategoryOption[];
  userId: string;
  siteId: string | null;
  jumlahUserSite: number;
  stocks?: InventoryStockItem[];
}) {
  const router = useRouter();
  const [categoryId, setCategoryId] = useState("");
  const [deskripsi, setDeskripsi] = useState("");
  const [jumlahUser, setJumlahUser] = useState<number | "">("");
  const [jumlahTask, setJumlahTask] = useState<number | "">("");
  const [nomorAset, setNomorAset] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [penanganan, setPenanganan] = useState<"remote" | "onsite">("onsite");
  const [anydeskId, setAnydeskId] = useState("");
  const [anydeskPassword, setAnydeskPassword] = useState("");
  const [uvId, setUvId] = useState("");
  const [uvPassword, setUvPassword] = useState("");
  const [remoteFile, setRemoteFile] = useState<File | null>(null);
  const [ramWarning, setRamWarning] = useState<{
    ramGb: number;
    assetName: string | null;
  } | null>(null);
  const [requestUpgradeRam, setRequestUpgradeRam] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [createdTicketId, setCreatedTicketId] = useState<string | null>(null);

  const kategori = categories.find((category) => category.id === categoryId);
  const aturan = parseAturanKenaikan(kategori?.prioritas_naik);
  const stocksByKode = Object.fromEntries(stocks.map((s) => [s.kode, s]));
  const stockCheck = resolveInitialTicketStockState(
    kategori?.stock_kode,
    stocksByKode,
  );
  const needsAffectedUsers =
    aturan?.tipe === "persen_site" ||
    aturan?.tipe === "jumlah_user" ||
    (kategori?.nama ?? "").startsWith("Internet lambat") ||
    (kategori?.nama ?? "").startsWith("Masalah VPN");
  const needsTaskCount = aturan?.tipe === "jumlah_task";

  const handleAssetDetected = useCallback(
    (info: { ramGb: number | null; assetName: string | null }) => {
      if (info.ramGb !== null && info.ramGb <= 4) {
        setRamWarning({ ramGb: info.ramGb, assetName: info.assetName });
      } else {
        setRamWarning(null);
        setRequestUpgradeRam(false);
      }
    },
    [],
  );

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!kategori) {
      setError("Pilih kategori terlebih dahulu.");
      return;
    }

    if (needsAffectedUsers && (jumlahUser === "" || jumlahUser < 1)) {
      setError("Masukkan jumlah user terdampak (minimal 1).");
      return;
    }
    if (
      needsTaskCount &&
      (jumlahTask === "" ||
        !Number.isSafeInteger(jumlahTask) ||
        jumlahTask < 1 ||
        jumlahTask > 100_000)
    ) {
      setError("Masukkan jumlah task antara 1 sampai 100.000.");
      return;
    }

    if (kategori.butuh_foto && !file) {
      setError("Kategori ini wajib melampirkan foto/screenshot.");
      return;
    }
    if (
      file &&
      (!IMAGE_EXTENSIONS[file.type] || file.size > MAX_ATTACHMENT_SIZE)
    ) {
      setError(
        !IMAGE_EXTENSIONS[file.type]
          ? "File harus berupa gambar JPEG, PNG, WebP, atau GIF."
          : "Ukuran file maksimal 5 MB.",
      );
      return;
    }
    if (file && !(await hasSupportedImageSignature(file))) {
      setError("Isi file tidak cocok dengan format gambar yang dipilih.");
      return;
    }
    setLoading(true);
    setError(null);
    setNotice(null);

    const prioritas = hitungPrioritas({
      prioritasDefault: kategori.prioritas_default,
      aturan,
      jumlahUserTerdampak: typeof jumlahUser === "number" ? jumlahUser : undefined,
      jumlahUserSite,
      jumlahTaskVendor: typeof jumlahTask === "number" ? jumlahTask : undefined,
    });

    const supabase = createClient();
    const { data: ticket, error: ticketError } = await supabase
      .from("tickets")
      .insert({
        pembuat_id: userId,
        site_id: siteId,
        category_id: kategori.id,
        tipe: kategori.tipe,
        deskripsi: deskripsi.trim(),
        prioritas,
        jumlah_user_terdampak:
          typeof jumlahUser === "number" ? jumlahUser : null,
        jumlah_task:
          typeof jumlahTask === "number" ? jumlahTask : null,
        nomor_aset: nomorAset.trim() || null,
        penanganan,
        rekomendasi_upgrade_ram: requestUpgradeRam,
      })
      .select("id, status")
      .single();

    if (ticketError || !ticket) {
      setError(
        `Gagal membuat tiket: ${ticketError?.message ?? "Respons tiket kosong."}`,
      );
      setLoading(false);
      return;
    }

    const postCreateWarnings: string[] = [];

    const uploads: Array<{ file: File; jenis: "foto" | "foto_remote" }> = [];
    if (file) uploads.push({ file, jenis: "foto" });
    if (remoteFile) uploads.push({ file: remoteFile, jenis: "foto_remote" });

    for (const item of uploads) {
      try {
        const attachmentForm = new FormData();
        attachmentForm.set("ticketId", ticket.id);
        attachmentForm.set("jenis", item.jenis);
        attachmentForm.set("file", item.file);
        const uploadResponse = await fetch("/api/tiket/lampiran", {
          method: "POST",
          body: attachmentForm,
        });
        const uploadResult = (await uploadResponse.json()) as {
          error?: string;
        };
        if (!uploadResponse.ok) {
          postCreateWarnings.push(
            uploadResult.error ?? "Upload lampiran gagal.",
          );
        }
      } catch {
        postCreateWarnings.push(
          "Tidak dapat menghubungi layanan upload lampiran.",
        );
      }
    }

    if (
      anydeskId.trim() ||
      anydeskPassword.trim() ||
      uvId.trim() ||
      uvPassword.trim()
    ) {
      try {
        const credResponse = await fetch("/api/tiket/remote-credentials", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ticketId: ticket.id,
            anydeskId: anydeskId.trim(),
            anydeskPassword: anydeskPassword.trim(),
            uvId: uvId.trim(),
            uvPassword: uvPassword.trim(),
          }),
        });
        const credResult = (await credResponse.json()) as { error?: string };
        if (!credResponse.ok) {
          postCreateWarnings.push(
            credResult.error ?? "Kredensial remote gagal disimpan.",
          );
        }
      } catch {
        postCreateWarnings.push(
          "Tidak dapat menghubungi layanan penyimpanan kredensial remote.",
        );
      }
    }

    try {
      const notificationResponse = await fetch("/api/notif/tiket-baru", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticketId: ticket.id }),
      });
      const notificationResult = (await notificationResponse.json()) as {
        error?: string;
        warnings?: string[];
      };

      if (!notificationResponse.ok || notificationResult.warnings?.length) {
        postCreateWarnings.push(
          notificationResult.warnings?.join("; ") ??
            notificationResult.error ??
            "Notifikasi tiket baru gagal dikirim.",
        );
      }
    } catch {
      postCreateWarnings.push("Tidak dapat menghubungi layanan notifikasi.");
    }

    if (postCreateWarnings.length > 0) {
      setCreatedTicketId(ticket.id);
      setNotice(`Tiket dibuat, tetapi ${postCreateWarnings.join("; ")}.`);
      setLoading(false);
      return;
    }

    router.push(
      ticket.status === "menunggu_pengadaan" ? `/tiket/${ticket.id}` : "/tiket",
    );
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <CategoryGroupSelector
        categories={categories}
        selectedCategoryId={categoryId}
        selectId="category"
        onSelectCategory={(nextId) => {
          setCategoryId(nextId);
          setJumlahUser("");
          setJumlahTask("");
          setNomorAset("");
          setFile(null);
          setFileError(null);
          setPenanganan("onsite");
          setAnydeskId("");
          setAnydeskPassword("");
          setUvId("");
          setUvPassword("");
          setRemoteFile(null);
        }}
      />

      {kategori && (
        <PriorityPreviewBanner
          prioritasDefault={kategori.prioritas_default}
          prioritasNaik={kategori.prioritas_naik}
          jumlahUserTerdampak={
            typeof jumlahUser === "number" ? jumlahUser : undefined
          }
          jumlahUserSite={jumlahUserSite}
          jumlahTaskVendor={
            typeof jumlahTask === "number" ? jumlahTask : undefined
          }
        />
      )}

      {kategori?.stock_kode && (
        <div
          className={`rounded-xl border p-3.5 text-sm ${
            stockCheck.needsProcurement
              ? "border-amber-300 bg-amber-50 text-amber-950"
              : "border-emerald-300 bg-emerald-50 text-emerald-950"
          }`}
        >
          {stockCheck.needsProcurement ? (
            <>
              <p className="font-semibold">
                Stok {stockCheck.stockNama} sedang kosong (0 unit)
              </p>
              <p className="mt-0.5 text-xs">
                Tiket tetap dibuat dan otomatis masuk status{" "}
                <strong>Menunggu Pengadaan</strong> dengan estimasi pengadaan{" "}
                <strong>
                  {formatProcurementEstimate(stockCheck.estimasiPengadaan) ??
                    "bulan depan"}
                </strong>
                . SLA dijeda sampai stok tersedia dari pengadaan bulan depan.
              </p>
            </>
          ) : (
            <p className="text-xs font-semibold">
              Stok {stockCheck.stockNama} tersedia ({stockCheck.availableCount}{" "}
              unit) - IT dapat langsung menindaklanjuti tiket ini.
            </p>
          )}
        </div>
      )}

      <div>
        <label htmlFor="description" className="mb-1 block text-sm font-medium">
          Deskripsi masalah
        </label>
        <textarea
          id="description"
          value={deskripsi}
          onChange={(event) => setDeskripsi(event.target.value)}
          required
          minLength={5}
          rows={4}
          className="w-full rounded border px-3 py-2"
        />
      </div>

      <SelfCheckPanel
        categoryId={categoryId}
        grup={kategori?.grup}
        deskripsi={deskripsi}
      />

      {needsAffectedUsers && (
        <div>
          <label htmlFor="affected-users" className="mb-1 block text-sm font-medium">
            Berapa user yang terdampak?
          </label>
          <input
            id="affected-users"
            type="number"
            min={1}
            value={jumlahUser}
            onChange={(event) =>
              setJumlahUser(
                event.target.value === "" ? "" : Number(event.target.value),
              )
            }
            required
            className="w-full rounded border px-3 py-2"
          />
        </div>
      )}

      {needsTaskCount && (
        <div>
          <label htmlFor="task-count" className="mb-1 block text-sm font-medium">
            Berapa jumlah task (akun) yang diaktifkan atau dinonaktifkan?
          </label>
          <input
            id="task-count"
            type="number"
            min={1}
            max={100_000}
            value={jumlahTask}
            onChange={(event) =>
              setJumlahTask(
                event.target.value === "" ? "" : Number(event.target.value),
              )
            }
            required
            className="w-full rounded border px-3 py-2"
          />
        </div>
      )}

      {kategori?.butuh_aset && (
        <div>
          <label htmlFor="asset-number" className="mb-1 block text-sm font-medium">
            Nomor aset
          </label>
          <input
            id="asset-number"
            type="text"
            value={nomorAset}
            onChange={(event) => setNomorAset(event.target.value)}
            required
            className="w-full rounded border px-3 py-2"
          />
        </div>
      )}

      {ramWarning && (
        <div className="rounded border border-yellow-200 bg-yellow-50 p-3 text-sm">
          <p className="font-medium text-yellow-800">
            Perangkat {ramWarning.assetName ?? nomorAset} terdeteksi memiliki RAM{" "}
            {ramWarning.ramGb} GB.
          </p>
          <label className="mt-2 flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={requestUpgradeRam}
              onChange={(e) => setRequestUpgradeRam(e.target.checked)}
            />
            Ajukan rekomendasi Upgrade RAM ke GA/Admin sekaligus
          </label>
        </div>
      )}

      {kategori?.butuh_foto && (
        <div>
          <label htmlFor="ticket-photo" className="mb-1 block text-sm font-medium">
            Foto / screenshot masalah (wajib, maksimal 5 MB)
          </label>
          <input
            key={categoryId}
            id="ticket-photo"
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            onChange={async (event) => {
              const selectedFile = event.target.files?.[0] ?? null;
              if (!selectedFile) {
                setFile(null);
                setFileError(null);
                return;
              }
              if (!IMAGE_EXTENSIONS[selectedFile.type]) {
                setFile(null);
                setFileError(
                  "File harus berupa gambar JPEG, PNG, WebP, atau GIF.",
                );
                return;
              }
              if (selectedFile.size > MAX_ATTACHMENT_SIZE) {
                setFile(null);
                setFileError("Ukuran file maksimal 5 MB.");
                return;
              }
              if (!(await hasSupportedImageSignature(selectedFile))) {
                setFile(null);
                setFileError(
                  "Isi file tidak cocok dengan format gambar yang dipilih.",
                );
                return;
              }
              setFileError(null);
              setFile(selectedFile);
            }}
            className="w-full text-sm"
          />
          {file && (
            <p className="mt-1 text-xs text-gray-600">
              Terpilih: {file.name} ({(file.size / 1024).toFixed(0)} KB)
            </p>
          )}
          {fileError && (
            <p role="alert" className="mt-1 text-xs text-red-600">
              {fileError}
            </p>
          )}
        </div>
      )}

      <fieldset>
        <legend className="mb-1 block text-sm font-medium">Penanganan</legend>
        <div className="flex gap-4">
          {kategori?.bisa_remote && (
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="penanganan"
                value="remote"
                checked={penanganan === "remote"}
                onChange={() => setPenanganan("remote")}
              />
              Remote
            </label>
          )}
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="penanganan"
              value="onsite"
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
        anydeskPassword={anydeskPassword}
        uvId={uvId}
        uvPassword={uvPassword}
        remoteFile={remoteFile}
        onAnydeskIdChange={setAnydeskId}
        onAnydeskPasswordChange={setAnydeskPassword}
        onUvIdChange={setUvId}
        onUvPasswordChange={setUvPassword}
        onRemoteFileChange={setRemoteFile}
        onAssetDetected={handleAssetDetected}
      />

      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="text-sm text-amber-700">
          {notice}
        </p>
      )}

      {createdTicketId ? (
        <Link
          href={`/tiket/${createdTicketId}`}
          className="block text-sm font-medium text-blue-700 underline"
        >
          Buka tiket yang sudah dibuat
        </Link>
      ) : (
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded bg-black py-2 text-white hover:bg-gray-800 disabled:opacity-50"
        >
          {loading ? "Mengirim..." : "Kirim Tiket"}
        </button>
      )}
    </form>
  );
}
