import { NextResponse } from "next/server";
import { checkEndpointRateLimit } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const PRIVATE_HEADERS = { "Cache-Control": "no-store, private" };

function getClientIp(request: Request) {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]?.trim() || "unknown";
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { error: "Autentikasi diperlukan." },
      { status: 401, headers: PRIVATE_HEADERS },
    );
  }

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
    return NextResponse.json(
      { error: "Akses IT, Admin, atau GA diperlukan." },
      { status: 403, headers: PRIVATE_HEADERS },
    );
  }

  const limitResult = await checkEndpointRateLimit({
    ip: getClientIp(request),
    bucket: "aset-lookup",
    limit: 60,
    windowMinutes: 15,
  });
  if (!limitResult.success) {
    return NextResponse.json(
      { error: "Terlalu banyak pencarian aset. Coba lagi nanti." },
      { status: 429, headers: PRIVATE_HEADERS },
    );
  }

  const nomorAset = new URL(request.url).searchParams.get("nomorAset")?.trim() ?? "";
  if (nomorAset.length < 2 || nomorAset.length > 120) {
    return NextResponse.json({ found: false }, { headers: PRIVATE_HEADERS });
  }

  const admin = createAdminClient();
  const { data } = await admin
    .from("assets")
    .select("id, nomor_aset, nama_perangkat, tipe, ram_gb, status")
    .ilike("nomor_aset", nomorAset)
    .maybeSingle();

  if (!data) return NextResponse.json({ found: false }, { headers: PRIVATE_HEADERS });
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
    { headers: PRIVATE_HEADERS },
  );
}
