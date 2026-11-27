"use client";

import { Suspense } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import BrandMark from "@/components/layout/BrandMark";
import ThemeToggle from "@/components/theme/ThemeToggle";

const NAV_ITEMS = [
  { href: "/lapor", label: "Lapor Gangguan" },
  { href: "/login", label: "Masuk Staf" },
];

function StaticPublicNavLinks() {
  return (
    <>
      {NAV_ITEMS.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className="inline-flex min-h-9 items-center rounded-lg px-3 py-1.5 text-sm font-medium text-[var(--secondary)] hover:bg-[var(--surface-muted)] hover:text-[var(--foreground)]"
        >
          {item.label}
        </Link>
      ))}
    </>
  );
}

function PublicNavLinks() {
  const pathname = usePathname();

  return (
    <>
      {NAV_ITEMS.map((item) => {
        const active = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`inline-flex min-h-9 items-center rounded-lg px-3 py-1.5 text-sm font-medium ${
              active
                ? "bg-[#eff6ff] text-[#1d4ed8] border border-[#bfdbfe]"
                : "text-[var(--secondary)] hover:bg-[var(--surface-muted)] hover:text-[var(--foreground)]"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </>
  );
}

export default function PublicHeader() {
  return (
    <header className="sticky top-0 z-30 border-b bg-[var(--surface)]/95 backdrop-blur-xs">
      <div className="mx-auto flex h-15 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <Link href="/" className="shrink-0 rounded-lg focus-visible:outline-offset-4">
          <BrandMark />
        </Link>

        <nav aria-label="Navigasi Publik" className="flex items-center gap-2 sm:gap-3">
          <Suspense fallback={<StaticPublicNavLinks />}>
            <PublicNavLinks />
          </Suspense>
          <ThemeToggle />
        </nav>
      </div>
    </header>
  );
}
