import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request: Request) {
  const nomorAset = new URL(request.url).searchParams.get("nomorAset")?.trim() ?? "";
  if (nomorAset.length < 2 || nomorAset.length > 120) {
    return NextResponse.json({ found: false });
  }

  const admin = createAdminClient();
  const { data } = await admin
    .from("assets")
    .select("id, nomor_aset, nama_perangkat, tipe, ram_gb, status")
    .ilike("nomor_aset", nomorAset)
    .maybeSingle();

  if (!data) return NextResponse.json({ found: false });
  return NextResponse.json(
    {
      found: true,
      asset: {
        id: data.id,
        nomorAset: data.nomor_aset,
        namaPerangkat: data.nama_perangkat,
        tipe: data.tipe,
        ramGb: data.ram_gb,
        status: data.status,
      },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
