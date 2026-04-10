// Shared locale types and pure functions — importable from server and client.

export interface LocaleSettings {
  country: string;        // ISO 3166-1 alpha-2 e.g. "MX"
  currency: string;       // ISO 4217 e.g. "MXN"
  currencyLocale: string; // BCP 47 for Intl.NumberFormat e.g. "es-MX"
  timezone: string;       // IANA e.g. "America/Mexico_City"
  phonePrefix: string;    // E.164 prefix e.g. "+52"
}

export interface CountryPreset extends LocaleSettings {
  label: string;
}

export const DEFAULT_LOCALE: LocaleSettings = {
  country: "MX",
  currency: "MXN",
  currencyLocale: "es-MX",
  timezone: "America/Mexico_City",
  phonePrefix: "+52",
};

// ── Country presets ────────────────────────────────────────────────────────────
export const COUNTRY_PRESETS: Record<string, CountryPreset> = {
  // América Latina
  AR: { label: "Argentina",             country: "AR", currency: "ARS", currencyLocale: "es-AR", timezone: "America/Argentina/Buenos_Aires", phonePrefix: "+54"  },
  BO: { label: "Bolivia",               country: "BO", currency: "BOB", currencyLocale: "es-BO", timezone: "America/La_Paz",                 phonePrefix: "+591" },
  BR: { label: "Brasil",                country: "BR", currency: "BRL", currencyLocale: "pt-BR", timezone: "America/Sao_Paulo",              phonePrefix: "+55"  },
  CL: { label: "Chile",                 country: "CL", currency: "CLP", currencyLocale: "es-CL", timezone: "America/Santiago",               phonePrefix: "+56"  },
  CO: { label: "Colombia",              country: "CO", currency: "COP", currencyLocale: "es-CO", timezone: "America/Bogota",                 phonePrefix: "+57"  },
  CR: { label: "Costa Rica",            country: "CR", currency: "CRC", currencyLocale: "es-CR", timezone: "America/Costa_Rica",             phonePrefix: "+506" },
  DO: { label: "República Dominicana",  country: "DO", currency: "DOP", currencyLocale: "es-DO", timezone: "America/Santo_Domingo",          phonePrefix: "+1"   },
  EC: { label: "Ecuador",               country: "EC", currency: "USD", currencyLocale: "es-EC", timezone: "America/Guayaquil",              phonePrefix: "+593" },
  SV: { label: "El Salvador",           country: "SV", currency: "USD", currencyLocale: "es-SV", timezone: "America/El_Salvador",            phonePrefix: "+503" },
  GT: { label: "Guatemala",             country: "GT", currency: "GTQ", currencyLocale: "es-GT", timezone: "America/Guatemala",              phonePrefix: "+502" },
  HN: { label: "Honduras",              country: "HN", currency: "HNL", currencyLocale: "es-HN", timezone: "America/Tegucigalpa",            phonePrefix: "+504" },
  MX: { label: "México",                country: "MX", currency: "MXN", currencyLocale: "es-MX", timezone: "America/Mexico_City",            phonePrefix: "+52"  },
  NI: { label: "Nicaragua",             country: "NI", currency: "NIO", currencyLocale: "es-NI", timezone: "America/Managua",                phonePrefix: "+505" },
  PA: { label: "Panamá",                country: "PA", currency: "USD", currencyLocale: "es-PA", timezone: "America/Panama",                 phonePrefix: "+507" },
  PY: { label: "Paraguay",              country: "PY", currency: "PYG", currencyLocale: "es-PY", timezone: "America/Asuncion",               phonePrefix: "+595" },
  PE: { label: "Perú",                  country: "PE", currency: "PEN", currencyLocale: "es-PE", timezone: "America/Lima",                   phonePrefix: "+51"  },
  PR: { label: "Puerto Rico",           country: "PR", currency: "USD", currencyLocale: "es-PR", timezone: "America/Puerto_Rico",            phonePrefix: "+1"   },
  UY: { label: "Uruguay",               country: "UY", currency: "UYU", currencyLocale: "es-UY", timezone: "America/Montevideo",             phonePrefix: "+598" },
  VE: { label: "Venezuela",             country: "VE", currency: "VES", currencyLocale: "es-VE", timezone: "America/Caracas",                phonePrefix: "+58"  },
  CU: { label: "Cuba",                  country: "CU", currency: "CUP", currencyLocale: "es-CU", timezone: "America/Havana",                 phonePrefix: "+53"  },
  // América del Norte
  CA: { label: "Canadá",                country: "CA", currency: "CAD", currencyLocale: "en-CA", timezone: "America/Toronto",                phonePrefix: "+1"   },
  US: { label: "Estados Unidos",        country: "US", currency: "USD", currencyLocale: "en-US", timezone: "America/New_York",               phonePrefix: "+1"   },
  // Europa
  DE: { label: "Alemania",              country: "DE", currency: "EUR", currencyLocale: "de-DE", timezone: "Europe/Berlin",                  phonePrefix: "+49"  },
  ES: { label: "España",                country: "ES", currency: "EUR", currencyLocale: "es-ES", timezone: "Europe/Madrid",                  phonePrefix: "+34"  },
  FR: { label: "Francia",               country: "FR", currency: "EUR", currencyLocale: "fr-FR", timezone: "Europe/Paris",                   phonePrefix: "+33"  },
  GB: { label: "Reino Unido",           country: "GB", currency: "GBP", currencyLocale: "en-GB", timezone: "Europe/London",                  phonePrefix: "+44"  },
  IT: { label: "Italia",                country: "IT", currency: "EUR", currencyLocale: "it-IT", timezone: "Europe/Rome",                    phonePrefix: "+39"  },
  NL: { label: "Países Bajos",          country: "NL", currency: "EUR", currencyLocale: "nl-NL", timezone: "Europe/Amsterdam",               phonePrefix: "+31"  },
  PL: { label: "Polonia",               country: "PL", currency: "PLN", currencyLocale: "pl-PL", timezone: "Europe/Warsaw",                  phonePrefix: "+48"  },
  PT: { label: "Portugal",              country: "PT", currency: "EUR", currencyLocale: "pt-PT", timezone: "Europe/Lisbon",                  phonePrefix: "+351" },
  RU: { label: "Rusia",                 country: "RU", currency: "RUB", currencyLocale: "ru-RU", timezone: "Europe/Moscow",                  phonePrefix: "+7"   },
  CH: { label: "Suiza",                 country: "CH", currency: "CHF", currencyLocale: "de-CH", timezone: "Europe/Zurich",                  phonePrefix: "+41"  },
  // Asia / Oceanía
  AU: { label: "Australia",             country: "AU", currency: "AUD", currencyLocale: "en-AU", timezone: "Australia/Sydney",               phonePrefix: "+61"  },
  CN: { label: "China",                 country: "CN", currency: "CNY", currencyLocale: "zh-CN", timezone: "Asia/Shanghai",                  phonePrefix: "+86"  },
  AE: { label: "Emiratos Árabes Unidos",country: "AE", currency: "AED", currencyLocale: "ar-AE", timezone: "Asia/Dubai",                     phonePrefix: "+971" },
  IN: { label: "India",                 country: "IN", currency: "INR", currencyLocale: "en-IN", timezone: "Asia/Kolkata",                   phonePrefix: "+91"  },
  JP: { label: "Japón",                 country: "JP", currency: "JPY", currencyLocale: "ja-JP", timezone: "Asia/Tokyo",                     phonePrefix: "+81"  },
  SG: { label: "Singapur",              country: "SG", currency: "SGD", currencyLocale: "en-SG", timezone: "Asia/Singapore",                 phonePrefix: "+65"  },
  KR: { label: "Corea del Sur",         country: "KR", currency: "KRW", currencyLocale: "ko-KR", timezone: "Asia/Seoul",                     phonePrefix: "+82"  },
  // África
  EG: { label: "Egipto",                country: "EG", currency: "EGP", currencyLocale: "ar-EG", timezone: "Africa/Cairo",                   phonePrefix: "+20"  },
  NG: { label: "Nigeria",               country: "NG", currency: "NGN", currencyLocale: "en-NG", timezone: "Africa/Lagos",                   phonePrefix: "+234" },
  ZA: { label: "Sudáfrica",             country: "ZA", currency: "ZAR", currencyLocale: "en-ZA", timezone: "Africa/Johannesburg",            phonePrefix: "+27"  },
  MA: { label: "Marruecos",             country: "MA", currency: "MAD", currencyLocale: "ar-MA", timezone: "Africa/Casablanca",              phonePrefix: "+212" },
};

export const SORTED_COUNTRIES = Object.values(COUNTRY_PRESETS).sort((a, b) =>
  a.label.localeCompare(b.label, "es")
);

// ── Pure format functions ─────────────────────────────────────────────────────

function toDateObj(date: Date | number): Date {
  if (date instanceof Date) return date;
  return new Date(date < 1e12 ? date * 1000 : date);
}

export function formatCurrencyWith(cents: number, settings: LocaleSettings): string {
  try {
    return new Intl.NumberFormat(settings.currencyLocale, {
      style: "currency",
      currency: settings.currency,
    }).format(cents / 100);
  } catch {
    // Fallback if locale/currency is invalid
    return `${settings.currency} ${(cents / 100).toFixed(2)}`;
  }
}

export function formatDateWith(date: Date | number | null, settings: LocaleSettings): string {
  if (!date) return "-";
  const d = toDateObj(date);
  try {
    return new Intl.DateTimeFormat(settings.currencyLocale, {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: settings.timezone,
    }).format(d);
  } catch {
    return d.toLocaleDateString();
  }
}

export function formatRelativeDateWith(date: Date | number, settings: LocaleSettings): string {
  const d = toDateObj(date);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return "Hoy";
  if (diffDays === 1) return "Ayer";
  if (diffDays < 7) return `Hace ${diffDays} días`;
  if (diffDays < 30) return `Hace ${Math.floor(diffDays / 7)} semanas`;
  return formatDateWith(date, settings);
}
