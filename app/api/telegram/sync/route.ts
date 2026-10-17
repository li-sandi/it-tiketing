import { createHash, randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { ambilUpdate, escapeHtml, kirimPesan } from "@/lib/telegram";

const startPattern = /^\/start(?:@[A-Za-z0-9_]+)?(?:\s+([A-Za-z0-9_-]{43}))?$/;

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Belum login." }, { status: 401 });
  }

  let admin: ReturnType<typeof createAdminClient>;
  const lockId = randomUUID();

  try {
    admin = createAdminClient();
    const { data: claimed, error: lockError } = await admin.rpc(
      "claim_telegram_poll",
      { p_lock_id: lockId },
    );
    if (lockError) {
      throw new Error(`Gagal mengunci polling bot: ${lockError.message}`);
    }
    if (!claimed) {
      return NextResponse.json(
        { error: "Polling Telegram sedang berjalan. Coba lagi sebentar." },
        { status: 409 },
      );
    }

    try {
      const { data: state, error: stateError } = await admin
        .from("bot_state")
        .select("value")
        .eq("key", "telegram_last_update_id")
        .maybeSingle();

      if (stateError) {
        throw new Error(`Gagal membaca offset bot: ${stateError.message}`);
      }

      const offset =
        state?.value !== undefined ? Number(state.value) : undefined;
      if (offset !== undefined && !Number.isSafeInteger(offset)) {
        throw new Error("Offset bot di database tidak valid.");
      }

      const updates = await ambilUpdate(offset);
      let terhubung = 0;
      let lastId = offset === undefined ? -1 : offset - 1;

      for (const update of updates) {
        const { data: lockRenewed, error: renewError } = await admin.rpc(
          "claim_telegram_poll",
          { p_lock_id: lockId },
        );
        if (renewError || !lockRenewed) {
          throw new Error(
            renewError
              ? `Gagal memperbarui lock polling: ${renewError.message}`
              : "Lock polling Telegram kedaluwarsa.",
          );
        }

        const message = update.message;
        if (message?.text && message.chat.type === "private") {
          const match = message.text.trim().match(startPattern);
          if (match) {
            const startToken = match[1];
            if (!startToken) {
              await kirimPesan(
                message.chat.id,
                'Buka dashboard aplikasi, pilih "Hubungkan Telegram", lalu gunakan tautan yang dibuat.',
              );
            } else {
              const tokenHash = createHash("sha256")
                .update(startToken)
                .digest("hex");
              const { data: result, error: redeemError } = await admin.rpc(
                "redeem_telegram_link",
                {
                  p_token_hash: tokenHash,
                  p_chat_id: String(message.chat.id),
                },
              );

              if (redeemError) {
                throw new Error(
                  `Gagal memproses tautan Telegram: ${redeemError.message}`,
                );
              }

              const redemption = Array.isArray(result) ? result[0] : result;
              if (!redemption || typeof redemption.result !== "string") {
                throw new Error("Respons redemption Telegram tidak valid.");
              }

              if (redemption.result === "linked") {
                const name =
                  typeof redemption.user_name === "string"
                    ? escapeHtml(redemption.user_name)
                    : "pengguna";
                await kirimPesan(
                  message.chat.id,
                  `Berhasil terhubung sebagai <b>${name}</b>.`,
                );
                terhubung++;
              } else if (redemption.result === "already_linked") {
                const name =
                  typeof redemption.user_name === "string"
                    ? escapeHtml(redemption.user_name)
                    : "pengguna";
                await kirimPesan(
                  message.chat.id,
                  `Kamu sudah terhubung sebagai <b>${name}</b>.`,
                );
              } else if (redemption.result === "chat_in_use") {
                await kirimPesan(
                  message.chat.id,
                  "Akun Telegram ini sudah terhubung ke akun lain. Hubungi admin.",
                );
              } else {
                await kirimPesan(
                  message.chat.id,
                  "Tautan tidak valid atau sudah kedaluwarsa. Buat tautan baru dari dashboard.",
                );
              }
            }
          }
        }

        const { error: offsetError } = await admin.from("bot_state").upsert({
          key: "telegram_last_update_id",
          value: String(update.update_id + 1),
          updated_at: new Date().toISOString(),
        });
        if (offsetError) {
          throw new Error(`Gagal menyimpan offset bot: ${offsetError.message}`);
        }
        lastId = update.update_id;
      }

      return NextResponse.json({
        ok: true,
        terhubung,
        totalUpdate: updates.length,
        lastUpdateId: lastId,
      });
    } finally {
      const { error: releaseError } = await admin.rpc("release_telegram_poll", {
        p_lock_id: lockId,
      });
      if (releaseError) {
        console.error("Gagal melepas lock polling Telegram:", releaseError.message);
      }
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Terjadi kesalahan Telegram.";
    console.error("Telegram sync gagal:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
