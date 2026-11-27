import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const NO_STORE_HEADERS = { "Cache-Control": "no-store" };

function jsonError(error: string, status: number) {
  return NextResponse.json({ error }, { status, headers: NO_STORE_HEADERS });
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
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return jsonError("Belum login.", 401);
  }

  const username = process.env.TELEGRAM_BOT_USERNAME?.replace(/^@/, "");
  if (!username || !/^[A-Za-z0-9_]{5,32}$/.test(username)) {
    return jsonError("TELEGRAM_BOT_USERNAME belum diset dengan benar.", 500);
  }

  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");

  try {
    const admin = createAdminClient();
    const { error } = await admin.from("telegram_link_tokens").insert({
      token_hash: tokenHash,
      user_id: user.id,
      expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    });

    if (error) {
      console.error("Gagal menyimpan token taut Telegram:", error.message);
      return jsonError("Gagal membuat tautan Telegram. Coba lagi.", 500);
    }
  } catch (error) {
    console.error(
      "Konfigurasi Telegram link error:",
      error instanceof Error ? error.message : "Unknown error",
    );
    return jsonError("Konfigurasi server Telegram belum lengkap.", 500);
  }

  return NextResponse.json(
    {
      url: `https://t.me/${username}?start=${token}`,
    },
    { headers: NO_STORE_HEADERS },
  );
}
