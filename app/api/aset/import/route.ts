import { NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { parseAssetsCsv } from "@/lib/aset-csv";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

function jsonError(error: string, status: number) {
  return NextResponse.json(
    { error },
    { status, headers: { "Cache-Control": "no-store" } },
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

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return jsonError("Autentikasi diperlukan.", 401);

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
    return jsonError("Akses IT, Admin, atau GA diperlukan.", 403);
  }

  let body: { csv?: string; site_id?: string | null };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return jsonError("Payload JSON tidak valid.", 400);
  }

  const csvText = typeof body.csv === "string" ? body.csv : "";
  const siteId = typeof body.site_id === "string" && body.site_id ? body.site_id : null;

  const { rows, errors } = parseAssetsCsv(csvText);
  if (rows.length === 0) {
    return NextResponse.json(
      {
        error: errors[0] ?? "Tidak ada baris aset yang valid untuk diimpor.",
        errors,
      },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  const admin = createAdminClient();
  const payload = rows.map((row) => ({
    ...row,
    site_id: siteId,
    diperbarui_pada: new Date().toISOString(),
  }));

  const { data, error: upsertError } = await admin
    .from("assets")
    .upsert(payload, { onConflict: "nomor_aset" })
    .select("id");

  if (upsertError) {
    return jsonError(
      `Gagal mengimpor data aset: ${upsertError.message}`,
      500,
    );
  }

  revalidateTag("assets", { expire: 0 });
  revalidatePath("/aset");

  return NextResponse.json(
    {
      ok: true,
      importedCount: data?.length ?? rows.length,
      errors,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
