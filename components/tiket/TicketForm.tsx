"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import RemoteCredentialFields from "@/components/tiket/RemoteCredentialFields";
import {
  hitungPrioritas,
  parseAturanKenaikan,
  type Prioritas,
} from "@/lib/prioritas";

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

export default function TicketForm({
  categories,
  userId,
  siteId,
  jumlahUserSite,
}: {
  categories: Category[];
  userId: string;
  siteId: string | null;
  jumlahUserSite: number;
}) {
  const router = useRouter();
  const [categoryId, setCategoryId] = useState("");
  const [deskripsi, setDeskripsi] = useState("");
  const [jumlahUser, setJumlahUser] = useState<number | "">("");
  const [nomorAset, setNomorAset] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [penanganan, setPenanganan] = useState<"remote" | "onsite">("onsite");
  const [anydeskId, setAnydeskId] = useState("");
  const [uvId, setUvId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [createdTicketId, setCreatedTicketId] = useState<string | null>(null);

  const kategori = categories.find((category) => category.id === categoryId);
  const aturan = parseAturanKenaikan(kategori?.prioritas_naik);
  const needsAffectedUsers =
    aturan?.tipe === "persen_site" ||
    aturan?.tipe === "jumlah_user" ||
    kategori?.nama === "Internet lambat" ||
    kategori?.nama === "Masalah VPN" ||
    kategori?.nama === "Aktivasi / non-aktivasi VPN";

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
        nomor_aset: nomorAset.trim() || null,
        penanganan,
      })
      .select("id")
      .single();

    if (ticketError || !ticket) {
      setError(
        `Gagal membuat tiket: ${ticketError?.message ?? "Respons tiket kosong."}`,
      );
      setLoading(false);
      return;
    }

    const postCreateWarnings: string[] = [];

    if (file) {
      try {
        const attachmentForm = new FormData();
        attachmentForm.set("ticketId", ticket.id);
        attachmentForm.set("file", file);
        const uploadResponse = await fetch("/api/tiket/lampiran", {
          method: "POST",
          body: attachmentForm,
        });
        const uploadResult = (await uploadResponse.json()) as {
          error?: string;
        };
        if (!uploadResponse.ok) {
          postCreateWarnings.push(uploadResult.error ?? "Upload lampiran gagal.");
        }
      } catch {
        postCreateWarnings.push(
          "Tidak dapat menghubungi layanan upload lampiran.",
        );
      }
    }

    const remoteRows = [
      ...(anydeskId.trim()
        ? [
            {
              ticket_id: ticket.id,
              aplikasi: "anydesk",
              remote_id: anydeskId.trim(),
            },
          ]
        : []),
      ...(uvId.trim()
        ? [
            {
              ticket_id: ticket.id,
              aplikasi: "uv",
              remote_id: uvId.trim(),
            },
          ]
        : []),
    ];

    if (remoteRows.length > 0) {
      const { error: remoteError } = await supabase
        .from("remote_credentials")
        .insert(remoteRows);

      if (remoteError) {
        console.error("Gagal menyimpan ID remote tiket:", remoteError.message);
        postCreateWarnings.push(
          `ID remote gagal disimpan: ${remoteError.message}`,
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

      if (!notificationResponse.ok) {
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

    router.push("/tiket");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="category" className="mb-1 block text-sm font-medium">
          Kategori
        </label>
        <select
          id="category"
          value={categoryId}
          onChange={(event) => {
            setCategoryId(event.target.value);
            setJumlahUser("");
            setNomorAset("");
            setFile(null);
            setFileError(null);
            setPenanganan("onsite");
            setAnydeskId("");
            setUvId("");
          }}
          required
          className="w-full rounded border px-3 py-2"
        >
          <option value="">— pilih kategori —</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.nama} ({category.prioritas_default})
            </option>
          ))}
        </select>
      </div>

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

      {kategori?.butuh_foto && (
        <div>
          <label htmlFor="ticket-photo" className="mb-1 block text-sm font-medium">
            Foto / screenshot (wajib, maksimal 5 MB)
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
        uvId={uvId}
        onAnydeskIdChange={setAnydeskId}
        onUvIdChange={setUvId}
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
