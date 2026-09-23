import { NextResponse } from "next/server";

// CORS de las rutas publicas de testimonios. Solo se refleja el Origin
// cuando ya se valido contra el sitio (ver config.ts).

export function corsHeaders(origin: string | null, methods: string): Record<string, string> {
  if (!origin) return { Vary: "Origin" };
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": methods,
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

export function jsonCors(
  body: unknown,
  status: number,
  origin: string | null,
  methods = "POST, OPTIONS",
  extra: Record<string, string> = {},
) {
  return NextResponse.json(body, { status, headers: { ...corsHeaders(origin, methods), ...extra } });
}

export function htmlPage(title: string, message: string, status = 200, extraBody = ""): NextResponse {
  const html = `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>${title}</title>
<style>body{font-family:-apple-system,Inter,sans-serif;background:#F4F4F8;color:#14162B;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0;padding:16px}
.card{background:#fff;border-radius:16px;padding:32px 28px;max-width:420px;width:100%;box-shadow:0 1px 3px rgba(0,0,0,.08)}
h1{font-size:20px;margin:0 0 8px}p{font-size:15px;line-height:1.5;color:#14162Bcc;margin:0 0 8px}
button{margin-top:16px;padding:12px 24px;border:0;border-radius:100px;font-size:15px;font-weight:600;color:#fff;cursor:pointer}
.approve{background:#15803d}.reject{background:#b91c1c}</style></head>
<body><div class="card"><h1>${title}</h1><p>${message}</p>${extraBody}</div></body></html>`;
  return new NextResponse(html, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex",
      "Referrer-Policy": "no-referrer",
    },
  });
}
