import { NextRequest, NextResponse } from "next/server";
import { getLocaleSettings, saveLocaleSettings } from "@/lib/locale-server";
import { DEFAULT_LOCALE, COUNTRY_PRESETS, type LocaleSettings } from "@/lib/locale";
import { requireAuth } from "@/lib/supabase-server";

export async function GET() {
  const settings = getLocaleSettings();
  return NextResponse.json(settings);
}

export async function PUT(request: NextRequest) {
  // Config de pais/moneda/zona horaria global -- sin este check cualquiera
  // podia cambiarla sin sesion (CN-007, auditoria 3 sep 2026). Solo
  // owner/admin de la organizacion puede modificarla.
  const { isAdmin, error } = await requireAuth();
  if (error) return error;
  if (!isAdmin) {
    return NextResponse.json({ error: "Solo administradores pueden modificar esta configuración" }, { status: 403 });
  }

  let body: Partial<LocaleSettings>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const country = (body.country ?? DEFAULT_LOCALE.country).toUpperCase();
  const preset = COUNTRY_PRESETS[country];

  const settings: LocaleSettings = {
    country,
    currency: sanitizeCurrency(body.currency) ?? preset?.currency ?? DEFAULT_LOCALE.currency,
    currencyLocale: sanitizeLocale(body.currencyLocale) ?? preset?.currencyLocale ?? DEFAULT_LOCALE.currencyLocale,
    timezone: sanitizeTimezone(body.timezone) ?? preset?.timezone ?? DEFAULT_LOCALE.timezone,
    phonePrefix: sanitizePhonePrefix(body.phonePrefix) ?? preset?.phonePrefix ?? DEFAULT_LOCALE.phonePrefix,
  };

  saveLocaleSettings(settings);
  return NextResponse.json(settings);
}

function sanitizeCurrency(v?: string): string | null {
  if (!v) return null;
  const clean = v.trim().toUpperCase();
  return /^[A-Z]{3}$/.test(clean) ? clean : null;
}

function sanitizeLocale(v?: string): string | null {
  if (!v) return null;
  const clean = v.trim();
  return /^[a-z]{2,3}(-[A-Z]{2,4})?$/.test(clean) ? clean : null;
}

function sanitizeTimezone(v?: string): string | null {
  if (!v) return null;
  try {
    Intl.DateTimeFormat(undefined, { timeZone: v });
    return v;
  } catch {
    return null;
  }
}

function sanitizePhonePrefix(v?: string): string | null {
  if (!v) return null;
  const clean = v.trim();
  return /^\+\d{1,4}$/.test(clean) ? clean : null;
}
