import { NextResponse } from "next/server";
import { checkEndpointRateLimit } from "@/lib/rate-limit";
import { sanitizeRemoteLookupResult } from "@/lib/remote-id-policy";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PRIVATE_HEADERS = { "Cache-Control": "no-store, private" };

function jsonError(error: string, status: number) {
  return NextResponse.json({ error }, { status, headers: PRIVATE_HEADERS });
}

function getClientIp(request: Request) {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]?.trim() || "unknown";
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}

export async function POST(request: Request) {
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

  const rateLimit = await checkEndpointRateLimit({
    ip: getClientIp(request),
    bucket: "remote-ids",
    limit: 30,
    windowMinutes: 15,
  });
  if (!rateLimit.success) {
    return jsonError("Terlalu banyak percobaan pencarian aset. Coba lagi nanti.", 429);
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return jsonError("Data pencarian tidak valid.", 400);
  }
  if (typeof payload !== "object" || payload === null) {
    return jsonError("Data pencarian tidak valid.", 400);
  }

  const assetNumber =
    "nomorAset" in payload && typeof payload.nomorAset === "string"
      ? payload.nomorAset.trim()
      : "";
  const accessToken =
    "accessToken" in payload && typeof payload.accessToken === "string"
      ? payload.accessToken
      : "";
  if (!assetNumber || assetNumber.length < 4 || assetNumber.length > 120) {
    return jsonError("Nomor aset tidak valid.", 400);
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const admin = createAdminClient();
  const { data: assetRecord } = await admin
    .from("assets")
    .select("nama_perangkat, ram_gb, anydesk_id, uv_id")
    .ilike("nomor_aset", assetNumber)
    .maybeSingle();

  let ticketIds: string[] = [];
  let canReadRemoteIds = false;

  if (user) {
    const { data: profile, error: profileError } = await supabase
      .from("users")
      .select("peran")
      .eq("id", user.id)
      .maybeSingle();
    if (profileError) {
      console.error("Gagal memeriksa akses pencarian ID remote:", profileError.message);
      return jsonError("Gagal memeriksa akses.", 500);
    }

    const isPrivileged =
      profile?.peran === "it" ||
      profile?.peran === "admin" ||
      profile?.peran === "ga";

    let ticketsQuery = admin
      .from("tickets")
      .select("id")
      .eq("nomor_aset", assetNumber)
      .order("dibuat_pada", { ascending: false })
      .limit(50);
    if (!isPrivileged) {
      ticketsQuery = ticketsQuery.eq("pembuat_id", user.id);
    }

    const { data: tickets, error: ticketsError } = await ticketsQuery;
    if (ticketsError) {
      console.error("Gagal mencari tiket berdasarkan nomor aset:", ticketsError.message);
      return jsonError("Gagal mencari ID remote untuk aset.", 500);
    }
    ticketIds = (tickets ?? []).map((ticket) => ticket.id);
    canReadRemoteIds = isPrivileged || ticketIds.length > 0;
  } else {
    if (!UUID_PATTERN.test(accessToken) && !assetRecord) {
      return jsonError(
        "Login atau tiket publik sebelumnya diperlukan untuk mencari ID.",
        401,
      );
    }

    if (UUID_PATTERN.test(accessToken)) {
      const { data: ticket, error: ticketError } = await admin
        .from("tickets")
        .select("id")
        .eq("akses_token", accessToken)
        .eq("nomor_aset", assetNumber)
        .is("pembuat_id", null)
        .maybeSingle();
      if (ticketError) {
        console.error("Gagal memvalidasi token tiket:", ticketError.message);
        return jsonError("Gagal memeriksa akses tiket.", 500);
      }
      if (ticket) {
        ticketIds = [ticket.id];
        canReadRemoteIds = true;
      }
    }
  }

  let ticketCreds: Array<{ ticket_id: string; aplikasi: string; remote_id: string }> = [];
  if (canReadRemoteIds && ticketIds.length > 0) {
    const { data: credentials, error: credentialError } = await admin
      .from("remote_credentials")
      .select("ticket_id, aplikasi, remote_id")
      .in("ticket_id", ticketIds);
    if (credentialError) {
      console.error("Gagal membaca ID remote:", credentialError.message);
      return jsonError("Gagal mencari ID remote untuk aset.", 500);
    }
    ticketCreds = credentials ?? [];
  }

  const sanitized = sanitizeRemoteLookupResult({
    assetRecord,
    ticketIds,
    ticketCreds,
    canReadRemoteIds,
  });

  return NextResponse.json(sanitized, { headers: PRIVATE_HEADERS });
}
