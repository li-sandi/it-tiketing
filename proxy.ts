import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const SUPABASE_AUTH_COOKIE_RE = /^sb-.+-auth-token(?:\.(?:0|[1-9]\d*))?$/;

export function hasSupabaseAuthCookie(
  cookies: ReadonlyArray<{ name: string }>,
): boolean {
  return cookies.some(({ name }) => SUPABASE_AUTH_COOKIE_RE.test(name));
}

export async function proxy(request: NextRequest) {
  if (!hasSupabaseAuthCookie(request.cookies.getAll())) {
    return NextResponse.next({ request });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.next({ request });
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    supabaseUrl,
    supabaseAnonKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  await supabase.auth.getClaims();

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
