import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  setVapidDetailsMock,
  sendNotificationMock,
  createAdminClientMock,
} = vi.hoisted(() => ({
  setVapidDetailsMock: vi.fn(),
  sendNotificationMock: vi.fn(),
  createAdminClientMock: vi.fn(),
}));

vi.mock("server-only", () => ({}));

vi.mock("web-push", () => ({
  setVapidDetails: setVapidDetailsMock,
  sendNotification: sendNotificationMock,
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: createAdminClientMock,
}));

import {
  getVapidPublicKey,
  isWebPushConfigured,
  sendWebPushToUser,
} from "@/lib/web-push";

describe("lib/web-push", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    delete process.env.VAPID_PUBLIC_KEY;
    delete process.env.VAPID_PRIVATE_KEY;
    delete process.env.VAPID_SUBJECT;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("skips gracefully without throwing when VAPID keys are not configured", async () => {
    expect(isWebPushConfigured()).toBe(false);
    expect(getVapidPublicKey()).toBeNull();

    const result = await sendWebPushToUser({
      userId: "user-1",
      notificationType: "waiting_user",
      title: "Update Tiket",
      body: "IT membutuhkan info tambahan",
    });

    expect(result).toEqual({
      sent: 0,
      skipped: 1,
      removed: 0,
      failures: [],
    });
    expect(createAdminClientMock).not.toHaveBeenCalled();
    expect(sendNotificationMock).not.toHaveBeenCalled();
  });

  it("skips placeholder browser-local subscriptions and sends valid ones with notification_logs entry", async () => {
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = "BPublicKeyTest123";
    process.env.VAPID_PRIVATE_KEY = "PrivateKeyTest123";
    process.env.VAPID_SUBJECT = "mailto:ops@example.com";

    const eqMock = vi.fn().mockResolvedValue({
      data: [
        {
          id: "sub-placeholder",
          endpoint: "https://browser.local/123",
          p256dh: "browser-local",
          auth: "browser-local",
        },
        {
          id: "sub-valid",
          endpoint: "https://fcm.googleapis.com/fcm/send/abc123",
          p256dh: "p256dh-key",
          auth: "auth-key",
        },
      ],
      error: null,
    });
    const selectMock = vi.fn().mockReturnValue({ eq: eqMock });
    const insertLogMock = vi.fn().mockResolvedValue({ error: null });

    createAdminClientMock.mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === "push_subscriptions") return { select: selectMock };
        if (table === "notification_logs") return { insert: insertLogMock };
        throw new Error(`Unexpected table: ${table}`);
      }),
    });

    sendNotificationMock.mockResolvedValue({ statusCode: 201 });

    const result = await sendWebPushToUser({
      userId: "user-1",
      ticketId: "ticket-9",
      notificationType: "user_replied",
      title: "Balasan Pelapor",
      body: "Pelapor membalas tiket #IT-009",
      url: "/tiket/ticket-9",
    });

    expect(setVapidDetailsMock).toHaveBeenCalledWith(
      "mailto:ops@example.com",
      "BPublicKeyTest123",
      "PrivateKeyTest123",
    );
    expect(sendNotificationMock).toHaveBeenCalledTimes(1);
    expect(sendNotificationMock).toHaveBeenCalledWith(
      {
        endpoint: "https://fcm.googleapis.com/fcm/send/abc123",
        keys: { p256dh: "p256dh-key", auth: "auth-key" },
      },
      JSON.stringify({
        title: "Balasan Pelapor",
        body: "Pelapor membalas tiket #IT-009",
        url: "/tiket/ticket-9",
        tag: "user_replied",
      }),
      {
        vapidDetails: {
          subject: "mailto:ops@example.com",
          publicKey: "BPublicKeyTest123",
          privateKey: "PrivateKeyTest123",
        },
      },
    );
    expect(insertLogMock).toHaveBeenCalledWith(
      expect.objectContaining({
        ticket_id: "ticket-9",
        channel: "web_push",
        notification_type: "user_replied",
        status: "sent",
      }),
    );
    expect(result).toEqual({
      sent: 1,
      skipped: 1,
      removed: 0,
      failures: [],
    });
  });

  it("cleans up expired 410 subscriptions without throwing and logs failure", async () => {
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = "BPublicKeyTest123";
    process.env.VAPID_PRIVATE_KEY = "PrivateKeyTest123";

    const eqSelectMock = vi.fn().mockResolvedValue({
      data: [
        {
          id: "sub-expired",
          endpoint: "https://updates.push.services.mozilla.com/wpush/v2/expired",
          p256dh: "key-1",
          auth: "auth-1",
        },
      ],
      error: null,
    });
    const deleteEqMock = vi.fn().mockResolvedValue({ error: null });
    const insertLogMock = vi.fn().mockResolvedValue({ error: null });

    createAdminClientMock.mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === "push_subscriptions") {
          return {
            select: vi.fn().mockReturnValue({ eq: eqSelectMock }),
            delete: vi.fn().mockReturnValue({ eq: deleteEqMock }),
          };
        }
        if (table === "notification_logs") return { insert: insertLogMock };
        throw new Error(`Unexpected table: ${table}`);
      }),
    });

    const goneErr = Object.assign(new Error("Gone"), { statusCode: 410 });
    sendNotificationMock.mockRejectedValue(goneErr);

    const result = await sendWebPushToUser({
      userId: "user-1",
      notificationType: "procurement_ready",
      title: "Stok Tersedia",
      body: "Sparepart sudah restock",
    });

    expect(deleteEqMock).toHaveBeenCalledWith("id", "sub-expired");
    expect(insertLogMock).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: "web_push",
        notification_type: "procurement_ready",
        status: "failed",
        error_message: "Gone",
      }),
    );
    expect(result).toEqual({
      sent: 0,
      skipped: 0,
      removed: 1,
      failures: ["Gone"],
    });
  });

  it("catches malformed VAPID credentials when setVapidDetails throws synchronously", async () => {
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = "invalid-key";
    process.env.VAPID_PRIVATE_KEY = "invalid-private";
    process.env.VAPID_SUBJECT = "not-a-valid-subject";

    const eqSelectMock = vi.fn().mockResolvedValue({
      data: [
        {
          id: "sub-valid",
          endpoint: "https://fcm.googleapis.com/fcm/send/abc123",
          p256dh: "p256dh-key",
          auth: "auth-key",
        },
      ],
      error: null,
    });

    createAdminClientMock.mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === "push_subscriptions") {
          return {
            select: vi.fn().mockReturnValue({ eq: eqSelectMock }),
          };
        }
        throw new Error(`Unexpected table: ${table}`);
      }),
    });

    setVapidDetailsMock.mockImplementationOnce(() => {
      throw new Error("Vapid subject is not a valid URL");
    });

    const result = await sendWebPushToUser({
      userId: "user-1",
      notificationType: "waiting_user",
      title: "Update Tiket",
      body: "Periksa kredensial VAPID",
    });

    expect(setVapidDetailsMock).toHaveBeenCalledWith(
      "not-a-valid-subject",
      "invalid-key",
      "invalid-private",
    );
    expect(sendNotificationMock).not.toHaveBeenCalled();
    expect(result).toEqual({
      sent: 0,
      skipped: 0,
      removed: 0,
      failures: ["Vapid subject is not a valid URL"],
    });
  });
});
