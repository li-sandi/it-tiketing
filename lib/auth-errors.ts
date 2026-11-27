export function mapSupabaseAuthError(message: string | null | undefined): string {
  const normalized = (message ?? "").trim().toLowerCase();
  if (!normalized) {
    return "Gagal masuk ke akun. Periksa kembali data masuk Anda atau hubungi Administrator IT.";
  }

  if (
    normalized.includes("invalid login credentials") ||
    normalized.includes("invalid_credentials") ||
    normalized.includes("invalid email or password")
  ) {
    return "Email atau kata sandi salah. Periksa kembali email dan kata sandi Anda.";
  }

  if (normalized.includes("email not confirmed")) {
    return "Email akun belum dikonfirmasi. Hubungi Administrator IT untuk aktivasi akun.";
  }

  if (
    normalized.includes("too many requests") ||
    normalized.includes("rate limit") ||
    normalized.includes("over_request_rate_limit")
  ) {
    return "Terlalu banyak percobaan masuk. Tunggu beberapa menit sebelum mencoba lagi.";
  }

  if (
    normalized.includes("failed to fetch") ||
    normalized.includes("network") ||
    normalized.includes("timeout") ||
    normalized.includes("fetch failed")
  ) {
    return "Tidak dapat terhubung ke server autentikasi. Periksa koneksi internet Anda lalu coba lagi.";
  }

  if (normalized.includes("user not found")) {
    return "Akun dengan email tersebut tidak ditemukan.";
  }

  if (normalized.includes("disabled") || normalized.includes("banned")) {
    return "Akun Anda sedang dinonaktifkan. Silakan hubungi Administrator IT.";
  }

  return "Gagal masuk ke akun. Periksa kembali data masuk Anda atau hubungi Administrator IT.";
}
