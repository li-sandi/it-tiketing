import { describe, expect, it } from "vitest";
import { getNextTicketStatuses, isTicketStatus } from "@/lib/tiket-status";

describe("tiket-status transitions", () => {
  it("validates known ticket statuses", () => {
    expect(isTicketStatus("baru")).toBe(true);
    expect(isTicketStatus("menunggu_pengadaan")).toBe(true);
    expect(isTicketStatus("invalid")).toBe(false);
  });

  it("enforces allowed transitions", () => {
    expect(getNextTicketStatuses("baru")).toEqual(["diproses"]);
    expect(getNextTicketStatuses("diproses")).toContain("selesai");
    expect(getNextTicketStatuses("diproses")).toContain("menunggu_pengadaan");
    expect(getNextTicketStatuses("menunggu_pengadaan")).toEqual(["diproses"]);
    expect(getNextTicketStatuses("selesai")).toEqual([]);
    expect(getNextTicketStatuses("ditutup")).toEqual([]);
  });
});
