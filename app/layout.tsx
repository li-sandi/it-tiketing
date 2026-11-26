import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import ToastProvider from "@/components/ui/ToastProvider";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "IT Service Desk | Debito Jogja",
  description:
    "Sistem pelaporan gangguan, antrian SLA, inventaris aset, dan stok sparepart IT Debito Jogja.",
};

const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem('it-ticketing-theme');document.documentElement.dataset.theme=t==='dark'?'dark':'light';}catch(e){document.documentElement.dataset.theme='light';}})();`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="id"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="flex min-h-full flex-col">
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
