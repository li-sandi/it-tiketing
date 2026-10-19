import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import SlaTimer from "@/components/tiket/SlaTimer";
import TicketActions from "@/components/tiket/TicketActions";
import UserRatingForm from "@/components/tiket/UserRatingForm";
import { PrioritasBadge, StatusBadge } from "@/components/tiket/StatusBadge";
import { createClient } from "@/lib/supabase/server";
import {
  isTicketStatus,
  ticketStatusLabels,
  type TicketStatus,
} from "@/lib/tiket-status";

export const instant = false;

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function formatDate(value: string | null) {
  if (!value) return "Belum ditetapkan";
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Jakarta",
  }).format(new Date(value));
}

function describeEvent(event: {
  jenis: string;
  dari: string | null;
  ke: string | null;
}) {
  if (event.jenis === "assign") return "Tiket ditugaskan ke IT";
  if (event.jenis === "status") {
    const from =
      event.dari && isTicketStatus(event.dari)
        ? ticketStatusLabels[event.dari]
        : event.dari ?? "Baru";
    const to =
      event.ke && isTicketStatus(event.ke)
        ? ticketStatusLabels[event.ke]
        : event.ke ?? "—";
    return `Status berubah: ${from} → ${to}`;
  }
  if (event.jenis === "komentar") return "Komentar ditambahkan";
  if (event.jenis === "kredensial_dilihat") return "ID remote dilihat";
  return "Perubahan tiket";
}

export default async function TicketDetailPage({
  params,
}: PageProps<"/tiket/[id]">) {
  await connection();
  const { id } = await params;
  if (!uuidPattern.test(id)) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile, error: profileError } = await supabase
    .from("users")
    .select("id, nama, peran")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) {
    return (
      <main className="mx-auto w-full max-w-3xl p-8">
        <p role="alert" className="text-red-700">
          Gagal memeriksa profil: {profileError.message}
        </p>
      </main>
    );
  }

  const role = profile?.peran ?? null;
  const isStaff = role === "it" || role === "admin";
  const { data: ticket, error: ticketError } = await supabase
    .from("tickets")
    .select(
      "id, nomor_tiket, pembuat_id, site_id, category_id, deskripsi, prioritas, jumlah_user_terdampak, nomor_aset, penanganan, status, it_id, dibuat_pada, diproses_pada, selesai_pada, ditutup_pada, rating, sla_respon_batas, sla_resolusi_batas",
    )
    .eq("id", id)
    .maybeSingle();

  if (ticketError) {
    return (
      <main className="mx-auto w-full max-w-3xl p-8">
        <p role="alert" className="text-red-700">
          Gagal memuat tiket: {ticketError.message}
        </p>
      </main>
    );
  }
  if (!ticket || (!isStaff && ticket.pembuat_id !== user.id)) notFound();
  const isCreator = ticket.pembuat_id === user.id;

  const [
    { data: category, error: categoryError },
    siteResult,
    { data: events, error: eventsError },
    { data: attachments, error: attachmentsError },
  ] = await Promise.all([
    supabase
      .from("categories")
      .select("nama")
      .eq("id", ticket.category_id)
      .maybeSingle(),
    ticket.site_id
      ? supabase
          .from("sites")
          .select("nama")
          .eq("id", ticket.site_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    supabase
      .from("ticket_events")
      .select("id, jenis, dari, ke, waktu, aktor_id")
      .eq("ticket_id", ticket.id)
      .order("waktu", { ascending: true }),
    supabase
      .from("attachments")
      .select("id, path_file, jenis")
      .eq("ticket_id", ticket.id)
      .order("diunggah_pada", { ascending: true }),
  ]);

  const { data: site, error: siteError } = siteResult;
  const attachmentsWithUrl = await Promise.all(
    (attachments ?? []).map(async (attachment) => {
      const { data, error } = await supabase.storage
        .from("ticket-attachments")
        .createSignedUrl(attachment.path_file, 3600);
      return {
        ...attachment,
        url: data?.signedUrl ?? null,
        error: error?.message ?? null,
      };
    }),
  );
  const profileIds = Array.from(
    new Set(
      [
        ticket.pembuat_id,
        ticket.it_id,
        ...(events ?? []).map((event) => event.aktor_id),
      ].filter((profileId): profileId is string => Boolean(profileId)),
    ),
  );
  const { data: relatedProfiles, error: relatedProfilesError } =
    (isStaff || isCreator) && profileIds.length > 0
      ? await supabase.from("users").select("id, nama").in("id", profileIds)
      : { data: [], error: null };
  const namesById = new Map(
    [...(relatedProfiles ?? []), ...(profile ? [profile] : [])].map(
      (relatedProfile) => [relatedProfile.id, relatedProfile.nama],
    ),
  );

  const mayViewRemoteIds =
    isStaff && (role === "admin" || ticket.it_id === user.id);
  const { data: remoteCredentials, error: remoteError } = mayViewRemoteIds
    ? await supabase
        .from("remote_credentials")
        .select("id, aplikasi, remote_id")
        .eq("ticket_id", ticket.id)
    : { data: null, error: null };

  const status = ticket.status as TicketStatus;

  return (
    <main className="mx-auto w-full max-w-3xl space-y-6 p-8">
      <div>
        <Link href="/tiket" className="text-sm text-gray-600 hover:underline">
          ← Kembali
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="font-mono text-sm text-gray-500">
            {ticket.nomor_tiket}
          </h1>
          <PrioritasBadge prioritas={ticket.prioritas} />
          <StatusBadge status={ticket.status} />
        </div>
        <h2 className="mt-2 text-2xl font-semibold">
          {categoryError ? "Kategori" : category?.nama ?? "Kategori"}
        </h2>
        {categoryError && (
          <p role="alert" className="text-sm text-red-700">
            Gagal memuat kategori: {categoryError.message}
          </p>
        )}
      </div>

      <section className="grid gap-4 rounded border p-5 sm:grid-cols-2">
        <div>
          <p className="text-sm text-gray-500">Pembuat</p>
          <p>{namesById.get(ticket.pembuat_id) ?? "Pengguna"}</p>
        </div>
        <div>
          <p className="text-sm text-gray-500">Site</p>
          {siteError ? (
            <p role="alert" className="text-red-700">
              Gagal memuat site: {siteError.message}
            </p>
          ) : (
            <p>{site?.nama ?? "—"}</p>
          )}
        </div>
        <div>
          <p className="text-sm text-gray-500">Dibuat</p>
          <p>{formatDate(ticket.dibuat_pada)}</p>
        </div>
        <div>
          <p className="text-sm text-gray-500">Penanganan</p>
          <p>{ticket.penanganan === "remote" ? "Remote" : "Onsite"}</p>
        </div>
        {ticket.jumlah_user_terdampak != null && (
          <div>
            <p className="text-sm text-gray-500">User terdampak</p>
            <p>{ticket.jumlah_user_terdampak}</p>
          </div>
        )}
        {ticket.nomor_aset && (
          <div>
            <p className="text-sm text-gray-500">Nomor aset</p>
            <p>{ticket.nomor_aset}</p>
          </div>
        )}
        {ticket.it_id && (
          <div>
            <p className="text-sm text-gray-500">Ditangani oleh</p>
            <p>{namesById.get(ticket.it_id) ?? "IT"}</p>
          </div>
        )}
      </section>

      <section className="rounded border p-5">
        <h2 className="mb-2 font-medium">Deskripsi</h2>
        <p className="whitespace-pre-wrap">{ticket.deskripsi}</p>
      </section>

      {(attachmentsError || attachmentsWithUrl.length > 0) && (
        <section className="rounded border p-5">
          <h2 className="mb-3 font-medium">Lampiran</h2>
          {attachmentsError ? (
            <p role="alert" className="text-sm text-red-700">
              Gagal memuat data lampiran: {attachmentsError.message}
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {attachmentsWithUrl.map((attachment) =>
                attachment.url ? (
                  <a
                    key={attachment.id}
                    href={attachment.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block overflow-hidden rounded border hover:opacity-90"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={attachment.url}
                      alt="Lampiran foto tiket"
                      className="h-40 w-full object-cover"
                    />
                  </a>
                ) : (
                  <p key={attachment.id} role="alert" className="text-sm text-red-700">
                    Gagal membuat tautan lampiran:{" "}
                    {attachment.error ?? "URL file tidak tersedia."}
                  </p>
                ),
              )}
            </div>
          )}
        </section>
      )}

      <section className="space-y-2 rounded border p-5">
        <h2 className="mb-3 font-medium">SLA</h2>
        <p className="text-xs text-gray-500">
          Batas respons: {formatDate(ticket.sla_respon_batas)}
        </p>
        <SlaTimer
          label="SLA Respons"
          batas={ticket.sla_respon_batas}
          berhenti={["diproses", "selesai", "ditutup"].includes(status)}
        />
        <p className="pt-2 text-xs text-gray-500">
          Batas resolusi: {formatDate(ticket.sla_resolusi_batas)}
        </p>
        <SlaTimer
          label="SLA Resolusi"
          batas={ticket.sla_resolusi_batas}
          berhenti={[
            "selesai",
            "ditutup",
            "menunggu_user",
            "dijadwalkan_kunjungan",
          ].includes(status)}
        />
      </section>

      {mayViewRemoteIds && (
        <section className="rounded border p-5">
          <h2 className="mb-3 font-medium">Kredensial remote</h2>
          {remoteError ? (
            <p role="alert" className="text-red-700">
              Gagal memuat ID remote: {remoteError.message}
            </p>
          ) : !remoteCredentials?.length ? (
            <p className="text-sm text-gray-600">
              Tidak ada ID remote tersimpan.
            </p>
          ) : (
            <ul className="space-y-1 text-sm">
              {remoteCredentials.map((credential) => (
                <li key={credential.id} className="font-mono">
                  {credential.aplikasi}: {credential.remote_id}
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-xs text-gray-500">
            Hanya IT yang ditugaskan dan admin yang dapat melihat ID. Password
            tidak disimpan; minta password terbaru langsung kepada pelapor.
          </p>
        </section>
      )}

      {(isStaff || isCreator) && (
        <section className="border-t pt-4">
          <h2 className="mb-2 font-medium">Aksi</h2>
          {isStaff && ticket.it_id && (
            <p className="mb-3 text-sm text-gray-600">
              Ditangani oleh: {namesById.get(ticket.it_id) ?? "IT"}
            </p>
          )}
          {isStaff && (
            <TicketActions
              ticketId={ticket.id}
              status={status}
              assigneeId={ticket.it_id}
              userId={user.id}
              role={role}
            />
          )}
          {isCreator && status === "selesai" && (
            <UserRatingForm ticketId={ticket.id} />
          )}
          {status === "ditutup" && ticket.rating != null && (
            <p className="inline-block rounded border bg-gray-50 p-3 text-sm">
              Rating pembuat:{" "}
              <span
                aria-label={`${ticket.rating} dari 5 bintang`}
                className="text-lg text-yellow-500"
              >
                {"★".repeat(ticket.rating)}
              </span>
            </p>
          )}
          {isCreator && status === "ditutup" && ticket.rating == null && (
            <p className="text-sm text-gray-500">Tiket sudah ditutup.</p>
          )}
        </section>
      )}

      <section className="border-t pt-4">
        <h2 className="mb-2 font-medium">Riwayat</h2>
        {eventsError ? (
          <p role="alert" className="text-red-700">
            Gagal memuat timeline: {eventsError.message}
          </p>
        ) : !events?.length ? (
          <p className="text-sm text-gray-500">Belum ada aktivitas.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {events.map((event) => (
              <li key={event.id} className="flex flex-wrap gap-2">
                <span className="text-gray-500">{formatDate(event.waktu)}</span>
                <span>
                  <strong>
                    {event.aktor_id
                      ? namesById.get(event.aktor_id) ?? "Pengguna"
                      : "Sistem"}
                  </strong>
                  {" — "}
                  {describeEvent(event)}
                </span>
              </li>
            ))}
          </ul>
        )}
        {relatedProfilesError && (
          <p role="alert" className="mt-3 text-sm text-red-700">
            Gagal memuat nama pengguna terkait: {relatedProfilesError.message}
          </p>
        )}
      </section>
    </main>
  );
}
