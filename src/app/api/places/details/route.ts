import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";

interface AddressComponent {
  longText?: string;
  shortText?: string;
  types: string[];
}

function findComponent(components: AddressComponent[], ...types: string[]): string | null {
  for (const type of types) {
    const match = components.find((c) => c.types?.includes(type));
    if (match) return match.longText ?? match.shortText ?? null;
  }
  return null;
}

// POST /api/places/details -- { placeId, sessionToken } -> direccion
// formateada + comuna/region/pais + lat/lng, para autocompletar el
// formulario de Venue. Usa solo campos del tier "Essentials" (el mas
// barato) -- no pedimos horarios, fotos, rating, etc. porque no los
// necesitamos y cada campo extra sube el SKU de facturación.
export async function POST(request: NextRequest) {
  const { error } = await requireAuth();
  if (error) return error;

  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ configured: false }, { status: 200 });
  }

  const body = await request.json().catch(() => ({}));
  const { placeId, sessionToken } = body as { placeId?: string; sessionToken?: string };

  if (!placeId) {
    return NextResponse.json({ error: "placeId requerido" }, { status: 400 });
  }

  try {
    const url = new URL(`https://places.googleapis.com/v1/places/${placeId}`);
    if (sessionToken) url.searchParams.set("sessionToken", sessionToken);

    const res = await fetch(url.toString(), {
      headers: {
        "X-Goog-Api-Key": apiKey,
        // Solo Essentials: id, formattedAddress, addressComponents,
        // location. Cualquier otro campo (rating, currentOpeningHours,
        // etc.) mete la request en un SKU mas caro.
        "X-Goog-FieldMask": "id,formattedAddress,addressComponents,location",
      },
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      console.error("[places/details] Google respondió error", res.status, errBody);
      return NextResponse.json({ error: "No se pudo obtener el detalle del lugar" }, { status: 502 });
    }

    const data = await res.json();
    const components: AddressComponent[] = data.addressComponents ?? [];

    const comuna = findComponent(components, "administrative_area_level_3", "locality", "sublocality_level_1");
    const region = findComponent(components, "administrative_area_level_1");
    const country = findComponent(components, "country");

    return NextResponse.json({
      configured: true,
      address: data.formattedAddress ?? "",
      comuna,
      region,
      country,
      latitude: data.location?.latitude ?? null,
      longitude: data.location?.longitude ?? null,
    });
  } catch (err) {
    console.error("[places/details] fallo la llamada a Google", err);
    return NextResponse.json({ error: "No se pudo obtener el detalle del lugar" }, { status: 502 });
  }
}
