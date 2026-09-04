import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";

// POST /api/places/autocomplete -- { input, sessionToken } -> sugerencias de
// direccion. Proxy server-side para nunca exponer GOOGLE_MAPS_API_KEY al
// navegador. Si la key no esta configurada todavia, responde
// { configured: false } en vez de un error -- el frontend usa eso para
// caer de vuelta a un input de texto normal, sin mostrar ningun error.
//
// Sin restriccion de pais: los proyectos hacen giras fuera de Chile (ej.
// Peru), asi que el autocompletado busca en cualquier pais.
export async function POST(request: NextRequest) {
  const { error } = await requireAuth();
  if (error) return error;

  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ configured: false, suggestions: [] });
  }

  const body = await request.json().catch(() => ({}));
  const { input, sessionToken } = body as { input?: string; sessionToken?: string };

  if (!input || input.trim().length < 3) {
    return NextResponse.json({ configured: true, suggestions: [] });
  }

  try {
    const res = await fetch("https://places.googleapis.com/v1/places:autocomplete", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
      },
      body: JSON.stringify({
        input,
        sessionToken,
        languageCode: "es",
      }),
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      console.error("[places/autocomplete] Google respondió error", res.status, errBody);
      return NextResponse.json({ configured: true, suggestions: [] });
    }

    const data = (await res.json()) as {
      suggestions?: Array<{
        placePrediction?: {
          placeId: string;
          text?: { text?: string };
          structuredFormat?: { mainText?: { text?: string }; secondaryText?: { text?: string } };
        };
      }>;
    };

    const suggestions = (data.suggestions ?? [])
      .map((s) => s.placePrediction)
      .filter((p): p is NonNullable<typeof p> => Boolean(p))
      .map((p) => ({
        placeId: p.placeId,
        text: p.text?.text ?? "",
        mainText: p.structuredFormat?.mainText?.text ?? p.text?.text ?? "",
        secondaryText: p.structuredFormat?.secondaryText?.text ?? "",
      }));

    return NextResponse.json({ configured: true, suggestions });
  } catch (err) {
    console.error("[places/autocomplete] fallo la llamada a Google", err);
    return NextResponse.json({ configured: true, suggestions: [] });
  }
}
