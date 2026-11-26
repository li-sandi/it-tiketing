import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { notifApprovalKeputusan } from "@/lib/notifikasi";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function jsonError(error: string, status: number) {
  return NextResponse.json(
    { error },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const origin = request.headers.get("origin");
  if (origin) {
    try {
      if (new URL(origin).origin !== new URL(request.url).origin) {
        return jsonError("Asal permintaan tidak diizinkan.", 403);
      }
    } catch {
      return jsonError("Header asal permintaan tidak valid.", 403);
    }
  }

  const { id: ticketId } = await params;
  if (!UUID_PATTERN.test(ticketId)) {
    return jsonError("ID tiket tidak valid.", 400);
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return jsonError("Belum login.", 401);

  const { data: profile } = await supabase
    .from("users")
    .select("peran")
    .eq("id", user.id)
    .maybeSingle();
  if (profile?.peran !== "ga" && profile?.peran !== "admin") {
    return jsonError("Hanya GA atau admin yang dapat memutuskan approval.", 403);
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return jsonError("Data approval tidak valid.", 400);
  }
  if (typeof payload !== "object" || payload === null) {
    return jsonError("Data approval tidak valid.", 400);
  }

  const record = payload as Record<string, unknown>;
  const keputusan = record.keputusan;
  const catatan =
    typeof record.catatan === "string" ? record.catatan.trim().slice(0, 1000) : "";

  if (keputusan !== "disetujui" && keputusan !== "ditolak") {
    return jsonError("Keputusan harus disetujui atau ditolak.", 400);
  }

  const admin = createAdminClient();
  const { data: ticket, error: ticketError } = await admin
    .from("tickets")
    .select("id, approval_status")
    .eq("id", ticketId)
    .maybeSingle();
  if (ticketError || !ticket) {
    return jsonError("Tiket tidak ditemukan.", 404);
  }
  if (ticket.approval_status !== "menunggu") {
    return jsonError("Tiket ini tidak sedang menunggu persetujuan.", 409);
  }

  const { error: updateError } = await admin
    .from("tickets")
    .update({
      approval_status: keputusan,
      approval_oleh: user.id,
      approval_pada: new Date().toISOString(),
      approval_catatan: catatan || null,
    })
    .eq("id", ticketId)
    .eq("approval_status", "menunggu");

  if (updateError) {
    return jsonError("Gagal menyimpan keputusan approval.", 500);
  }

  await admin.from("ticket_events").insert({
    ticket_id: ticketId,
    aktor_id: user.id,
    jenis: "approval",
    dari: "menunggu",
    ke: keputusan,
  });

  await notifApprovalKeputusan(ticketId, keputusan, catatan).catch((err) =>
    console.error("Gagal notif keputusan approval:", err),
  );

  revalidatePath(`/tiket/${ticketId}`);
  revalidatePath("/dashboard");

  return NextResponse.json(
    { ok: true, approvalStatus: keputusan },
    { headers: { "Cache-Control": "no-store" } },
  );
}
