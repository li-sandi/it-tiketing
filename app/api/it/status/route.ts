import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const ALLOWED_STATUSES = new Set(["free", "off", "kunjungan"]);

function jsonError(error: string, status: number) {
  return NextResponse.json(
    { error },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return jsonError("Belum login.", 401);

  const { data: statusRow, error } = await supabase
    .from("it_status")
    .select("status, diperbarui_pada")
    .eq("it_id", user.id)
    .maybeSingle();

  if (error) return jsonError("Gagal membaca status IT.", 500);
  return NextResponse.json(
    {
      status: statusRow?.status ?? "free",
      diperbaruiPada: statusRow?.diperbarui_pada ?? null,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function PATCH(request: Request) {
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
    return jsonError("Payload tidak valid.", 400);
  }
  if (typeof payload !== "object" || payload === null) {
    return jsonError("Payload tidak valid.", 400);
  }

  const record = payload as Record<string, unknown>;
  const targetItId =
    typeof record.itId === "string" && record.itId ? record.itId : user.id;
  const status = typeof record.status === "string" ? record.status : "";
  if (!ALLOWED_STATUSES.has(status)) {
    return jsonError("Status manual harus free, off, atau kunjungan.", 400);
  }

  const { data: finalStatus, error } = await supabase.rpc(
    "set_manual_it_status",
    {
      p_target_it_id: targetItId,
      p_status: status,
    },
  );
  if (error) {
    return jsonError(error.message, 400);
  }

  return NextResponse.json(
    { ok: true, status: finalStatus },
    { headers: { "Cache-Control": "no-store" } },
  );
}
