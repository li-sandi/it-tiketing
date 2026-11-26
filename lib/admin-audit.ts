import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

export async function logAdminAction(params: {
  aktorId: string | null;
  aksi: "create" | "update" | "delete";
  entitas: "kategori" | "site" | "user" | "settings" | "jadwal";
  entitasId?: string | null;
  ringkasan: string;
  detail?: unknown;
}) {
  try {
    const admin = createAdminClient();
    const { error } = await admin.from("admin_audit_logs").insert({
      aktor_id: params.aktorId,
      aksi: params.aksi,
      entitas: params.entitas,
      entitas_id: params.entitasId ?? null,
      ringkasan: params.ringkasan.slice(0, 500),
      detail: params.detail ?? null,
    });
    if (error) {
      console.error("Gagal mencatat admin audit log:", error.message);
    }
  } catch (err) {
    console.error("Error admin audit log:", err);
  }
}
