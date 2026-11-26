import { describe, expect, it } from "vitest";
import { sanitizeRemoteLookupResult } from "@/lib/remote-id-policy";

describe("sanitizeRemoteLookupResult privacy policy", () => {
  const sampleAsset = {
    nama_perangkat: "LAPTOP-OPS-01",
    ram_gb: 16,
    anydesk_id: "123 456 789",
    uv_id: "987 654 321",
  };

  const sampleCreds = [
    { ticket_id: "t-old", aplikasi: "anydesk", remote_id: "111 222 333" },
    { ticket_id: "t-new", aplikasi: "uv", remote_id: "444 555 666" },
  ];

  it("redacts anydeskId and uvId for anonymous callers while keeping non-sensitive asset metadata", () => {
    const result = sanitizeRemoteLookupResult({
      assetRecord: sampleAsset,
      ticketIds: ["t-new", "t-old"],
      ticketCreds: sampleCreds,
      canReadRemoteIds: false,
    });

    expect(result).toEqual({
      anydeskId: null,
      uvId: null,
      ramGb: 16,
      assetName: "LAPTOP-OPS-01",
      hasSavedRemoteId: true,
    });
  });

  it("sets hasSavedRemoteId false for unprivileged callers when asset has no saved static IDs", () => {
    const result = sanitizeRemoteLookupResult({
      assetRecord: {
        nama_perangkat: "LAPTOP-BARU",
        ram_gb: 8,
        anydesk_id: null,
        uv_id: null,
      },
      ticketIds: ["t-old"],
      ticketCreds: sampleCreds,
      canReadRemoteIds: false,
    });

    expect(result).toEqual({
      anydeskId: null,
      uvId: null,
      ramGb: 8,
      assetName: "LAPTOP-BARU",
      hasSavedRemoteId: false,
    });
  });

  it("returns static asset remote IDs for authorized callers (IT/Admin/GA, owner, or valid token)", () => {
    const result = sanitizeRemoteLookupResult({
      assetRecord: sampleAsset,
      ticketIds: ["t-new", "t-old"],
      ticketCreds: sampleCreds,
      canReadRemoteIds: true,
    });

    expect(result).toEqual({
      anydeskId: "123 456 789",
      uvId: "987 654 321",
      ramGb: 16,
      assetName: "LAPTOP-OPS-01",
      hasSavedRemoteId: true,
    });
  });

  it("fills missing asset remote IDs from newest ticket credential first and ignores placeholders", () => {
    const result = sanitizeRemoteLookupResult({
      assetRecord: {
        nama_perangkat: "LAPTOP-PARTIAL",
        ram_gb: 16,
        anydesk_id: null,
        uv_id: null,
      },
      ticketIds: ["t-newest", "t-older"],
      ticketCreds: [
        { ticket_id: "t-older", aplikasi: "anydesk", remote_id: "222 000 111" },
        { ticket_id: "t-newest", aplikasi: "anydesk", remote_id: "999 888 777" },
        { ticket_id: "t-newest", aplikasi: "uv", remote_id: "-" },
        { ticket_id: "t-older", aplikasi: "uv", remote_id: "555 666 777" },
      ],
      canReadRemoteIds: true,
    });

    expect(result).toEqual({
      anydeskId: "999 888 777",
      uvId: "555 666 777",
      ramGb: 16,
      assetName: "LAPTOP-PARTIAL",
      hasSavedRemoteId: true,
    });
  });
});
