import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";

const PUBLIC_PATHS = new Set([
  "/login",
  "/forgot-password",
  "/reset-password",
  "/auth/activate",
  "/auth/callback",
  "/sin-acceso",
]);

const ADMIN_ONLY_PREFIXES = ["/settings/team", "/settings/project", "/settings/org"];

export async function middleware(request: NextRequest) {
  const response = NextResponse.next({ request });

  // Solo refresca la sesión — el redirect lo maneja cada página con requireAuth()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set(name, value);
            response.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  // Refresca el token si está por vencer (no hace redirect)
  await supabase.auth.getSession();

  const pathname = request.nextUrl.pathname;
  const isApiRoute = pathname.startsWith("/api");
  const isPublicRoute = PUBLIC_PATHS.has(pathname);

  // Pending users must complete activation before entering app pages.
  if (!isApiRoute && !isPublicRoute) {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      const { data: memberships } = await supabase
        .from("organization_members")
        .select("status")
        .eq("user_id", user.id)
        .limit(1);

      const hasPending = (memberships ?? []).some((m) => m.status === "pending");
      if (hasPending) {
        return NextResponse.redirect(new URL("/auth/activate", request.url));
      }

      const needsAdmin = ADMIN_ONLY_PREFIXES.some((prefix) => pathname.startsWith(prefix));
      if (needsAdmin) {
        const { data: roleRows, error: roleError } = await supabase
          .from("organization_members")
          .select("role")
          .eq("user_id", user.id)
          .in("role", ["owner", "admin"])
          .limit(1);

        if (roleError) {
          console.error("[middleware] role check failed", roleError.message);
          return NextResponse.redirect(new URL("/sin-acceso", request.url));
        }

        const isAdmin = (roleRows?.length ?? 0) > 0;
        if (!isAdmin) {
          return NextResponse.redirect(new URL("/sin-acceso", request.url));
        }
      }
    }
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
