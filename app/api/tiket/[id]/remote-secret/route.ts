import { NextResponse } from "next/server";
import { storeRemoteSecret } from "@/lib/redis";
import { createClient } from "@/lib/supabase/server";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PRIVATE_HEADERS = { "Cache-Control": "no-store, private" };

function jsonError(error: string, status: number) {
  return NextResponse.json({ error }, { status, headers: PRIVATE_HEADERS });
}

async function getAuthorizedTicket(ticketId: string, allowCreator = false) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) return { error: jsonError("Belum login.", 401) };

  const { data: profile, error: profileError } = await supabase
    .from("users")
    .select("peran")
    .eq("id", user.id)
    .maybeSingle();
  if (profileError) {
    console.error("Gagal memeriksa akses password remote:", profileError.message);
    return { error: jsonError("Gagal memeriksa akses.", 500) };
  }

  const isStaff = profile?.peran === "it" || profile?.peran === "admin";
  const { data: ticket, error: ticketError } = await supabase
    .from("tickets")
    .select("id, pembuat_id, it_id")
    .eq("id", ticketId)
    .maybeSingle();
  if (ticketError) {
    console.error("Gagal membaca tiket untuk password remote:", ticketError.message);
    return { error: jsonError("Gagal memuat tiket.", 500) };
  }
  if (!ticket) return { error: jsonError("Tiket tidak ditemukan.", 404) };

  const isAdmin = profile?.peran === "admin";
  const isAssignedIt = profile?.peran === "it" && ticket.it_id === user.id;
  const isCreator = ticket.pembuat_id === user.id;
  if (
    (!isStaff || (!isAdmin && !isAssignedIt)) &&
    !(allowCreator && isCreator)
  ) {
    return {
      error: jsonError("Hanya IT yang ditugaskan atau admin yang dapat mengakses.", 403),
    };
  }

  return { supabase, ticket, user, profileRole: profile?.peran ?? null };
}

export async function POST(
  request: Request,
  { params }: RouteContext<"/api/tiket/[id]/remote-secret">,
) {
  const { id } = await params;
  if (!UUID_PATTERN.test(id)) return jsonError("ID tiket tidak valid.", 400);

  const access = await getAuthorizedTicket(id, true);
  if ("error" in access) return access.error;

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

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return jsonError("Data password sementara tidak valid.", 400);
  }
  if (
    typeof payload !== "object" ||
    payload === null ||
    !("anydeskPassword" in payload) ||
    !("uvPassword" in payload) ||
    (typeof payload.anydeskPassword !== "string" &&
      typeof payload.anydeskPassword !== "undefined") ||
    (typeof payload.uvPassword !== "string" &&
      typeof payload.uvPassword !== "undefined")
  ) {
    return jsonError("Data password sementara tidak valid.", 400);
  }

  const anydeskPassword =
    typeof payload.anydeskPassword === "string"
      ? payload.anydeskPassword
      : "";
  const uvPassword =
    typeof payload.uvPassword === "string" ? payload.uvPassword : "";
  if (
    anydeskPassword.length > 512 ||
    uvPassword.length > 512 ||
    (!anydeskPassword.trim() && !uvPassword.trim())
  ) {
    return jsonError("Password kosong atau terlalu panjang.", 400);
  }

  const canSubmit =
    access.ticket.pembuat_id === access.user.id ||
    access.profileRole === "admin" ||
    (access.profileRole === "it" && access.ticket.it_id === access.user.id);
  if (!canSubmit) {
    return jsonError("Hanya pembuat tiket yang dapat mengirim password.", 403);
  }

  try {
    await storeRemoteSecret(id, {
      ...(anydeskPassword.trim() ? { anydeskPassword } : {}),
      ...(uvPassword.trim() ? { uvPassword } : {}),
    });
  } catch (error) {
    console.error(
      "Gagal menyimpan password tiket sementara:",
      error instanceof Error ? error.message : "Kesalahan Redis.",
    );
    return jsonError("Password sementara tidak dapat disimpan dengan aman.", 503);
  }

  return NextResponse.json({ ok: true }, { headers: PRIVATE_HEADERS });
}
