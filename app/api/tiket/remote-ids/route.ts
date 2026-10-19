import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PRIVATE_HEADERS = { "Cache-Control": "no-store, private" };

function jsonError(error: string, status: number) {
  return NextResponse.json({ error }, { status, headers: PRIVATE_HEADERS });
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
  let ticketIds: string[];

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

    let ticketsQuery = admin
      .from("tickets")
      .select("id")
      .eq("nomor_aset", assetNumber)
      .order("dibuat_pada", { ascending: false })
      .limit(50);
    if (profile?.peran !== "it" && profile?.peran !== "admin") {
      ticketsQuery = ticketsQuery.eq("pembuat_id", user.id);
    }

    const { data: tickets, error: ticketsError } = await ticketsQuery;
    if (ticketsError) {
      console.error("Gagal mencari tiket berdasarkan nomor aset:", ticketsError.message);
      return jsonError("Gagal mencari ID remote untuk aset.", 500);
    }
    ticketIds = (tickets ?? []).map((ticket) => ticket.id);
  } else {
    if (!UUID_PATTERN.test(accessToken)) {
      return jsonError(
        "Login atau tiket publik sebelumnya diperlukan untuk mencari ID.",
        401,
      );
    }

    const { data: ticket, error: ticketError } = await admin
      .from("tickets")
      .select("id")
      .eq("akses_token", accessToken)
      .eq("nomor_aset", assetNumber)
      .is("pembuat_id", null)
      .maybeSingle();
    if (ticketError) {
      console.error("Gagal memvalidasi token tiket untuk pencarian ID:", ticketError.message);
      return jsonError("Gagal memeriksa akses tiket.", 500);
    }
    ticketIds = ticket ? [ticket.id] : [];
  }

  if (!ticketIds.length) {
    return NextResponse.json(
      { anydeskId: null, uvId: null },
      { headers: PRIVATE_HEADERS },
    );
  }

  const { data: credentials, error: credentialError } = await admin
    .from("remote_credentials")
    .select("ticket_id, aplikasi, remote_id")
    .in("ticket_id", ticketIds);
  if (credentialError) {
    console.error("Gagal membaca ID remote berdasarkan aset:", credentialError.message);
    return jsonError("Gagal mencari ID remote untuk aset.", 500);
  }

  const ticketOrder = new Map(ticketIds.map((id, index) => [id, index]));
  const newestFirst = [...(credentials ?? [])].sort(
    (left, right) =>
      (ticketOrder.get(left.ticket_id) ?? Number.MAX_SAFE_INTEGER) -
      (ticketOrder.get(right.ticket_id) ?? Number.MAX_SAFE_INTEGER),
  );
  const ids: { anydeskId: string | null; uvId: string | null } = {
    anydeskId: null,
    uvId: null,
  };
  for (const credential of newestFirst) {
    if (credential.aplikasi === "anydesk" && !ids.anydeskId) {
      ids.anydeskId = credential.remote_id;
    }
    if (credential.aplikasi === "uv" && !ids.uvId) {
      ids.uvId = credential.remote_id;
    }
    if (ids.anydeskId && ids.uvId) break;
  }

  return NextResponse.json(ids, { headers: PRIVATE_HEADERS });
}
