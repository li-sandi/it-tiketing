import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  createAdminClientMock,
  kirimPesanMock,
  sendWebPushToUserMock,
} = vi.hoisted(() => ({
  createAdminClientMock: vi.fn(),
  kirimPesanMock: vi.fn(),
  sendWebPushToUserMock: vi.fn(),
}));

vi.mock("server-only", () => ({}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: createAdminClientMock,
}));

vi.mock("@/lib/telegram", () => ({
  kirimPesan: kirimPesanMock,
  escapeHtml: (val: string) =>
    val.replace(/[&<>"']/g, (ch) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch] ?? ch),
    ),
}));

vi.mock("@/lib/web-push", () => ({
  sendWebPushToUser: sendWebPushToUserMock,
}));

import {
  dispatchUserNotification,
  dispatchUsersNotification,
} from "@/lib/in-app-notifications";

describe("lib/in-app-notifications", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.TELEGRAM_BOT_TOKEN;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("dispatches to in_app_notifications, Telegram, and Web Push", async () => {
    process.env.TELEGRAM_BOT_TOKEN = "bot-token-test";

    const inAppInsertMock = vi.fn().mockResolvedValue({ error: null });
    const logInsertMock = vi.fn().mockResolvedValue({ error: null });

    createAdminClientMock.mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === "in_app_notifications") return { insert: inAppInsertMock };
        if (table === "notification_logs") return { insert: logInsertMock };
        throw new Error(`Unexpected table: ${table}`);
      }),
    });

    kirimPesanMock.mockResolvedValue({ message_id: 42 });
    sendWebPushToUserMock.mockResolvedValue({
      sent: 1,
      skipped: 0,
      removed: 0,
      failures: [],
    });

    const result = await dispatchUserNotification({
      userId: "u-1",
      ticketId: "t-1",
      jenis: "waiting_user",
      judul: "Menunggu Konfirmasi Anda",
      pesan: "Mohon lampirkan screenshot error VPN.",
      tautan: "/tiket/t-1",
      telegramId: "123456789",
    });

    expect(inAppInsertMock).toHaveBeenCalledWith({
      user_id: "u-1",
      ticket_id: "t-1",
      jenis: "waiting_user",
      judul: "Menunggu Konfirmasi Anda",
      pesan: "Mohon lampirkan screenshot error VPN.",
      tautan: "/tiket/t-1",
    });
    expect(kirimPesanMock).toHaveBeenCalledWith(
      123456789,
      "<b>Menunggu Konfirmasi Anda</b>\nMohon lampirkan screenshot error VPN.",
    );
    expect(logInsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        ticket_id: "t-1",
        channel: "telegram",
        notification_type: "waiting_user",
        recipient: "123456789",
        status: "sent",
      }),
    );
    expect(sendWebPushToUserMock).toHaveBeenCalledWith({
      userId: "u-1",
      ticketId: "t-1",
      notificationType: "waiting_user",
      title: "Menunggu Konfirmasi Anda",
      body: "Mohon lampirkan screenshot error VPN.",
      url: "/tiket/t-1",
      tag: "waiting_user",
    });
    expect(result).toEqual({
      inApp: true,
      telegram: "sent",
      webPush: { sent: 1, skipped: 0, removed: 0, failures: [] },
    });
  });

  it("isolates failures across channels and rejects invalid telegramId", async () => {
    process.env.TELEGRAM_BOT_TOKEN = "bot-token-test";

    const inAppInsertMock = vi
      .fn()
      .mockResolvedValue({ error: { message: "db error" } });
    const logInsertMock = vi.fn().mockResolvedValue({ error: null });

    createAdminClientMock.mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === "in_app_notifications") return { insert: inAppInsertMock };
        if (table === "notification_logs") return { insert: logInsertMock };
        throw new Error(`Unexpected table: ${table}`);
      }),
    });

    sendWebPushToUserMock.mockResolvedValue({
      sent: 0,
      skipped: 1,
      removed: 0,
      failures: [],
    });

    const invalidTgRes = await dispatchUserNotification({
      userId: "u-2",
      jenis: "user_replied",
      judul: "Balasan Baru",
      pesan: "User membalas tiket",
      telegramId: "not-a-chat-id",
    });

    expect(invalidTgRes.inApp).toBe(false);
    expect(invalidTgRes.telegram).toBe("skipped");
    expect(kirimPesanMock).not.toHaveBeenCalled();
    expect(sendWebPushToUserMock).toHaveBeenCalledTimes(1);

    kirimPesanMock.mockRejectedValueOnce(new Error("Telegram timeout"));
    const tgFailRes = await dispatchUsersNotification([
      {
        userId: "u-3",
        ticketId: "t-3",
        jenis: "procurement_ready",
        judul: "Stok Siap",
        pesan: "Silakan proses tiket",
        telegramId: 987654321,
        telegramHtml: "<b>Stok Siap</b>",
      },
    ]);

    expect(tgFailRes[0].telegram).toBe("failed");
    expect(logInsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: "telegram",
        status: "failed",
        error_message: "Telegram timeout",
      }),
    );
  });
});
