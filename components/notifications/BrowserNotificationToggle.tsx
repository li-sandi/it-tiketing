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
        <span className="rounded bg-green-100 px-2.5 py-1 font-medium text-green-800">
          Notifikasi Browser Aktif
        </span>
      ) : permission === "denied" ? (
        <span className="text-gray-500">Notifikasi browser diblokir</span>
      ) : (
        <button
          type="button"
          disabled={busy}
          onClick={() => void enableNotifications()}
          className="rounded border px-2.5 py-1 hover:bg-gray-50 disabled:opacity-50"
        >
          {busy ? "Mengaktifkan..." : "Aktifkan Notifikasi Browser"}
        </button>
      )}
    </div>
  );
}
