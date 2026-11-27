export type ExpectedBuildClass = "STATIC_COMPLETE" | "PPR_RESUMING";

export type PublicRouteSpec = {
  routePattern: string;
  samplePath: string;
  expectedBuildClass: ExpectedBuildClass;
  expectedMarkers: string[];
};

export type ProtectedRouteSpec = {
  routePattern: string;
  samplePath: string;
  expectedBuildClass: ExpectedBuildClass;
  requiredRole: "any" | "it_admin" | "ga_it_admin" | "admin";
  sidebarLabel: string;
};

export type ApiEndpointSpec = {
  method: "GET" | "POST" | "PATCH" | "DELETE";
  path: string;
  expectedUnauthStatus: 401 | 403;
  expectsNoStore: boolean;
  body?: Record<string, unknown>;
};

export const NONEXISTENT_UUID = "00000000-0000-4000-8000-000000000000";

export const PUBLIC_ROUTES: PublicRouteSpec[] = [
  {
    routePattern: "/",
    samplePath: "/",
    expectedBuildClass: "STATIC_COMPLETE",
    expectedMarkers: [
      "Layanan Bantuan IT Debito Jogja",
      "Target SLA Penanganan",
      "/lapor",
      "/login",
    ],
  },
  {
    routePattern: "/lapor",
    samplePath: "/lapor",
    expectedBuildClass: "STATIC_COMPLETE",
    expectedMarkers: ["Buat Tiket Layanan IT", 'href="/"'],
  },
  {
    routePattern: "/login",
    samplePath: "/login",
    expectedBuildClass: "STATIC_COMPLETE",
    expectedMarkers: [
      "Masuk ke IT Service Desk",
      "login-email",
      "login-password",
      "/lapor",
    ],
  },
  {
    routePattern: "/status/[token]",
    samplePath: `/status/${NONEXISTENT_UUID}`,
    expectedBuildClass: "PPR_RESUMING",
    expectedMarkers: [],
  },
];

export const PROTECTED_ROUTES: ProtectedRouteSpec[] = [
  {
    routePattern: "/dashboard",
    samplePath: "/dashboard",
    expectedBuildClass: "PPR_RESUMING",
    requiredRole: "any",
    sidebarLabel: "Dashboard",
  },
  {
    routePattern: "/antrian",
    samplePath: "/antrian",
    expectedBuildClass: "PPR_RESUMING",
    requiredRole: "it_admin",
    sidebarLabel: "Antrian IT",
  },
  {
    routePattern: "/tiket",
    samplePath: "/tiket",
    expectedBuildClass: "PPR_RESUMING",
    requiredRole: "any",
    sidebarLabel: "Tiket Aktif",
  },
  {
    routePattern: "/tiket/baru",
    samplePath: "/tiket/baru",
    expectedBuildClass: "PPR_RESUMING",
    requiredRole: "any",
    sidebarLabel: "Buat Tiket",
  },
  {
    routePattern: "/tiket/[id]",
    samplePath: `/tiket/${NONEXISTENT_UUID}`,
    expectedBuildClass: "PPR_RESUMING",
    requiredRole: "any",
    sidebarLabel: "Tiket Aktif",
  },
  {
    routePattern: "/aset",
    samplePath: "/aset",
    expectedBuildClass: "PPR_RESUMING",
    requiredRole: "ga_it_admin",
    sidebarLabel: "Inventaris Aset",
  },
  {
    routePattern: "/stok",
    samplePath: "/stok",
    expectedBuildClass: "PPR_RESUMING",
    requiredRole: "ga_it_admin",
    sidebarLabel: "Stok Sparepart",
  },
  {
    routePattern: "/wiki",
    samplePath: "/wiki",
    expectedBuildClass: "PPR_RESUMING",
    requiredRole: "any",
    sidebarLabel: "Wiki & SOP",
  },
  {
    routePattern: "/laporan",
    samplePath: "/laporan",
    expectedBuildClass: "PPR_RESUMING",
    requiredRole: "it_admin",
    sidebarLabel: "Laporan & SLA",
  },
  {
    routePattern: "/admin",
    samplePath: "/admin",
    expectedBuildClass: "PPR_RESUMING",
    requiredRole: "admin",
    sidebarLabel: "Ringkasan Admin",
  },
  {
    routePattern: "/admin/users",
    samplePath: "/admin/users",
    expectedBuildClass: "PPR_RESUMING",
    requiredRole: "admin",
    sidebarLabel: "Pengguna",
  },
  {
    routePattern: "/admin/sites",
    samplePath: "/admin/sites",
    expectedBuildClass: "PPR_RESUMING",
    requiredRole: "admin",
    sidebarLabel: "Site",
  },
  {
    routePattern: "/admin/kategori",
    samplePath: "/admin/kategori",
    expectedBuildClass: "PPR_RESUMING",
    requiredRole: "admin",
    sidebarLabel: "Kategori",
  },
  {
    routePattern: "/admin/jadwal",
    samplePath: "/admin/jadwal",
    expectedBuildClass: "PPR_RESUMING",
    requiredRole: "admin",
    sidebarLabel: "Jadwal",
  },
  {
    routePattern: "/admin/pengaturan",
    samplePath: "/admin/pengaturan",
    expectedBuildClass: "PPR_RESUMING",
    requiredRole: "admin",
    sidebarLabel: "Pengaturan",
  },
  {
    routePattern: "/admin/audit",
    samplePath: "/admin/audit",
    expectedBuildClass: "PPR_RESUMING",
    requiredRole: "admin",
    sidebarLabel: "Audit Log",
  },
];

export const ALL_20_ROUTE_PATTERNS: string[] = [
  ...PUBLIC_ROUTES.map((r) => r.routePattern),
  ...PROTECTED_ROUTES.map((r) => r.routePattern),
];

export const API_401_ENDPOINTS: ApiEndpointSpec[] = [
  {
    method: "GET",
    path: "/api/laporan/export",
    expectedUnauthStatus: 401,
    expectsNoStore: false,
  },
  {
    method: "GET",
    path: "/api/stok",
    expectedUnauthStatus: 401,
    expectsNoStore: false,
  },
  {
    method: "POST",
    path: "/api/stok",
    expectedUnauthStatus: 401,
    expectsNoStore: true,
    body: {},
  },
  {
    method: "POST",
    path: "/api/stok/adjust",
    expectedUnauthStatus: 401,
    expectsNoStore: true,
    body: {},
  },
  {
    method: "GET",
    path: "/api/wiki",
    expectedUnauthStatus: 401,
    expectsNoStore: true,
  },
  {
    method: "POST",
    path: "/api/wiki",
    expectedUnauthStatus: 401,
    expectsNoStore: true,
    body: {},
  },
  {
    method: "GET",
    path: "/api/aset/lookup?nomorAset=AST-0001",
    expectedUnauthStatus: 401,
    expectsNoStore: true,
  },
  {
    method: "GET",
    path: "/api/it/status",
    expectedUnauthStatus: 401,
    expectsNoStore: true,
  },
  {
    method: "PATCH",
    path: "/api/it/status",
    expectedUnauthStatus: 401,
    expectsNoStore: true,
    body: { status: "free" },
  },
  {
    method: "POST",
    path: "/api/telegram/link",
    expectedUnauthStatus: 401,
    expectsNoStore: true,
    body: {},
  },
  {
    method: "POST",
    path: "/api/telegram/sync",
    expectedUnauthStatus: 401,
    expectsNoStore: true,
  },
  {
    method: "POST",
    path: "/api/tiket/lampiran",
    expectedUnauthStatus: 401,
    expectsNoStore: true,
    body: {},
  },
  {
    method: "POST",
    path: "/api/tiket/remote-credentials",
    expectedUnauthStatus: 401,
    expectsNoStore: true,
    body: {},
  },
  {
    method: "POST",
    path: `/api/tiket/${NONEXISTENT_UUID}/approval`,
    expectedUnauthStatus: 401,
    expectsNoStore: true,
    body: { keputusan: "disetujui" },
  },
  {
    method: "POST",
    path: `/api/tiket/${NONEXISTENT_UUID}/merge`,
    expectedUnauthStatus: 401,
    expectsNoStore: true,
    body: { childIds: [] },
  },
  {
    method: "POST",
    path: `/api/tiket/${NONEXISTENT_UUID}/remote-reveal`,
    expectedUnauthStatus: 401,
    expectsNoStore: true,
  },
  {
    method: "POST",
    path: "/api/aset/import",
    expectedUnauthStatus: 401,
    expectsNoStore: true,
    body: { csv: "" },
  },
  {
    method: "POST",
    path: "/api/notif/tiket-baru",
    expectedUnauthStatus: 401,
    expectsNoStore: true,
    body: {},
  },
  {
    method: "POST",
    path: "/api/notifications/subscribe",
    expectedUnauthStatus: 401,
    expectsNoStore: true,
    body: {},
  },
  {
    method: "DELETE",
    path: "/api/notifications/subscribe",
    expectedUnauthStatus: 401,
    expectsNoStore: true,
  },
];

export const API_403_ENDPOINTS: ApiEndpointSpec[] = [
  {
    method: "GET",
    path: "/api/aset",
    expectedUnauthStatus: 403,
    expectsNoStore: true,
  },
  {
    method: "POST",
    path: "/api/aset",
    expectedUnauthStatus: 403,
    expectsNoStore: true,
    body: {},
  },
  {
    method: "PATCH",
    path: `/api/aset/${NONEXISTENT_UUID}`,
    expectedUnauthStatus: 403,
    expectsNoStore: true,
    body: {},
  },
  {
    method: "DELETE",
    path: `/api/aset/${NONEXISTENT_UUID}`,
    expectedUnauthStatus: 403,
    expectsNoStore: true,
  },
  {
    method: "PATCH",
    path: `/api/wiki/${NONEXISTENT_UUID}`,
    expectedUnauthStatus: 403,
    expectsNoStore: true,
    body: {},
  },
  {
    method: "DELETE",
    path: `/api/wiki/${NONEXISTENT_UUID}`,
    expectedUnauthStatus: 403,
    expectsNoStore: true,
  },
  {
    method: "GET",
    path: "/api/admin/settings",
    expectedUnauthStatus: 403,
    expectsNoStore: true,
  },
  {
    method: "PATCH",
    path: "/api/admin/settings",
    expectedUnauthStatus: 403,
    expectsNoStore: true,
    body: {},
  },
  {
    method: "GET",
    path: "/api/admin/sites",
    expectedUnauthStatus: 403,
    expectsNoStore: true,
  },
  {
    method: "POST",
    path: "/api/admin/sites",
    expectedUnauthStatus: 403,
    expectsNoStore: true,
    body: {},
  },
  {
    method: "PATCH",
    path: `/api/admin/sites/${NONEXISTENT_UUID}`,
    expectedUnauthStatus: 403,
    expectsNoStore: true,
    body: {},
  },
  {
    method: "POST",
    path: "/api/admin/kategori",
    expectedUnauthStatus: 403,
    expectsNoStore: true,
    body: {},
  },
  {
    method: "PATCH",
    path: `/api/admin/kategori/${NONEXISTENT_UUID}`,
    expectedUnauthStatus: 403,
    expectsNoStore: true,
    body: {},
  },
  {
    method: "PATCH",
    path: `/api/admin/users/${NONEXISTENT_UUID}`,
    expectedUnauthStatus: 403,
    expectsNoStore: true,
    body: {},
  },
  {
    method: "POST",
    path: "/api/admin/generate-jadwal",
    expectedUnauthStatus: 403,
    expectsNoStore: true,
    body: {},
  },
];

export const PROTECTED_API_ENDPOINTS: ApiEndpointSpec[] = [
  ...API_401_ENDPOINTS,
  ...API_403_ENDPOINTS,
];

/**
 * Markers that indicate actual protected business data or internal DB tables
 * leaked to an unauthenticated caller (distinct from static AppShell nav chrome).
 */
export const SENSITIVE_LEAK_MARKERS = [
  "admin_audit_logs",
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "ENCRYPTION_KEY",
  "TELEGRAM_BOT_TOKEN",
] as const;

export function hasStackTrace(body: string): boolean {
  return (
    /\n\s+at\s+/.test(body) ||
    body.includes("node_modules") ||
    body.includes("TypeError:") ||
    body.includes("ReferenceError:") ||
    body.includes("SyntaxError:")
  );
}

export function hasSensitiveDataLeak(body: string): boolean {
  return SENSITIVE_LEAK_MARKERS.some((marker) => body.includes(marker));
}

export function isUnauthenticatedRedirectToLogin(params: {
  status: number;
  location: string | null;
  body: string;
}): boolean {
  const { status, location, body } = params;
  if (
    (status === 307 || status === 302 || status === 303 || status === 308) &&
    location !== null &&
    /\/login(?:[?#]|$)/.test(location)
  ) {
    return true;
  }
  if (status === 200) {
    return (
      body.includes("/login") &&
      (body.includes("NEXT_REDIRECT") ||
        body.includes('http-equiv="refresh"') ||
        body.includes('replace("/login') ||
        body.includes("location.replace") ||
        body.includes("Masuk ke IT Service Desk"))
    );
  }
  return false;
}
