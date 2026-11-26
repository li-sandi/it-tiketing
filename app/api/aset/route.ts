import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

function jsonError(error: string, status: number) {
  return NextResponse.json(
    { error },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

async function getAssetOperator() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase
    .from("users")
    .select("peran")
    .eq("id", user.id)
    .maybeSingle();
  if (
    profile?.peran !== "it" &&
    profile?.peran !== "admin" &&
    profile?.peran !== "ga"
  ) {
    return null;
  }
  return { user, role: profile.peran };
}

export async function GET() {
  const operator = await getAssetOperator();
  if (!operator) return jsonError("Akses IT, Admin, atau GA diperlukan.", 403);

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("assets")
    .select("*, sites(nama)")
    .order("nomor_aset");
  if (error) return jsonError("Gagal memuat daftar aset.", 500);

  return NextResponse.json(
    { assets: data ?? [] },
    { headers: { "Cache-Control": "no-store" } },
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

  const operator = await getAssetOperator();
  if (!operator) return jsonError("Akses IT, Admin, atau GA diperlukan.", 403);

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return jsonError("Data aset tidak valid.", 400);
  }
  if (typeof payload !== "object" || payload === null) {
    return jsonError("Data aset tidak valid.", 400);
  }

  const r = payload as Record<string, unknown>;
  const nomorAset = typeof r.nomor_aset === "string" ? r.nomor_aset.trim() : "";
  const namaPerangkat =
    typeof r.nama_perangkat === "string" ? r.nama_perangkat.trim() : "";
  const tipe = typeof r.tipe === "string" ? r.tipe : "laptop";
  const ramGb =
    r.ram_gb === null || r.ram_gb === undefined || r.ram_gb === ""
      ? null
      : Number(r.ram_gb);
  const siteId = typeof r.site_id === "string" && r.site_id ? r.site_id : null;
  const pemegangNama =
    typeof r.pemegang_nama === "string" ? r.pemegang_nama.trim() : null;
  const anydeskId =
    typeof r.anydesk_id === "string" ? r.anydesk_id.trim() : null;
  const uvId = typeof r.uv_id === "string" ? r.uv_id.trim() : null;
  const status = typeof r.status === "string" ? r.status : "aktif";

  if (nomorAset.length < 2 || nomorAset.length > 120) {
    return jsonError("Nomor aset harus 2–120 karakter.", 400);
  }
  if (namaPerangkat.length < 2 || namaPerangkat.length > 200) {
    return jsonError("Nama perangkat harus 2–200 karakter.", 400);
  }
  if (
    ramGb !== null &&
    (!Number.isSafeInteger(ramGb) || ramGb < 1 || ramGb > 1024)
  ) {
    return jsonError("Kapasitas RAM (GB) tidak valid.", 400);
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("assets")
    .insert({
      nomor_aset: nomorAset,
      nama_perangkat: namaPerangkat,
      tipe,
      ram_gb: ramGb,
      site_id: siteId,
      pemegang_nama: pemegangNama || null,
      anydesk_id: anydeskId || null,
      uv_id: uvId || null,
      status,
    })
    .select("*")
    .single();

  if (error) {
    return jsonError(`Gagal menyimpan aset: ${error.message}`, 400);
  }
  return NextResponse.json(
    { ok: true, asset: data },
    { status: 201, headers: { "Cache-Control": "no-store" } },
  );
}
