import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

const ALLOWED_FLOWS = new Set(["invite", "recovery"]);

function normalizeNextPath(raw: string | null): string {
  if (!raw || !raw.startsWith("/")) return "/";
  if (raw.startsWith("//")) return "/";
  return raw;
}

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const flow = requestUrl.searchParams.get("flow");
  const nextPath = normalizeNextPath(requestUrl.searchParams.get("next"));

  let finalPath = nextPath;
  if (flow && ALLOWED_FLOWS.has(flow)) {
    const separator = finalPath.includes("?") ? "&" : "?";
    finalPath = `${finalPath}${separator}flow=${encodeURIComponent(flow)}`;
  }

  let response = NextResponse.redirect(new URL(finalPath, requestUrl.origin));

  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      response = NextResponse.redirect(new URL("/login?auth=expired", requestUrl.origin));
    }
  }

  return response;
}