import { NextRequest, NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { createClient } from "@/lib/supabase/server";

const ALLOWED_ROLES = new Set(["ga", "it", "admin"]);
const NO_STORE_HEADERS = { "Cache-Control": "no-store" };

function jsonError(error: string, status: number) {
  return NextResponse.json({ error }, { status, headers: NO_STORE_HEADERS });
}

export async function POST(request: NextRequest) {
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

  if (!user) {
    return jsonError("Autentikasi diperlukan.", 401);
  }

  const { data: profile } = await supabase
    .from("users")
    .select("id, peran")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile || !ALLOWED_ROLES.has(profile.peran)) {
    return jsonError(
      "Hanya GA, IT, atau Admin yang dapat memperbarui stok.",
      403,
    );
  }

  let body: {
    kode?: string;
    delta?: number;
    jenis?: "masuk" | "keluar" | "penyesuaian";
    ticketId?: string | null;
    catatan?: string | null;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return jsonError("Body request tidak valid.", 400);
  }

  const kode = String(body.kode ?? "").trim();
  const delta = Math.trunc(Number(body.delta ?? 0));
  const jenis = body.jenis ?? (delta > 0 ? "masuk" : "keluar");
  const ticketId = body.ticketId?.trim() || null;
  const catatan = body.catatan?.trim() || null;

  if (!kode || !Number.isFinite(delta) || delta === 0) {
    return jsonError(
      "Kode sparepart dan jumlah perubahan stok tidak valid.",
      400,
    );
  }

  if (jenis !== "masuk" && jenis !== "keluar" && jenis !== "penyesuaian") {
    return jsonError("Jenis mutasi tidak valid.", 400);
  }

  const { data: rpcResult, error: rpcError } = await supabase.rpc(
    "adjust_inventory_stock",
    {
      p_kode: kode,
      p_delta: delta,
      p_jenis: jenis,
      p_ticket_id: ticketId,
      p_catatan: catatan,
      p_actor_id: user.id,
    },
  );

  if (rpcError) {
    return jsonError(rpcError.message, 400);
  }

  const result = rpcResult as {
    movement_id: string;
    kode: string;
    nama: string;
    satuan: string;
    stok_sebelum: number;
    stok_sesudah: number;
    stok_minimum: number;
  };

  let waitingProcurementCount = 0;
  if (result.stok_sebelum <= 0 && result.stok_sesudah > 0) {
    const { count } = await supabase
      .from("tickets")
      .select("id", { count: "exact", head: true })
      .eq("status", "menunggu_pengadaan")
      .eq("stock_kode", kode);

    waitingProcurementCount = count ?? 0;
  }

  revalidateTag("stocks", { expire: 0 });
  revalidatePath("/stok");
  revalidatePath("/antrian");
  revalidatePath("/dashboard");
  revalidatePath("/tiket/baru");
  revalidatePath("/lapor");
  if (ticketId) {
    revalidatePath(`/tiket/${ticketId}`);
  }

  return NextResponse.json(
    {
      ok: true,
      result,
      waitingProcurementCount,
    },
    { headers: NO_STORE_HEADERS },
  );
}
