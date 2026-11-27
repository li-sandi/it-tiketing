import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  revalidatePathMock,
  requireAuthUserMock,
  notifTiketSelesaiMock,
  purgeRemoteScreenshotsMock,
} = vi.hoisted(() => ({
  revalidatePathMock: vi.fn(),
  requireAuthUserMock: vi.fn(),
  notifTiketSelesaiMock: vi.fn(),
  purgeRemoteScreenshotsMock: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: revalidatePathMock,
}));

vi.mock("@/lib/auth", () => ({
  requireAuthUser: requireAuthUserMock,
}));

vi.mock("@/lib/notifikasi", () => ({
  notifTiketSelesai: notifTiketSelesaiMock,
}));

vi.mock("@/lib/remote-cleanup", () => ({
  purgeRemoteScreenshots: purgeRemoteScreenshotsMock,
}));

import {
  changeTicketStatus,
  claimTicket,
  tutupTiketOlehUser,
} from "@/app/(app)/tiket/[id]/actions";

const VALID_TICKET_ID = "11111111-1111-4111-8111-111111111111";

function createSupabaseActionMock(options: {
  role?: string;
  ticket?: Record<string, unknown> | null;
}) {
  const from = vi.fn((table: string) => {
    if (table === "users") {
      const maybeSingle = vi.fn().mockResolvedValue({
        data: options.role ? { peran: options.role } : null,
        error: null,
      });
      const eq = vi.fn().mockReturnValue({ maybeSingle });
      const select = vi.fn().mockReturnValue({ eq });
      return { select };
    }
    if (table === "tickets") {
      const maybeSingle = vi.fn().mockResolvedValue({
        data: options.ticket ?? null,
        error: null,
      });
      const eq = vi.fn().mockReturnValue({ maybeSingle });
      const select = vi.fn().mockReturnValue({ eq });
      return { select };
    }
    throw new Error(`Unexpected table query: ${table}`);
  });

  return { from };
}

describe("app/(app)/tiket/[id]/actions.ts Tier-5 adversarial hardening", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("enforces live requireAuthUser() across claimTicket, changeTicketStatus, and tutupTiketOlehUser", async () => {
    requireAuthUserMock.mockResolvedValue(null);

    expect(await claimTicket(VALID_TICKET_ID)).toEqual({
      error: "Sesi tidak valid. Silakan login lagi.",
    });
    expect(
      await changeTicketStatus(VALID_TICKET_ID, "diproses"),
    ).toEqual({
      error: "Sesi tidak valid. Silakan login lagi.",
    });
    expect(await tutupTiketOlehUser(VALID_TICKET_ID, 5)).toEqual({
      error: "Belum login.",
    });
    expect(requireAuthUserMock).toHaveBeenCalledTimes(3);
  });

  it("rejects __proto__ and toString as nextStatus in changeTicketStatus", async () => {
    for (const protoStatus of ["__proto__", "toString", "constructor"]) {
      const res = await changeTicketStatus(
        VALID_TICKET_ID,
        protoStatus as never,
      );
      expect(res).toEqual({ error: "Status tiket tidak valid." });
    }
    expect(requireAuthUserMock).not.toHaveBeenCalled();
  });

  it("rejects NaN, fractional, and out-of-range rating and poinKesulitan", async () => {
    for (const badRating of [NaN, 3.5, 0, 6, Infinity]) {
      const res = await tutupTiketOlehUser(VALID_TICKET_ID, badRating);
      expect(res).toEqual({ error: "Rating harus 1-5." });
    }

    const supabase = createSupabaseActionMock({
      role: "it",
      ticket: {
        id: VALID_TICKET_ID,
        it_id: "it-1",
        status: "diproses",
        diproses_pada: "2026-11-26T00:00:00.000Z",
      },
    });
    requireAuthUserMock.mockResolvedValue({
      supabase,
      user: { id: "it-1" },
    });

    for (const badPoin of [NaN, 2.5, 0, 6, Infinity]) {
      const res = await changeTicketStatus(VALID_TICKET_ID, "selesai", {
        poinKesulitan: badPoin,
        catatanSolusi: "Masalah berhasil diperbaiki dengan baik.",
      });
      expect(res).toEqual({
        error: "Poin kesulitan harus dipilih dari 1 sampai 5.",
      });
    }
  });

  it("rejects whitespace-only catatanSolusi when completing a ticket", async () => {
    const supabase = createSupabaseActionMock({
      role: "it",
      ticket: {
        id: VALID_TICKET_ID,
        it_id: "it-1",
        status: "diproses",
        diproses_pada: "2026-11-26T00:00:00.000Z",
      },
    });
    requireAuthUserMock.mockResolvedValue({
      supabase,
      user: { id: "it-1" },
    });

    const res = await changeTicketStatus(VALID_TICKET_ID, "selesai", {
      poinKesulitan: 3,
      catatanSolusi: "   \n\t   ",
    });
    expect(res).toEqual({
      error: "Catatan solusi harus berisi 5 sampai 5.000 karakter.",
    });
  });

  it("rejects non-assignee IT in changeTicketStatus and non-owner in tutupTiketOlehUser", async () => {
    const supabaseOtherIt = createSupabaseActionMock({
      role: "it",
      ticket: {
        id: VALID_TICKET_ID,
        it_id: "it-owner",
        status: "diproses",
        diproses_pada: "2026-11-26T00:00:00.000Z",
      },
    });
    requireAuthUserMock.mockResolvedValueOnce({
      supabase: supabaseOtherIt,
      user: { id: "it-intruder" },
    });

    const changeRes = await changeTicketStatus(VALID_TICKET_ID, "menunggu_user");
    expect(changeRes).toEqual({
      error: "Hanya IT yang mengambil tiket ini yang dapat mengubah status.",
    });

    const supabaseOtherUser = createSupabaseActionMock({
      ticket: {
        pembuat_id: "real-creator",
        status: "selesai",
      },
    });
    requireAuthUserMock.mockResolvedValueOnce({
      supabase: supabaseOtherUser,
      user: { id: "other-user" },
    });

    const closeRes = await tutupTiketOlehUser(VALID_TICKET_ID, 5);
    expect(closeRes).toEqual({
      error: "Hanya pembuat tiket yang bisa menutup.",
    });
  });
});
