import { Suspense, type ReactNode } from "react";
import { redirect } from "next/navigation";
import {
  AppShellFrame,
  AppShellHeaderAction,
  AppShellHeaderSubtitle,
  AppShellHeaderTitle,
  AppShellMobileDrawer,
  AppShellSidebar,
} from "@/components/layout/AppShell";
import { getCurrentUserProfile } from "@/lib/auth";
import { getFeatureFlags } from "@/lib/settings";

function SidebarSkeleton() {
  return (
    <div className="flex flex-1 flex-col justify-between p-3 animate-pulse">
      <div className="space-y-5 px-1 py-2">
        <div className="space-y-2">
          <div className="h-3 w-20 rounded bg-[var(--surface-muted)]" />
          <div className="h-9 rounded-lg bg-[var(--surface-muted)]" />
          <div className="h-9 rounded-lg bg-[var(--surface-muted)]" />
          <div className="h-9 rounded-lg bg-[var(--surface-muted)]" />
        </div>
        <div className="space-y-2">
          <div className="h-3 w-24 rounded bg-[var(--surface-muted)]" />
          <div className="h-9 rounded-lg bg-[var(--surface-muted)]" />
        </div>
      </div>
      <div className="border-t pt-3">
        <div className="h-12 rounded-lg bg-[var(--surface-muted)]" />
        <div className="mt-2 h-9 rounded-lg bg-[var(--surface-muted)]" />
      </div>
    </div>
  );
}

function MobileTriggerSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="size-9 rounded-lg border bg-[var(--surface-muted)] lg:hidden"
    />
  );
}

function HeaderTitleSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="h-6 w-36 animate-pulse rounded bg-[var(--surface-muted)]"
    />
  );
}

async function SidebarSlot() {
  const [profile, flags] = await Promise.all([
    getCurrentUserProfile(),
    getFeatureFlags(),
  ]);
  if (!profile) redirect("/login");

  return (
    <AppShellSidebar
      userName={profile.nama ?? profile.email ?? "Pengguna"}
      userEmail={profile.email}
      role={profile.peran}
      showSchedule={flags.sleman_routing_enabled}
    />
  );
}

async function MobileDrawerSlot() {
  const [profile, flags] = await Promise.all([
    getCurrentUserProfile(),
    getFeatureFlags(),
  ]);
  if (!profile) return null;

  return (
    <AppShellMobileDrawer
      userName={profile.nama ?? profile.email ?? "Pengguna"}
      userEmail={profile.email}
      role={profile.peran}
      showSchedule={flags.sleman_routing_enabled}
    />
  );
}

async function HeaderActionSlot() {
  const profile = await getCurrentUserProfile();
  if (!profile) return null;

  return <AppShellHeaderAction role={profile.peran} />;
}

export default function AuthenticatedAppLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <AppShellFrame
      sidebarSlot={
        <Suspense fallback={<SidebarSkeleton />}>
          <SidebarSlot />
        </Suspense>
      }
      mobileNavSlot={
        <Suspense fallback={<MobileTriggerSkeleton />}>
          <MobileDrawerSlot />
        </Suspense>
      }
      headerTitleSlot={
        <Suspense fallback={<HeaderTitleSkeleton />}>
          <AppShellHeaderTitle />
        </Suspense>
      }
      headerActionSlot={
        <Suspense fallback={null}>
          <HeaderActionSlot />
        </Suspense>
      }
      subtitleSlot={
        <Suspense fallback={null}>
          <AppShellHeaderSubtitle />
        </Suspense>
      }
    >
      {children}
    </AppShellFrame>
  );
}
