import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

const ALLOWED_ROLES = new Set(["ga", "it", "admin"]);

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Autentikasi diperlukan." }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("users")
    .select("id, peran")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile || !ALLOWED_ROLES.has(profile.peran)) {
    return NextResponse.json(
      { error: "Hanya GA, IT, atau Admin yang dapat memperbarui stok." },
      { status: 403 },
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
    return NextResponse.json({ error: "Body request tidak valid." }, { status: 400 });
  }

  const kode = String(body.kode ?? "").trim();
  const delta = Math.trunc(Number(body.delta ?? 0));
  const jenis = body.jenis ?? (delta > 0 ? "masuk" : "keluar");
  const ticketId = body.ticketId?.trim() || null;
  const catatan = body.catatan?.trim() || null;

  if (!kode || !Number.isFinite(delta) || delta === 0) {
    return NextResponse.json(
      { error: "Kode sparepart dan jumlah perubahan stok tidak valid." },
      { status: 400 },
    );
  }

  if (jenis !== "masuk" && jenis !== "keluar" && jenis !== "penyesuaian") {
    return NextResponse.json({ error: "Jenis mutasi tidak valid." }, { status: 400 });
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
    return NextResponse.json({ error: rpcError.message }, { status: 400 });
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

  revalidatePath("/stok");
  revalidatePath("/antrian");
  revalidatePath("/dashboard");
  revalidatePath("/tiket/baru");
  revalidatePath("/lapor");
  if (ticketId) {
    revalidatePath(`/tiket/${ticketId}`);
  }

  return NextResponse.json({
    ok: true,
    result,
    waitingProcurementCount,
  });
}
