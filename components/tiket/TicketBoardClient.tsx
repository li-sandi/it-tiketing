"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { PrioritasBadge, StatusBadge } from "@/components/tiket/StatusBadge";
import { ticketStatusLabels, type TicketStatus } from "@/lib/tiket-status";

export type TicketBoardRow = {
  id: string;
  nomor_tiket: string;
  prioritas: string;
  status: string;
  dibuat_pada: string;
  kategori: string;
  site?: string | null;
  deskripsi?: string | null;
  aging_level?: number | null;
  canOpen: boolean;
};

const PRIORITY_RANK: Record<string, number> = { P0: 0, P1: 1, P2: 2, P3: 3 };

function formatDate(value: string) {
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Jakarta",
  }).format(new Date(value));
}

export default function TicketBoardClient({
  tickets,
  emptyMessage,
  showSite = true,
  showDescription = false,
}: {
  tickets: TicketBoardRow[];
  emptyMessage: string;
  showSite?: boolean;
  showDescription?: boolean;
}) {
  const [search, setSearch] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [sortBy, setSortBy] = useState<"priority" | "newest" | "oldest">("priority");

  const availableStatuses = useMemo(
    () => Array.from(new Set(tickets.map((t) => t.status))),
    [tickets],
  );

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = tickets.filter((t) => {
      if (priorityFilter !== "ALL" && t.prioritas !== priorityFilter) return false;
      if (statusFilter !== "ALL" && t.status !== statusFilter) return false;
      if (q) {
        return (
          t.nomor_tiket.toLowerCase().includes(q) ||
          t.kategori.toLowerCase().includes(q) ||
          (t.deskripsi ?? "").toLowerCase().includes(q)
        );
      }
      return true;
    });

    return [...filtered].sort((a, b) => {
      if (sortBy === "newest") {
        return new Date(b.dibuat_pada).getTime() - new Date(a.dibuat_pada).getTime();
      }
      if (sortBy === "oldest") {
        return new Date(a.dibuat_pada).getTime() - new Date(b.dibuat_pada).getTime();
      }
      const pDiff = (PRIORITY_RANK[a.prioritas] ?? 9) - (PRIORITY_RANK[b.prioritas] ?? 9);
      if (pDiff !== 0) return pDiff;
      return new Date(a.dibuat_pada).getTime() - new Date(b.dibuat_pada).getTime();
    });
  }, [tickets, search, priorityFilter, statusFilter, sortBy]);

  if (tickets.length === 0) {
    return (
      <div className="rounded-xl border bg-[var(--surface)] p-6 text-center text-sm text-[var(--muted)]">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2.5 rounded-xl border bg-[var(--surface)] p-3 shadow-xs">
        <input
          type="search"
          aria-label="Cari nomor tiket, kategori, atau deskripsi"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Cari nomor tiket atau kategori..."
          className="min-w-48 flex-1 rounded-lg border px-3 py-1.5 text-sm"
        />
        <select
          aria-label="Filter prioritas"
          value={priorityFilter}
          onChange={(e) => setPriorityFilter(e.target.value)}
          className="rounded-lg border px-2.5 py-1.5 text-xs font-medium"
        >
          <option value="ALL">Semua Prioritas</option>
          <option value="P0">P0</option>
          <option value="P1">P1</option>
          <option value="P2">P2</option>
          <option value="P3">P3</option>
        </select>
        {availableStatuses.length > 1 && (
          <select
            aria-label="Filter status"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-lg border px-2.5 py-1.5 text-xs font-medium"
          >
            <option value="ALL">Semua Status</option>
            {availableStatuses.map((s) => (
              <option key={s} value={s}>
                {ticketStatusLabels[s as TicketStatus] ?? s}
              </option>
            ))}
          </select>
        )}
        <select
          aria-label="Urutkan tiket"
          value={sortBy}
          onChange={(e) =>
            setSortBy(e.target.value as "priority" | "newest" | "oldest")
          }
          className="rounded-lg border px-2.5 py-1.5 text-xs font-medium"
        >
          <option value="priority">Urut: Prioritas</option>
          <option value="newest">Urut: Terbaru</option>
          <option value="oldest">Urut: Terlama</option>
        </select>
      </div>

      {visible.length === 0 ? (
        <div className="rounded-xl border bg-[var(--surface)] p-6 text-center text-sm text-[var(--muted)]">
          Tidak ada tiket yang cocok dengan filter saat ini.
        </div>
      ) : (
        <>
          {/* Desktop Table */}
          <div className="hidden overflow-x-auto rounded-xl border bg-[var(--surface)] shadow-xs md:block">
            <table className="w-full text-left text-sm">
              <thead className="border-b bg-slate-50 text-xs uppercase text-[var(--muted)]">
                <tr>
                  <th className="px-4 py-3 font-medium">Nomor</th>
                  <th className="px-4 py-3 font-medium">Prioritas</th>
                  <th className="px-4 py-3 font-medium">Kategori</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Masuk (WIB)</th>
                  <th className="px-4 py-3 font-medium text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {visible.map((t) => (
                  <tr key={t.id} className="hover:bg-[var(--surface-muted)]">
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-xs font-medium tabular-nums text-[var(--foreground)]">
                      {t.nomor_tiket}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <PrioritasBadge prioritas={t.prioritas} />
                        {(t.aging_level ?? 0) > 0 && (
                          <span className="rounded border border-amber-300 bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium text-amber-800">
                            +{t.aging_level}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="max-w-sm px-4 py-3">
                      <p className="truncate font-medium text-[var(--foreground)]">
                        {t.kategori}
                      </p>
                      {showDescription && t.deskripsi && (
                        <p className="truncate text-xs text-[var(--secondary)]">
                          {t.deskripsi}
                        </p>
                      )}
                      {showSite && t.site && (
                        <p className="text-[11px] text-[var(--muted)]">{t.site}</p>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <StatusBadge status={t.status} />
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs tabular-nums text-[var(--muted)]">
                      {formatDate(t.dibuat_pada)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      {t.canOpen ? (
                        <Link
                          href={`/tiket/${t.id}`}
                          className="inline-flex min-h-8 items-center rounded-lg border bg-[var(--surface)] px-3 py-1 text-xs font-medium text-blue-700 hover:bg-blue-50"
                        >
                          Buka
                        </Link>
                      ) : (
                        <span className="text-xs text-[var(--muted)]">Terbatas</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards */}
          <div className="space-y-2.5 md:hidden">
            {visible.map((t) => {
              const card = (
                <div className="space-y-1.5 rounded-xl border bg-[var(--surface)] p-4 shadow-xs">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs font-medium tabular-nums text-[var(--muted)]">
                      {t.nomor_tiket}
                    </span>
                    <PrioritasBadge prioritas={t.prioritas} />
                    <StatusBadge status={t.status} />
                  </div>
                  <p className="text-sm font-semibold text-[var(--foreground)]">
                    {t.kategori}
                  </p>
                  {showDescription && t.deskripsi && (
                    <p className="line-clamp-2 text-xs text-[var(--secondary)]">
                      {t.deskripsi}
                    </p>
                  )}
                  <p className="text-xs text-[var(--muted)]">
                    {showSite && t.site ? `${t.site} · ` : ""}
                    {formatDate(t.dibuat_pada)}
                  </p>
                </div>
              );

              return t.canOpen ? (
                <Link key={t.id} href={`/tiket/${t.id}`} className="block">
                  {card}
                </Link>
              ) : (
                <div key={t.id}>{card}</div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
