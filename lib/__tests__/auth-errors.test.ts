import { describe, expect, it } from "vitest";
import { mapSupabaseAuthError } from "@/lib/auth-errors";

describe("lib/auth-errors", () => {
  it("maps known Supabase Auth errors into clear Indonesian messages", () => {
    expect(mapSupabaseAuthError("Invalid login credentials")).toContain(
      "Email atau kata sandi salah",
    );
    expect(mapSupabaseAuthError("Email not confirmed")).toContain(
      "Email akun belum dikonfirmasi",
    );
    expect(mapSupabaseAuthError("Too many requests")).toContain(
      "Terlalu banyak percobaan masuk",
    );
    expect(mapSupabaseAuthError("Failed to fetch")).toContain(
      "Tidak dapat terhubung ke server autentikasi",
    );
    expect(mapSupabaseAuthError("User not found")).toContain(
      "Akun dengan email tersebut tidak ditemukan",
    );
    expect(mapSupabaseAuthError("User is banned")).toContain(
      "Akun Anda sedang dinonaktifkan",
    );
  });

  it("returns safe Indonesian fallback for empty or unknown error strings", () => {
    expect(mapSupabaseAuthError("")).toContain("Gagal masuk ke akun");
    expect(mapSupabaseAuthError(null)).toContain("Gagal masuk ke akun");
    expect(mapSupabaseAuthError("Unexpected OAuth state")).toContain(
      "Gagal masuk ke akun",
    );
  });
});
