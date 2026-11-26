"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import BrandMark from "@/components/layout/BrandMark";
import ThemeToggle from "@/components/theme/ThemeToggle";
import { createClient } from "@/lib/supabase/client";

type NavItem = {
  href: string;
  label: string;
  roles?: string[];
  icon:
    | "dashboard"
    | "tickets"
    | "plus"
    | "queue"
    | "chart"
    | "book"
    | "laptop"
    | "box"
    | "shield";
};

const OPERATIONAL_NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: "dashboard" },
  { href: "/tiket", label: "Tiket Aktif", icon: "tickets" },
  { href: "/tiket/baru", label: "Buat Tiket", icon: "plus" },
  { href: "/antrian", label: "Antrian IT", roles: ["it", "admin"], icon: "queue" },
  { href: "/laporan", label: "Laporan & SLA", roles: ["it", "admin"], icon: "chart" },
  { href: "/wiki", label: "Wiki & SOP", icon: "book" },
];

const INVENTORY_NAV: NavItem[] = [
  { href: "/aset", label: "Inventaris Aset", roles: ["ga", "it", "admin"], icon: "laptop" },
  { href: "/stok", label: "Stok Sparepart", roles: ["ga", "it", "admin"], icon: "box" },
];

const ADMIN_NAV: NavItem[] = [
  { href: "/admin", label: "Ringkasan Admin", roles: ["admin"], icon: "shield" },
  { href: "/admin/kategori", label: "Kategori", roles: ["admin"], icon: "shield" },
  { href: "/admin/sites", label: "Site", roles: ["admin"], icon: "shield" },
  { href: "/admin/users", label: "Pengguna", roles: ["admin"], icon: "shield" },
  { href: "/admin/jadwal", label: "Jadwal", roles: ["admin"], icon: "shield" },
  { href: "/admin/pengaturan", label: "Pengaturan", roles: ["admin"], icon: "shield" },
];

function NavIcon({ name }: { name: NavItem["icon"] }) {
  const cls = "size-4 shrink-0";
  switch (name) {
    case "dashboard":
      return (
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={cls}>
          <rect x="3" y="3" width="7" height="9" rx="1.5" />
          <rect x="14" y="3" width="7" height="5" rx="1.5" />
          <rect x="14" y="12" width="7" height="9" rx="1.5" />
          <rect x="3" y="16" width="7" height="5" rx="1.5" />
        </svg>
      );
    case "tickets":
      return (
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={cls}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v3a2 2 0 0 0 0 4v3a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-3a2 2 0 0 0 0-4V7z" />
          <path strokeLinecap="round" d="M9 12h6" />
        </svg>
      );
    case "plus":
      return (
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={cls}>
          <circle cx="12" cy="12" r="9" />
          <path strokeLinecap="round" d="M12 8v8M8 12h8" />
        </svg>
      );
    case "queue":
      return (
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={cls}>
          <path strokeLinecap="round" d="M4 6h16M4 12h16M4 18h10" />
        </svg>
      );
    case "chart":
      return (
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={cls}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 20h16M7 16v-5M12 16V7M17 16v-8" />
        </svg>
      );
    case "book":
      return (
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={cls}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21V5.5z" />
          <path strokeLinecap="round" d="M8 7h8M8 11h6" />
        </svg>
      );
    case "laptop":
      return (
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={cls}>
          <rect x="4" y="5" width="16" height="11" rx="1.5" />
          <path strokeLinecap="round" d="M2 19h20" />
        </svg>
      );
    case "box":
      return (
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={cls}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.5l-9-4.5-9 4.5v7l9 4.5 9-4.5v-7z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.2 8.7L12 13l8.8-4.3M12 13v7" />
        </svg>
      );
    case "shield":
      return (
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={cls}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 3l7 3v5c0 4.5-3 8.3-7 9.8-4-1.5-7-5.3-7-9.8V6l7-3z" />
        </svg>
      );
  }
}

export default function AppShell({
  userName,
  userEmail,
  role,
  pageTitle,
  pageSubtitle,
  headerAction,
  children,
}: {
  userName: string;
  userEmail?: string | null;
  role: string;
  pageTitle: string;
  pageSubtitle?: string;
  headerAction?: ReactNode;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [openForPath, setOpenForPath] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement | null>(null);
  const drawerOpen = openForPath === pathname;

  useEffect(() => {
    if (!drawerOpen) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpenForPath(null);
        menuButtonRef.current?.focus();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [drawerOpen]);

  async function handleSignOut() {
    setSigningOut(true);
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
      router.push("/login");
      router.refresh();
    } catch {
      setSigningOut(false);
    }
  }

  function isVisible(item: NavItem) {
    return !item.roles || item.roles.includes(role);
  }

  function isActive(href: string) {
    if (href === "/tiket") {
      return pathname === "/tiket" || (pathname.startsWith("/tiket/") && pathname !== "/tiket/baru");
    }
    return pathname === href;
  }

  const operationalLinks = OPERATIONAL_NAV.filter(isVisible);
  const inventoryLinks = INVENTORY_NAV.filter(isVisible);
  const adminLinks = ADMIN_NAV.filter(isVisible);
  const initials = (userName || "U")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");

  function renderNavContent() {
    const renderSection = (title: string, items: NavItem[]) => {
      if (!items.length) return null;
      return (
        <div className="space-y-1">
          <p className="px-3 text-[11px] font-semibold uppercase tracking-wider text-[var(--muted)]">
            {title}
          </p>
          <ul className="space-y-0.5">
            {items.map((item) => {
              const active = isActive(item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={`relative flex min-h-9 items-center gap-2.5 rounded-lg px-3 py-1.5 text-sm ${
                      active
                        ? "bg-blue-50 font-semibold text-blue-700"
                        : "text-[var(--secondary)] hover:bg-[var(--surface-muted)] hover:text-[var(--foreground)]"
                    }`}
                  >
                    {active && (
                      <span
                        aria-hidden="true"
                        className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-blue-700"
                      />
                    )}
                    <NavIcon name={item.icon} />
                    <span className="truncate">{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      );
    };

    return (
      <div className="flex h-full flex-col">
        <div className="flex h-14 items-center border-b px-4">
          <Link href="/dashboard" className="min-w-0 flex-1 rounded-lg focus-visible:outline-offset-4">
            <BrandMark />
          </Link>
        </div>

        <nav aria-label="Menu Utama" className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
          {renderSection("Operasional", operationalLinks)}
          {renderSection("Inventaris & Stok", inventoryLinks)}
          {renderSection("Administrasi", adminLinks)}
        </nav>

        <div className="border-t p-3">
          <div className="flex items-center gap-2.5 rounded-lg bg-[var(--surface-muted)] px-2.5 py-2">
            <div
              aria-hidden="true"
              className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[#1d4ed8] text-xs font-semibold text-white"
            >
              {initials || "U"}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold text-[var(--foreground)]">
                {userName}
              </p>
              <p className="truncate text-[11px] text-[var(--muted)]">
                <span className="font-semibold uppercase">{role}</span>
                {userEmail ? ` · ${userEmail}` : ""}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void handleSignOut()}
            disabled={signingOut}
            className="mt-2 flex min-h-9 w-full items-center justify-center gap-2 rounded-lg border bg-[var(--surface)] px-3 py-1.5 text-xs font-medium text-[var(--secondary)] hover:bg-[var(--surface-muted)] hover:text-[var(--foreground)] disabled:opacity-50"
          >
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="size-3.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3" />
            </svg>
            {signingOut ? "Keluar..." : "Keluar"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-1 bg-[var(--background)]">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:fixed lg:inset-y-0 lg:left-0 lg:z-20 lg:flex lg:w-60 lg:flex-col lg:border-r lg:bg-[var(--surface)]">
        {renderNavContent()}
      </aside>

      {/* Mobile Drawer */}
      {drawerOpen && (
        <div
          className="fixed inset-0 z-50 flex lg:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Navigasi Utama"
        >
          <div
            className="fixed inset-0 bg-slate-900/50 backdrop-blur-[1px]"
            onClick={() => setOpenForPath(null)}
          />
          <div className="relative z-10 flex w-72 max-w-[85vw] flex-col border-r bg-[var(--surface)] shadow-xl">
            <div className="absolute right-2 top-2.5">
              <button
                type="button"
                onClick={() => {
                  setOpenForPath(null);
                  menuButtonRef.current?.focus();
                }}
                aria-label="Tutup menu navigasi"
                className="inline-flex size-9 items-center justify-center rounded-lg border bg-[var(--surface)] text-[var(--foreground)] hover:bg-[var(--surface-muted)]"
              >
                <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-4">
                  <path strokeLinecap="round" d="M6 6l12 12M18 6l-12 12" />
                </svg>
              </button>
            </div>
            {renderNavContent()}
          </div>
        </div>
      )}

      {/* Workspace Column */}
      <div className="flex min-w-0 flex-1 flex-col lg:pl-60">
        <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center justify-between gap-3 border-b bg-[var(--surface)]/95 px-4 backdrop-blur-xs sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <button
              ref={menuButtonRef}
              type="button"
              onClick={() => setOpenForPath(pathname)}
              aria-label="Buka menu navigasi"
              aria-expanded={drawerOpen}
              className="inline-flex size-9 items-center justify-center rounded-lg border bg-[var(--surface)] text-[var(--foreground)] hover:bg-[var(--surface-muted)] lg:hidden"
            >
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="size-5">
                <path strokeLinecap="round" d="M4 7h16M4 12h16M4 17h16" />
              </svg>
            </button>
            <h1 className="truncate text-base font-semibold text-[var(--foreground)] sm:text-lg">
              {pageTitle}
            </h1>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {headerAction}
            <ThemeToggle />
          </div>
        </header>

        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 lg:px-8">
          {pageSubtitle && (
            <p className="mb-5 text-sm text-[var(--muted)]">{pageSubtitle}</p>
          )}
          <div className="space-y-6">{children}</div>
        </main>
      </div>
    </div>
  );
}
