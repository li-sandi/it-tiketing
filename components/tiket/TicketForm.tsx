"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  hitungPrioritas,
  parseAturanKenaikan,
  type Prioritas,
} from "@/lib/prioritas";

type Category = {
  id: string;
  nama: string;
  tipe: "insiden" | "permintaan" | "internal";
  prioritas_default: Prioritas;
  prioritas_naik: unknown;
  butuh_aset: boolean;
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

    let notificationWarning: string | null = null;
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
        notificationWarning =
          notificationResult.warnings?.join("; ") ??
          notificationResult.error ??
          "Notifikasi tiket baru gagal dikirim.";
      }
    } catch {
      notificationWarning = "Tidak dapat menghubungi layanan notifikasi.";
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

    if (penanganan === "remote" && remoteRows.length > 0) {
      const { error: remoteError } = await supabase
        .from("remote_credentials")
        .insert(remoteRows);

      if (remoteError) {
        setCreatedTicketId(ticket.id);
        if (notificationWarning) {
          setNotice(`Notifikasi juga gagal: ${notificationWarning}`);
        }
        setError(
          `Tiket berhasil dibuat, tetapi ID remote gagal disimpan: ${remoteError.message}`,
        );
        setLoading(false);
        return;
      }
    }

    if (notificationWarning) {
      setCreatedTicketId(ticket.id);
      setNotice(`Tiket dibuat, tetapi notifikasi gagal: ${notificationWarning}`);
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

      {penanganan === "remote" && kategori?.bisa_remote && (
        <div className="space-y-3 border-l-4 border-blue-200 pl-4">
          <div>
            <label htmlFor="anydesk-id" className="mb-1 block text-sm font-medium">
              ID AnyDesk (opsional)
            </label>
            <input
              id="anydesk-id"
              type="text"
              value={anydeskId}
              onChange={(event) => setAnydeskId(event.target.value)}
              className="w-full rounded border px-3 py-2"
            />
          </div>
          <div>
            <label htmlFor="uv-id" className="mb-1 block text-sm font-medium">
              UV ID (opsional)
            </label>
            <input
              id="uv-id"
              type="text"
              value={uvId}
              onChange={(event) => setUvId(event.target.value)}
              className="w-full rounded border px-3 py-2"
            />
          </div>
          <p className="text-sm text-gray-600">
            Password UV akan diminta IT lewat chat/telepon.
          </p>
        </div>
      )}

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
          href="/tiket"
          className="block text-sm font-medium text-blue-700 underline"
        >
          Tiket sudah dibuat. Kembali ke daftar tiket
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
