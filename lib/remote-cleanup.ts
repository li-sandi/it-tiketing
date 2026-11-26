import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

export async function purgeRemoteScreenshots(ticketId: string) {
  const admin = createAdminClient();
  const { data: rows, error: readError } = await admin
    .from("attachments")
    .select("id, path_file")
    .eq("ticket_id", ticketId)
    .eq("jenis", "foto_remote");

  if (readError) {
    throw new Error(
      `Gagal membaca lampiran remote untuk dibersihkan: ${readError.message}`,
    );
  }
  if (!rows?.length) return 0;

  const paths = rows.map((row) => row.path_file);
  const { error: storageError } = await admin.storage
    .from("ticket-attachments")
    .remove(paths);
  if (storageError) {
    throw new Error(
      `Gagal menghapus file foto remote dari storage: ${storageError.message}`,
    );
  }

  const ids = rows.map((row) => row.id);
  const { error: deleteError } = await admin
    .from("attachments")
    .delete()
    .in("id", ids);
  if (deleteError) {
    throw new Error(
      `Gagal menghapus metadata foto remote: ${deleteError.message}`,
    );
  }

  return rows.length;
}
