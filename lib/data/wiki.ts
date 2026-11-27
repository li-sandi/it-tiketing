import "server-only";

import { cacheLife, cacheTag } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";

export type WikiArticleRecord = {
  id: string;
  judul: string;
  grup: string;
  masalah: string;
  solusi: string;
  kata_kunci: string[];
  status: "draft" | "published";
  is_internal: boolean;
  diperbarui_pada: string;
};

export async function getWikiArticles({
  includeDrafts = false,
  includeInternal = includeDrafts,
}: { includeDrafts?: boolean; includeInternal?: boolean } = {}): Promise<
  WikiArticleRecord[]
> {
  "use cache";
  cacheLife("hours");
  cacheTag("wiki");

  const admin = createAdminClient();
  let query = admin
    .from("knowledge_articles")
    .select(
      "id, judul, grup, masalah, solusi, kata_kunci, status, is_internal, diperbarui_pada",
    );

  if (!includeDrafts) {
    query = query.eq("status", "published");
  }

  if (!includeInternal) {
    query = query.eq("is_internal", false);
  }

  const { data, error } = await query
    .order("diperbarui_pada", { ascending: false })
    .limit(100);

  if (error) {
    throw new Error(`Gagal memuat artikel wiki: ${error.message}`);
  }

  return (data ?? []) as WikiArticleRecord[];
}

export async function getPublishedPublicWikiArticles(): Promise<
  WikiArticleRecord[]
> {
  "use cache";
  cacheLife("hours");
  cacheTag("wiki");

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("knowledge_articles")
    .select(
      "id, judul, grup, masalah, solusi, kata_kunci, status, is_internal, diperbarui_pada",
    )
    .eq("status", "published")
    .eq("is_internal", false)
    .order("diperbarui_pada", { ascending: false })
    .limit(100);

  if (error) {
    throw new Error(`Gagal memuat panduan publik: ${error.message}`);
  }

  return (data ?? []) as WikiArticleRecord[];
}
