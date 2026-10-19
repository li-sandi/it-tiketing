"use client";

import { useEffect } from "react";

type Theme = "light" | "dark";

function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  try {
    window.localStorage.setItem("it-ticketing-theme", theme);
  } catch (error) {
    console.warn("Preferensi tema tidak dapat disimpan:", error);
  }
}

export default function ThemeToggle() {
  useEffect(() => {
    try {
      const storedTheme = window.localStorage.getItem("it-ticketing-theme");
      document.documentElement.dataset.theme =
        storedTheme === "dark" ? "dark" : "light";
    } catch (error) {
      console.warn("Preferensi tema tidak dapat dimuat:", error);
      document.documentElement.dataset.theme = "light";
    }
  }, []);

  function toggleTheme() {
    const currentTheme: Theme =
      document.documentElement.dataset.theme === "dark" ? "dark" : "light";
    const nextTheme = currentTheme === "light" ? "dark" : "light";
    applyTheme(nextTheme);
  }

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label="Ganti antara mode terang dan gelap"
      title="Ganti antara mode terang dan gelap"
      className="fixed bottom-4 right-4 z-50 inline-flex min-h-11 items-center gap-2 rounded-full border bg-white px-4 py-2 text-sm font-medium text-gray-800 shadow-lg transition hover:bg-gray-100"
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        className="size-5"
      >
        <circle cx="12" cy="12" r="4" />
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42"
        />
      </svg>
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        className="size-5"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M20.2 15.4A8.4 8.4 0 0 1 8.6 3.8 8.5 8.5 0 1 0 20.2 15.4Z"
        />
      </svg>
      <span>Tema</span>
    </button>
  );
}
