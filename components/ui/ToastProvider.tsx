"use client";

import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";

type ToastType = "success" | "error" | "info";

type ToastItem = {
  id: string;
  message: string;
  type: ToastType;
};

type ToastContextValue = {
  toast: (message: string, type?: ToastType) => void;
};

const ToastContext = createContext<ToastContextValue>({
  toast: () => {},
});

export function useToast() {
  return useContext(ToastContext);
}

export default function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const toast = useCallback(
    (message: string, type: ToastType = "info") => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      setItems((prev) => [...prev.slice(-3), { id, message, type }]);
      window.setTimeout(() => {
        dismiss(id);
      }, 4200);
    },
    [dismiss],
  );

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div
        aria-live="polite"
        aria-atomic="true"
        className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-full max-w-sm flex-col gap-2 px-4 sm:px-0"
      >
        {items.map((item) => {
          const style =
            item.type === "success"
              ? "border-emerald-300 bg-emerald-50 text-emerald-950"
              : item.type === "error"
                ? "border-red-300 bg-red-50 text-red-900"
                : "border-blue-300 bg-blue-50 text-blue-950";
          return (
            <div
              key={item.id}
              role="status"
              className={`pointer-events-auto flex items-start justify-between gap-3 rounded-xl border px-4 py-3 text-sm shadow-md ${style}`}
            >
              <span className="font-medium">{item.message}</span>
              <button
                type="button"
                aria-label="Tutup notifikasi"
                onClick={() => dismiss(item.id)}
                className="shrink-0 rounded px-1.5 text-xs font-semibold opacity-70 hover:opacity-100"
              >
                Tutup
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}
