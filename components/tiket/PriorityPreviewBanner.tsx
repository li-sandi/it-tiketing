import { PrioritasBadge } from "@/components/tiket/StatusBadge";
import { hitungPrioritas, parseAturanKenaikan, type Prioritas } from "@/lib/prioritas";

const SLA_SUMMARY: Record<Prioritas, { respon: string; resolusi: string }> = {
  P0: { respon: "5 menit", resolusi: "30 menit" },
  P1: { respon: "15 menit", resolusi: "2 jam" },
  P2: { respon: "30 menit", resolusi: "4 jam" },
  P3: { respon: "2 jam", resolusi: "1 hari kerja (WIB)" },
};

export default function PriorityPreviewBanner({
  prioritasDefault,
  prioritasNaik,
  jumlahUserTerdampak,
  jumlahUserSite,
  jumlahTaskVendor,
}: {
  prioritasDefault: Prioritas;
  prioritasNaik: unknown;
  jumlahUserTerdampak?: number;
  jumlahUserSite?: number;
  jumlahTaskVendor?: number;
}) {
  const aturan = parseAturanKenaikan(prioritasNaik);
  const estimasi = hitungPrioritas({
    prioritasDefault,
    aturan,
    jumlahUserTerdampak,
    jumlahUserSite,
    jumlahTaskVendor,
  });
  const target = SLA_SUMMARY[estimasi];
  const escalated = estimasi !== prioritasDefault;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-[var(--surface-muted)] px-4 py-3 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium text-[var(--secondary)]">
          Estimasi Prioritas &amp; SLA:
        </span>
        <PrioritasBadge prioritas={estimasi} />
        {escalated && (
          <span className="rounded-md border border-red-200 bg-red-50 px-2 py-0.5 font-medium text-red-700">
            Naik otomatis dari {prioritasDefault}
          </span>
        )}
      </div>
      <div className="font-medium tabular-nums text-[var(--foreground)]">
        Respon {target.respon} · Resolusi {target.resolusi}
      </div>
    </div>
  );
}
