"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import PublicHeader from "@/components/layout/PublicHeader";
import { mapSupabaseAuthError } from "@/lib/auth-errors";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleLogin(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const supabase = createClient();
      const { error: loginError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (loginError) {
        setError(mapSupabaseAuthError(loginError.message));
        setLoading(false);
        return;
      }

      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      setError(
        mapSupabaseAuthError(
          err instanceof Error ? err.message : "failed to fetch",
        ),
      );
      setLoading(false);
    }
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
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <label
                  htmlFor="login-password"
                  className="block text-sm font-medium text-[var(--foreground)]"
                >
                  Kata Sandi
                </label>
                <button
                  type="button"
                  aria-expanded={helpOpen}
                  aria-controls="login-admin-help"
                  onClick={() => setHelpOpen((prev) => !prev)}
                  className="text-xs font-medium text-blue-700 hover:underline"
                >
                  Lupa kata sandi?
                </button>
              </div>
              <div className="relative">
                <input
                  id="login-password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Masukkan kata sandi"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full rounded-lg border py-2 pl-3 pr-11 text-sm"
                />
                <button
                  type="button"
                  aria-label={
                    showPassword
                      ? "Sembunyikan kata sandi"
                      : "Lihat kata sandi"
                  }
                  aria-pressed={showPassword}
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute inset-y-0 right-0 flex items-center px-3 text-[var(--muted)] hover:text-[var(--foreground)]"
                >
                  {showPassword ? (
                    <svg
                      aria-hidden="true"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={1.75}
                      className="h-4 w-4"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M3.98 8.223A10.477 10.477 0 0 0 1.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.451 10.451 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.498a10.522 10.522 0 0 1-4.293 5.774M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 1 0-4.243-4.243m4.242 4.242L9.88 9.88"
                      />
                    </svg>
                  ) : (
                    <svg
                      aria-hidden="true"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={1.75}
                      className="h-4 w-4"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z"
                      />
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"
                      />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {helpOpen && (
              <div
                id="login-admin-help"
                className="space-y-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3.5 py-2.5 text-xs text-blue-950"
              >
                <p className="font-semibold">Panduan Reset Kata Sandi</p>
                <p>
                  Reset kata sandi dikelola oleh Administrator IT internal untuk
                  menjaga keamanan akun. Hubungi Administrator IT dengan
                  menyertakan Nama Lengkap dan Email terdaftar.
                </p>
                <p>
                  Untuk kendala mendesak tanpa menunggu reset akun, Anda tetap
                  dapat{" "}
                  <Link href="/lapor" className="font-semibold underline">
                    mengirim tiket melalui Portal Publik
                  </Link>
                  .
                </p>
              </div>
            )}

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
