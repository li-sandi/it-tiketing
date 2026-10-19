import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { allowRateLimitedRequest } from "@/lib/redis";

const PRIVATE_HEADERS = { "Cache-Control": "no-store, private" };

export async function GET(request: Request) {
  const assetNumber = new URL(request.url).searchParams.get("nomorAset")?.trim();
  if (!assetNumber || assetNumber.length < 4 || assetNumber.length > 120) {
    return NextResponse.json(
      { error: "Nomor aset tidak valid." },
      { status: 400, headers: PRIVATE_HEADERS },
    );
  }

  const forwardedFor = request.headers.get("x-forwarded-for");
  const clientIp =
    forwardedFor?.split(",").at(-1)?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown";
  const ipHash = createHash("sha256").update(clientIp).digest("hex");

  try {
    const allowed = await allowRateLimitedRequest(
      `remote-id-lookup:${ipHash}`,
      20,
      60,
    );
    if (!allowed) {
      return NextResponse.json(
        { error: "Terlalu banyak pencarian. Coba lagi dalam satu menit." },
        {
          status: 429,
          headers: { ...PRIVATE_HEADERS, "Retry-After": "60" },
        },
      );
    }
  } catch (error) {
    console.error(
      "Layanan rate limit pencarian ID remote tidak tersedia:",
      error instanceof Error ? error.message : "Kesalahan Redis.",
    );
    return NextResponse.json(
      { error: "Pencarian ID aset sementara tidak tersedia." },
      { status: 503, headers: PRIVATE_HEADERS },
    );
  }

  const admin = createAdminClient();
  const { data: tickets, error: ticketsError } = await admin
    .from("tickets")
    .select("id")
    .eq("nomor_aset", assetNumber)
    .order("dibuat_pada", { ascending: false })
    .limit(50);

  if (ticketsError) {
    console.error("Gagal mencari tiket berdasarkan nomor aset:", ticketsError.message);
    return NextResponse.json(
      { error: "Gagal mencari ID remote untuk aset." },
      { status: 500, headers: PRIVATE_HEADERS },
    );
  }

  const ticketIds = (tickets ?? []).map((ticket) => ticket.id);
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
    return NextResponse.json(
      { error: "Gagal mencari ID remote untuk aset." },
      { status: 500, headers: PRIVATE_HEADERS },
    );
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
    if (
      credential.aplikasi === "anydesk" &&
      !ids.anydeskId
    ) {
      ids.anydeskId = credential.remote_id;
    }
    if (credential.aplikasi === "uv" && !ids.uvId) {
      ids.uvId = credential.remote_id;
    }
    if (ids.anydeskId && ids.uvId) break;
  }

  return NextResponse.json(ids, { headers: PRIVATE_HEADERS });
}
