// Configuración central del bot de Meta Ads (cuenta CP_LUR).
// Todo lo ajustable vive acá o en env vars, para no esparcir números mágicos
// por el motor de reglas. Los umbrales son EXACTAMENTE los guardrails pedidos.

export const GRAPH_BASE = "https://graph.facebook.com/v21.0";

/** Cuenta de ads. Default = CP_LUR; overridable por env para reusar el bot. */
export const AD_ACCOUNT_ID = process.env.META_AD_ACCOUNT_ID || "act_1734662137756560";

/** Token de system user con permiso ads_management/ads_read sobre la cuenta. */
export const META_SYSTEM_TOKEN = process.env.META_SYSTEM_TOKEN || "";

/** Slug del qr_code cuya campaña seguimos: de ahí sale el project_id (derivado)
 *  y los spotify_clicks (qr_scans por utm_content = ad_name). */
export const SPOTIFY_QR_SLUG = process.env.BOT_SPOTIFY_QR_SLUG || "lur-dopamina";

/** El bot SOLO mira campañas cuyo nombre empiece con uno de estos prefijos.
 *  Blindaje: aunque la cuenta tenga otras campañas, el bot no las toca. */
export const CAMPAIGN_PREFIXES = (
  process.env.BOT_CAMPAIGN_PREFIXES || "LUR_DOPA_TEST_TRAF,LUR_DOPA_ESCALA_TRAF"
).split(",").map((s) => s.trim()).filter(Boolean);

/** Interruptores. Arranca DESACTIVADO para escribir y en DRY-RUN por defecto:
 *  evalúa y registra/notifica, pero NO toca Meta hasta que se diga explícito. */
export const BOT_ENABLED = process.env.BOT_ENABLED === "true";
export const BOT_DRY_RUN = process.env.BOT_DRY_RUN !== "false"; // default true

/** Plan diario total en CLP (tope global). Si no está seteado, la regla de
 *  SUBIR presupuesto queda inactiva (no se puede garantizar el tope) -- se
 *  emite una alerta en su lugar. Es el comportamiento seguro por defecto. */
export const DAILY_BUDGET_CAP_CLP = process.env.BOT_DAILY_BUDGET_CAP_CLP
  ? Number(process.env.BOT_DAILY_BUDGET_CAP_CLP)
  : null;

/** outcomes de app_open_result que cuentan como "llegó a Spotify". Un scan sin
 *  outcome (beacon incompleto) NO cuenta -- señal más limpia para optimizar. */
export const REACHED_OUTCOMES = ["app_opened", "user_web", "tap_fallback_web"];

// ── Guardrails / umbrales (los pedidos, sin reinterpretar) ──────────────────
export const RULES = {
  /** Nunca actuar con menos de esto: piso de significancia estadística. */
  MIN_IMPRESSIONS: 1500,
  /** Máximo una acción (no-alerta) por anuncio cada 24h. */
  ACTION_COOLDOWN_HOURS: 24,
  /** Pausar si CPC > (esto × mediana del conjunto) en N lecturas seguidas. */
  CPC_PAUSE_MULTIPLE: 2,
  CPC_PAUSE_STREAK: 2,
  /** Hook rate = video_3s_views / impressions. Pausar si < esto Y CPC > mediana. */
  HOOK_RATE_MIN: 0.2,
  /** Escalar al ganador si su costo/SpotifyClick < (esto × el del otro) por N días. */
  WINNER_COST_RATIO: 0.7,
  WINNER_DAYS: 3,
  /** Mover este % del presupuesto por día del perdedor al ganador. */
  BUDGET_SHIFT_PCT: 0.2,
  /** Nunca subir un conjunto más que esto por día. */
  MAX_BUDGET_UP_PCT: 0.2,
  /** Alertar (sin actuar) si frecuencia supera esto. */
  FREQ_ALERT: 3,
  /** Alertar si SpotifyClick/clic (link click) cae bajo esto. */
  SPOTIFY_PER_CLICK_ALERT: 0.4,
} as const;
