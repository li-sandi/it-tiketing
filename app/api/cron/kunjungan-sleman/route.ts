import { NextResponse } from "next/server";
import { cekCronSecret } from "@/lib/cron-auth";
import {
  cekJadwalSlemanHampirHabis,
  kirimPengingatKunjungan,
} from "@/lib/sleman";

export async function GET(request: Request) {
  if (!cekCronSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const [reminder, expiry] = await Promise.all([
      kirimPengingatKunjungan(),
      cekJadwalSlemanHampirHabis(),
    ]);
    return NextResponse.json({ ok: true, ...reminder, expiry });
  } catch (error) {
    console.error(
      "Cron kunjungan Sleman gagal:",
      error instanceof Error ? error.message : error,
    );
    return NextResponse.json(
      { error: "Cron kunjungan Sleman gagal." },
      { status: 500 },
    );
  }
}
