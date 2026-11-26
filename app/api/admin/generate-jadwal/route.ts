import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/admin-auth";
import { addDaysToDate, getNextScheduleStartDate } from "@/lib/jadwal-sleman";
import { createAdminClient } from "@/lib/supabase/admin";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
  if (typeof payload !== "object" || payload === null) {
    return jsonError("Data jadwal tidak valid.", 400);
  }

  const record = payload as Record<string, unknown>;
  const staffIdsRaw = Array.isArray(record.staffIds) ? record.staffIds : [];
  const staffIds = staffIdsRaw.filter(
    (id): id is string => typeof id === "string" && UUID_PATTERN.test(id),
  );
  const siteIdInput =
    typeof record.siteId === "string" && UUID_PATTERN.test(record.siteId)
      ? record.siteId
      : null;

  if (staffIds.length < 2) {
    return jsonError("Pilih minimal 2 petugas IT untuk rotasi jadwal.", 400);
  }

  const admin = createAdminClient();
  const { data: validStaff, error: staffError } = await admin
    .from("users")
    .select("id")
    .eq("peran", "it")
    .in("id", staffIds);

  if (staffError) {
    return jsonError("Gagal memeriksa data petugas IT.", 500);
  }
  const validSet = new Set((validStaff ?? []).map((u) => u.id));
  const orderedStaffIds = staffIds.filter((id) => validSet.has(id));
  if (orderedStaffIds.length < 2) {
    return jsonError("Petugas IT yang dipilih tidak valid.", 400);
  }

  const siteQuery = siteIdInput
    ? admin.from("sites").select("id").eq("id", siteIdInput).maybeSingle()
    : admin.from("sites").select("id").eq("nama", "Sleman").maybeSingle();
  const { data: targetSite, error: siteError } = await siteQuery;
  if (siteError) {
    return jsonError("Gagal memeriksa site tujuan.", 500);
  }
  if (!targetSite) return jsonError("Site tujuan tidak ditemukan.", 400);

  const startDate = getNextScheduleStartDate();
  const endDate = addDaysToDate(startDate, 56);
  const assignments: {
    it_id: string;
    site_id: string;
    tanggal: string;
    jenis: "kunjungan_sleman";
  }[] = [];

  for (let week = 0; week < 8; week++) {
    const itId = orderedStaffIds[week % orderedStaffIds.length];
    for (const dayOffset of [0, 2]) {
      assignments.push({
        it_id: itId,
        site_id: targetSite.id,
        tanggal: addDaysToDate(startDate, week * 7 + dayOffset),
        jenis: "kunjungan_sleman",
      });
    }
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
    console.error("Gagal membuat jadwal kunjungan:", scheduleError.message);
    return jsonError("Gagal menyimpan jadwal kunjungan.", 500);
  }
  if (jumlah !== 16) {
    return jsonError("Jumlah jadwal yang tersimpan tidak sesuai.", 500);
  }

  return NextResponse.json(
    { ok: true, jumlah, mulai: startDate, sampai: addDaysToDate(endDate, -1) },
    { headers: { "Cache-Control": "no-store" } },
  );
}
