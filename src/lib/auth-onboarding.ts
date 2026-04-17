import type { EmailOtpType } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

interface SessionFromUrlOptions {
  allowedTypes: EmailOtpType[];
}

interface SessionFromUrlResult {
  ok: boolean;
  type: EmailOtpType | null;
  error: string | null;
}

function parseHashParams(): URLSearchParams {
  if (typeof window === "undefined") return new URLSearchParams();
  const hash = window.location.hash.startsWith("#")
    ? window.location.hash.slice(1)
    : window.location.hash;
  return new URLSearchParams(hash);
}

export async function establishSessionFromUrl(
  options: SessionFromUrlOptions
): Promise<SessionFromUrlResult> {
  const search = new URLSearchParams(window.location.search);
  const rawType = search.get("type");
  const tokenHash = search.get("token_hash");

  if (rawType && tokenHash) {
    const type = rawType as EmailOtpType;
    if (!options.allowedTypes.includes(type)) {
      return { ok: false, type, error: "El tipo de enlace no es válido para esta página." };
    }

    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (error) {
      return { ok: false, type, error: error.message };
    }
    return { ok: true, type, error: null };
  }

  const hash = parseHashParams();
  const accessToken = hash.get("access_token");
  const refreshToken = hash.get("refresh_token");
  const hashType = hash.get("type") as EmailOtpType | null;

  if (accessToken && refreshToken) {
    if (hashType && !options.allowedTypes.includes(hashType)) {
      return { ok: false, type: hashType, error: "El tipo de enlace no es válido para esta página." };
    }

    const { error } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });

    if (error) {
      return { ok: false, type: hashType, error: error.message };
    }

    return { ok: true, type: hashType, error: null };
  }

  return {
    ok: false,
    type: null,
    error: "No se encontró un enlace de autenticación válido. Solicita un nuevo correo.",
  };
}