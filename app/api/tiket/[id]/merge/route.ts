import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { notifTiketDigabung } from "@/lib/notifikasi";
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

  const { id: parentId } = await params;
  if (!UUID_PATTERN.test(parentId)) {
    return jsonError("ID tiket induk tidak valid.", 400);
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
  if (profile?.peran !== "it" && profile?.peran !== "admin") {
    return jsonError("Hanya IT atau admin yang dapat menggabungkan tiket.", 403);
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return jsonError("Data merge tidak valid.", 400);
  }
  if (typeof payload !== "object" || payload === null) {
    return jsonError("Data merge tidak valid.", 400);
  }

  const rawIds = (payload as { childIds?: unknown }).childIds;
  const childIds = Array.isArray(rawIds)
    ? Array.from(
        new Set(
          rawIds.filter(
            (id): id is string =>
              typeof id === "string" && UUID_PATTERN.test(id) && id !== parentId,
          ),
        ),
      )
    : [];
  if (childIds.length === 0) {
    return jsonError("Pilih minimal satu tiket yang akan digabungkan.", 400);
  }

  const admin = createAdminClient();
  const { data: parentTicket } = await admin
    .from("tickets")
    .select("nomor_tiket")
    .eq("id", parentId)
    .maybeSingle();

  const { data: mergedCount, error: mergeError } = await admin.rpc(
    "merge_tickets",
    {
      p_parent_id: parentId,
      p_child_ids: childIds,
      p_actor_id: user.id,
    },
  );
  if (mergeError) {
    return jsonError(mergeError.message, 400);
  }

  if (parentTicket?.nomor_tiket) {
    await notifTiketDigabung(childIds, parentTicket.nomor_tiket);
  }

  revalidatePath("/tiket");
  revalidatePath("/antrian");
  revalidatePath(`/tiket/${parentId}`);

  return NextResponse.json(
    { ok: true, mergedCount },
    { headers: { "Cache-Control": "no-store" } },
  );
}
