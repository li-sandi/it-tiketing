import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Belum login." }, { status: 401 });
  }

  const username = process.env.TELEGRAM_BOT_USERNAME?.replace(/^@/, "");
  if (!username || !/^[A-Za-z0-9_]{5,32}$/.test(username)) {
    return NextResponse.json(
      { error: "TELEGRAM_BOT_USERNAME belum diset dengan benar." },
      { status: 500 },
    );
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
      return NextResponse.json(
        { error: "Gagal membuat tautan Telegram. Coba lagi." },
        { status: 500 },
      );
    }
  } catch (error) {
    console.error(
      "Konfigurasi Telegram link error:",
      error instanceof Error ? error.message : "Unknown error",
    );
    return NextResponse.json(
      { error: "Konfigurasi server Telegram belum lengkap." },
      { status: 500 },
    );
  }

  return NextResponse.json({
    url: `https://t.me/${username}?start=${token}`,
  });
}
