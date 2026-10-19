import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PRIVATE_HEADERS = { "Cache-Control": "no-store, private" };

function responseError(error: string, status: number) {
  return NextResponse.json(
    { error },
    { status, headers: PRIVATE_HEADERS },
  );
}

export async function POST(
  request: Request,
  { params }: RouteContext<"/api/tiket/publik/[token]/rating">,
) {
  const { token } = await params;
  if (!UUID_PATTERN.test(token)) {
    return responseError("Tiket tidak ditemukan.", 404);
  }

  const origin = request.headers.get("origin");
  if (origin) {
    try {
      if (new URL(origin).origin !== new URL(request.url).origin) {
        return responseError("Asal permintaan tidak diizinkan.", 403);
      }
    } catch {
      return responseError("Header asal permintaan tidak valid.", 403);
    }
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return responseError("Data rating tidak valid.", 400);
  }

  if (
    typeof payload !== "object" ||
    payload === null ||
    !("rating" in payload) ||
    typeof payload.rating !== "number" ||
    !Number.isInteger(payload.rating) ||
    payload.rating < 1 ||
    payload.rating > 5
  ) {
    return responseError("Rating harus berupa angka 1-5.", 400);
  }

  const admin = createAdminClient();
  const { data: closed, error } = await admin.rpc("close_public_ticket", {
    p_access_token: token,
    p_rating: payload.rating,
  });

  if (error) {
    console.error("Gagal menutup tiket publik dengan rating:", error.message);
    return responseError("Gagal menutup tiket. Silakan coba lagi.", 500);
  }
  if (!closed) {
    return responseError(
      "Tiket tidak ditemukan, belum selesai, atau sudah ditutup.",
      409,
    );
  }

  return NextResponse.json({ ok: true }, { headers: PRIVATE_HEADERS });
}
