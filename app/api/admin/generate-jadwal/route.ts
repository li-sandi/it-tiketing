import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/admin-auth";
import { addDaysToDate, getNextScheduleStartDate } from "@/lib/jadwal-sleman";
import { createAdminClient } from "@/lib/supabase/admin";

type MulaiDengan = "Miko" | "Fuad";

function jsonError(error: string, status: number) {
  return NextResponse.json(
    { error },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request) {
  const adminUser = await getAdminUser();
  if (!adminUser) return jsonError("Akses admin diperlukan.", 403);

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

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return jsonError("Data jadwal tidak valid.", 400);
  }
  if (
    typeof payload !== "object" ||
    payload === null ||
    !("mulaiDengan" in payload) ||
    (payload.mulaiDengan !== "Miko" && payload.mulaiDengan !== "Fuad")
  ) {
    return jsonError("Pilih petugas awal antara Miko atau Fuad.", 400);
  }
  const mulaiDengan: MulaiDengan = payload.mulaiDengan;

  const admin = createAdminClient();
  const [{ data: mikoUsers, error: mikoError }, { data: fuadUsers, error: fuadError }] =
    await Promise.all([
      admin
        .from("users")
        .select("id")
        .eq("nama", "Miko")
        .eq("peran", "it")
        .limit(2),
      admin
        .from("users")
        .select("id")
        .eq("nama", "Fuad")
        .eq("peran", "it")
        .limit(2),
    ]);

  if (mikoError || fuadError) {
    console.error(
      "Gagal mencari petugas jadwal Sleman:",
      mikoError?.message ?? fuadError?.message,
    );
    return jsonError("Gagal memeriksa data petugas IT.", 500);
  }
  if (mikoUsers?.length !== 1 || fuadUsers?.length !== 1) {
    return jsonError(
      'User IT bernama "Miko" atau "Fuad" tidak ditemukan atau namanya duplikat.',
      400,
    );
  }
  const miko = mikoUsers[0];
  const fuad = fuadUsers[0];

  const { data: sleman, error: siteError } = await admin
    .from("sites")
    .select("id")
    .eq("nama", "Sleman")
    .maybeSingle();
  if (siteError) {
    console.error("Gagal mencari site Sleman:", siteError.message);
    return jsonError("Gagal memeriksa site Sleman.", 500);
  }
  if (!sleman) return jsonError("Site Sleman tidak ditemukan.", 400);

  const startDate = getNextScheduleStartDate();
  const endDate = addDaysToDate(startDate, 56);
  const assignments: {
    it_id: string;
    site_id: string;
    tanggal: string;
    jenis: "kunjungan_sleman";
  }[] = [];
  let isMikoTurn = mulaiDengan === "Miko";

  for (let week = 0; week < 8; week++) {
    const itId = isMikoTurn ? miko.id : fuad.id;
    for (const dayOffset of [0, 2]) {
      assignments.push({
        it_id: itId,
        site_id: sleman.id,
        tanggal: addDaysToDate(startDate, week * 7 + dayOffset),
        jenis: "kunjungan_sleman",
      });
    }
    isMikoTurn = !isMikoTurn;
  }

  const { data: jumlah, error: scheduleError } = await admin.rpc(
    "replace_sleman_schedule",
    {
      p_start_date: startDate,
      p_end_date: endDate,
      p_assignments: assignments,
    },
  );
  if (scheduleError) {
    console.error("Gagal membuat jadwal kunjungan Sleman:", scheduleError.message);
    return jsonError("Gagal menyimpan jadwal kunjungan. Silakan coba lagi.", 500);
  }
  if (jumlah !== 16) {
    console.error("Jumlah jadwal yang tersimpan tidak sesuai:", jumlah);
    return jsonError("Jumlah jadwal yang tersimpan tidak sesuai.", 500);
  }

  return NextResponse.json(
    { ok: true, jumlah, mulai: startDate, sampai: addDaysToDate(endDate, -1) },
    { headers: { "Cache-Control": "no-store" } },
  );
}
