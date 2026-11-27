import { Suspense } from "react";
import { redirect } from "next/navigation";
import WikiLoading from "@/app/(app)/wiki/loading";
import WikiClient from "@/components/wiki/WikiClient";
import { getCurrentUserProfile } from "@/lib/auth";
import { getWikiArticles } from "@/lib/data/wiki";

async function WikiContent() {
  const profile = await getCurrentUserProfile();
  if (!profile) redirect("/login");

  const isStaff = profile.peran === "it" || profile.peran === "admin";
  let articles: Awaited<ReturnType<typeof getWikiArticles>> = [];
  let errorMessage: string | null = null;
  try {
    articles = await getWikiArticles({ includeDrafts: isStaff });
  } catch (err) {
    errorMessage =
      err instanceof Error ? err.message : "Terjadi kesalahan saat memuat Wiki.";
  }

  if (errorMessage) {
    return (
      <p
        role="alert"
        className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700"
      >
        Gagal memuat Wiki: {errorMessage}
      </p>
    );
  }

  return <WikiClient initialArticles={articles} isStaff={isStaff} />;
}

export default function WikiPage() {
  return (
    <Suspense fallback={<WikiLoading />}>
      <WikiContent />
    </Suspense>
  );
}
