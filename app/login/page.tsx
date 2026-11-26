"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import PublicHeader from "@/components/layout/PublicHeader";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleLogin(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { error: loginError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (loginError) {
      setError(loginError.message);
      setLoading(false);
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  return (
    <div className="flex min-h-screen flex-col bg-[var(--background)]">
      <PublicHeader />

      <main className="flex flex-1 items-center justify-center px-4 py-10 sm:px-6">
        <div className="w-full max-w-md rounded-xl border bg-[var(--surface)] p-6 shadow-xs sm:p-8">
          <div className="mb-6 space-y-1.5">
            <h1 className="text-xl font-bold tracking-tight text-[var(--foreground)]">
              Masuk ke IT Service Desk
            </h1>
            <p className="text-sm text-[var(--muted)]">
              Gunakan akun karyawan, staf IT, GA, atau Administrator yang terdaftar.
            </p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label
                htmlFor="login-email"
                className="mb-1.5 block text-sm font-medium text-[var(--foreground)]"
              >
                Email
              </label>
              <input
                id="login-email"
                type="email"
                placeholder="nama@perusahaan.com"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full rounded-lg border px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label
                htmlFor="login-password"
                className="mb-1.5 block text-sm font-medium text-[var(--foreground)]"
              >
                Kata Sandi
              </label>
              <input
                id="login-password"
                type="password"
                placeholder="Masukkan kata sandi"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full rounded-lg border px-3 py-2 text-sm"
              />
            </div>

            {error && (
              <p
                role="alert"
                className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
              >
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="min-h-10 w-full rounded-lg bg-[#1d4ed8] py-2.5 text-sm font-semibold text-white hover:bg-[#1e40af] disabled:opacity-50"
            >
              {loading ? "Memverifikasi akun..." : "Masuk"}
            </button>
          </form>

          <div className="mt-6 border-t pt-4 text-center text-xs text-[var(--muted)]">
            Belum memiliki akun atau ingin melapor cepat?{" "}
            <Link href="/lapor" className="font-medium text-blue-700 hover:underline">
              Buat tiket publik
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
