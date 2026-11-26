import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

function jsonError(error: string, status: number) {
  return NextResponse.json(
    { error },
    { status, headers: { "Cache-Control": "no-store" } },
  );
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

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return jsonError("Belum login.", 401);

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return jsonError("Data langganan notifikasi tidak valid.", 400);
  }
  if (typeof payload !== "object" || payload === null) {
    return jsonError("Data langganan tidak valid.", 400);
  }

  const r = payload as Record<string, unknown>;
  const endpoint = typeof r.endpoint === "string" ? r.endpoint.trim() : "";
  const p256dh = typeof r.p256dh === "string" ? r.p256dh : "browser-local";
  const auth = typeof r.auth === "string" ? r.auth : "browser-local";

  if (!endpoint) return jsonError("Endpoint diperlukan.", 400);

  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      user_id: user.id,
      endpoint,
      p256dh,
      auth,
    },
    { onConflict: "endpoint" },
  );
  if (error) return jsonError("Gagal menyimpan langganan notifikasi.", 500);

  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}

export async function DELETE() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return jsonError("Belum login.", 401);

  const { error } = await supabase
    .from("push_subscriptions")
    .delete()
    .eq("user_id", user.id);
  if (error) return jsonError("Gagal menghapus langganan.", 500);

  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
