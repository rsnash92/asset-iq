import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { publicSupabaseEnv } from "./env";

const PUBLIC_PATHS = ["/login", "/auth"];

/**
 * Refresh the Supabase session cookie on every request and bounce signed-out
 * browsers to /login. API routes are excluded here: they authenticate
 * themselves (cookie OR bearer token) and return 401 JSON instead of redirects.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const { url, anonKey } = publicSupabaseEnv();
  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (toSet) => {
        for (const { name, value } of toSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of toSet) response.cookies.set(name, value, options);
      },
    },
  });

  const { data } = await supabase.auth.getClaims();
  const path = request.nextUrl.pathname;
  const isPublic = PUBLIC_PATHS.some((p) => path === p || path.startsWith(`${p}/`));

  if (!data?.claims && !isPublic) {
    const to = request.nextUrl.clone();
    to.pathname = "/login";
    to.search = path === "/" ? "" : `?next=${encodeURIComponent(path)}`;
    return NextResponse.redirect(to);
  }
  if (data?.claims && path === "/login") {
    const to = request.nextUrl.clone();
    to.pathname = "/library";
    to.search = "";
    return NextResponse.redirect(to);
  }
  return response;
}
