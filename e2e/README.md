# Pruebas de punta a punta (e2e)

Pruebas con Playwright (paquete `playwright`) y el runner nativo de Node
(`node:test`, vía `tsx`). Abren la app real en Chromium, inician sesión con un
usuario de prueba y revisan que las pantallas principales funcionen.

## Son de SOLO LECTURA

Corren contra la base real (Supabase), así que nunca deben escribir. Cada
contexto del navegador pasa por una guardia (`guardReadOnly` en
`e2e/support.ts`) que responde `403` sin dejar salir **cualquier** request que
no sea `GET`/`HEAD`/`OPTIONS`: `POST/PUT/PATCH/DELETE` a `/api/**`, a
`/rest/v1` o `/storage/v1` de Supabase, Server Actions, etc. Las únicas
excepciones son:

- `POST .../auth/v1/token` de Supabase Auth: es el endpoint que usa
  `supabase.auth.signInWithPassword` (y el refresh del token). No pasa por
  `/api` de la app y no toca datos del CRM.
- `/__nextjs*`: endpoints internos de `next dev` (no existen en producción).

Además se bloquean los service workers, para que ninguna request escape a la
guardia. Al terminar, el runner lista las requests de escritura que bloqueó
(por ejemplo `POST /api/notifications/mark-seen`), solo como diagnóstico.

## Qué prueban (`e2e/app.test.ts`)

| Caso | Qué revisa |
|------|------------|
| Login | El login lleva a `/` y el header muestra el selector de proyecto ("Prueba 2"). |
| `/crm` | Carga sin "No pudimos cargar la información", hay al menos una columna, las tarjetas tienen un botón `aria-label="Mover ..."`, al abrirlo aparece un `role=menu` con opciones y Escape lo cierra. |
| `/tasks` | El selector de orden muestra una etiqueta legible (p. ej. "Nombre A → Z"), no la clave interna (`alpha_asc`). |
| Ficha de evento | El evento de prueba muestra las secciones `[data-section]`: summary, contacts, setlist, timing, tickets, costs, riders. |
| Skip link | El primer Tab enfoca "Saltar al contenido" y Enter mueve el foco a `#contenido-principal`. |
| Móvil 375x812 | En `/crm`, `/contacts`, `/eventos` y `/finances`, ningún botón/link del `<main>` queda más allá del ancho de la pantalla (salvo dentro de un contenedor con scroll horizontal). |
| Errores JS | En todas esas páginas no hay errores de JavaScript sin capturar (`pageerror`). |

## Variables de entorno

| Variable | Uso | Default |
|----------|-----|---------|
| `E2E_BASE_URL` | URL de la app a probar | `http://localhost:3000` |
| `E2E_EMAIL` / `E2E_PASSWORD` | Usuario de prueba | — (si falta alguna, todas las pruebas quedan **omitidas**, no fallan) |
| `E2E_PROJECT_NAME` | Proyecto que debe verse en el selector | `Prueba 2` |
| `E2E_EVENT_ID` | Evento cuya ficha se revisa | el evento de prueba de "Prueba 2" |
| `E2E_CHROMIUM_PATH` | Ruta a un Chromium ya instalado, si su versión no calza con la del paquete `playwright` | — |
| `E2E_TIMEOUT_MS` | Tiempo de espera por acción/navegación | `60000` |

El usuario de prueba debe tener rol `member` y ver solo el proyecto de prueba.
Nunca pongas la contraseña en el repo.

## Correrlas en local

```bash
# 1. Navegador (una vez)
npx playwright install chromium

# 2. App levantada (en otra terminal), con .env.local apuntando a Supabase
npm run dev            # o: npm run build && npm start

# 3. Pruebas
E2E_BASE_URL=http://localhost:3000 \
E2E_EMAIL="usuario@ejemplo.cl" E2E_PASSWORD="..." \
npm run test:e2e
```

Con `next dev` la primera visita a cada ruta compila, por eso los tiempos de
espera son generosos. Las pruebas corren en serie y reutilizan la sesión del
caso de login.

## En GitHub Actions

El workflow `.github/workflows/ci.yml` tiene un job `e2e` (después de
`verificar`) que instala Chromium, hace `npm run build`, levanta `npm start` y
corre `npm run test:e2e`. Para activarlo, agrega estos secretos en
**Settings → Secrets and variables → Actions → New repository secret**:

| Secreto | Se usa como |
|---------|-------------|
| `E2E_SUPABASE_URL` | `NEXT_PUBLIC_SUPABASE_URL` |
| `E2E_SUPABASE_ANON_KEY` | `NEXT_PUBLIC_SUPABASE_ANON_KEY` |
| `E2E_SUPABASE_SERVICE_ROLE_KEY` | `SUPABASE_SERVICE_ROLE_KEY` (lo usa el middleware) |
| `E2E_EMAIL` | email del usuario de prueba |
| `E2E_PASSWORD` | contraseña del usuario de prueba |

Si falta cualquiera (o el PR viene de un fork, donde GitHub no entrega
secretos), el job termina en verde con el aviso "E2E omitido: faltan secretos".
