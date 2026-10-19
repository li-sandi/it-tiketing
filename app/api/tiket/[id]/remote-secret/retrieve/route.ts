import { NextResponse } from "next/server";
import { getRedisClient, remoteSecretKey } from "@/lib/redis";
import { createClient } from "@/lib/supabase/server";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PRIVATE_HEADERS = { "Cache-Control": "no-store, private" };

function jsonError(error: string, status: number) {
  return NextResponse.json({ error }, { status, headers: PRIVATE_HEADERS });
}

export async function POST(
  request: Request,
  { params }: RouteContext<"/api/tiket/[id]/remote-secret/retrieve">,
) {
  const { id } = await params;
  if (!UUID_PATTERN.test(id)) return jsonError("ID tiket tidak valid.", 400);

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

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) return jsonError("Belum login.", 401);

  const { data: profile, error: profileError } = await supabase
    .from("users")
    .select("peran")
    .eq("id", user.id)
    .maybeSingle();
  if (profileError) {
    console.error("Gagal memeriksa akses password remote:", profileError.message);
    return jsonError("Gagal memeriksa akses.", 500);
  }

  const { data: ticket, error: ticketError } = await supabase
    .from("tickets")
    .select("it_id")
    .eq("id", id)
    .maybeSingle();
  if (ticketError) {
    console.error("Gagal membaca tiket untuk password remote:", ticketError.message);
    return jsonError("Gagal memuat tiket.", 500);
  }
  if (!ticket) return jsonError("Tiket tidak ditemukan.", 404);

  const isAdmin = profile?.peran === "admin";
  const isAssignedIt = profile?.peran === "it" && ticket.it_id === user.id;
  if (!isAdmin && !isAssignedIt) {
    return jsonError(
      "Hanya IT yang ditugaskan atau admin yang dapat mengambil password.",
      403,
    );
  }

  try {
    const secret = await getRedisClient().getdel<{
      anydeskPassword?: string;
      uvPassword?: string;
    }>(remoteSecretKey(id));
    if (!secret) {
      return jsonError(
        "Password tidak tersedia, sudah diambil, atau kedaluwarsa (5 menit).",
        404,
      );
    }
    return NextResponse.json(secret, { headers: PRIVATE_HEADERS });
  } catch (error) {
    console.error(
      "Gagal mengambil password tiket sementara:",
      error instanceof Error ? error.message : "Kesalahan Redis.",
    );
    return jsonError("Password sementara tidak dapat diambil.", 503);
  }
}
