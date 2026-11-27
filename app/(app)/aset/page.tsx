import { Suspense } from "react";
import { redirect } from "next/navigation";
import AsetLoading from "@/app/(app)/aset/loading";
import AssetClient from "@/components/aset/AssetClient";
import { getCurrentUserProfile } from "@/lib/auth";
import { getAssetsList } from "@/lib/data/assets";
import { getActiveSites } from "@/lib/data/sites";

async function AsetContent() {
  const profile = await getCurrentUserProfile();
  if (!profile) redirect("/login");
  if (
    profile.peran !== "it" &&
    profile.peran !== "admin" &&
    profile.peran !== "ga"
  ) {
    redirect("/dashboard");
  }

  const [assetsResult, sitesResult] = await Promise.allSettled([
    getAssetsList(),
    getActiveSites(),
  ]);

  if (assetsResult.status === "rejected") {
    const message =
      assetsResult.reason instanceof Error
        ? assetsResult.reason.message
        : "Terjadi kesalahan saat memuat aset.";
    return (
      <p
        role="alert"
        className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700"
      >
        Gagal memuat data aset: {message}
      </p>
    );
  }

  const sites =
    sitesResult.status === "fulfilled"
      ? sitesResult.value.map((s) => ({ id: s.id, nama: s.nama }))
      : [];

  return <AssetClient assets={assetsResult.value} sites={sites} />;
}

export default function AsetPage() {
  return (
    <Suspense fallback={<AsetLoading />}>
      <AsetContent />
    </Suspense>
  );
}
