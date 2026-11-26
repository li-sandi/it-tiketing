export type AssetRemoteRecord = {
  nama_perangkat: string | null;
  ram_gb: number | null;
  anydesk_id: string | null;
  uv_id: string | null;
} | null;

export type TicketRemoteCred = {
  ticket_id: string;
  aplikasi: string;
  remote_id: string;
};

export function sanitizeRemoteLookupResult(params: {
  assetRecord: AssetRemoteRecord;
  ticketIds: string[];
  ticketCreds: TicketRemoteCred[];
  canReadRemoteIds: boolean;
}): {
  anydeskId: string | null;
  uvId: string | null;
  ramGb: number | null;
  assetName: string | null;
  hasSavedRemoteId: boolean;
} {
  const { assetRecord, ticketIds, ticketCreds, canReadRemoteIds } = params;

  const hasAssetSaved = Boolean(assetRecord?.anydesk_id || assetRecord?.uv_id);
  const ramGb = assetRecord?.ram_gb ?? null;
  const assetName = assetRecord?.nama_perangkat ?? null;

  if (!canReadRemoteIds) {
    return {
      anydeskId: null,
      uvId: null,
      ramGb,
      assetName,
      hasSavedRemoteId: hasAssetSaved,
    };
  }

  let anydeskId = assetRecord?.anydesk_id ?? null;
  let uvId = assetRecord?.uv_id ?? null;

  if (ticketIds.length > 0 && (!anydeskId || !uvId)) {
    const ticketOrder = new Map(ticketIds.map((id, index) => [id, index]));
    const newestFirst = [...ticketCreds].sort(
      (left, right) =>
        (ticketOrder.get(left.ticket_id) ?? Number.MAX_SAFE_INTEGER) -
        (ticketOrder.get(right.ticket_id) ?? Number.MAX_SAFE_INTEGER),
    );
    for (const credential of newestFirst) {
      if (
        credential.aplikasi === "anydesk" &&
        !anydeskId &&
        credential.remote_id &&
        credential.remote_id !== "-"
      ) {
        anydeskId = credential.remote_id;
      }
      if (
        credential.aplikasi === "uv" &&
        !uvId &&
        credential.remote_id &&
        credential.remote_id !== "-"
      ) {
        uvId = credential.remote_id;
      }
      if (anydeskId && uvId) break;
    }
  }

  return {
    anydeskId,
    uvId,
    ramGb,
    assetName,
    hasSavedRemoteId: Boolean(anydeskId || uvId || hasAssetSaved),
  };
}
