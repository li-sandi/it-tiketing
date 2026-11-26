"use client";

import { useState } from "react";
import type { Prioritas } from "@/lib/prioritas";

export type CategoryOption = {
  id: string;
  nama: string;
  grup?: string | null;
  tipe: "insiden" | "permintaan" | "internal";
  prioritas_default: Prioritas;
  prioritas_naik: unknown;
  butuh_aset: boolean;
  butuh_foto: boolean;
  bisa_remote: boolean;
  stock_kode?: string | null;
};

export default function CategoryGroupSelector({
  categories,
  selectedCategoryId,
  onSelectCategory,
  selectId,
}: {
  categories: CategoryOption[];
  selectedCategoryId: string;
  onSelectCategory: (categoryId: string) => void;
  selectId: string;
}) {
  const groups = Array.from(
    new Set(categories.map((c) => c.grup?.trim() || "Lainnya")),
  ).sort((a, b) => a.localeCompare(b, "id"));

  const [activeGroup, setActiveGroup] = useState<string>("Semua");
  const [search, setSearch] = useState("");

  const filtered = categories.filter((c) => {
    const groupName = c.grup?.trim() || "Lainnya";
    if (activeGroup !== "Semua" && groupName !== activeGroup) return false;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      return (
        c.nama.toLowerCase().includes(q) || groupName.toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="space-y-3">
      <div>
        <span className="mb-2 block text-sm font-medium text-[var(--foreground)]">
          1. Pilih Kelompok Kategori
        </span>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Kelompok kategori">
          <button
            type="button"
            onClick={() => setActiveGroup("Semua")}
            className={`min-h-8 rounded-lg border px-3 py-1 text-xs font-medium ${
              activeGroup === "Semua"
                ? "border-[#1d4ed8] bg-[#1d4ed8] text-white"
                : "bg-[var(--surface)] text-[var(--secondary)] hover:bg-[var(--surface-muted)] hover:text-[var(--foreground)]"
            }`}
          >
            Semua ({categories.length})
          </button>
          {groups.map((group) => {
            const count = categories.filter(
              (c) => (c.grup?.trim() || "Lainnya") === group,
            ).length;
            const selected = activeGroup === group;
            return (
              <button
                key={group}
                type="button"
                onClick={() => {
                  setActiveGroup(group);
                  const current = categories.find(
                    (c) => c.id === selectedCategoryId,
                  );
                  if (
                    current &&
                    (current.grup?.trim() || "Lainnya") !== group
                  ) {
                    onSelectCategory("");
                  }
                }}
                className={`min-h-8 rounded-lg border px-3 py-1 text-xs font-medium ${
                  selected
                    ? "border-[#1d4ed8] bg-[#1d4ed8] text-white"
                    : "bg-[var(--surface)] text-[var(--secondary)] hover:bg-[var(--surface-muted)] hover:text-[var(--foreground)]"
                }`}
              >
                {group} ({count})
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
          <label htmlFor={selectId} className="block text-sm font-medium text-[var(--foreground)]">
            2. Jenis Masalah / Permintaan
          </label>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari kategori..."
            aria-label="Cari kategori"
            className="rounded-lg border px-2.5 py-1 text-xs"
          />
        </div>
        <select
          id={selectId}
          value={selectedCategoryId}
          onChange={(event) => onSelectCategory(event.target.value)}
          required
          className="w-full rounded-lg border px-3 py-2 text-sm"
        >
          <option value="">Pilih jenis masalah</option>
          {filtered.map((item) => (
            <option key={item.id} value={item.id}>
              [{item.grup ?? "Lainnya"}] {item.nama} ({item.prioritas_default})
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
