import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import AppShell from "@/components/layout/AppShell";
import ApprovalActions from "@/components/tiket/ApprovalActions";
import MergeTicketPanel from "@/components/tiket/MergeTicketPanel";
import PromoteWikiButton from "@/components/tiket/PromoteWikiButton";
import RemoteCredentialPanel from "@/components/tiket/RemoteCredentialPanel";
import SlaTimer from "@/components/tiket/SlaTimer";
import { PrioritasBadge, StatusBadge } from "@/components/tiket/StatusBadge";
import StockConsumeButton from "@/components/tiket/StockConsumeButton";
import TicketActions from "@/components/tiket/TicketActions";
import UserRatingForm from "@/components/tiket/UserRatingForm";
import { formatProcurementEstimate } from "@/lib/stok";
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
        : event.ke ?? "-";
    return `Status berubah: ${from} ke ${to}`;
  }
  if (event.jenis === "komentar") return "Komentar ditambahkan";
  if (event.jenis === "kredensial_dilihat") return "Kredensial remote dibuka";
  if (event.jenis === "aging") return `Prioritas naik otomatis: ${event.dari} ke ${event.ke}`;
  if (event.jenis === "merge") return `Penggabungan tiket: ${event.dari} ke ${event.ke}`;
  if (event.jenis === "approval") return `Persetujuan GA/Admin: ${event.ke}`;
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

  const userName = profile?.nama ?? user.email ?? "Pengguna";
  const role = profile?.peran ?? "user";

  if (profileError) {
    return (
      <AppShell
        userName={userName}
        userEmail={user.email}
        role={role}
        pageTitle="Detail Tiket"
      >
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Gagal memeriksa profil: {profileError.message}
        </p>
      </AppShell>
    );
  }

  const isStaff = role === "it" || role === "admin";
  const isApprover = role === "ga" || role === "admin";
  const { data: ticket, error: ticketError } = await supabase
    .from("tickets")
    .select(
      "id, nomor_tiket, pembuat_id, pembuat_nama, pembuat_kontak, site_id, category_id, deskripsi, prioritas, prioritas_awal, aging_level, jumlah_user_terdampak, jumlah_task, kunjungan_pada, nomor_aset, penanganan, status, it_id, digabung_ke_id, approval_status, approval_catatan, rekomendasi_upgrade_ram, estimasi_pengadaan, stock_kode, sla_paused_at, dibuat_pada, diproses_pada, selesai_pada, ditutup_pada, poin_kesulitan, catatan_solusi, rating, sla_respon_batas, sla_resolusi_batas",
    )
    .eq("id", id)
    .maybeSingle();

  if (ticketError) {
    return (
      <AppShell
        userName={userName}
        userEmail={user.email}
        role={role}
        pageTitle="Detail Tiket"
      >
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Gagal memuat tiket: {ticketError.message}
        </p>
      </AppShell>
    );
  }

  const canGaView = role === "ga" && ticket?.approval_status !== "tidak_perlu";
  if (!ticket || (!isStaff && !canGaView && ticket.pembuat_id !== user.id)) {
    notFound();
  }
  const isCreator = ticket.pembuat_id === user.id;

  const [
    { data: category, error: categoryError },
    siteResult,
    { data: events, error: eventsError },
    { data: attachments, error: attachmentsError },
  ] = await Promise.all([
    supabase
      .from("categories")
      .select("nama, grup")
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
  const regularAttachments = (attachments ?? []).filter(
    (a) => a.jenis !== "foto_remote",
  );
  const remotePhotoCount = (attachments ?? []).filter(
    (a) => a.jenis === "foto_remote",
  ).length;

  const attachmentsWithUrl = await Promise.all(
    regularAttachments.map(async (attachment) => {
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
    (isStaff || isCreator || canGaView) && profileIds.length > 0
      ? await supabase.from("users").select("id, nama").in("id", profileIds)
      : { data: [], error: null };
  const namesById = new Map(
    [...(relatedProfiles ?? []), ...(profile ? [profile] : [])].map(
      (relatedProfile) => [relatedProfile.id, relatedProfile.nama],
    ),
  );

  const mayViewRemoteIds =
    isStaff && (role === "admin" || ticket.it_id === user.id);
  const { data: remoteCredentials } = mayViewRemoteIds
    ? await supabase
        .from("remote_credentials")
        .select("id")
        .eq("ticket_id", ticket.id)
    : { data: null };

  const status = ticket.status as TicketStatus;
  const [{ data: stockItem }, { count: stockConsumeCount }] =
    ticket.stock_kode && (isStaff || isApprover)
      ? await Promise.all([
          supabase
            .from("inventory_stocks")
            .select("kode, nama, satuan, jumlah_stok")
            .eq("kode", ticket.stock_kode)
            .maybeSingle(),
          supabase
            .from("stock_movements")
            .select("id", { count: "exact", head: true })
            .eq("ticket_id", ticket.id)
            .eq("jenis", "keluar"),
        ])
      : [{ data: null }, { count: 0 }];
  const canMerge =
    isStaff &&
    !ticket.digabung_ke_id &&
    !["selesai", "ditutup"].includes(status);

  const { data: mergeCandidatesRaw } = canMerge
    ? await supabase
        .from("tickets")
        .select("id, nomor_tiket, deskripsi, prioritas, pembuat_id, pembuat_nama")
        .eq("category_id", ticket.category_id)
        .is("digabung_ke_id", null)
        .neq("id", ticket.id)
        .in("status", ["baru", "diproses", "menunggu_user", "menunggu_pengadaan"])
        .order("dibuat_pada", { ascending: false })
        .limit(20)
    : { data: [] };

  const mergeCandidates = (mergeCandidatesRaw ?? []).map((c) => ({
    id: c.id,
    nomor_tiket: c.nomor_tiket,
    deskripsi: c.deskripsi,
    prioritas: c.prioritas,
    pembuat: c.pembuat_nama ?? namesById.get(c.pembuat_id) ?? "Pelapor",
  }));

  const creatorName = ticket.pembuat_id
    ? namesById.get(ticket.pembuat_id) ?? "Pengguna"
    : ticket.pembuat_nama ?? "Pelapor Publik";

  return (
    <AppShell
      userName={userName}
      userEmail={user.email}
      role={role}
      pageTitle={`Tiket ${ticket.nomor_tiket}`}
      headerAction={
        <Link
          href={isStaff ? "/antrian" : "/tiket"}
          className="inline-flex min-h-9 items-center rounded-lg border bg-[var(--surface)] px-3 py-1.5 text-xs font-medium text-[var(--foreground)] hover:bg-[var(--surface-muted)]"
        >
          {isStaff ? "Kembali ke Antrian" : "Daftar Tiket"}
        </Link>
      }
    >
      <div className="mx-auto w-full max-w-4xl space-y-6">
        <div className="rounded-xl border bg-[var(--surface)] p-5 shadow-xs sm:p-6">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="font-mono text-xs font-semibold tabular-nums text-[var(--muted)]">
              {ticket.nomor_tiket}
            </span>
            <PrioritasBadge prioritas={ticket.prioritas} />
            <StatusBadge status={ticket.status} />
            {(ticket.aging_level ?? 0) > 0 && (
              <span className="rounded-md border border-amber-300 bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                Aging (awal {ticket.prioritas_awal ?? ticket.prioritas})
              </span>
            )}
            {ticket.digabung_ke_id && (
              <Link
                href={`/tiket/${ticket.digabung_ke_id}`}
                className="rounded-md border border-blue-200 bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700 underline"
              >
                Digabung ke tiket induk
              </Link>
            )}
          </div>
          <h2 className="mt-3 text-xl font-bold text-[var(--foreground)]">
            {categoryError ? "Kategori" : category?.nama ?? "Kategori"}
          </h2>
          {category?.grup && (
            <p className="mt-0.5 text-xs text-[var(--muted)]">
              Kelompok: {category.grup}
            </p>
          )}
          {categoryError && (
            <p role="alert" className="mt-1 text-sm text-red-700">
              Gagal memuat kategori: {categoryError.message}
            </p>
          )}
        </div>

        <section className="grid gap-4 rounded-xl border bg-[var(--surface)] p-5 shadow-xs sm:grid-cols-2">
          <div>
            <p className="text-xs font-medium text-[var(--muted)]">Pembuat</p>
            <p className="mt-0.5 text-sm font-medium text-[var(--foreground)]">
              {creatorName}
              {!ticket.pembuat_id && (
                <span className="ml-1.5 rounded-md bg-[var(--surface-muted)] px-1.5 py-0.5 text-xs text-[var(--muted)]">
                  Publik
                </span>
              )}
            </p>
            {ticket.pembuat_kontak && (isStaff || isApprover) && (
              <p className="mt-0.5 text-xs text-[var(--muted)]">
                Kontak: {ticket.pembuat_kontak}
              </p>
            )}
          </div>
          <div>
            <p className="text-xs font-medium text-[var(--muted)]">Site</p>
            {siteError ? (
              <p role="alert" className="mt-0.5 text-sm text-red-700">
                Gagal memuat site: {siteError.message}
              </p>
            ) : (
              <p className="mt-0.5 text-sm font-medium">{site?.nama ?? "-"}</p>
            )}
          </div>
          <div>
            <p className="text-xs font-medium text-[var(--muted)]">Dibuat</p>
            <p className="mt-0.5 text-sm font-medium">{formatDate(ticket.dibuat_pada)}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-[var(--muted)]">Penanganan</p>
            <p className="mt-0.5 text-sm font-medium">
              {ticket.penanganan === "remote" ? "Remote" : "Onsite"}
            </p>
          </div>
          {ticket.jumlah_user_terdampak != null && (
            <div>
              <p className="text-xs font-medium text-[var(--muted)]">User terdampak</p>
              <p className="mt-0.5 text-sm font-medium tabular-nums">
                {ticket.jumlah_user_terdampak}
              </p>
            </div>
          )}
          {ticket.jumlah_task != null && (
            <div>
              <p className="text-xs font-medium text-[var(--muted)]">Jumlah task</p>
              <p className="mt-0.5 text-sm font-medium tabular-nums">
                {ticket.jumlah_task}
              </p>
            </div>
          )}
          {ticket.kunjungan_pada && (
            <div>
              <p className="text-xs font-medium text-[var(--muted)]">Tanggal kunjungan</p>
              <p className="mt-0.5 text-sm font-medium">
                {new Date(`${ticket.kunjungan_pada}T00:00:00.000Z`).toLocaleDateString(
                  "id-ID",
                  { dateStyle: "long", timeZone: "UTC" },
                )}
              </p>
            </div>
          )}
          {ticket.nomor_aset && (
            <div>
              <p className="text-xs font-medium text-[var(--muted)]">Nomor aset</p>
              <p className="mt-0.5 font-mono text-sm font-medium">{ticket.nomor_aset}</p>
            </div>
          )}
          {ticket.it_id && (
            <div>
              <p className="text-xs font-medium text-[var(--muted)]">Ditangani oleh</p>
              <p className="mt-0.5 text-sm font-medium">
                {namesById.get(ticket.it_id) ?? "IT"}
              </p>
            </div>
          )}
          {ticket.approval_status && ticket.approval_status !== "tidak_perlu" && (
            <div className="sm:col-span-2">
              <p className="text-xs font-medium text-[var(--muted)]">
                Status Persetujuan GA
              </p>
              <p className="mt-0.5 text-sm font-semibold capitalize">
                {ticket.approval_status}
                {ticket.rekomendasi_upgrade_ram ? " (Rekomendasi Upgrade RAM)" : ""}
              </p>
              {ticket.approval_catatan && (
                <p className="mt-0.5 text-xs text-[var(--secondary)]">
                  Catatan: {ticket.approval_catatan}
                </p>
              )}
            </div>
          )}
        </section>

        <section className="rounded-xl border bg-[var(--surface)] p-5 shadow-xs">
          <h2 className="mb-2 text-sm font-semibold text-[var(--foreground)]">
            Deskripsi Masalah
          </h2>
          <p className="whitespace-pre-wrap text-sm text-[var(--secondary)]">
            {ticket.deskripsi}
          </p>
        </section>

        {isApprover && ticket.approval_status === "menunggu" && (
          <ApprovalActions ticketId={ticket.id} />
        )}

        {ticket.status === "menunggu_pengadaan" && (
          <section className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950 shadow-xs">
            <p className="font-semibold">
              Menunggu Pengadaan Sparepart Bulan Depan
            </p>
            <p className="mt-1 text-xs">
              Stok sparepart ({stockItem?.nama ?? ticket.stock_kode ?? "terkait"})
              saat tiket dibuat sedang kosong. Estimasi pengadaan:{" "}
              <strong>
                {formatProcurementEstimate(ticket.estimasi_pengadaan) ??
                  "Awal bulan depan"}
              </strong>
              . SLA dijeda selama menunggu pengadaan GA/Admin.
            </p>
          </section>
        )}

        {isStaff &&
          stockItem &&
          !["selesai", "ditutup"].includes(status) && (
            <StockConsumeButton
              ticketId={ticket.id}
              stockKode={stockItem.kode}
              stockNama={stockItem.nama}
              availableCount={stockItem.jumlah_stok}
              satuan={stockItem.satuan}
              alreadyConsumed={(stockConsumeCount ?? 0) > 0}
            />
          )}

        {(ticket.poin_kesulitan != null || ticket.catatan_solusi) && (
          <section className="space-y-2 rounded-xl border bg-[var(--surface)] p-5 shadow-xs">
            <h2 className="text-sm font-semibold text-[var(--foreground)]">
              Penyelesaian
            </h2>
            {ticket.poin_kesulitan != null && (
              <p className="text-sm text-[var(--secondary)]">
                Poin kesulitan: <strong className="tabular-nums">{ticket.poin_kesulitan} dari 5</strong>
              </p>
            )}
            {ticket.catatan_solusi && (
              <p className="whitespace-pre-wrap text-sm text-[var(--secondary)]">
                {ticket.catatan_solusi}
              </p>
            )}
            {isStaff && ticket.catatan_solusi && (
              <PromoteWikiButton
                ticketId={ticket.id}
                categoryId={ticket.category_id}
                grup={category?.grup ?? "Lainnya"}
                defaultTitle={`SOP: ${category?.nama ?? ticket.nomor_tiket}`}
                masalah={ticket.deskripsi}
                solusi={ticket.catatan_solusi}
              />
            )}
          </section>
        )}

        {(attachmentsError || attachmentsWithUrl.length > 0) && (
          <section className="rounded-xl border bg-[var(--surface)] p-5 shadow-xs">
            <h2 className="mb-3 text-sm font-semibold text-[var(--foreground)]">
              Lampiran
            </h2>
            {attachmentsError ? (
              <p role="alert" className="text-sm text-red-700">
                Gagal memuat data lampiran: {attachmentsError.message}
              </p>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {attachmentsWithUrl.map((attachment) =>
                  attachment.url ? (
                    <a
                      key={attachment.id}
                      href={attachment.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block overflow-hidden rounded-lg border hover:opacity-90"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={attachment.url}
                        alt="Lampiran foto tiket"
                        className="h-44 w-full object-cover"
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

        <section className="space-y-2 rounded-xl border bg-[var(--surface)] p-5 shadow-xs">
          <h2 className="mb-3 text-sm font-semibold text-[var(--foreground)]">SLA</h2>
          <p className="text-xs text-[var(--muted)]">
            Batas respons: {formatDate(ticket.sla_respon_batas)}
          </p>
          <SlaTimer
            label="SLA Respons"
            batas={ticket.sla_respon_batas}
            berhenti={["diproses", "selesai", "ditutup"].includes(status)}
          />
          <p className="pt-2 text-xs text-[var(--muted)]">
            Batas resolusi: {formatDate(ticket.sla_resolusi_batas)}
          </p>
          <SlaTimer
            label="SLA Resolusi"
            batas={ticket.sla_resolusi_batas}
            berhenti={[
              "selesai",
              "ditutup",
              "menunggu_user",
              "menunggu_pengadaan",
              "dijadwalkan_kunjungan",
            ].includes(status)}
          />
          {ticket.sla_paused_at && (
            <p className="text-xs text-amber-700">
              Timer SLA dijeda sejak {formatDate(ticket.sla_paused_at)}
            </p>
          )}
        </section>

        {mayViewRemoteIds && (
          <RemoteCredentialPanel
            ticketId={ticket.id}
            initialCount={remoteCredentials?.length ?? 0}
            remotePhotoCount={remotePhotoCount}
          />
        )}

        {canMerge && mergeCandidates.length > 0 && (
          <MergeTicketPanel
            parentTicketId={ticket.id}
            candidates={mergeCandidates}
          />
        )}

        {(isStaff || isCreator) && (
          <section className="rounded-xl border bg-[var(--surface)] p-5 shadow-xs">
            <h2 className="mb-3 text-sm font-semibold text-[var(--foreground)]">
              Aksi Tiket
            </h2>
            {isStaff && ticket.it_id && (
              <p className="mb-3 text-sm text-[var(--secondary)]">
                Ditangani oleh: <strong>{namesById.get(ticket.it_id) ?? "IT"}</strong>
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
              <p className="inline-block rounded-lg border bg-[var(--surface-muted)] p-3 text-sm">
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
              <p className="text-sm text-[var(--muted)]">Tiket sudah ditutup.</p>
            )}
          </section>
        )}

        <section className="rounded-xl border bg-[var(--surface)] p-5 shadow-xs">
          <h2 className="mb-3 text-sm font-semibold text-[var(--foreground)]">
            Riwayat Aktivitas
          </h2>
          {eventsError ? (
            <p role="alert" className="text-sm text-red-700">
              Gagal memuat timeline: {eventsError.message}
            </p>
          ) : !events?.length ? (
            <p className="text-sm text-[var(--muted)]">Belum ada aktivitas.</p>
          ) : (
            <ul className="space-y-2.5 text-sm">
              {events.map((event) => (
                <li key={event.id} className="flex flex-wrap gap-x-2 gap-y-0.5 border-b pb-2 last:border-b-0 last:pb-0">
                  <span className="text-xs text-[var(--muted)]">
                    {formatDate(event.waktu)}
                  </span>
                  <span className="text-sm text-[var(--secondary)]">
                    <strong className="text-[var(--foreground)]">
                      {event.aktor_id
                        ? namesById.get(event.aktor_id) ?? "Pengguna"
                        : "Sistem"}
                    </strong>{" "}
                    · {describeEvent(event)}
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
      </div>
    </AppShell>
  );
}
