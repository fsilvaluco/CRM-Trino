// Utilidades compartidas de las pruebas de punta a punta (Playwright).
//
// Todas las pruebas son de SOLO LECTURA: cada contexto del navegador pasa por
// `guardReadOnly`, que corta cualquier request que no sea GET/HEAD/OPTIONS
// (salvo el login de Supabase Auth) antes de que salga del navegador.
import {
  chromium,
  type Browser,
  type BrowserContext,
  type BrowserContextOptions,
  type Page,
} from "playwright";

export const BASE_URL = (process.env.E2E_BASE_URL || "http://localhost:3000").replace(/\/+$/, "");
export const EMAIL = process.env.E2E_EMAIL ?? "";
export const PASSWORD = process.env.E2E_PASSWORD ?? "";
/** Proyecto que el usuario de prueba debe ver en el selector. */
export const PROJECT_NAME = process.env.E2E_PROJECT_NAME || "Prueba 2";
/** Evento del proyecto de prueba cuya ficha se revisa. */
export const EVENT_ID = process.env.E2E_EVENT_ID || "48d6ff4f-c7a2-400a-b4de-156332f687b6";

/** Mensaje de omision (false si hay credenciales). node:test lo muestra como "# SKIP". */
export const SKIP_REASON: string | false =
  EMAIL && PASSWORD ? false : "E2E omitido: faltan las variables E2E_EMAIL y/o E2E_PASSWORD";

/** Tiempo de espera generoso: en `next dev` la primera visita compila la ruta. */
export const TIMEOUT = Number(process.env.E2E_TIMEOUT_MS || 60_000);

export function launchBrowser(): Promise<Browser> {
  // E2E_CHROMIUM_PATH permite usar un Chromium ya instalado cuando su version
  // no calza con la del paquete `playwright` (en CI no hace falta: se instala
  // con `npx playwright install --with-deps chromium`).
  const executablePath = process.env.E2E_CHROMIUM_PATH || undefined;
  return chromium.launch({ executablePath });
}

/** Requests de escritura que la guardia bloqueo (para diagnostico). */
export const blockedRequests: string[] = [];

const READ_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Bloquea toda request que pueda escribir. Se permite solo:
 *  - GET/HEAD/OPTIONS a cualquier destino;
 *  - POST a `/auth/v1/token` de Supabase (login con contrasena y refresh del
 *    token: es lo que usa `supabase.auth.signInWithPassword`, no pasa por
 *    /api de la app y no toca datos del CRM);
 *  - endpoints internos de `next dev` (`/__nextjs*`), que no tocan la base.
 * Todo lo demas (POST/PUT/PATCH/DELETE a /api/**, a /rest/v1 de Supabase,
 * Server Actions, etc.) responde 403 sin salir del navegador.
 */
export async function guardReadOnly(context: BrowserContext): Promise<void> {
  await context.route("**/*", async (route) => {
    const req = route.request();
    const method = req.method().toUpperCase();
    if (READ_METHODS.has(method)) return route.fallback();
    const url = new URL(req.url());
    if (url.pathname.endsWith("/auth/v1/token")) return route.fallback();
    if (url.pathname.startsWith("/__nextjs")) return route.fallback();
    blockedRequests.push(`${method} ${url.origin === BASE_URL ? "" : url.origin}${url.pathname}`);
    return route.fulfill({
      status: 403,
      contentType: "application/json",
      body: JSON.stringify({ error: "Bloqueado por las pruebas e2e (solo lectura)" }),
    });
  });
}

/** Contexto nuevo con la guardia de solo lectura ya instalada. */
export async function newGuardedContext(
  browser: Browser,
  options: BrowserContextOptions = {}
): Promise<BrowserContext> {
  // serviceWorkers "block": asi ninguna request escapa a context.route().
  const context = await browser.newContext({ baseURL: BASE_URL, serviceWorkers: "block", ...options });
  context.setDefaultTimeout(TIMEOUT);
  context.setDefaultNavigationTimeout(TIMEOUT);
  await guardReadOnly(context);
  return context;
}

/** Pagina que acumula los errores de JavaScript no capturados (`pageerror`). */
export async function trackedPage(context: BrowserContext): Promise<{ page: Page; errors: string[] }> {
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(`${page.url()}: ${err.message}`));
  return { page, errors };
}

/** Inicia sesion por la pantalla de login y espera llegar a "/". */
export async function login(page: Page): Promise<void> {
  await page.goto("/login");
  await page.locator("#email").fill(EMAIL);
  await page.locator("#password").fill(PASSWORD);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL((url) => url.pathname === "/", { timeout: TIMEOUT });
}

/** Espera a que la pagina termine de cargar datos (sin requests pendientes). */
export async function settle(page: Page): Promise<void> {
  await page.waitForLoadState("networkidle", { timeout: TIMEOUT }).catch(() => {});
}
