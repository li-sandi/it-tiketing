import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { getClaimsMock, getUserMock, createServerClientMock } = vi.hoisted(
  () => {
    const getClaimsMock = vi.fn();
    const getUserMock = vi.fn();
    const createServerClientMock = vi.fn();
    return { getClaimsMock, getUserMock, createServerClientMock };
  },
);

vi.mock("@supabase/ssr", () => ({
  createServerClient: createServerClientMock,
}));

import { config, hasSupabaseAuthCookie, proxy } from "@/proxy";

describe("proxy.ts auth cookie bypass & lightweight verification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
  });

  it("detects single and chunked Supabase auth-token cookies accurately", () => {
    expect(hasSupabaseAuthCookie([])).toBe(false);
    expect(
      hasSupabaseAuthCookie([
        { name: "it-ticketing-theme" },
        { name: "sb-xyz-auth-token-code-verifier" },
        { name: "sb-xyz-auth-token." },
        { name: "sb-xyz-auth-token.01" },
        { name: "sb--auth-token" },
      ]),
    ).toBe(false);

    expect(hasSupabaseAuthCookie([{ name: "sb-abc123-auth-token" }])).toBe(true);
    expect(hasSupabaseAuthCookie([{ name: "sb-abc123-auth-token.0" }])).toBe(
      true,
    );
    expect(hasSupabaseAuthCookie([{ name: "sb-abc123-auth-token.12" }])).toBe(
      true,
    );
  });

  it("bypasses Supabase client creation when no auth-token cookie exists", async () => {
    const request = new NextRequest("http://localhost:3000/lapor", {
      headers: {
        cookie:
          "it-ticketing-theme=dark; sb-proj-auth-token-code-verifier=verifier",
      },
    });

    const response = await proxy(request);

    expect(response.status).toBe(200);
    expect(createServerClientMock).not.toHaveBeenCalled();
    expect(getClaimsMock).not.toHaveBeenCalled();
    expect(getUserMock).not.toHaveBeenCalled();
  });

  it("calls getClaims() (not getUser()) and propagates refreshed cookies when auth cookie exists", async () => {
    createServerClientMock.mockImplementation(
      (
        _url: string,
        _key: string,
        options: {
          cookies: {
            getAll: () => Array<{ name: string; value: string }>;
            setAll: (
              cookiesToSet: Array<{
                name: string;
                value: string;
                options?: Record<string, unknown>;
              }>,
            ) => void;
          };
        },
      ) => {
        getClaimsMock.mockImplementationOnce(async () => {
          options.cookies.setAll([
            {
              name: "sb-proj-auth-token",
              value: "refreshed-jwt",
              options: { path: "/", httpOnly: true },
            },
          ]);
          return { data: { claims: { sub: "user-1" } }, error: null };
        });

        return {
          auth: {
            getClaims: getClaimsMock,
            getUser: getUserMock,
          },
        };
      },
    );

    const request = new NextRequest("http://localhost:3000/dashboard", {
      headers: {
        cookie: "sb-proj-auth-token=stale-jwt",
      },
    });

    const response = await proxy(request);

    expect(createServerClientMock).toHaveBeenCalledTimes(1);
    expect(getClaimsMock).toHaveBeenCalledTimes(1);
    expect(getUserMock).not.toHaveBeenCalled();
    expect(response.cookies.get("sb-proj-auth-token")?.value).toBe(
      "refreshed-jwt",
    );
  });

  it("preserves the static-asset exclusion matcher", () => {
    expect(config.matcher).toEqual([
      "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
    ]);
  });
});
