import { NextResponse } from "next/server";
import { cekCronSecret } from "@/lib/cron-auth";
import { kirimPengingatKunjungan } from "@/lib/sleman";

export async function GET(request: Request) {
  if (!cekCronSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await kirimPengingatKunjungan();
    return NextResponse.json({ ok: true, ...result });
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
