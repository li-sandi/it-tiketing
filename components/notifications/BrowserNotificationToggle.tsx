"use client";

import { useState, useSyncExternalStore } from "react";

const emptySubscribe = () => () => {};

function getNotificationSupport() {
  return typeof window !== "undefined" && "Notification" in window;
}

function getPermissionSnapshot(): NotificationPermission | null {
  if (!getNotificationSupport()) return null;
  return Notification.permission;
}

export default function BrowserNotificationToggle() {
  const initialPermission = useSyncExternalStore(
    emptySubscribe,
    getPermissionSnapshot,
    () => null,
  );
  const [overridePermission, setOverridePermission] =
    useState<NotificationPermission | null>(null);
  const [busy, setBusy] = useState(false);

  const permission = overridePermission ?? initialPermission;
  if (permission === null) return null;

  async function enableNotifications() {
    setBusy(true);
    try {
      const result = await Notification.requestPermission();
      setOverridePermission(result);
      if (result === "granted") {
        if ("serviceWorker" in navigator) {
          await navigator.serviceWorker.register("/sw.js").catch(() => null);
        }
        await fetch("/api/notifications/subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            endpoint: `browser-notification:${window.location.origin}:${Date.now()}`,
            p256dh: "browser-local",
            auth: "browser-local",
          }),
        });
        new Notification("Notifikasi Layanan IT Aktif", {
          body: "Anda akan menerima pemberitahuan di browser.",
        });
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-2 text-xs">
      {permission === "granted" ? (
        <span className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 font-medium text-emerald-800">
          Notifikasi Browser Aktif
        </span>
      ) : permission === "denied" ? (
        <span className="rounded-lg border bg-[var(--surface-muted)] px-3 py-1.5 text-[var(--muted)]">
          Notifikasi browser diblokir
        </span>
      ) : (
        <button
          type="button"
          disabled={busy}
          onClick={() => void enableNotifications()}
          className="min-h-9 rounded-lg border bg-[var(--surface)] px-3 py-1.5 font-medium text-[var(--foreground)] hover:bg-[var(--surface-muted)] disabled:opacity-50"
        >
          {busy ? "Mengaktifkan..." : "Aktifkan Notifikasi Browser"}
        </button>
      )}
    </div>
  );
}
