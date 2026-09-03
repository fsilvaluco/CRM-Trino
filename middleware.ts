import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { checkRateLimit } from "@/lib/rate-limit";

// Rutas publicas/anonimas -- el vector de abuso mas directo (spam de leads,
// fuerza bruta de login). Limite mas estricto que el resto de /api/*.
const STRICT_RATE_LIMIT_PREFIXES = ["/api/webhook", "/api/auth"];

function clientIp(request: NextRequest): string {
  // Railway (y la mayoria de PaaS) llegan detras de un proxy -- el IP real
  // del cliente va en x-forwarded-for, no en request headers estandar.
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0].trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}

const PUBLIC_PATHS = new Set([
  "/login",
  "/forgot-password",
  "/reset-password",
  "/auth/activate",
  "/auth/callback",
  "/sin-acceso",
]);

const ADMIN_ONLY_PREFIXES = ["/settings/team", "/settings/project", "/settings/org"];

// Dominio corto opcional para los QR/Smartlinks (ej. "artspr.cl") -- si
// esta configurado y el Host de la request calza, "artspr.cl/abc123" se
// reescribe por dentro a "/q/abc123" o "/s/abc123" segun de cual de las dos
// tablas sea el slug (QR y Smartlink comparten el mismo namespace, ver
// src/lib/short-slug.ts). Sin la variable de entorno configurada, esto no
// hace nada -- artistpro.app sigue igual.
const SHORT_LINK_DOMAINS = (process.env.SHORT_LINK_DOMAINS ?? "")
  .split(",")
  .map((d) => d.trim().toLowerCase())
  .filter(Boolean);

async function resolveShortSlugPrefix(slug: string): Promise<"/q" | "/s" | null> {
  const supabase = createAdminClient();
  const [qr, smartlink] = await Promise.all([
    supabase.from("qr_codes").select("id").eq("slug", slug).maybeSingle(),
    supabase.from("smartlinks").select("id").eq("slug", slug).maybeSingle(),
  ]);
  if (qr.data) return "/q";
  if (smartlink.data) return "/s";
  return null;
}

export async function middleware(request: NextRequest) {
  const host = (request.headers.get("host") ?? "").toLowerCase().split(":")[0];
  if (SHORT_LINK_DOMAINS.includes(host)) {
    const url = request.nextUrl.clone();
    if (url.pathname === "/" || url.pathname === "") {
      url.hostname = process.env.NEXT_PUBLIC_SITE_URL
        ? new URL(process.env.NEXT_PUBLIC_SITE_URL).hostname
        : "artistpro.app";
      return NextResponse.redirect(url);
    }
    const slug = url.pathname.slice(1);
    // Default a /q si no se encuentra en ninguna tabla -- esa ruta ya sabe
    // manejar un slug inexistente (redirige a "/" en vez de tirar error).
    const prefix = (await resolveShortSlugPrefix(slug)) ?? "/q";
    url.pathname = `${prefix}${url.pathname}`;
    return NextResponse.rewrite(url);
  }

  const pathnameForRateLimit = request.nextUrl.pathname;
  if (pathnameForRateLimit.startsWith("/api")) {
    const isStrict = STRICT_RATE_LIMIT_PREFIXES.some((prefix) => pathnameForRateLimit.startsWith(prefix));
    const ip = clientIp(request);
    const result = await checkRateLimit(`${ip}:${isStrict ? "strict" : "default"}`, isStrict);
    if (!result.success) {
      return NextResponse.json(
        { success: false, error: "Demasiadas solicitudes. Intenta de nuevo en un momento." },
        {
          status: 429,
          headers: {
            "Retry-After": Math.max(0, Math.ceil((result.reset - Date.now()) / 1000)).toString(),
          },
        }
      );
    }
  }

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
