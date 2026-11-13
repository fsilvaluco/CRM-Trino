// Pruebas de punta a punta de SOLO LECTURA contra una instancia real de la app.
//   E2E_BASE_URL=http://localhost:3000 E2E_EMAIL=... E2E_PASSWORD=... npm run test:e2e
// Sin credenciales todas quedan omitidas (no fallan). Ver e2e/README.md.
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { Browser, BrowserContext, Page } from "playwright";
import {
  EVENT_ID,
  PROJECT_NAME,
  SKIP_REASON,
  blockedRequests,
  launchBrowser,
  login,
  newGuardedContext,
  settle,
  trackedPage,
} from "./support";

if (SKIP_REASON) console.log(SKIP_REASON);

const DESKTOP = { width: 1280, height: 900 };
const MOBILE = { width: 375, height: 812 };

// Etiquetas legibles del selector de orden de /tasks (SORT_LABELS en TaskFilterBar).
const SORT_LABELS = [
  "Por defecto",
  "Nombre A → Z",
  "Nombre Z → A",
  "Vencimiento próximo",
  "Vencimiento lejano",
  "Más antiguas",
  "Más nuevas",
  "Por prioridad",
  "Por estado",
];

/**
 * Corre en el navegador: botones/links del <main> que terminan mas alla del
 * ancho de la ventana, salvo los que viven dentro de un contenedor con scroll
 * horizontal (ahi es esperable que sobresalgan). Va como string porque tsx
 * (esbuild) envuelve las funciones con un helper `__name` que no existe en
 * la pagina.
 */
const findOffscreenControls = `(() => {
  const main = document.getElementById("contenido-principal");
  if (!main) return ["no hay <main id=contenido-principal>"];
  const vw = document.documentElement.clientWidth;
  const out = [];
  for (const el of main.querySelectorAll("button, a[href], [role=button]")) {
    const r = el.getBoundingClientRect();
    // Invisibles o solo para lector de pantalla (sr-only mide 1px).
    if (r.width <= 1 || r.height <= 1) continue;
    if (getComputedStyle(el).visibility === "hidden") continue;
    let scroller = false;
    for (let p = el.parentElement; p && p !== main; p = p.parentElement) {
      const ox = getComputedStyle(p).overflowX;
      if (ox === "auto" || ox === "scroll") { scroller = true; break; }
    }
    if (scroller) continue;
    if (r.right > vw + 1) {
      const name = (el.getAttribute("aria-label") || el.textContent || el.tagName).trim().slice(0, 50);
      out.push('"' + name + '" termina en x=' + Math.round(r.right) + " (ancho " + vw + ")");
    }
  }
  return out;
})()`;

const EVENT_SECTIONS =["summary", "contacts", "setlist", "timing", "tickets", "costs", "riders"];

describe("App (solo lectura)", { skip: SKIP_REASON, concurrency: false }, () => {
  let browser: Browser;
  /** Sesion obtenida por la prueba de login, reutilizada por las demas. */
  let storageState: Awaited<ReturnType<BrowserContext["storageState"]>> | undefined;
  const contexts: BrowserContext[] = [];

  before(async () => {
    browser = await launchBrowser();
  });

  after(async () => {
    for (const c of contexts) await c.close().catch(() => {});
    await browser?.close();
    if (blockedRequests.length > 0) {
      const unique = [...new Set(blockedRequests)];
      console.log(`Requests de escritura bloqueadas por la guardia (${unique.length} distintas):`);
      for (const r of unique) console.log(`  ${r}`);
    }
  });

  /** Pagina con sesion iniciada y registro de errores de JavaScript. */
  async function loggedPage(viewport = DESKTOP): Promise<{ page: Page; errors: string[] }> {
    assert.ok(storageState, "requiere que la prueba de login haya pasado");
    const context = await newGuardedContext(browser, { storageState, viewport });
    contexts.push(context);
    return trackedPage(context);
  }

  function assertNoPageErrors(errors: string[]) {
    assert.deepEqual(errors, [], `errores de JavaScript en la pagina:\n${errors.join("\n")}`);
  }

  async function assertNoLoadError(page: Page) {
    const n = await page.getByText("No pudimos cargar la información").count();
    assert.equal(n, 0, `la pagina ${page.url()} muestra el estado de error de carga`);
  }

  test("login: llega a '/' y ve el selector de proyecto", async () => {
    const context = await newGuardedContext(browser, { viewport: DESKTOP });
    contexts.push(context);
    const { page, errors } = await trackedPage(context);
    await login(page);
    assert.equal(new URL(page.url()).pathname, "/");
    await page.locator("header").getByText(PROJECT_NAME, { exact: true }).first().waitFor();
    storageState = await context.storageState();
    assertNoPageErrors(errors);
  });

  test("/crm: kanban con columnas y menu 'Mover' accesible", async () => {
    const { page, errors } = await loggedPage();
    await page.goto("/crm");
    const columns = page.locator("main [role=tabpanel] h3");
    await columns.first().waitFor();
    await settle(page);
    await assertNoLoadError(page);
    assert.ok((await columns.count()) >= 1, "deberia haber al menos una columna");

    const moveButtons = page.locator('main button[aria-label^="Mover "]');
    const count = await moveButtons.count();
    assert.ok(count >= 1, "las tarjetas deberian tener un boton 'Mover ...'");

    const trigger = moveButtons.first();
    await trigger.click();
    const menu = page.getByRole("menu");
    await menu.waitFor();
    assert.ok((await menu.getByRole("menuitem").count()) >= 1, "el menu deberia tener opciones");
    await page.keyboard.press("Escape");
    await menu.waitFor({ state: "hidden" });
    assertNoPageErrors(errors);
  });

  test("/tasks: el selector de orden muestra una etiqueta legible", async () => {
    const { page, errors } = await loggedPage();
    await page.goto("/tasks");
    const combos = page.locator('main [role="combobox"]');
    await combos.first().waitFor();
    await settle(page);
    await assertNoLoadError(page);
    const texts = (await combos.allInnerTexts()).map((t) => t.trim());
    assert.ok(
      texts.some((t) => SORT_LABELS.includes(t)),
      `ningun selector muestra una etiqueta de orden conocida: ${JSON.stringify(texts)}`
    );
    for (const t of texts) {
      assert.doesNotMatch(t, /^[a-z]+(_[a-z]+)+$/, `selector con clave interna en vez de etiqueta: "${t}"`);
    }
    assertNoPageErrors(errors);
  });

  test("ficha del evento de prueba: muestra todas las secciones", async () => {
    const { page, errors } = await loggedPage();
    await page.goto(`/eventos/${EVENT_ID}`);
    await page.locator('[data-section="summary"]').waitFor();
    await settle(page);
    await assertNoLoadError(page);
    const missing: string[] = [];
    for (const s of EVENT_SECTIONS) {
      if ((await page.locator(`[data-section="${s}"]`).count()) === 0) missing.push(s);
    }
    assert.deepEqual(missing, [], `faltan secciones: ${missing.join(", ")}`);
    assertNoPageErrors(errors);
  });

  test("skip link: el primer Tab enfoca 'Saltar al contenido' y Enter salta al main", async () => {
    const { page, errors } = await loggedPage();
    await page.goto("/");
    await page.locator("#contenido-principal").waitFor();
    await settle(page);
    await page.keyboard.press("Tab");
    const focused = await page.evaluate(() => document.activeElement?.textContent?.trim() ?? "");
    assert.equal(focused, "Saltar al contenido");
    await page.keyboard.press("Enter");
    await page.waitForFunction(() => document.activeElement?.id === "contenido-principal", undefined, {
      timeout: 5_000,
    });
    assertNoPageErrors(errors);
  });

  for (const path of ["/crm", "/contacts", "/eventos", "/finances"]) {
    test(`movil 375px: ${path} no deja botones ni links fuera de la pantalla`, async () => {
      const { page, errors } = await loggedPage(MOBILE);
      await page.goto(path);
      await page.locator("#contenido-principal").waitFor();
      await settle(page);
      await assertNoLoadError(page);
      const offenders = await page.evaluate<string[]>(findOffscreenControls);
      assert.deepEqual(offenders, [], `elementos fuera de la pantalla en ${path}:\n${offenders.join("\n")}`);
      assertNoPageErrors(errors);
    });
  }
});
