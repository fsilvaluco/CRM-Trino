# Bitácora de Trabajo — Auto-CRM
_Checkpoint v1.4 — 18 de agosto de 2026 (sesión 17-18 ago)_
_Checkpoint anterior: v1.3 — 16 de agosto de 2026_

> **Formato de tracking:** Registro histórico de trabajo realizado + pendientes actuales.  
> Cada entrada incluye fecha, estado (🔨 En Progreso / ✅ Hecho), y notas de implementación detalladas.
> Este checkpoint existe para poder empezar una conversación nueva sin perder contexto — si estás
> retomando desde acá, lee primero **"🤝 Cómo trabajamos"**, después "🔴 Crítico" y "⚠️ Por verificar"
> antes de construir nada.

---

## 🤝 Cómo trabajamos (leer esto primero al retomar)

Esta sesión (12-16 ago 2026) fue larga y con harto ida-y-vuelta. Estas son las reglas del juego que
quedaron establecidas con Francisco — asumirlas desde el arranque de la próxima conversación, no
esperar a que las repita:

**Flujo de cada cambio:**
1. Verificar `npx tsc --noEmit` + `npx eslint <archivos tocados>` + `npm run build` completo **antes** de
   cada commit — nunca pushear sin los 3 limpios.
2. Commit + `git push origin main` directo (Francisco no pide branch/PR para este proyecto).
3. Railway despliega solo al pushear. Esperar el deploy activamente: pedir `curl .../api/version` para
   anotar el `buildId` actual, pushear, y usar `Bash` en background con un loop `until` que compare el
   `buildId` nuevo contra el viejo — avisar cuando cambie, **nunca decir "listo" sin haber confirmado el
   deploy real** (pasó más de una vez que el deploy que parecía terminado en realidad era el commit
   anterior, o que el build fallaba silenciosamente).
4. Verificar en producción con pruebas reales (`curl`, a veces con `-A` para simular un user-agent
   específico) — no asumir que porque compiló, funciona. Varios bugs de esta sesión solo se
   detectaron así (el contador de escaneos en 0, el `og:url` con `localhost:8080`, etc.)
5. **Migraciones de Supabase las corre Claude siempre**, vía el MCP de Supabase (`apply_migration`),
   nunca pedirle a Francisco que las corra a mano — instrucción explícita de Francisco (12 ago 2026).
6. Después de cada feature grande, actualizar esta bitácora (sección correspondiente) **antes** de dar
   el trabajo por cerrado — es lo que permite retomar sin repetir contexto.
7. **Cada vez que se actualiza esta bitácora, subir también `APP_VERSION`** en `src/lib/constants.ts`
   (se muestra como "Artist Pro vX.Y" al pie de la barra lateral, `Sidebar.tsx`) — instrucción explícita
   de Francisco (18 ago 2026). Convención: subir el número **después** del punto en cada actualización
   normal (v2.14 → v2.15); subir el número **de antes** del punto (y resetear el de después a 0) solo
   para cambios grandes -- módulos nuevos, no ajustes/fixes puntuales (ej. v2.15 → v3.0).

**Con los datos reales de Francisco (Supabase) — regla dura, aprendida por un incidente real:**
Durante la depuración del contador de QR, Claude corrió `DELETE FROM qr_scans WHERE qr_id = ...` sin
filtrar por cuáles filas eran específicamente las de sus propias pruebas de curl — probablemente borró
también un clic real de Francisco que cayó justo en el medio. **Nunca más un DELETE ancho sobre una
tabla con datos reales del usuario.** Si hace falta limpiar filas de prueba, filtrar por algo que las
identifique sin ambigüedad (ej. `user_agent = 'curl/...'` o un marcador explícito), o simplemente no
tocar la tabla y avisarle a Francisco que van a quedar un par de filas de prueba de más.

**Estilo de las respuestas:** Francisco prefiere que se le muestre evidencia concreta (output de curl,
query a la base, número exacto) en vez de "ya debería estar funcionando". Cuando algo se rompe, prefiere
que se le explique la causa raíz real encontrada, no solo "ya lo arreglé".

---

## 🔧 Lecciones técnicas de esta sesión (para no repetir)

Bugs reales encontrados y su causa raíz — dejar constancia porque varios son sutiles y se pueden repetir
en otras partes del código:

- **`void promesa.insert(...)` (fire-and-forget) no garantiza terminar** antes de que el proceso pase a
  la siguiente request en un Route Handler — el registro de escaneos de QR se perdía siempre en
  silencio (el redirect funcionaba perfecto, el INSERT no). Fix: usar `after()` de `next/server`, que sí
  garantiza que el trabajo en segundo plano corra hasta el final. Aplicar este patrón en cualquier
  "logueo sin bloquear la respuesta" nuevo.
- **Variables `NEXT_PUBLIC_*` nuevas no le llegan al build si el proyecto usa `Dockerfile`** (no
  Nixpacks, aunque `railway.toml` diga `builder = "nixpacks"` — ese campo no se está usando de verdad).
  Docker solo pasa al build las variables que el `Dockerfile` declara explícitamente con `ARG`+`ENV`.
  Hay que agregar la variable en **2 lugares** siempre: Railway (Variables) Y el `Dockerfile`. Runtime y
  build-time son entornos distintos en un build por Dockerfile — por eso `/api/health` podía ver la
  variable bien (runtime) mientras el bundle del navegador seguía sin ella (build-time).
- **Especificidad CSS en reglas `@media print`**: un selector más específico definido ANTES en el
  archivo gana sobre uno menos específico definido DESPUÉS, aunque `!important` esté en ambos — el
  orden en el archivo solo desempata cuando la especificidad es IGUAL. Rompió el grid de 4 columnas del
  resumen financiero al imprimir Costos.
- **Los bots de preview (WhatsApp/Facebook/Slack/Telegram/etc.) no siguen redirects HTTP** para leer los
  meta tags `og:*` de la página final — hay que detectar su user-agent y servirles HTML con los tags
  copiados directamente (`src/lib/link-preview-bots.ts`). Si la página es Next.js real (no un redirect
  puro), `generateMetadata()` nativo alcanza sin necesitar este truco.
- **Valores HTML scrapeados de otro sitio ya vienen con entidades codificadas** (`&amp;`) — si se
  vuelven a escapar al armar el HTML propio, queda `&amp;amp;`. Decodificar antes de re-escapar.
- **`request.url` dentro de un Route Handler refleja el host interno del contenedor** (`localhost:8080`
  detrás del proxy de Railway), no el dominio público — para armar URLs absolutas correctas, usar
  `NEXT_PUBLIC_SITE_URL` (mismo patrón ya usado en `taskUrl()`/`siteUrl()` en otras rutas).
- **`eslint-plugin-react-hooks` (`set-state-in-effect`) rechaza un `setState` síncrono seguido de un
  fetch en el mismo efecto** (aunque esté detrás de un `if`/guard clause) — no rechaza un `setState`
  síncrono solo (sin fetch después). Para "resetear estado + cargar datos nuevos cuando cambia un prop",
  separar en un sub-componente remontado por `key={id}` en vez de resetear a mano dentro del efecto.
- **Gráficos de barras agrupados por día quedan con una sola barra (invisibles)** cuando toda la
  actividad cae en un solo día — hay que detectar ese caso y agrupar por hora en su lugar (aplicado en
  `QrScanDetailSheet.tsx` y `SmartlinkStatsSheet.tsx`).
- **Supabase/PostgREST con joins a `profiles` infiere el tipo como array** (no objeto) cuando TypeScript
  no tiene los tipos generados de la base — para joins ambiguos (una tabla con más de una FK al mismo
  destino), especificar el nombre exacto de la FK (`profiles!task_assignees_user_id_fkey`), patrón ya
  usado en varias rutas.
- **Un mismo dato leído por dos endpoints con mapeos manuales independientes se desincroniza fácil**: al
  agregar `category`/`pagado`/`comprobantePagoUrl` a `event_cost_items` se actualizó el mapeo en
  `GET /api/eventos/[id]/costs`, pero se pasó por alto que `GET /api/eventos/[id]` (usado de verdad por
  la página del evento, tanto en la carga inicial como en el `load()` automático después de cada
  guardado) tiene su **propio** `.map()` de la misma tabla. El síntoma engañaba: parecía "no se guarda"
  cuando en realidad SÍ se guardaba bien y el problema era de lectura. **Diagnóstico correcto: consultar
  la tabla directo por Supabase MCP antes de asumir dónde está el bug** — confirmó en segundos que el
  guardado funcionaba y descartó horas de debug por el lado equivocado. Lección para el futuro: si se
  agrega una columna nueva a `event_cost_items`, actualizar los mapeos en **ambos** archivos.
- **Un embed de PostgREST (`tabla ( columnas )`) necesita una foreign key real para funcionar** -- no
  basta con que la columna "debería" relacionarse con la otra tabla. `project_members.user_id` nunca tuvo
  FK hacia `profiles` (a diferencia de `organization_members`/`event_closing_signatures`, que sí la
  tienen), así que `.select("user_id, profiles(...)")` fallaba en silencio (`data: null`, sin lanzar
  excepción) y `data ?? []` lo escondía como "0 resultados" en vez de un error visible -- exactamente el
  mismo síntoma engañoso que el caso anterior. Esto es distinto del caso ya documentado de FK *ambigua*
  (dos FKs al mismo destino, se resuelve nombrando la FK exacta) -- acá directamente no existía ninguna.
  Cuando un embed de Supabase devuelve sospechosamente vacío, **verificar primero si la FK existe de
  verdad** (`information_schema.table_constraints`) antes de asumir que es un problema de datos.
- **La tabla `transactions` (módulo Finanzas) guarda los montos en PESOS, no en centavos** -- a
  diferencia de todo el resto de la app (`event_cost_items`, `deals`, etc.), que sí usa centavos
  (`amount * 100` al guardar, `/ 100` al mostrar). `TransactionForm.tsx`/`api/finances/route.ts` no
  tienen esa conversión en ningún lado. Al importar datos a mano (ej. un CSV) a esta tabla en particular,
  **no multiplicar por 100** -- el monto va tal cual. Causó un bug real (montos 100x de más) al importar
  el presupuesto del LP de Los Últimos Románticos (19 ago 2026).

---

## 📦 Qué se construyó en esta sesión (12-16 ago 2026) — resumen ejecutivo

Sesión larga, todo mergeado a `main` y verificado en producción. Detalle completo de cada uno en
**"🟠 Importante"** más abajo — esto es solo el mapa para orientarse rápido:

1. **Notificaciones push (Web Push nativo, VAPID)** — toggle en Configuración + auto-prompt al entrar +
   botón en el menú de perfil. 5 triggers: tarea asignada, mención en comentario, tarea/deal por vencer
   (5/2/1 días), evento mañana, broadcast de admin. Cron `/api/cron/daily-reminders` **creado pero
   todavía sin el Cron Job en Railway** (ver pendiente abajo).
2. **Firma virtual del cierre de caja** — `/eventos/[id]/firmar`, firmantes = `project_members` del
   proyecto, bloqueante hasta que firmen todos, log auditable.
3. **Auditoría de tamaño de letra** — 2 gaps reales encontrados y corregidos en Costos/Venta de entradas
   del módulo Eventos.
4. **Nota de reparto de utilidad + firmas Productor/Rep + nombre de archivo al imprimir** en la Planilla
   de costos.
5. **Creador de Códigos QR con tracking de escaneos** (`/qr-codes`) — slug corto, imagen generada en el
   navegador, preview correcto en WhatsApp (detección de bots + meta tags copiados del destino).
6. **Herramienta de Smartlink** (`/smartlinks`) — página tipo "link en la bio" con un botón por
   plataforma (Spotify/Apple Music/etc.), tracking de vistas y clicks por plataforma.
7. **Link corto personalizable + soporte para dominio propio** (`artspr.cl`, aún sin comprar) — QR y
   Smartlink comparten namespace de slugs, el middleware ya sabe resolver ambos desde la raíz del
   dominio corto el día que se compre.
8. **3 bugs de producción encontrados y corregidos** (contador de QR en 0, preview de WhatsApp sin
   datos, gráfico de actividad invisible con datos de un solo día) — causas raíz documentadas arriba en
   "🔧 Lecciones técnicas".

---

## 📦 Qué se construyó en esta sesión (17-18 ago 2026) — resumen ejecutivo

Sesión corta pero con harta iteración sobre un mismo módulo (Costos de Eventos). Detalle completo de
cada uno en **"🟠 Importante"** más abajo — esto es solo el mapa para orientarse rápido:

1. **Reportar gastos por link, con lectura de comprobante por IA** — página nueva
   `/eventos/[id]/gastos`: cualquier integrante del proyecto reporta un gasto (ítem, monto, comprobante)
   sin acceso a editar la Planilla completa; la IA lee el comprobante y sugiere el monto. Queda
   "pendiente" en una tabla aparte (`event_cost_submissions`) hasta que un admin lo aprueba (se agrega
   como ítem normal a la Planilla) o lo rechaza (se borra, la persona puede reintentar).
2. **Categorías de gasto** — lista cerrada de categorías (`src/lib/cost-categories.ts`) para poder sacar
   informes de "en qué se gasta" más adelante. Ajustada una vez a pedido de Francisco (se sacaron
   Honorarios y Transporte de equipos).
3. **Comprobante de pago (transferencia) separado del comprobante de gasto (boleta)** — checkbox
   "Pagado" + adjuntar comprobante de transferencia, independiente del comprobante de la boleta que ya
   existía.
4. **3 bugs de producción encontrados y corregidos**, los 3 en el mismo módulo de Costos:
   - Panel de gastos pendientes con texto invisible (bug de contraste: colores de tema sobre un fondo
     forzado a claro).
   - `saveCosts()` no mandaba `category`/`pagado`/`comprobantePagoUrl` al guardar (los perdía en el PUT).
   - **El más largo de encontrar:** el mapeo de `event_cost_items` está duplicado en dos endpoints
     (`costs/route.ts` y `[id]/route.ts`) -- se corrigió el primero pero no el segundo, que es el que la
     página realmente usa para cargar/recargar. Se diagnosticó **consultando la base directo por
     Supabase MCP** antes de tocar código, lo que confirmó que el guardado sí funcionaba y descartó una
     pista falsa (ver "🔧 Lecciones técnicas").
5. **Fix de layout**: header de Evento (botones empujaban el título hacia abajo con nombres largos) --
   botones en su fila propia arriba, título abajo a ancho completo.
6. **Auditoría de tamaños de letra en toda la app** (pendiente de hace rato) -- se hizo de verdad: el
   único patrón real de bug son las filas densas tipo planilla (`SortableList`, solo existe en Eventos);
   se encontró y corrigió 1 gap real en Timing/Cronograma. El resto de la app (~130 inputs revisados) ya
   estaba bien.
7. **Vista Carta Gantt en Tareas** -- resultó estar ya construida de una sesión anterior sin documentar
   (`TaskGanttView.tsx`, pestaña Gantt en `/tasks`); la bitácora quedó actualizada para reflejar el
   estado real (v1, sin rango porque `Task` no tiene `start_date` todavía).
8. **Incidente de Railway** (deploys lentos/fallando, 19 ago madrugada UTC) -- confirmado resuelto por
   Railway durante la sesión; se trabajó localmente mientras tanto (`.claude/launch.json` agregado para
   poder levantar `npm run dev` con el panel de preview).

---

## 🔴 Crítico (arreglar primero)

_Ningún bug crítico conocido sin resolver._
- ✅ Confirmado por Francisco (10 ago 2026): el paquete de fixes de gráficos de Métricas + agrupación por mes en Eventos quedó bien aplicado y probado.
- ✅ **Bug de producción encontrado y corregido (19 ago 2026):** Francisco cerró la caja de un evento real ("Gamuza: otra noche más aquí en Plaza Victoria 1") y la Planilla mostró "Pendiente de aprobación (0/0)" -- al abrir el link de firma, decía "no eres parte del equipo requerido" a pesar de estar en el proyecto (confirmado en Equipo y Acceso). **Causa raíz:** `getRequiredSigners()` en `signatures/route.ts` calculaba los firmantes con un embed de PostgREST (`project_members.select("user_id, profiles(...)")`), pero `project_members.user_id` **no tiene foreign key hacia `profiles`** (a diferencia de `organization_members`/`event_closing_signatures`, que sí la tienen) -- el embed fallaba en silencio, `data` quedaba `null`, y `data ?? []` lo escondía como si el proyecto no tuviera integrantes. Verificado directo en la base (Supabase MCP) antes de tocar código: el proyecto Gamuza sí tiene 4 `project_members` (Francisco, Joaquín, Diego, Gonzalo). Corregido reemplazando el embed por dos queries separadas (`project_members` + `profiles` por `IN (...)`). Revisados los demás usos de `project_members` en la app -- ninguno más intenta este embed roto, era el único caso.

---

## ⚠️ Por verificar / sin probar a fondo

**Fix del mapeo duplicado de `event_cost_items` en producción** _(agregado: 18 ago 2026)_
- Corregido en código y pusheado (`6f4ce20`), pero el deploy a Railway estaba recién recuperándose de un incidente al momento del push -- **falta que Francisco confirme en producción** (no solo local) que el ítem "Sonidista" del evento "Gamuza: otra noche más aquí en Plaza Victoria 1" ya se ve marcado como Pagado sin tener que resubir nada, y que un ítem nuevo (categoría + comprobante de pago) queda completo después de "Guardar costos" y recargar.

**✅ Google Maps — comuna en direcciones reales**
- Francisco confirmó que Google Maps muestra correctamente las direcciones con sus comunas. Sin más acción.

✅ **pdf-parse en producción** — confirmado ok (10 ago 2026), sin más acción.

---

## 🟢 Diferido a propósito (decisión del usuario, no son bugs)

- **Timing general de gira**, **agrupación por secciones en Timing** — sin cambios, siguen pendientes tal como se dejaron
- ✅ **Ícono de Instagram/redes en el header impreso** — Francisco confirma que ya está, cerrado
- **Login con clave por evento en el link público** — sigue diferido, Francisco lo va a hacer más adelante
- **Direcciones reales de venues** — tarea manual de Francisco (10 venues nuevos + 7 eventos de la gira "La Amistad Hecha Bolero"), no requiere desarrollo — solo pendiente de que él las complete

---

## 🟣 Pendientes grandes (para más adelante, sin agendar todavía)

**✅ Roles y permisos granulares -- Fase 1: Costos de eventos + Deals** _(agregado: 12 ago 2026, diseñado y construido: 19 ago 2026)_
- **Diseño acordado con Francisco** (ver conversación del 19 ago): reusar `project_members.role`, que ya existía con `admin`/`member`/`artist` pero era **puramente decorativo** -- ninguna ruta lo miraba para restringir nada (confirmado al revisar el código: Gonzalo estaba etiquetado "Artista" pero veía exactamente lo mismo que un admin). Se agregó un 4to valor, `staff`.
  - **Admin / Member** (a nivel de proyecto): sin cambios, acceso completo.
  - **Artist**: ve los Deals de su proyecto pero de **solo lectura** (no crea/edita/mueve de etapa/borra) -- **no ve nada de plata de eventos** (ni el resumen Fee/Ingresos/Egresos/Utilidad, ni el detalle de la Planilla de costos).
  - **Staff** (sonidista, asistente de producción, etc.): igual que Artist en Costos, pero el **módulo de Deals/CRM queda oculto del menú por completo** (ni lectura).
  - El resto de Eventos (Setlist, Timing, Contactos, info general) sigue **visible y editable** por cualquiera con acceso al proyecto -- eso es Fase 2 (ver abajo).
- **Implementación:**
  - Migraciones `074_staff_project_role.sql` (agrega `staff` al `CHECK` de `project_members.role`) y `075_staff_org_role.sql` (mismo en `organization_members.role`, porque el flujo de invitación graba el rol elegido en ambas tablas a la vez).
  - `src/lib/project-roles.ts` -- única fuente de verdad de qué puede ver/editar cada rol (`canViewDeals`, `canEditDeals`, `canViewEventCosts`), para no repetir la lógica en cada endpoint.
  - **Backend** (todas las rutas relevantes revisadas y protegidas, no solo las que muestra la UI -- defensa real, no solo ocultar botones): `GET/PUT /api/eventos/[id]/costs`, `POST /api/eventos/[id]/costs/close`, `POST /api/eventos/[id]/costs/reopen`, `GET/POST /api/deals`, `GET/PUT /api/deals/[id]` (DELETE ya era admin-only), `GET/PUT /api/pipeline` (tablero + mover de etapa).
  - `GET/PUT /api/eventos/[id]` (el que usa la página del evento) ahora manda `fee`/`ticketIncome`/`expenses` en `null` y `costItems: []` para roles restringidos, más un flag `canViewCosts` que el front usa para ocultar la Card completa de Costos y el resumen financiero -- así no hace falta bloquear toda la página, solo la parte de plata.
  - **De paso, se corrigió un gap de seguridad preexistente**: `GET /api/deals` y `GET /api/pipeline` no validaban `allowedProjectIds` en absoluto -- cualquier member autenticado podía pedir `?projectId=<cualquier-proyecto-de-otro-cliente>` y ver esos deals. Ahora sí se valida.
  - **Frontend:** `project-context.tsx` expone `activeProjectRole`/`canViewDealsModule`/`canEditDeals`/`canViewEventCosts` calculados a partir del `role` que trae cada proyecto (tanto para admin -- siempre `"admin"` -- como para member, leído de `project_members`). El Sidebar oculta "Tratos" del grupo CRM cuando `!canViewDealsModule`.
  - UI para asignar el rol actualizada en 3 lugares: `MemberAccessSheet.tsx` (gestionar acceso por proyecto, con explicación de cada rol), `OrgMembersPanel.tsx` (invitar usuario nuevo), y el email de invitación (`resend.ts`).
- **Deliberadamente fuera de esta fase 1** (confirmado con Francisco antes de empezar):
  - **Finanzas general y Métricas** -- siguen con el acceso de hoy (cualquiera con el proyecto asignado los ve completos). Se suman si Francisco los pide.
  - **Edición condicionada por persona** (el caso de Daniela: "que pueda rellenar Timing si le doy permiso") -- Francisco confirmó que quiere esto **por persona individual**, no por rol fijo. Requiere una columna nueva (ej. `project_members.can_edit_event_ops boolean`) + UI para prenderlo caso a caso + chequeo en los endpoints de Setlist/Timing/Contactos. No construido todavía, queda para cuando efectivamente incorpore a Rodrick/Daniela.
- **✅ Ajustes pedidos por Francisco tras revisar la fase 1 (19 ago 2026):**
  - **Firmantes requeridos acotados a Admin + Artista** (resuelve la inconsistencia que había quedado abierta): antes firmaban *todos* los `project_members` del proyecto; ahora solo `role IN ('admin','artist')` -- Miembro y Staff técnico no firman. Un admin de la organización siempre puede firmar igual aunque su rol en ese proyecto puntual no sea Admin/Artista (ej. Francisco, dueño de la org, está como "Miembro" en Gamuza), pero no cuenta como uno de los requeridos. `getRequiredSigners()` en `signatures/route.ts`.
  - **Corregido: "Artista" SÍ ve los Costos de eventos** (de solo lectura) -- el diseño original de la fase 1 se lo bloqueaba igual que a Staff, pero eso no tenía sentido: si Artista es firmante requerido del cierre de caja, tiene que poder ver los números que está aprobando. Se separó el permiso en dos funciones en `project-roles.ts`: `canViewEventCosts` (todos menos Staff) y `canEditEventCosts` (solo Admin/Member -- Artista ve pero no edita ni cierra/reabre la caja). Aplicado en el backend (`costs/route.ts` GET vs PUT, `close`/`reopen`, `/api/eventos/[id]` GET/PUT) y en el frontend (`canEditCosts` deshabilita todos los campos/botones de edición de la Planilla, la Card completa ya no se oculta para Artista).
  - **Staff técnico también incluye músicos** (sesionistas que no son "el artista" representado) -- actualizada la descripción en `MemberAccessSheet.tsx`.
  - **Hoja de firma (`/eventos/[id]/firmar`):** la lista plana de ítems de costo se convirtió en tabla con columnas **"Comprobante de cobro"** (la boleta/factura del gasto) y **"Comprobante de pago"** (la transferencia) -- cada una con un botón/ícono que abre el archivo en una pestaña nueva. También se corrigió el mismo bug de conteo que tenía el badge de Costos (contaba *todas* las firmas históricas, no solo las de los firmantes requeridos actuales -- podía mostrar cosas como "4/3" al achicar la lista de requeridos).
  - **Página del evento:** se agregó una Card nueva "Aprobación" (fuera de la Card de Costos a propósito, para que un Artista la vea aunque su rol no le muestre los montos) con el mismo detalle que la hoja de firma -- badge "X/Y firmaron" + lista de cada firmante requerido con check verde/círculo gris y fecha si ya firmó.
- **Falta probar con un usuario real**: confirmar con Gonzalo (ya está como `artist` en Gamuza) que ve la Planilla de costos de solo lectura, ve/lee sus Deals sin poder moverlos, y aparece como firmante requerido; cuando Francisco agregue a Rodrick/Daniela como `staff`, confirmar que ni ven "Tratos" en el menú ni la Planilla de costos.

**Hoja de firma -- 2 mejoras más** _(agregado: 19 ago 2026)_
- **Botón de firma personalizado**: en vez de "Estoy de acuerdo" genérico, ahora dice **"Yo, [nombre], estoy de acuerdo. Firmo."** -- el nombre sale de `requiredSigners`/`signatures` (ya traen el `full_name` real de `profiles`), con fallback al nombre/email de la sesión si quien firma no es de los firmantes requeridos (ej. un admin de la org firmando por su cuenta).
- **Resumen de venta de entradas**, agregado **antes** de la tabla de costos (mismo Card "Resumen"): tabla con columnas Tipo de entrada / Cantidad vendida / Total, más una fila de **Total ingresos** al final -- mismos datos que ya existían en `ticketTiers`, ahora también visibles en la hoja de firma para que quien aprueba vea de dónde salió la plata, no solo en qué se gastó.
- **✅ Bug encontrado y corregido (19 ago 2026):** Francisco firmó el cierre de "Gamuza: otra noche más aquí en Plaza Victoria 1" a pesar de no ser firmante requerido (su rol de proyecto es "Miembro", solo Admin/Artista firman) -- la firma quedó bien guardada (el `POST` ya tenía el bypass de admin de la org), pero el panel de "Aprobación" (tanto en la hoja de firma como en la Card nueva de la página del evento) solo iteraba `requiredSigners`, así que su nombre no aparecía en ningún lado aunque sí había firmado. Corregido: ambos paneles ahora también listan los firmantes "voluntarios" (alguien que firmó sin estar en la lista de requeridos) al final, con su check y fecha -- no cuentan para el badge "X/Y firmaron", pero quedan visibles.

**"Informar cierre" -- correo con el resumen a todos los que firmaron** _(agregado: 19 ago 2026)_
- Botón nuevo **"Informar cierre"** en la Planilla de costos (junto a "Link de firma"/"Reabrir") -- **solo aparece cuando `allSigned` es `true`** (todos los firmantes requeridos ya aprobaron). Al apretarlo manda un correo con el resumen completo del cierre (Ingresos/Egresos/Utilidad, venta de entradas por tramo + total, detalle de costos, nota de reparto de utilidad, y quién aprobó y cuándo) a **todos los que firmaron** -- requeridos y voluntarios, deduplicado por email.
- **No es de un solo uso**: después del primer envío el botón cambia a "Reenviar informe" (con la fecha del último envío en el tooltip) -- útil si alguien perdió el correo. Se revalida `allSigned` en el servidor antes de mandar, no solo se confía en que el botón esté habilitado en el cliente.
- **Reabrir la caja limpia el estado de "informado"** (`cost_sheet_informed_at`/`_by`), igual que ya limpiaba las firmas -- si se reabre es porque algo va a cambiar, no tendría sentido dejar registrado que se informó un cierre con números viejos.
- Lógica de firmantes (`getRequiredSigners`/`getSignaturesState`) extraída a `src/lib/event-signatures.ts` para reusarla entre `signatures/route.ts` y el nuevo `costs/inform/route.ts` sin duplicar las queries.
- Nuevo template de correo `buildCostSheetSummaryEmailHtml()` en `resend.ts` -- mismo servicio (Resend) que ya se usa para invitaciones y el digest diario, requiere `RESEND_API_KEY` configurada (si no está, el botón devuelve error explicando que falta configurarla, no falla en silencio).
- Migración `076_cost_sheet_informed.sql` (`cost_sheet_informed_at`, `cost_sheet_informed_by` en `shows`).
- **Falta probar con un envío real** (confirmar que el correo llega bien formateado a todos los firmantes de un cierre real).

**Login con Google** _(agregado: 12 ago 2026, "para más adelante")_
- Hoy el login es solo email/password vía Supabase Auth
- Agregar Google como proveedor OAuth adicional (Supabase Auth lo soporta nativo) — requiere crear credenciales OAuth en Google Cloud Console y activar el provider en Supabase, más el botón "Continuar con Google" en `/login`

**Panel admin-only tipo "intranet"** _(agregado: 12 ago 2026, idea a madurar)_
- Francisco (como owner) quiere una vista separada, solo para él, con: logs del sistema, panel de usuarios (activos/inactivos), en qué proyectos está asignado cada uno
- Idea suelta: "quizás funciona como una intranet para trabajadores de la app, no para usuarios" — falta definir bien el alcance (¿qué logs? ¿de qué se considera "activo"? ¿solo lectura o también gestión de usuarios desde ahí, duplicando `/settings/team`?) antes de construir

**Pre-save real (Spotify/Apple Music/Deezer)** _(agregado: 14 ago 2026, confirmado explícitamente para después el 16 ago 2026)_
- Requiere OAuth propio con cada plataforma (Spotify Developer Dashboard, Apple MusicKit — necesita cuenta paga de Apple Developer, Deezer) + guardar tokens de fans + un cron el día del lanzamiento que dispare el "save" para todos los que dieron permiso
- Tamaño comparable a las integraciones que ya existen (Gmail/Meta/Shopify en Configuración > Integraciones) — necesita su propia sesión, y Francisco tiene que crear las apps de desarrollador en cada plataforma primero (cuentas suyas, no se pueden crear desde acá)

**Creador de dossier / EPK** _(agregado: 16 ago 2026, idea suelta)_
- Mencionado de pasada junto con el pre-save — sin definir alcance todavía (¿PDF descargable? ¿página web tipo one-pager con bio/fotos/rider/contacto? ¿plantilla por proyecto?)

---

## 🟠 Importante (esta semana)

**Financiamiento del LP de Los Últimos Románticos -- Finanzas para los costos + módulo nuevo "Préstamos" para la deuda** _(agregado: 19 ago 2026)_
- Francisco trajo un presupuesto real (CSV, 40 ítems) del LP de "Los Últimos Románticos" -- financiado con $3.000.000 en préstamos de familiares/empresas de los 2 artistas (Nacho: $1M empresa + $1M tío, ya entregados a Francisco; Simplemente Yo: $1M de su tío, **todavía no entregado**), que los artistas le van devolviendo en cuotas mensuales para que Francisco se las reparta a los prestamistas.
- **Primer intento (descartado por Francisco):** meter todo en Finanzas, incluyendo el $2.000.000 recibido como "Ingreso". Francisco hizo notar -- con razón -- que esa plata **no es ingreso real, sigue siendo deuda** hasta devolverla; contarla como ingreso infla el panorama financiero del proyecto como si hubiera generado esa plata. "Campañas" tampoco resolvía nada (es solo un contenedor de agrupación, sin lógica financiera propia).
- **Diseño final, confirmado con Francisco:**
  - **Costos reales de producción** (los 40 ítems del CSV: Masterización, Mezcla, Video, etc.) -- esto SÍ es gasto real del proyecto, se queda en **Finanzas** tal como se importó. Se agregaron categorías nuevas a `TransactionForm.tsx` para que calzaran con producción musical: **Masterización, Mezcla, Grabación, Prensa/PR, Video, Fotografía, Campaña ADS, Pago de préstamo, Préstamo**.
  - **La deuda** (préstamos + sus devoluciones + los aportes mensuales que juntan los artistas para pagarles) -- módulo nuevo **`/prestamos`**, completamente separado de Finanzas, para que nunca contamine el Balance de Ingresos/Egresos:
    - `loans` (un prestamista = una fila: nombre, monto prestado, si ya llegó) + `loan_repayments` (abonos a ESE prestamista puntual, comprobante incluido) -- el saldo pendiente por prestamista se calcula solo (`principal - sum(repayments)`), nunca se guarda.
    - `loan_contributions` (los aportes que juntan los artistas, ej. $150.000 c/u mensual) -- plata de paso para poder pagarle a los prestamistas, no atada a un préstamo en particular.
    - Cards de resumen: Prestado (recibido), Devuelto, Saldo pendiente, Fondo disponible (aportes − devuelto).
    - Migración `077_loans.sql`. **A diferencia de Finanzas, estas tablas nuevas usan CENTAVOS** (la convención del resto de la app) -- ver lección técnica abajo sobre por qué Finanzas es la excepción.
  - Se cargaron los 3 préstamos reales: Nacho (empresa) $1M recibido, Nacho (tío) $1M recibido, Simplemente Yo (tío) $1M **pendiente de recibir** (`received: false`) -- se actualiza a mano cuando confirme que llegó.
- **Se importaron los 40 ítems del CSV** como transacciones `expense` del proyecto LUR en Finanzas (categoría según la columna "Ítem", `reimbursed = true` para los marcados "Pagado"). Se excluyó 1 fila con monto $0. La columna "Quién paga?" del CSV (qué préstamo financia esa línea) se agregó como texto en la descripción (ej. "Dopamina · Financia: SoloNacho") porque no tiene campo propio.
- **✅ Bug propio encontrado y corregido (19 ago 2026), antes de descubrir lo de arriba:** al importar los 40 ítems a Finanzas los monté como centavos (`pesos * 100`), igual que el resto de la app -- pero Finanzas guarda pesos directos, sin esa conversión (`formatCLP()`/`TransactionForm.tsx` no multiplican/dividen por 100). Corregido con un `UPDATE ... amount = amount / 100` sobre las 42 filas (verificado que eran exactamente las que yo había insertado, sin transacciones previas de ese proyecto).
- **Verificado con totales reales**: presupuesto Finanzas $4.184.500 (40 ítems), $645.000 ya pagados -- balance queda negativo por ahora (-$2.184.500 según Finanzas solo, sin contar los préstamos) porque la mayoría sigue "Por pagar" y falta el tercer préstamo -- es normal, no un error.
- **Cómo sigue usándolo Francisco de acá en adelante** (no requiere más desarrollo): en `/prestamos`, cada mes "Nuevo aporte" (uno por artista, ~$150.000) y "Registrar abono" en cada prestamista (~$85.000 c/u) con su comprobante. En `/finances`, marcar "Pagado" y subir comprobante en cada ítem del presupuesto a medida que se van pagando de verdad. Cuando confirme que llegó el tercer préstamo, tildar "Ya se recibió esta plata" en la card de Simplemente Yo (tío).
- **✅ Ajuste pedido por Francisco (19 ago 2026), mismo día:** el nombre del prestamista no puede ser un apodo genérico ("Nacho (tío)") -- tiene que ser el nombre real de la persona/empresa a la que hay que transferirle. Y falta distinguir "quién es el prestamista" (a quién se le debe) de "quién consiguió el préstamo" (qué artista es responsable). Se agregó:
  - Migración `078_loans_details.sql`: `responsible_name` (el artista, ej. "SoloNacho") + datos bancarios del prestamista (`holder_rut`, `bank_name`, `account_type`, `account_number`, `contact_email`) para poder transferirle sin buscar los datos en otro lado.
  - Botón **"Editar"** (lápiz) en cada préstamo -- mismo diálogo que "Nuevo préstamo", precargado.
  - Corregidos los 2 préstamos ya cargados con los datos reales que pasó Francisco: **Servicio Automotriz Fénix SPA** (antes "Nacho (empresa)") y **Miguel Galindo** (antes "Nacho (tío)"), ambos con `responsible_name: "SoloNacho"` + RUT/banco/cuenta/email reales. El tercero (Simplemente Yo (tío), pendiente de recibir) quedó con `responsible_name: "Simplemente Yo"`, todavía sin datos bancarios -- agregarlos cuando Francisco los pase.

**Reportar gastos por link (con lectura de comprobante por IA)** _(agregado: 17 ago 2026)_
- Botón **"Link para gastos"** en la Planilla de costos (junto a Imprimir, visible mientras la caja no esté cerrada) — copia el link de `/eventos/[id]/gastos` para compartirlo con el equipo del proyecto.
- Página **`/eventos/[id]/gastos`**: cualquier integrante del proyecto, logueado con su cuenta, ve "Hola [nombre], deja tu gasto acá" y un formulario (Ítem con el mismo catálogo autocompletado que usa la Planilla, Responsable, Monto, comprobante y notas). Debajo, ve el estado de sus propios gastos ya reportados (pendiente/aprobado/rechazado).
- **Lectura del comprobante con IA**: al subir la foto/PDF, `gpt-4.1-mini` lee el monto total y lo rellena como sugerencia editable en el campo Monto (nunca se envía sin que la persona lo vea/confirme) — mismo patrón ya usado en setlist/timing/tickets (`extractReceiptFromImage`/`extractReceiptFromText` en `src/lib/openai.ts`, endpoint `/api/eventos/cost-submissions-extract`).
- **Queda "pendiente" en una tabla aparte** (`event_cost_submissions`, migración `070_event_cost_submissions.sql`) — nunca toca `event_cost_items` directamente hasta que se aprueba, para no arriesgar el guardado-completo de la Planilla (ese PUT borra cualquier fila que no venga en el payload).
- **Aprobación restringida a admins de la organización** (decisión explícita de Francisco): en la Planilla de costos aparece un panel amarillo "Gastos reportados pendientes de aprobar" con Aprobar/Rechazar por fila. Aprobar inserta una fila nueva normal en `event_cost_items` (editable después, igual que cualquier ítem agregado a mano); rechazar solo marca el estado, sin crear nada.
- Push automático: a los admins cuando llega un gasto nuevo, y a quien lo reportó cuando se aprueba o rechaza (reusa `sendPushToUsers()`).
- Bloqueado si la caja ya está cerrada (mismo criterio que editar la Planilla directamente).
- Migración `070_event_cost_submissions.sql` aplicada en Supabase — mismo patrón de RLS org-wide que `event_cost_items`/`event_closing_signatures` (el filtrado fino por proyecto y por rol lo hace la API, no la policy).
- **✅ Ajustes pedidos por Francisco tras probar el panel de revisión (17 ago 2026):**
  - **Bug de contraste corregido:** el panel de "Gastos pendientes" quedaba con texto invisible (blanco sobre blanco) porque usaba colores de tema (`text-foreground`/`text-muted-foreground`) sobre un fondo forzado a claro (`bg-amber-50`/`bg-white`) -- en modo oscuro esos colores de tema resuelven a un tono casi blanco, pensado para texto sobre fondo oscuro, no sobre el fondo claro hardcodeado del panel. Mismo tipo de causa raíz que el bug de tooltips de los gráficos (ver "🔧 Lecciones técnicas" arriba) -- **lección repetida: cualquier fondo forzado a un color fijo (no el de tema) necesita también texto en colores fijos, nunca `text-foreground`/`text-muted-foreground`.** Corregido con paleta explícita (`text-slate-900`, `text-slate-600`, etc.) y también se agregó fecha/hora, notas y la categoría al panel.
  - **Rechazar ahora BORRA el envío** (antes solo lo marcaba "rechazado" y quedaba dando vueltas) -- a pedido explícito de Francisco, así la persona puede volver a reportar el mismo gasto corregido sin fricción ni duplicados acumulados. El admin puede escribir un motivo opcional (prompt al hacer clic en Rechazar) que solo viaja en el push de aviso, no se guarda en ningún lado (no hay dónde guardarlo, ya que la fila se borra).
  - **Categorización de gastos** (para poder sacar informes de "en qué se gasta" más adelante): lista cerrada de categorías (`src/lib/cost-categories.ts`). Selector obligatorio al reportar un gasto desde `/gastos`; selector opcional (no retroactivo, los ítems viejos quedan sin categoría) en cada fila de la Planilla de costos y al agregar un ítem nuevo a mano. Columna nueva agregada también a la tabla de impresión de Costos.
  - **Ajuste (18 ago 2026):** se sacaron "Honorarios" y "Transporte de equipos" de la lista a pedido de Francisco -- quedaron 12: Movilización, Alimentación, Alojamiento, Arriendo de audio, Arriendo de luces, Arriendo de espacio, Catering, Producción y staff, Seguridad, Permisos y derechos de autor, Marketing y difusión, Otros. Verificado antes de aplicar que ninguna fila usaba todavía esas dos categorías (migración `072_remove_cost_categories.sql`, sin necesidad de migrar datos).
  - Migración `071_cost_categories.sql` aplicada en Supabase -- columna `category` en `event_cost_items` y `event_cost_submissions`, con CHECK constraint que debe calzar exactamente con la lista en `cost-categories.ts` si se agrega/saca una categoría.
- **Falta:** probar el flujo de punta a punta con un gasto real (alguien del equipo sube un comprobante real, un admin lo aprueba).

**Comprobante de pago (transferencia) separado del comprobante de gasto** _(agregado: 18 ago 2026)_
- Cada ítem de la Planilla de costos ya tenía un "comprobante" -- pero ese es la boleta/factura del GASTO (cuánto se debe). Ahora hay uno segundo, distinto: el comprobante de que YA SE LE PAGÓ a esa persona/proveedor (ej. captura de la transferencia), con checkbox **"Pagado"** al lado.
- Fila nueva en cada ítem de costo: checkbox Pagado + botón para adjuntar foto/PDF del comprobante de transferencia (mismo bucket `finances`, mismo límite 25MB) + ícono para verlo. Subir el comprobante marca "Pagado" automáticamente; el checkbox también se puede tildar solo (por si se pagó en efectivo, sin comprobante).
- Columna "Pagado" (Sí/No) agregada a la tabla de impresión de Costos.
- Al **duplicar un evento**, ya se excluía a propósito el comprobante y el flag BHE por fila (para no arrastrar datos de un pago ya hecho) -- `pagado`/`comprobante_pago_url` quedan en su default (`false`/`null`) sin necesitar cambios ahí.
- Migración `073_cost_item_payment_proof.sql` aplicada en Supabase (`pagado boolean`, `comprobante_pago_url text` en `event_cost_items`). No aplica a los gastos reportados por link (`event_cost_submissions`) -- el pago se marca después de aprobado, ya como ítem normal de la Planilla.
- **✅ Bug de producción encontrado y corregido en 2 partes (18 ago 2026):** Francisco reportó que al adjuntar el comprobante de pago y apretar "Guardar costos" el dato no quedaba -- desaparecía al volver a entrar (probado varias veces en el evento "Gamuza: otra noche más aquí en Plaza Victoria 1", pago al sonidista).
  - **Parte 1 (guardado):** `saveCosts()` arma su propio payload a mano (no reusa el objeto `CostItem` completo) y se le había olvidado incluir `category`, `pagado` y `comprobantePagoUrl` en el `map()` que arma el body del PUT -- el checkbox y el archivo sí se subían y quedaban en el estado local, pero el guardado real a la base nunca los mandaba. También afectaba silenciosamente a **categoría**.
  - **Parte 2 (lectura, la que realmente causaba "no aparece nada" incluso después de corregir el guardado):** el mapeo de `event_cost_items` está **duplicado en dos endpoints distintos** -- `GET /api/eventos/[id]/costs` (que arreglé primero) y `GET /api/eventos/[id]` (usado de verdad por la página del evento, tanto en la carga inicial como en el `load()` que se llama automáticamente después de cada guardado exitoso) -- y este segundo nunca se actualizó con los 3 campos nuevos, así que después de guardar bien, la propia página los pisaba con datos incompletos al recargar. **Verificado directo en la base vía Supabase MCP** antes de tocar nada: el guardado SÍ estaba funcionando de verdad (`pagado: true` y la URL del comprobante del sonidista ya estaban ahí) -- confirmó que el problema era 100% de lectura, no de escritura. Corregido agregando los 3 campos también en `/api/eventos/[id]/route.ts`.
  - **Lección:** hay dos rutas que devuelven la misma tabla con mapeos manuales independientes -- si se agrega una columna nueva a `event_cost_items` en el futuro, hay que actualizar **ambas** (`costs/route.ts` Y `[id]/route.ts`), no solo una.
- **✅ Corregido -- malentendido revertido (18 ago 2026):** el botón "Link para gastos" se había sacado por error entendiendo mal el pedido -- Francisco aclaró que ESE botón lo usa a propósito para compartir el link con músicos/integrantes y no se toca. Restaurado. El "cuadro" que realmente sobraba era el `Input` de texto "Link comprobante" en la fila de cada ítem (al lado del botón de adjuntar boleta) -- quedaba redundante porque ya existe el ícono de vista previa (`Receipt`) una vez subido el archivo. Sacado solo ese input en las filas de ítems ya existentes (se mantiene en el formulario de "agregar ítem nuevo", ahí sigue siendo la única forma de dejar un link antes de guardar por primera vez, no hay botón de adjuntar todavía en ese punto).

**Herramienta de Smartlink** _(agregado: 16 ago 2026)_
- Nuevo grupo **Herramientas** en el menú (antes "Códigos QR" era un ítem suelto) con **Smartlink** y **Códigos QR** adentro.
- Un smartlink es una página pública (`/s/{slug}`) con carátula + nombre de canción/artista + un botón por plataforma (Spotify, Apple Music, YouTube Music, YouTube, Deezer, Tidal, SoundCloud, iTunes, Bandcamp, u "Otra" con nombre libre) — iconos de marca reales vía `simple-icons`. Pensada como "link en la bio" para un lanzamiento.
- **Tracking de verdad, no solo un contador total**: se registra cada vista de la página Y cada click, **por plataforma** — el panel de detalle (mismo patrón que QR: click en el badge de la tarjeta) muestra vistas por día en un gráfico + un ranking de qué plataforma se clickeó más. Los clicks pasan por `/s/{slug}/go/{linkId}` (mismo patrón de redirect+log que los QR) para que el conteo sea confiable.
- **Meta tags reales para el preview de WhatsApp**: como el Smartlink es una página de Next.js de verdad (no un redirect puro como el QR), usa `generateMetadata()` nativo con la carátula/título — no necesitó el truco de detectar bots que sí hizo falta para `/q/[slug]`. Igual se excluyen esos bots del conteo de "vistas" para no inflar la métrica.
- **Link corto personalizable** (pedido explícito): al crear un QR o un Smartlink ahora se puede escribir el slug a mano (ej. `/q/flyer-valpo` en vez de uno random) — ambos comparten el mismo "namespace" de slugs (`src/lib/short-slug.ts`), así que un QR y un Smartlink nunca pueden chocar con el mismo link corto aunque estén en tablas separadas.
- **Preparado para el dominio corto propio** (artspr.cl, aún sin comprar): el middleware que ya resolvía `artspr.cl/{slug} → /q/{slug}` ahora primero revisa en cuál de las dos tablas (`qr_codes` o `smartlinks`) vive el slug y reescribe al prefijo correcto — cuando se compre el dominio, QR y Smartlink van a funcionar igual de bien desde la raíz, sin código nuevo.
- Migración `069_smartlinks.sql` (`smartlinks` + `smartlink_links` + `smartlink_events`) aplicada en Supabase.
- **Diferido a propósito, ya lo dijo Francisco explícitamente:** pre-save real (OAuth con Spotify/Apple Music/Deezer, cron el día del lanzamiento) y un creador de dossier/EPK — quedan para después, son su propia sesión.
- **Falta:** subida de carátula directa (hoy es pegar una URL de imagen ya alojada en otro lado — más simple para este v1, pero valdría la pena un upload directo más adelante); probar el flujo completo con un lanzamiento real.

**Creador de códigos QR con seguimiento de escaneos** _(agregado: 14 ago 2026)_
- Nueva sección **Códigos QR** (`/qr-codes`, en el menú lateral) — por proyecto. Cada QR generado apunta a `artistpro.app/q/{slug}` en vez de directo al destino real: ese endpoint público registra el escaneo (`qr_scans`) y recién ahí redirige.
- **Seguimiento por QR individual, no por link**: se puede crear más de un QR apuntando exactamente al mismo destino (ej. "Flyer show Valparaíso" y "Bio Instagram", ambos al mismo link de streaming) — cada uno cuenta sus propios escaneos por separado, para comparar cuál funciona mejor.
- Imagen del QR generada 100% en el navegador (librería `qrcode`, sin servicio externo) — se puede descargar como PNG.
- El slug es estable: si se edita el link de destino de un QR ya creado, el QR físico ya impreso/pegado sigue funcionando (apunta al slug, no al destino final).
- Migración `068_qr_codes.sql` (`qr_codes` + `qr_scans`) aplicada en Supabase.
- **✅ Bug de producción encontrado y corregido (16 ago 2026):** el contador quedaba en 0 aunque el link ya se había escaneado 60+ veces. Causa: el registro del escaneo en `/q/[slug]` usaba `void promesa.insert(...)` (fire-and-forget) — el redirect funcionaba perfecto, pero el INSERT nunca alcanzaba a terminar antes de que el proceso pasara a la siguiente request, así que se perdía siempre, en silencio. Fix: cambiado a `after()` (API de Next.js pensada exactamente para "trabajo en segundo plano que debe completarse sí o sí"). Confirmado con curl real + query directa a Supabase antes/después. **Los ~60 escaneos previos no se pudieron recuperar** (nunca quedó ningún registro de ellos) — el contador cuenta bien desde este fix en adelante.
- **✅ Preview de WhatsApp/redes sociales (16 ago 2026):** al compartir el link `/q/[slug]`, el bot de preview de WhatsApp/Facebook/Slack/etc. no seguía el redirect para leer los meta tags de la página final. Ahora se detecta el user-agent del bot (no cuenta como escaneo real, es un fetch de la propia app) y se le sirve HTML con los `og:title`/`og:description`/`og:image` copiados en caliente del sitio de destino — confirmado funcionando con la Pre-Save real de Gamuza en Hypeddit. De paso se corrigieron 2 bugs chicos encontrados en la prueba: entidades HTML dobles (`&amp;amp;` en vez de `&amp;`, por escapar dos veces) y `og:url` mostrando el host interno del contenedor (`localhost:8080`) en vez de `artistpro.app`.
- **Pendiente / diferido a propósito, dejado explícitamente para después:** creador de links de pre-save (Spotify/iTunes/Deezer) — Francisco lo pidió pero pidió ver primero el creador de QR.

**Firma virtual del cierre de caja** _(agregado: 12 ago 2026)_
- Nueva página `/eventos/[id]/firmar` — solo-lectura del resumen financiero + planilla de costos + nota de reparto, con un botón "Estoy de acuerdo" (confirmación explícita, irreversible) para aprobar el cierre. Pensada para compartir el link (botón "Link de firma" junto a Reabrir, visible solo con la caja cerrada) con el equipo del proyecto.
- **Firmantes = automático**: los `project_members` del proyecto del evento, calculados en caliente (no se guardan aparte) — si alguien entra o sale del proyecto después, la lista de requeridos cambia sola.
- **Bloqueante**: mientras no firmen todos, el evento muestra el badge "Pendiente de aprobación (X/Y)" en la Planilla de costos; cuando firman todos pasa a "Aprobado por todos".
- **Acceso restringido de verdad** (no solo por login): la API (`/api/eventos/[id]/signatures`) valida que quien pide los datos sea `project_member` de ESE proyecto específico (o admin) — alguien de otro proyecto de la misma organización no puede ver ni firmar este cierre.
- **Log auditable**: cada fila de `event_closing_signatures` guarda quién (perfil completo, no solo ID) y cuándo exacto — se muestra en la página de firma junto a cada firmante.
- **Reabrir caja borra las firmas** — si se reabre es porque algo va a cambiar en la planilla, las firmas viejas quedarían aprobando una versión que ya no es la que se vuelve a cerrar.
- Push automático al resto del equipo cuando alguien firma (y uno especial cuando queda 100% aprobado), reusando `sendPushToUsers()`.
- **Migración `067_event_closing_signatures.sql`** aplicada en Supabase.
- **Hallazgo colateral (no arreglado, fuera de alcance de este cambio):** `GET /api/eventos/[id]` (el endpoint general que usa la página de edición completa del evento) no filtra por proyecto — cualquier miembro de la organización puede ver el detalle completo de cualquier evento de cualquier proyecto, no solo del suyo. La página nueva de firma NO tiene este problema (usa su propio endpoint con chequeo de `allowedProjectIds`), pero valdría la pena revisar el endpoint general en algún momento si el aislamiento por proyecto importa en otras partes de Eventos.
- **Falta:** probar de punta a punta con Joaquín/Gonzalo/Francisco en el evento real de Gamuza que mencionó.

**Notificaciones push — Web Push nativo implementado** _(agregado: 12 ago 2026)_
- **Auditoría de letra chica primero:** se revisó `src/app/eventos/[id]/page.tsx` (único archivo con filas densas tipo planilla) y se encontraron 2 gaps reales que la bitácora daba por cerrados: Costos (fila Detalle+Monto sin `text-xs`, inconsistente con la fila Responsable+Comprobante del mismo ítem) y Venta de entradas/tramos (ningún campo tenía el tamaño reducido). Corregidos ambos, en fila existente y en "agregar nuevo". `tsc`/`eslint` limpios.
- **Decisión de arquitectura:** Web Push API nativa (VAPID), sin servicio externo (OneSignal, etc.) — consistente con "100% local" del proyecto. Diseñado para que el salto futuro a app nativa (Capacitor/Android/iOS) sea agregar un canal nuevo (`push_subscriptions.channel`), no rediseñar: la lógica de negocio (quién se notifica y por qué) vive separada del transporte (`sendPushToUsers()` en `src/lib/push.ts`).
- **Implementado:**
  - Migración `064_push_subscriptions.sql` (tabla `push_subscriptions`, RLS: cada usuario ve/borra solo las suyas; el envío usa el service role para leer suscripciones de otros usuarios)
  - `src/lib/push.ts` — helper server-only, limpia solas las suscripciones vencidas (410/404)
  - `/api/push/subscribe` (POST/DELETE) — guarda/borra la suscripción del navegador
  - `public/sw.js` — handlers `push` (muestra la notificación) y `notificationclick` (enfoca pestaña existente o abre una nueva)
  - `NotificationToggle.tsx` reescrito: antes solo pedía permiso y mostraba una notificación de prueba local; ahora se suscribe de verdad vía `PushManager` y guarda la suscripción en el backend
  - Trigger: al crear una tarea con `assigneeIds` (`POST /api/tasks`) o al agregar un asignado nuevo a una tarea existente (`PUT /api/tasks/[id]`, con diff contra los asignados previos para no reenviar a quien ya estaba) — nunca se notifica a quien hizo la asignación si se auto-asignó
  - Claves VAPID generadas y puestas en `.env.local` (no committeadas) y en Railway (production); documentadas en `.env.example`
  - Migración 064 aplicada en Supabase (corrida por Claude vía MCP — Francisco pidió que las migraciones de Supabase las corra siempre Claude)
- **✅ Bug de producción encontrado y corregido (12 ago 2026):** el toggle daba "Notificaciones push no configuradas todavia" en producción aunque las 3 variables VAPID estaban perfectas en Railway (confirmado con `/api/health`, visibles en runtime). **Causa raíz real:** el proyecto se despliega con un `Dockerfile` literal (no Nixpacks, aunque `railway.toml` diga `builder = "nixpacks"` — ese campo no se está usando). En un build por Dockerfile, Railway NO filtra automáticamente todas las variables de servicio al paso `RUN npm run build` — solo las que el Dockerfile declara explícitamente con `ARG` (así es como funcionan los builds de Docker). El `Dockerfile` ya tenía `ARG`/`ENV` para `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY`, pero nadie agregó `NEXT_PUBLIC_VAPID_PUBLIC_KEY` cuando se construyó esta feature — por eso el build seguía horneando `process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY` sin resolver en el bundle del navegador, aunque el mismo contenedor ya corriendo sí veía la variable bien (build-time y runtime son entornos distintos en un build por Dockerfile). Fix: agregado `ARG NEXT_PUBLIC_VAPID_PUBLIC_KEY` + `ENV` correspondiente en `Dockerfile`, antes de `RUN npm run build`. Confirmado en producción: la clave ya aparece "horneada" (literal) en el bundle servido.
  - **Nota para el futuro:** cualquier variable `NEXT_PUBLIC_*` nueva que se necesite en el navegador tiene que agregarse en 2 lugares — Railway (Variables) Y el `Dockerfile` (`ARG`+`ENV`) — no basta con Railway solo. De paso quedó pendiente (no urgente, no bloquea nada, tiene fallback silencioso): `NEXT_PUBLIC_SITE_URL` (usado en `forgot-password/page.tsx`) y `NEXT_PUBLIC_META_APP_ID` (no se encontró usado en ningún componente cliente, podría ser código muerto) tampoco están declaradas como `ARG` en el Dockerfile — si alguna vez dejan de comportarse bien, este es el motivo.
- **Falta:** probar de punta a punta con un usuario real (activar el toggle en Configuración > Proyecto, asignarle una tarea, confirmar que llega la notificación al celular/notebook)

**Notificaciones push — 5 tipos nuevos agregados sobre la base anterior** _(agregado: 12 ago 2026)_
- Reutiliza toda la infraestructura de arriba (`sendPushToUsers()`, `push_subscriptions`) — nada de esto cambia el transporte, solo agrega triggers nuevos.
- **Menciones en comentarios** (`@usuario` en tareas y deals) — ya existía el sistema de menciones (tabla `mentions`, usado por `NotificationPopover`); ahora además dispara un push. Enganchado en `POST /api/tasks/[id]/comments` y `POST /api/deals/[id]/comments`.
- **Tareas por vencer**: avisos a 5, 2 y 1 día antes del `due_date`, solo si la tarea no está en `listo`/`descartado`. Notifica a los `task_assignees`.
- **Deals por vencer**: mismo esquema (5/2/1 días) sobre `expected_close`, excluyendo deals en una etapa `is_won`/`is_lost`. Notifica a los `deal_assignees`.
- **Evento mañana**: eventos en estado `confirmado` con fecha = mañana, avisa a todo `project_members` del proyecto del evento.
- Los 3 de arriba corren en un cron nuevo: **`/api/cron/daily-reminders`** (mismo patrón `CRON_SECRET` que `sync-instagram`/`detect-leads`). Deduplicación real vía tabla nueva `reminder_log` (UNIQUE por tipo+entidad+umbral) — si el cron se reintenta el mismo día no se manda el aviso de nuevo.
- **Botón manual "Notificar cambios"** en la página de detalle de Evento — dispara al toque (no espera al cron) un push a todo el proyecto avisando que algo cambió. `POST /api/eventos/[id]/notify`.
- **Notificación de admin con mensaje libre** — página nueva **Configuración > Notificaciones** (`/settings/notifications`, solo admins), con selector de audiencia (toda la organización o un proyecto puntual) + título/mensaje + historial de lo mandado. `POST`/`GET /api/admin/broadcast`.
- **Migración `065_notification_infra.sql`** aplicada en Supabase: tabla `reminder_log` (dedup, sin policies a propósito — solo el cron con service role la toca) y `admin_broadcasts` (historial, RLS: solo admins de la org ven sus propios broadcasts vía `is_org_admin()`).
- `tsc`, `eslint` y `next build` completo limpios.
- **Falta:**
  - **Crear el Cron Job en Railway** para `/api/cron/daily-reminders` (mismo patrón que los crons de Instagram/Shopify/detect-leads que ya existen ahí) — corre diario, reusa el `CRON_SECRET` que ya está configurado, no necesita variable nueva.
  - Probar cada tipo con datos reales (mencionar a alguien, una tarea/deal por vencer, un evento de mañana, mandar un broadcast de prueba).

**Botón "Confirmar Timing" — envío de correo a contactos del evento** _(idea nueva de Francisco, agregado: 10 ago 2026)_
- Reemplaza al genérico "botón Enviar" diferido — esta es la especificación concreta que Francisco quiere avanzar
- **Selección de destinatarios:** se eligen desde los Contactos del evento (Contactos Importantes) — necesita UI para marcar/seleccionar a quién se le manda
- **Flujo:**
  1. Botón **"Confirmar Timing"** (estado inicial, timing aún no enviado) → al apretarlo, envía correo a los contactos seleccionados. Asunto/cuerpo tipo: *"Ya tenemos el timing confirmado para el evento [nombre]"* / *"Ya tienes disponible para revisar el timing del próximo evento"* + link al timing del evento
  2. Una vez enviado, el botón cambia de texto/estado — pasa a **"Reenviar actualización"**
  3. Si se modifica algo del timing **después** de haberlo enviado, apretar ese botón manda un correo distinto: *"Han actualizado la información, revisa el timing actualizado..."*
  4. **Correo automático el día anterior al evento** (recordatorio, no depende de un botón): *"Mañana es el día, tienes todo preparado, [lo que corresponda], recuerda revisar el timing"*
- **Por definir / a diseñar:**
  - Cómo se rastrea el estado "enviado" vs "modificado desde el último envío" (¿timestamp de último envío + timestamp de última edición del timing, comparados?)
  - Qué servicio de envío de correo se usa (¿Gmail vía la integración ya conectada, o un servicio transaccional tipo Resend/SendGrid?)
  - El recordatorio del día anterior necesita un cron job (similar al de sync de Instagram) que revise eventos con fecha = mañana y dispare el correo automáticamente
  - Definir textos finales de los 3 correos (confirmación / actualización / recordatorio) — Francisco dio la idea general, falta redacción final

**Sync automático de venta de entradas — 2 veces al día** _(especificado: 10 ago 2026)_
- Antes diferido sin definir; Francisco ya definió el horario: cron job a las **12:00** y **00:00**
- Reutiliza la misma lógica que ya tiene el botón "Sincronizar" manual (lee el link de la ticketera), solo que disparado por cron en vez de por click — similar al cron diario de Instagram

**Venues compartidos entre proyectos — solución implementada** _(agregado: 10 ago 2026, implementado: 10 ago 2026)_
- **Diseño acordado con Francisco:** los venues son un catálogo compartido (nombre + dirección, comuna/región/país, lat/lng) — igual que el buscador de lugares de PortalTickets. Cualquier proyecto puede encontrar y reutilizar un venue que otro proyecto ya cargó. Pero todo lo que tiene valor comercial (capacidad, contacto, mood, descripción, website, instagram, empresa asociada) queda **privado por proyecto** en una tabla nueva `venue_project_details` — si Francisco vende Katarsis/Trino como servicio a otro cliente, esos datos operativos de Gamuza no se filtran.
- Un proyecto solo ve un venue en su página `/venues` si ya tiene datos guardados ahí (`onlyUsed=true`). El selector de venue al crear un evento sigue mostrando el catálogo completo (para poder reutilizar), marcando "nunca usado por tu proyecto" cuando corresponde — y al seleccionar uno nuevo para el proyecto, el formulario pide llenar los datos privados desde cero.
- "Eliminar" en `/venues` ahora solo quita los datos privados del proyecto (deja de "usar" el venue) — nunca borra el venue del catálogo compartido, porque otro proyecto puede seguir usándolo.
- **Backfill:** los 10 venues que existen hoy son todos de Gamuza (confirmado por Francisco) — la migración copia sus datos privados actuales a `venue_project_details` con ese proyecto.
- **Verificado:** `tsc --noEmit` y `eslint` limpios en los 8 archivos tocados. (`next build` no se pudo probar completo en este sandbox por bloqueo de red a Google Fonts — no relacionado al cambio, debería compilar bien en Railway.)
- **✅ Migración aplicada directo en Supabase (10 ago 2026).** Antes de correrla se descubrió que no eran 10 venues sino **13** (había 3 más antiguos — Plaza Victoria, Biblioteca Quinta Normal, Kilombo Bar — sin `project_id` asignado); se verificó vía sus eventos (`shows.project_id`) que también son de Gamuza, así que el backfill los incluyó a los 13. `venue_project_details` quedó con 13 filas, todas Gamuza. Sin nuevos warnings de seguridad en Supabase Advisors.
- **Falta:** aplicar el código (patch/zip de abajo) y probar el flujo en la app.

~~**Kanban de tareas — delay de 2 segundos**~~ _(creado: 6 may 2026, cerrado: 10 ago 2026)_
- ✅ Francisco confirma que este problema ya no ocurre / ya está solucionado — sin acción pendiente

---

## 🟡 Mejoras UX (próximas semanas)

**✅ Auditoría de tamaños de letra en toda la app** _(agregado: 10 ago 2026, auditado: 18 ago 2026)_
- **Método:** se identificó que el patrón de bug real es específico -- **filas densas tipo planilla** (varios campos lado a lado, imitando spreadsheet) donde algunos inputs usan `text-xs`/`h-7` y otros quedan en el tamaño por defecto del componente `Input` (`text-base` en celular, intencional para que iOS no haga zoom al enfocar -- ver `md:text-sm` en `input.tsx`). En formularios normales de una columna (Sheets, Dialogs, páginas de Configuración) ese tamaño por defecto está bien y NO es el bug -- ahí no hay nada que corregir.
- Las únicas filas densas tipo planilla de toda la app viven en **Eventos** (`SortableList`, usado solo ahí: Contactos, Setlist, Timing, Costos, Tramos de entradas) -- se revisaron las 5 y se encontró **1 gap real sin corregir**: en **Timing/Cronograma**, la fila "Hora" + "Detalle/actividad" seguía en tamaño por defecto mientras la fila de abajo (Responsable + Notas, del mismo ítem) ya estaba en `text-xs` -- quedaba un salto de tamaño visible dentro del mismo ítem. Corregido (tanto en las filas existentes como en el formulario "agregar nuevo").
- Se revisaron además ~130 usos de `Input`/`TypeaheadInput`/`MoneyInput` en el resto de la app (Contactos, Deals, Finanzas, Proyectos, Configuración, Analytics, etc.) -- todos son formularios espaciados de una columna, tamaño correcto, nada que corregir.
- La revisión estética *completa* con la app de referencia (Notifica Legal) sigue siendo un tema aparte, sin agendar todavía.

**4. Importar / Exportar tablas**
- ✅ Importar: confirmado ok (CSV de tareas, contactos)
- Exportar: Tareas a CSV, Contactos con sus empresas a CSV — **estado sin confirmar**, hay que revisar si quedó funcionando (el endpoint `/api/export` ya existe para contactos/deals, faltaría confirmar que cubre tareas)

**✅ Vista Carta Gantt en Tareas** _(descubierto ya construido: 18 ago 2026 -- este ítem estaba desactualizado en la bitácora, alguna sesión anterior ya lo hizo y no quedó documentado)_
- Ya existe y está en producción: pestaña **Gantt** en `/tasks` (junto a Kanban y Lista), componente `TaskGanttView.tsx`, sin librería externa (SVG/CSS a mano).
- **v1 -- punto en el tiempo, no rango:** como el modelo de `Task` hoy solo tiene `dueDate` (no existe `start_date`), cada tarea se dibuja como una barra corta centrada en su fecha de vencimiento, no como un rango largo desde un inicio. El comentario en el código ya lo documenta a propósito.
- Agrupa por Campaña (subproyecto); "Sin campaña" al final. Marca overdue (ícono rojo) y línea de "hoy". Las tareas sin fecha de vencimiento se cuentan aparte, no se pueden ubicar en la línea de tiempo.
- **Si se quiere el rango real** (barra desde inicio hasta deadline, lo que originalmente pedía este pendiente) hay que agregar `start_date` al modelo de `Task` (migración + `TaskForm` + tipo `Task`) y extender `TaskGanttView` para dibujar el rango -- no se hizo todavía, quedaría como v2 si Francisco lo pide explícitamente.

---

## 🟢 Funcionalidad nueva (futuro cercano)

**6. Notificaciones push** _(prerequisito: responsables de tareas ✅ YA LISTO)_
- Backend: endpoint para enviar notificaciones cuando se asigna tarea
- Frontend: solicitar permiso de notificaciones
- Opciones: Web Push API nativa o servicio como OneSignal
- Trigger: cuando se crea tarea con assignees o se agrega assignee a tarea existente

---

## 🔵 Futuro lejano

**7. Módulo de seguimiento RRSS** _(alcance actualizado: 10 ago 2026)_
- ✅ Instagram ya está cubierto (Métricas + sync ya implementado)
- Falta: **TikTok** y **YouTube** — registrar publicaciones, métricas, campañas
- Conectar con deals/contactos

---

**✅ Fix: no se podía hacer scroll del menú móvil (hamburguesa)** _(resuelto: 20 ago 2026)_

Francisco reportó que en el celular no podía hacer scroll dentro del menú desplegable lateral. Causa: el `<nav>` de `MobileNav.tsx` (la lista de links dentro del `Sheet` que se abre con el ícono de hamburguesa) tenía `flex-1` pero le faltaba `overflow-y-auto` y `min-h-0` -- en flexbox, un hijo `flex-1` dentro de un contenedor `flex-col` necesita `min-h-0` para poder encogerse y habilitar su propio scroll interno; sin eso, el contenido simplemente se corta cuando no entra completo (y el scroll del fondo está bloqueado mientras el Sheet está abierto, así que no había forma de ver el resto de las opciones). Fix de una línea: `className="flex-1 px-3 py-4 space-y-1"` → `className="flex-1 min-h-0 overflow-y-auto px-3 py-4 space-y-1"`.

**✅ Fix real: subir comprobante en `/eventos/[id]/gastos` no hacía nada al elegir un archivo** _(resuelto: 20 ago 2026)_

Bug encontrado con el log de diagnóstico del punto anterior: en el Chrome de Francisco, `e.target.files` (el `FileList` del input) es una referencia VIVA -- el código nuevo (agregado al sumar soporte multi-archivo) leía `Array.from(fileList)` DESPUÉS de resetear `e.target.value = ""` (el reset es necesario para poder re-subir el mismo archivo dos veces seguidas). En ese navegador, resetear el value vacía esa misma lista en el momento, así que `Array.from()` después del reset devolvía 0 archivos -- por eso el toast decía "No se detectó ningún archivo". El código viejo (antes de esta sesión) no tenía este problema porque sacaba el `File` individual con `[0]` ANTES de resetear el value. Fix: `Array.from(fileList)` se ejecuta ahora ANTES de tocar `e.target.value`, materializando los archivos primero. Log de diagnóstico ya sacado.

**✅ Fix adicional: sw.js con cache-control no-cache (para que el fix anterior tome efecto rápido)** _(agregado: 19 ago 2026, mismo día)_

Francisco reportó que el fix del punto anterior no se notaba -- ni siquiera subir UNA foto funcionaba ("no hace nada"). Causa probable: `/sw.js` se serví­a sin headers explícitos de cache, así que algunos navegadores pudieron haber seguido usando la copia VIEJA del Service Worker (la que interceptaba todo, incluidos los POST) por un rato después del deploy, en vez de detectar la versión nueva altiro. Se agregó `Cache-Control: no-cache, no-store, must-revalidate` explícito para `/sw.js` en `next.config.ts` -- así el navegador siempre revalida contra el servidor antes de decidir si hay una versión nueva del Service Worker, en vez de confiar en una copia cacheada.

**Nota para Francisco:** si después de este deploy sigue sin andar, hay que forzar el reemplazo del Service Worker viejo a mano una vez: DevTools > Application > Service Workers > "Unregister", después recargar. Después de eso no debería volver a pasar.

**✅ Fix: "Failed to fetch" al subir varias fotos de comprobante** _(agregado: 19 ago 2026, mismo día)_

Al probar la función de subir 2-5 fotos recién construida, Francisco no podía subir las fotos -- la consola mostraba `Uncaught TypeError: Failed to fetch` disparado desde `sw.js` (el Service Worker de la PWA). Causa: `public/sw.js` tenía un `fetch` handler que re-lanza TODOS los requests (`event.respondWith(fetch(event.request))`), incluyendo POSTs con body -- ese patrón "passthrough" es un bug conocido de Chrome: re-fetchear un `event.request` con un body de varios MB (varias fotos en base64 en un solo POST) puede fallar silenciosamente adentro del Service Worker. Esto ya era un riesgo latente desde que se creó el Service Worker (18 ago, solo para habilitar "Instalar app"), pero recién se manifestó con esta función porque es el primer POST del CRM con un body realmente grande.

**Fix**: el fetch handler ahora solo intercepta GETs (`if (event.request.method !== "GET") return;`) -- todo lo que no sea GET (POST/PUT/DELETE, o sea prácticamente todas las llamadas a la API) pasa derecho al navegador sin pasar por el Service Worker. De paso se agregó `sharp` a `serverExternalPackages` en `next.config.ts` (mismo motivo que `better-sqlite3`: binario nativo, no se debe empaquetar con webpack) para evitar un problema similar en producción con la conversión WebP→PNG.

**✅ Link para reportar gastos: hasta 5 fotos por comprobante, se combinan en un PDF y se suma el monto** _(agregado: 19 ago 2026, mismo día)_

En `/eventos/[id]/gastos` (el link que se comparte para que cualquiera del proyecto reporte un gasto), antes solo se podía subir UN archivo por gasto. Pedido de Francisco: poder subir de 1 a 5 fotos, y que si son varias, se calcule el monto de cada una y se combinen en un solo PDF.

- El input de comprobante ahora acepta selección múltiple (hasta 5 archivos).
- **1 archivo** (foto o PDF): mismo comportamiento de siempre -- se sube tal cual, la IA lee el monto como sugerencia.
- **2 a 5 archivos** (tienen que ser todas fotos, no PDF): se manda cada una a un endpoint nuevo (`POST /api/eventos/cost-submissions-merge`) que (1) le lee el monto a CADA foto con IA en paralelo y suma el total, y (2) las combina en un solo PDF (una foto por página, vía `pdf-lib` -- nueva dependencia; WebP se re-codifica a PNG con `sharp` porque pdf-lib no lo soporta nativo). El PDF combinado queda como el único comprobante adjunto, y el monto total leído se precarga en el campo (igual que siempre, editable antes de enviar).
- Nuevo: `src/lib/pdf-merge.ts` (arma el PDF), `src/app/api/eventos/cost-submissions-merge/route.ts` (orquesta lectura + combinación).

**✅ Registro de actividad: sumado Tareas + rediseño visual (dark mode + estilos del resto de la app)** _(agregado: 19 ago 2026, mismo día)_

Dos ajustes pedidos por Francisco sobre el fix del Registro de actividad recién hecho:

1. **Tareas conectado**: `POST/PUT/DELETE` de `/api/tasks` y `/api/tasks/[id]` ahora también llaman a `logActivity()` -- se suma a Contactos, Deals, Finanzas, Préstamos y Eventos ya conectados antes.
2. **Rediseño visual**: la página original (`/settings/activity`) se armó con HTML crudo y clases Tailwind fijas (`bg-white`, `text-gray-700`, `border-gray-300`) que no reaccionan al tema oscuro -- por eso se veía en blanco duro sobre fondo oscuro y con una tipografía que no calzaba con el resto de la app (los inputs/tabla nativos no heredan el mismo reset que los componentes de shadcn). Se reconstruyó como `ActivityLogPanel` (`src/components/settings/ActivityLogPanel.tsx`), un componente cliente que usa los mismos componentes de UI que el resto del CRM (`Table`, `Badge`, `Select`, `Input`, tokens de tema `bg-card`/`text-muted-foreground`) -- se ve y comporta igual que, por ejemplo, la tabla de Prensa. La página en sí (`src/app/settings/activity/page.tsx`) quedó como server component solo para el chequeo de admin + redirect, delegando toda la UI al panel. Filtro de usuario ahora usa nombre/email real (vía `/api/org-members`) en vez de una lista cruda de emails. Se agregó al menú (Configuración > Actividad, admin-only) -- antes solo era accesible escribiendo la URL a mano, no tenía link en ningún lado.

**✅ Fix: el Registro de actividad (`/settings/activity`) no registraba nada** _(agregado: 19 ago 2026, mismo día)_

Francisco entró a "Registro de actividad" (Configuración > Actividad, admin) y no había ningún registro. Causa: la función `logActivity()` (`src/lib/activity-logs.ts`) se había construido junto con la tabla `activity_logs` y la página de admin, pero nunca se llamaba desde ningún endpoint que crea/edita/borra datos -- el sistema estaba completo pero desconectado. Se conectó en los módulos principales: **Contactos**, **Deals**, **Finanzas** (transacciones), **Préstamos** y **Eventos** -- cada `POST`/`PUT`/`DELETE` de esos endpoints ahora registra quién hizo qué, sobre qué entidad, y en qué proyecto. Queda pendiente sumar el resto de módulos (Tareas, Campañas, etc.) si Francisco los necesita también.

**✅ "Leer link con IA" en Prensa -- soporte para Instagram/TikTok/YouTube** _(agregado: 19 ago 2026, mismo día)_

Francisco probó la función recién construida con un Reel de Instagram y no leyó nada -- el scraper genérico (HTML a texto + IA) solo sirve para sitios de noticias normales, no para RRSS que renderizan todo por JS. `/api/analytics/press-extract` ahora detecta el dominio y usa 3 caminos distintos:
- **TikTok / YouTube**: tienen oEmbed público (sin token) que devuelve título/autor de forma confiable -- se usa directo, sin pasar por IA.
- **Instagram**: no tiene oEmbed público desde 2020 (Meta lo cerró, requiere token de la Graph API con app revisada) y no expone la descripción/caption en el HTML plano sin sesión iniciada -- solo se puede leer de forma confiable la cuenta que publicó (viene en el meta `og:url`). Se rellena esa cuenta como medio y se le avisa al usuario con un toast que tiene que completar descripción/fecha a mano.
- **Cualquier otro sitio** (noticias, blogs): sigue el flujo original de scrapear + IA, que sí funciona bien.

**✅ Leer link con IA en Prensa** _(agregado: 19 ago 2026, mismo día)_

Al registrar una mención de prensa, ahora se puede pegar el link de la nota y presionar "Leer" -- el servidor abre la página, la limpia a texto plano (`src/lib/html-to-text.ts`, extraído del helper que ya usaba `tickets-extract` para no duplicarlo) y la IA sugiere medio, tipo (radio/tv/digital/digital·rrss), descripción corta y fecha de publicación. Solo rellena los campos que pudo leer -- no pisa nada que el usuario ya haya escrito a mano -- y todo queda editable antes de guardar, mismo criterio que el resto de las lecturas con IA de la app. Nuevo endpoint `POST /api/analytics/press-extract` + `extractPressMentionFromText` en `src/lib/openai.ts`. Reset de Finanzas del proyecto LUR a pedido de Francisco (borrado permanente de las 40 transacciones de prueba, ninguna tenía comprobantes adjuntos) para volver a cargar el presupuesto de cero.

**✅ Ajuste "Adjuntar comprobante con IA" -- vendor correcto en transferencias + cuotas múltiples** _(agregado: 19 ago 2026, mismo día)_

Feedback real de Francisco probando la función recién construida, con un comprobante de Mercado Pago (transferencia a Kuyen Galeas, "Segunda cuota producción LUR"): la IA leyó a Francisco (quien envía la plata, el origen) como "vendor" en vez de a Kuyen (quien la recibe, el destino) -- y de paso surgió que una misma línea de presupuesto se puede pagar en 2+ cuotas (esta era justamente la segunda). Dos fixes:

1. **Prompt de extracción corregido** (`src/lib/openai.ts`, `RECEIPT_PROMPT`): regla explícita para comprobantes de transferencia -- "vendor" es SIEMPRE la cuenta de DESTINO (quien recibe la plata), nunca el origen, aunque el origen aparezca primero o más destacado en el comprobante (como en Mercado Pago, donde la cuenta propia sale arriba).
2. **Comprobantes múltiples por transacción** -- antes cada gasto solo podía tener un archivo adjunto (`transactions.file_path`), lo que impedía registrar una 2da/3ra cuota sin perder la anterior. Nueva tabla `transaction_attachments` (migración 079) para ir sumando comprobantes sin reemplazar los previos. El buscador de coincidencias (`match-receipt`) ya no descarta gastos que ya tienen comprobante -- los sigue mostrando como candidatos (marcados con "ya tiene N adjuntos") porque puede ser la cuota siguiente. Nuevos endpoints `POST/DELETE /api/finances/[id]/attachments`; `GET /api/finances` ahora devuelve `attachments: [...]` con URLs firmadas de todos los comprobantes de cada transacción, y la lista de Finanzas muestra un ícono por cada uno.

**✅ Fix "Devoluciones pendientes" falsas + Adjuntar comprobante con IA (Finanzas)** _(agregado: 19 ago 2026)_

Dos cosas en la misma sesión, sobre el presupuesto del LP "Los Últimos Románticos" ya cargado en Finanzas:

1. **Fix de datos:** al importar las ~40 líneas del presupuesto, el nombre del proveedor (Claudio Becerra, Collage, Crismol, DimePipe, etc.) había quedado guardado en el campo `responsible_name` de la transacción. Ese campo es para "un miembro del equipo que pagó de su bolsillo y hay que devolverle la plata" — no para el proveedor externo al que se le paga. Esto hacía que ~24 gastos reales del presupuesto aparecieran mal en la pestaña "Devoluciones pendientes". Corregido con un `UPDATE` acotado por `project_id` + `type = 'expense'` + `reimbursed = false` que limpió esos 24 registros (verificado con `RETURNING`, ningún dato se borró).

2. **Nueva función — "Adjuntar comprobante (IA)"** (botón nuevo en Finanzas, junto a "Nuevo Comprobante"): se sube una foto o PDF del comprobante de pago, la IA lo lee (reutiliza `extractReceiptFromImage`/`extractReceiptFromText` de `src/lib/openai.ts`, ya usado en Costos de eventos) y busca entre los gastos del presupuesto que todavía no tienen comprobante adjunto cuál podría ser. Si encuentra una coincidencia razonable (por monto + similitud de texto en descripción/categoría) pregunta *"¿Este pago se hizo para pagar 'X'?"* — si se confirma, el archivo queda adjunto a esa transacción existente (sin crear una nueva). Si no encuentra nada, pregunta *"¿Este pago podría ser el gasto nuevo 'X'?"* y, si se confirma, crea la transacción con los datos leídos por la IA y el comprobante ya adjunto. Nuevo endpoint `POST /api/finances/match-receipt`; `PUT /api/finances/[id]` ahora también acepta `filePath`/`fileName` para adjuntar/reemplazar comprobante en una transacción ya existente (antes explícitamente no se soportaba).

**✅ Continuación de sesión — mobile, importador masivo, Métricas de Eventos, Venues** _(completado: 9 de agosto de 2026)_

Segunda mitad de la misma sesión larga del módulo Eventos (ver v1.0 más abajo para la primera mitad). Resumen:

**Mobile / responsive**
- Botones con solo ícono en pantallas angostas en toda la página de detalle de evento (Setlist, Timing, Costos: Subir archivo/Imprimir/Adjuntar documento/Cerrar caja) — el texto vuelve desde `sm:` hacia arriba
- Encabezado de la página de evento y de la lista de Eventos pasan a apilarse en columna en celular en vez de apretujarse al lado del título
- Filas de Venta de entradas y Contactos partidas en 2 líneas en celular (5 campos no entran en una sola línea sin importar cuánto se achique la letra)
- Setlist y Contactos: letra ajustada a `text-sm`/`text-xs` — heredaban el `text-base` (16px) que el `Input` base usa a propósito en celular para que iOS no haga zoom al enfocar un campo; el resto de las secciones ya tenía el tamaño correcto, estas dos no
- Barra de navegación inferior en celular (`MobileBottomNav.tsx`): Dashboard, Eventos, Tareas, Métricas — inspirada en una app de referencia (Notifica Legal) que Francisco encontró con buena UX de accesos rápidos; CRM se dejó fuera a propósito (trabajo de Kanban/formularios largos, mejor en escritorio)
- **Fix real de drag-and-drop en touch** (Tareas y Tratos): el intento inicial (agregar `TouchSensor` con delay junto al `PointerSensor` existente) no funcionó — la documentación de dnd-kit dice explícitamente que no hay que mezclar `PointerSensor` con `TouchSensor`/`MouseSensor`. Solución correcta y ya confirmada: **handle de arrastre dedicado** (ícono `GripVertical` en la esquina de cada tarjeta) en vez de que toda la tarjeta sea arrastrable — deja el resto de la tarjeta 100% libre para scroll nativo sin ninguna ambigüedad. Motor de sensores cambiado a `MouseSensor` + `TouchSensor` (nunca `PointerSensor` junto a estos). Aplicado en `TaskKanbanBoard.tsx` y `DealCard.tsx` (comparten el hook `useKanbanDnd`)
- Fix relacionado: el layout general (`<main>`) solo bloqueaba scroll vertical, no horizontal — cualquier desborde (como el Kanban) arrastraba a toda la página con él en vez de quedarse contenido en su propia barra de scroll. Se agregó `overflow-x-hidden` global en `AppShell.tsx`

**Gráficos de Métricas — bug sistémico de tooltip**
- El fix anterior (labelStyle) solo arreglaba el **título** del tooltip; el **valor** de abajo seguía invisible por la misma causa (heredaba el color casi-blanco del tema oscuro) porque le faltaba también `itemStyle`. Corregido en los 8 gráficos que ya se habían tocado antes (ResumenTab, PlatformTab, MerchTab, EventsSummaryTab, MerchDashboard, SpotifyStatsCharts, InstagramDemographics, PressMonthlyChart)
- `EventsSummaryTab` (Métricas > Eventos) reestructurado: el gráfico agrupa utilidad **por mes** (no un bloque por evento individual, que se vuelve ilegible con muchos eventos históricos) + selector de rango arriba (3/6/12 meses o Todo), mismo patrón que ya usa Instagram/Spotify
- Encabezados ordenables tipo Excel (flecha ↓/↑) en la tabla "Posts y Reels" de Instagram — clic ordena descendente primero, segundo clic invierte

**Importador masivo — reforzado tras usarlo de verdad con datos reales**
- Ampliado el target "shows" (ya existía, era de antes de la unificación a Eventos): se agregaron Nombre, Estado, Hora, Dirección, Gira como columnas soportadas
- **Bug real encontrado y corregido:** el importador guardaba fee/entradas/egresos sin convertir a centavos — quedaban 100 veces más chicos que el valor real
- **Bug real encontrado y corregido (fechas):** el parser de fechas asumía ciegamente el orden año-mes-día sin validar rangos — si una fecha pasaba por Excel/Sheets y volvía con día/mes reordenado (pasó de verdad, un CSV real llegó con `2025-21-02`), la importación fallaba con error de Postgres en vez de corregirse sola. Ahora valida rangos y hace swap automático si el "mes" es inválido pero el "día" calza como mes
- **Selector de formato de fecha con vista previa real**, agregado en el paso de mapeo de columnas — en vez de que el sistema adivine el orden día/mes, la persona lo elige mirando un dato real de su archivo y una vista previa de cómo quedaría interpretado. Esto es necesario a propósito: fechas ambiguas (día y mes ambos ≤12) no se pueden adivinar bien de forma automática, "esto siempre va a pasar" con archivos que pasan por Excel
- **"Actualizar si ya existe" para Eventos** — checkbox que busca por nombre dentro del mismo proyecto y actualiza en vez de duplicar; pensado específicamente para poder volver a subir el mismo CSV después de corregir algo (ej. una fecha mal leída la primera vez) sin ir acumulando duplicados
- Se generaron y depuraron a mano ~21 eventos históricos de Gamuza + 2 de Simplemente Yo desde un reporte real de PortalTickets.cl (Excel de ventas de tickets), con harness de verificación cruzada entre dos versiones del reporte (uno agregado por ticket individual, otro ya agregado por evento con fecha/hora real) para no dejar pasar fechas mal inferidas

**Venta de entradas — sync directo desde el link de la ticketera**
- Además del pantallazo (ya existía), ahora se puede pegar el link público de estadísticas de PortalTickets y sincronizar directo: el servidor abre la página, limpia el HTML a texto plano, y la IA extrae los tramos — confirmado contra una URL real antes de construir
- A diferencia del pantallazo (que agrega tramos), sincronizar **reemplaza** todos los tramos — tiene sentido para mantener los números al día sin duplicar

**Campo "Gira" en eventos**
- Campo de texto simple con autocompletado (no se mezcló con el módulo Campañas existente, que es para marketing/prensa con empresa/contacto asociado — se evaluó a propósito y se descartó por no calzar)
- Filtro "Todas las giras" en la lista de Eventos, etiqueta visible en cada tarjeta, soportado también en el importador masivo

**Adjuntar comprobante en Planilla de costos**
- Antes solo se podía pegar un link; ahora también se puede subir una foto o PDF directo (máx. 25MB), que llena el mismo campo de texto con la URL del archivo subido — sin necesidad de columna nueva en la base

**Venues creados a partir de eventos existentes**
- Se revisaron los eventos de Gamuza y se crearon 10 fichas de Venue nuevas para los venues que solo estaban como texto libre (Bar Ramblas, El Nuevo Peregrino, El Viejo, Espacio La Aldea, Estudio Vinilo, Jardín Mallinkrodt, La Perrera, Lemutt Bar, Sala Los Leones, Taberna Pirata), con la comuna ya conocida por contexto y dirección "Por definir" para completar a mano
- Los 15 eventos correspondientes quedaron re-vinculados (`venue_id`) a estas fichas nuevas, no solo con el texto libre
- No se creó ficha para "Por definir" (7 eventos de la gira "La Amistad Hecha Bolero") — es un placeholder, no un venue real

**Orden del menú lateral** — Dashboard, CRM, Métricas, Eventos, Campañas, Tareas, Finanzas (antes CRM estaba después de Métricas, y Campañas antes de Eventos)

**Botón "Agregar a mi calendario" en el link público del evento** (`/e/[id]`)
- Genera un archivo `.ics` (estándar universal, funciona en Google/Apple/Outlook) con: nombre del evento, horario tomado del Timing (primera actividad a última — se probó extrayendo min/max de textos libres como "15:00 - 16:30"), dirección, y un link de vuelta a la misma página pública en la descripción

**Otros fixes chicos de esta continuación:**
- El grid de 4 columnas del resumen financiero se rompía en "Imprimir todo" porque una regla genérica de impresión (pensada para separar secciones) también le pisaba el `display:grid` a esas tarjetas — se restauró a propósito y se achicó letra/relleno solo para impresión
- La tarjeta de evento en la lista de Eventos cortaba el título en celular porque el bloque de "utilidad" tenía ancho fijo y nunca cedía espacio — mismo patrón de fix que en la página de detalle (apilar en columna en celular)
- Los íconos de editar/duplicar/eliminar en la lista de Eventos solo aparecían "al pasar el mouse" — en celular (sin hover) quedaban invisibles e inutilizables; ahora siempre visibles en touch, con hover solo desde escritorio

---

**✅ Módulo Eventos — construcción completa** _(completado: agosto 2026, sesión larga — primera mitad)_

Se unificó "Shows en vivo" + "Métricas > Shows" en un solo módulo **Eventos**, y se construyó encima toda una planilla de ejecución por evento. Resumen de lo que quedó (cada pieza tiene su propia migración numerada en `scripts/migrations/`):

- **Merge Shows en vivo + Métricas > Shows** → módulo único `/eventos`, con `/analytics/eventos` como dashboard de solo lectura filtrado a estado "Realizado" (bug real encontrado: antes contaba eventos cancelados/cotizando en la utilidad).
- **Venues como entidad propia** (como Empresas): combobox de búsqueda/creación en el formulario de evento, autocompletado de dirección con Google Places (server-side, la key nunca llega al navegador), campos de capacidad/mood/estacionamiento/backline/contacto/empresa asociada.
- **Nombre propio del evento**, independiente del venue (ej. "PAMN" tocado en la Biblioteca de Quinta Normal).
- **Fuente del trato + comisión Trino**: campo `source` en Tratos (Trino/Trino Nuevo/Artista antiguo/Artista nuevo) que determina si la comisión es % del ingreso neto (valor del trato) o % de la utilidad del evento vinculado. % editable por proyecto, override opcional por trato.
- **Planilla de ejecución del evento**, todas como listas reordenables (drag-and-drop) con guardado explícito:
  - **Setlist** — con lectura por IA de imagen, PDF o texto pegado.
  - **Timing/Cronograma** — Hora/Detalle/Responsable/Notas, misma lectura por IA (imagen/PDF/texto).
  - **Planilla de costos** — Detalle (autocompleta contra un catálogo de roles que crece solo), Responsable (autocompleta contra contactos del proyecto), Comprobante (link), casilla **BHE** que calcula automático bruto/retención (15,25% vigente 2026)/líquido.
  - **Venta de entradas por tramo** — con lectura por IA de pantallazos de plataformas de ticketing (PortalTickets, etc.), distingue precio unitario de monto acumulado.
  - **Contactos importantes** — Cargo/Nombre/Teléfono + casilla de visibilidad en el link público (apagada por defecto).
- **Cierre de caja**: botón que deja la planilla de costos de solo lectura, con documento adjunto opcional (reusa el bucket de Storage que ya tenía Finanzas).
- **Duplicar evento** (pensado para giras): copia nombre/venue/setlist/rider de banda/planilla de costos como plantilla; resetea fecha/estado/plata/venta de entradas.
- **Impresión por partes o todo junto**: botones de Imprimir independientes en Setlist/Timing/Costos/Contactos (cada uno con su encabezado con logo del proyecto + nombre/fecha/dirección del evento), más "Imprimir todo" para mandarle un reporte completo a la directiva. Pie de página con marca de Artist Pro en todas.
- **Link público sin login** (`/e/[id]`): header + contactos marcados + timing + setlist + riders (si existen). Metadata de OG/WhatsApp dinámica (título = nombre del evento, descripción con proyecto+fecha+venue, logo de Artist Pro como imagen). Teléfonos con botones de WhatsApp/llamada.
- **PWA instalable** (`manifest.ts` + service worker mínimo sin cache agresivo + iconos con fondo navy de marca).
- **Filtro por defecto "Próximos"** en la lista de Eventos (antes mostraba pasados primero); los pendientes de confirmar siguen visibles aunque ya pasaron.

**Bugs reales encontrados y corregidos en el camino** (dejar constancia porque algunos son sutiles y podrían repetirse en otros módulos):
- `Select` de base-ui no resuelve la etiqueta del valor seleccionado solo — hay que pasarle el label explícito como children, si no muestra el valor crudo (pasó con Proyecto/Artista mostrando un UUID).
- El mapeo de deals para el Kanban (`CrmPageClient.tsx`) perdía campos al armar el objeto a mano — pasó dos veces (primero `isShow`, después `projectId`/`artistProjectId`) y rompía silenciosamente el popup "¿Armamos el evento?".
- Bulk upsert a Supabase/PostgREST con arrays de objetos de **distinta forma** (algunos con `id`, otros sin) inserta `NULL` explícito en la columna faltante en vez de dejar que la base la genere — rompía con 500 al mezclar ítems nuevos y ya guardados en el mismo guardado. Afectaba a los cinco endpoints de listas reordenables (setlist/timing/costos/entradas/contactos); arreglado generando el `id` en el servidor para las filas nuevas también.
- El layout general (`AppShell`) usa `h-screen`+`overflow-hidden` para el scroll fijo del sidebar — eso cortaba cualquier impresión a una sola página, y el sidebar/header nunca estaban marcados como `no-print`. Fix global en `globals.css`, no solo para Eventos.
- El `<body>` raíz es `display:flex` — cualquier página nueva sin `w-full` explícito se encoge al ancho de su contenido en vez de ocupar toda la pantalla (pasó en el link público, dejaba una franja oscura al lado).
- `metadata.icons` en Next.js **pisa por completo** la convención de archivo (`icon.png`) aunque solo se defina una sub-clave (`apple`) — apagó el favicon sin querer.

---

**✅ Refactor: Simplificación total del sistema de responsable** _(completado: 7 may 2026)_
- **Problema persistente:** Dropdown de "Encargado del gasto" no cargaba miembros del proyecto correctamente
- **Decisión estratégica:** Cambiar el enfoque completamente - en lugar de seleccionar responsable, hacer log automático
- **Nuevo flujo implementado:**
  1. **Usuario que registra el gasto** → automático (`responsibleUserId = user.id`)
  2. **Nombre del responsable** → automático (`responsibleName = user.full_name || user.email`)
  3. **Si lo pagó otra persona** → campo opcional de texto libre para indicar nombre externo
- **Eliminaciones:**
  - Dropdown complejo con Select de project_members (eliminado por completo)
  - Constantes `EXTERNAL_KEY` y `NONE_KEY` (ya no se necesitan)
  - Schema field `responsibleKey` (simplificado)
  - Estado `members` y su useEffect de carga (ya no se necesita)
  - Prop `members` del componente TransactionForm (eliminado)
  - Lógica compleja de validación de miembro en useEffect (innecesaria)
- **UI simplificada:**
  - Campo: "¿Lo pagó otra persona?" (Input de texto simple)
  - Placeholder: "Dejar vacío si lo pagaste tú (opcional)"
  - Texto explicativo: "Por defecto quedas tú como quien ingresó el gasto"
  - Checkbox reembolsado: Solo aparece si hay nombre externo con el texto dinámico "el dinero ya fue devuelto a {nombre}"
- **Beneficios:**
  - ✅ **Log automático:** Siempre queda registrado quién ingresó cada gasto (trazabilidad)
  - ✅ **UX ultra-simplificada:** Un solo campo opcional en lugar de dropdown complejo
  - ✅ **Sin dependencia de APIs:** No requiere cargar miembros del proyecto
  - ✅ **Más robusto:** Sin errores de dropdown vacío o miembros no encontrados
  - ✅ **Mantiene funcionalidad:** Reembolsos a terceros siguen funcionando igual
- **Código más limpio:**
  - 72 líneas eliminadas (de 96 a 24 en lógica de responsable)
  - Sin complejidad de Select + validación + carga de members
  - onSubmit simplificado: solo 2 casos en lugar de 3 anidados
- **Build verificado:** ✓ 10.2s compile, TypeScript passing
- **Archivos modificados:** 2 (TransactionForm.tsx, finances/page.tsx)
- **Commit:** `ffc368d`

**✅ Fix final: Miembros del proyecto + comprobantes clickeables** _(completado: 7 may 2026)_
- **Problemas reportados:**
  1. Dropdown "Encargado del gasto" seguía sin mostrar usuarios del proyecto - mostraba solo `__none__`
  2. Comprobante se quedaba en "Cargando..." indefinidamente en modal de edición
  3. Usuario prefería que el nombre del archivo fuera clickeable directamente sin esperar
- **Causa raíz identificada:**
  - **Problema 1:** Se estaba cargando `organization_members` (todos los usuarios de la org) en lugar de `project_members` (usuarios del proyecto específico)
  - **Problema 2:** Sistema de URL firmada con `createSignedUrl()` tardaba demasiado o fallaba silenciosamente, dejando el estado en "Cargando..."
- **Soluciones implementadas:**
  - **Miembros del proyecto:**
    - Query cambiado de `organization_members` a `project_members`
    - Agregado filtro `.eq("project_id", activeProjectId)`
    - Agregado `activeProjectId` a dependencias del useEffect
    - Ahora solo muestra usuarios asignados al proyecto activo
  - **Comprobantes clickeables:**
    - Eliminado completamente el sistema de URL firmada (estado `signedUrl` y lógica `createSignedUrl`)
    - Nueva función helper `getFilePublicUrl(filePath)` que usa `storage.getPublicUrl()`
    - Comprobante convertido en link `<a>` clickeable con hover effect
    - Ícono ExternalLink visible todo el tiempo
    - Sin delay - funciona instantáneamente
    - Implementado tanto en modal de edición como en lista de transacciones
- **Resultado:**
  - ✅ Dropdown ahora muestra correctamente los miembros del proyecto activo
  - ✅ Comprobantes se abren instantáneamente al hacer clic en el nombre
  - ✅ No más "Cargando..." colgado
  - ✅ UX mejorada: archivo clickeable con efecto hover visual
- **Build verificado:** ✓ 5.5s compile, TypeScript passing
- **Archivos modificados:** 2 (finances/page.tsx, TransactionForm.tsx)
- **Commit:** `152844e`

**✅ Fix: Dropdown responsable + visualización de comprobantes en edición** _(completado: 7 may 2026)_
- **Problemas reportados:**
  1. Dropdown "Encargado del gasto" mostraba `__none__` en lugar del responsable seleccionado al editar transacción
  2. Al editar transacción, no se mostraba el comprobante adjunto (si existe)
  3. Para editar era necesario buscar el botón de edición — mejorar UX haciendo clic directo en descripción
- **Fixes implementados:**
  - **Bug del dropdown:**
    - Agregada validación explícita de `responsibleUserId` en useEffect de TransactionForm
    - Verificación de que el miembro existe en la lista `members` antes de asignar valor
    - Uso de `shouldValidate: true` en setValue para forzar actualización del Select de shadcn/ui
    - Verificación de strings vacíos con `.trim() !== ""`
    - Dependencias del useEffect incluyen `members` para recalcular si cambian
  - **Visualización de comprobante:**
    - ExtExtended `InitialTransaction` interface con `fileUrl` y `fileName`
    - Nuevo estado `signedUrl` para almacenar URL firmada temporal de Supabase Storage
    - useEffect que detecta `initialData.fileUrl` y genera URL firmada automáticamente (válida 1 hora)
    - Nueva sección UI en formulario de edición:
      - Muestra nombre del archivo con ícono File
      - Link "Abrir" con ExternalLink icon para ver archivo en nueva pestaña
      - Estado "Cargando..." mientras se genera signedUrl
      - Solo visible en modo edit cuando hay archivo adjunto
  - **Descripción clickeable:**
    - Cambio de `<span>` a `<button>` en TransactionList
    - Hover effect con `hover:text-blue-600`
    - title="Clic para editar" para feedback visual
    - onClick llama directamente a `onEdit(t)` para abrir modal
    - Mejora UX: clic directo sin buscar botón de edición
- **Resultado:** 
  - ✅ Dropdown ahora muestra correctamente el responsable seleccionado al editar
  - ✅ Comprobantes adjuntos son accesibles desde el modal de edición
  - ✅ Experiencia de edición más fluida con clic directo en descripción
- **Build verificado:** ✓ Compila exitosamente (6.6s), TypeScript passing
- **Archivos modificados:** 2 (TransactionForm.tsx, finances/page.tsx)
- **Commit:** `4caef3f`

**✅ Fix: RLS para upload de comprobantes en Supabase Storage** _(completado: 7 may 2026)_
- **Problema:** Error "new row violates row-level security policy" al intentar subir comprobantes en producción con Supabase
- **Causa raíz:** El bucket `finances` en Supabase Storage no tenía políticas de Row Level Security configuradas
- **Solución implementada:**
  - **Migración SQL:** Nuevo archivo `scripts/migrations/002_finances_storage_setup.sql`
    - 4 políticas RLS para el bucket `finances`:
      1. **INSERT** - Usuarios autenticados pueden subir a su carpeta (`receipts/{user_id}/*`)
      2. **SELECT** - Miembros de la org pueden ver todos los archivos del bucket
      3. **DELETE** - Usuarios pueden eliminar solo sus propios archivos
      4. **UPDATE** - Usuarios pueden actualizar/reemplazar sus propios archivos
  - **Documentación:** Nuevo archivo `SUPABASE_STORAGE_SETUP.md`
    - Instrucciones paso a paso para crear bucket y ejecutar migración
    - Explicación de cada política y qué permite
    - Queries de verificación
    - Sección de troubleshooting
  - **README actualizado:**
    - Nueva sección "Configuración de Supabase Storage"
    - Instrucciones rápidas con link a docs detalladas
    - Agregada funcionalidad de Finanzas a la lista de features
- **Configuración del bucket:**
  - Nombre: `finances`
  - Visibilidad: Privado (NO público)
  - Límite de tamaño: 10 MB por archivo
  - Tipos permitidos: PDF, JPG, PNG, WEBP
- **Estructura de archivos:** `receipts/{user_id}/{timestamp}.{ext}`
- **Encargado del gasto:** Confirmado que funciona correctamente - puede ser:
  - Cualquier usuario miembro del proyecto (selector dropdown)
  - Nombre externo libre (campo de texto)
- **Resultado:** Sistema de finanzas completamente funcional en producción con upload seguro de comprobantes
- **Archivos creados:** 2 (migración SQL + documentación)
- **Archivos modificados:** 2 (README + BITACORA)

**✅ Finanzas — edición y asignación de usuario** _(completado: 7 may 2026)_
- **Requerimiento:** Permitir editar transacciones existentes y manejar asignación de responsables
- **Implementación:**
  - **API endpoint PUT:** Nuevo `/api/finances/[id]` PUT para editar transacciones completas
    - Campos editables: type, amount, description, category, transactionDate, responsibleUserId, responsibleName, reimbursed
    - Validación de tipo y monto
    - PATCH mantiene compatibilidad para toggle rápido de reimbursed
  - **TransactionForm modo edit:**
    - Prop `initialData` opcional para detectar modo edit vs create
    - Pre-carga formulario con datos existentes usando useEffect
    - Upload de archivo solo en modo create (no se permite cambiar archivo en edit)
    - Título dinámico: "Editar Transacción" vs "Nuevo Comprobante"
    - Botón: "Actualizar" vs "Guardar Comprobante"
    - Lógica de responsable: detecta si es user_id (miembro) o nombre externo
  - **UI de finanzas:**
    - Botón "Editar" (Pencil icon) en cada transacción
    - Estado `editingTransaction` para manejar transacción seleccionada
    - Función `handleEdit` abre formulario con initialData
    - Función `handleCloseForm` limpia estado al cerrar
    - Interface Transaction incluye `responsibleUserId` opcional
  - **Flujo completo:**
    1. Usuario hace clic en botón Editar
    2. Se abre formulario pre-cargado con datos de la transacción
    3. Usuario modifica campos (monto, descripción, categoría, fecha, responsable, reimbursed)
    4. Submit hace PUT a `/api/finances/[id]`
    5. Recarga lista y cierra formulario
- **Funcionalidad YA existente (no modificada):**
  - ✅ Asignación de responsable con selector de miembros o nombre externo
  - ✅ Toggle reimbursed (pendiente/pagado) con badge visual
  - ✅ API PATCH para marcar reembolsado rápidamente desde la lista
- **Resultado:** Sistema de finanzas completo con edición inline, gestión de responsables y estados de devolución
- **Build verificado:** ✓ Compila exitosamente, TypeScript passing
- **Archivos modificados:** 3 (api/finances/[id]/route.ts, TransactionForm.tsx, finances/page.tsx)

**✅ Fix: Referencias remanentes de Activities** _(completado: 7 may 2026, fix post-deploy)_
- **Problema:** Build de Railway falló con errores TypeScript — ContactDetail y classify route todavía referenciaban Activities
- **Errores encontrados:**
  - `ContactDetail.tsx`: Importaba `ActivityForm` y `ACTIVITY_TYPE_CONFIG` (eliminados)
  - `contacts/[id]/page.tsx`: Query a tabla `activities` en Supabase (eliminada)
  - `api/classify/route.ts`: Calculaba `activityCount` y `daysSinceLastActivity` para scoring (campos eliminados de ScoringInput)
- **Fix implementado:**
  - **ContactDetail.tsx:** Eliminados imports, props `activities`, estado `showActivityForm`, función `handleCompleteActivity`, y card completa de "Activity timeline". Grid cambiado de 3 columnas a 2 (info + deals).
  - **contacts/[id]/page.tsx:** Eliminado query a activities, removido parámetro `activities` del componente
  - **api/classify/route.ts:** Eliminado query a activities, función `classifyLead` ahora recibe `[]` (array vacío), removida lógica de lastActivity y daysSinceLastActivity
- **Verificación:** Build local exitoso ✓ (5.6s compile, TypeScript passing)
- **Resultado:** Todas las referencias a Activities completamente eliminadas del codebase
- **Commits:** `1ce6c8c` (eliminación inicial) + `1a86815` (fix de referencias remanentes)

**✅ Eliminación de módulo Activities** _(completado: 7 may 2026)_
- **Requerimiento:** Remover módulo Activities - las tareas son el centro del sistema
- **Implementación:**
  - **Archivos eliminados (7):**
    - `src/app/activities/page.tsx` - Página principal de activities
    - `src/components/activities/ActivityForm.tsx` - Formulario
    - `src/app/api/activities/route.ts` + `[id]/route.ts` - API endpoints
    - `src/app/api/followups/route.ts` - Endpoint de seguimientos
    - `src/components/dashboard/NotificationBanner.tsx` - Banner que usaba followups
    - `src/components/shared/NotificationChecker.tsx` - Polling de followups (cada 5 min)
  - **Navegación:**
    - Removido link "Actividades" del menú principal
    - Eliminado import de `Activity` icon en nav-config.ts
  - **Deal detail:**
    - Reemplazado sección "Actividades" con "Tareas"
    - Query cambiado de `activities` a `tasks` filtrado por `deal_id`
    - UI actualizada: muestra status/priority/due_date de tareas
    - Links directos a `/tasks?taskId={id}`
  - **Dashboard:**
    - Removido `NotificationBanner` component (reemplazado por NotificationPopover de tareas)
    - Removido `NotificationChecker` de AppShell (polling obsoleto)
  - **Tipos y referencias:**
    - Eliminado `ActivityType` y `Activity` interfaces de `types/index.ts`
    - Removido `activities?: Activity[]` de `ContactWithDeals`
    - Eliminado `ACTIVITY_TYPE_CONFIG` de `lib/constants.ts`
    - Ajustado `classifyLead` en `lib/claude.ts` para usar `type: string` genérico
  - **Scoring:**
    - Removido `activityCount` y `daysSinceLastActivity` de `ScoringInput`
    - Aumentado peso de deals: `hasDeals` +15 (antes +10), `dealValue` bonuses duplicados
    - Score ahora se enfoca en: temperatura, completitud de datos, valor de deals
- **Resultado:** Sistema simplificado centrado en tareas con notificaciones en tiempo real (NotificationPopover) en lugar de polling de seguimientos obsoletos
- **Archivos modificados:** 8 (nav-config, deals/[id]/page, dashboard page, AppShell, types, constants, claude, scoring)

**✅ Botón de notificaciones — sistema de alertas de tareas** _(completado: 7 may 2026)_
- **Requerimiento:** Bell button decorativo sin funcionalidad → pivote a sistema de alertas de tareas
- **Implementación (Opción 1 - Rápida, 45 min):**
  - Endpoint `/api/task-notifications` GET:
    - Filtra tareas asignadas al usuario actual
    - Calcula tareas atrasadas (dueDate < hoy, status != done)
    - Calcula deadlines cercanos (próximos 3 días)
    - Retorna `{ overdue[], upcoming[], total }`
  - Componente `NotificationPopover`:
    - Badge rojo con contador (muestra "9+" si >9)
    - Popover con secciones separadas por urgencia
    - Links directos: `/tasks?taskId={id}`
    - Auto-cierra al hacer click en notificación
    - Estado vacío elegante cuando no hay alertas
  - Integrado en Header (reemplazó botón decorativo)
- **Archivos:**
  - `src/app/api/task-notifications/route.ts` (nuevo)
  - `src/components/shared/NotificationPopover.tsx` (nuevo)
  - `src/components/layout/Header.tsx` (modificado)
- **Futuro (Opción 2):** Menciones @usuario en comentarios, tabla notifications para persistir leído/no leído, notificaciones push

**✅ Dashboard no carga al volver de otra app** _(completado: 6 may 2026)_
- **Problema:** Dashboard no recargaba al volver de otra app con token refresh
- **Solución:** Corregido timing issue con listener de `TOKEN_REFRESHED` - el listener ahora está activo antes de que dispare el evento
- **Implementación:** Movido `addEventListener` dentro de `useEffect` antes del check inicial

**✅ Asignar responsables a tareas** _(completado: 6 may 2026)_
- **Requerimiento:** Sistema multi-usuario para asignar tareas (prerequisito para notificaciones push)
- **Implementación:**
  - Tabla `task_assignees` (Supabase) con relación many-to-many tasks ↔ profiles
  - API: GET `/api/tasks` devuelve array `assignees[]`, POST acepta `assigneeIds[]`
  - UI: Multi-select estilo Notion con búsqueda, chips, avatares, scroll
  - Filtro "Asignadas a mí" en página de tareas
  - Solo muestra usuarios del proyecto activo (no toda la org)
  - Fallback a email cuando falta `full_name` en profiles
  - Kanban muestra avatares (primeros 3 + contador overflow)
- **Bugs corregidos:**
  - FK ambiguity en Supabase (especificado `task_assignees_task_id_fkey` explícito)
  - React loop infinito (removido `onClick` del div wrapper del Checkbox)
  - Usuarios sin perfil mostraban "Usuario" (fetch de `auth.users` como fallback)
- **Migration:** `scripts/migrations/005_task_assignees.sql`

**✅ Simplificar formulario de tareas** _(completado: 6 may 2026)_
- Campo proyecto removido (usa proyecto activo automáticamente)
- Subproyecto reordenado arriba de contacto
- Labels "(opcional)" agregados a campos no obligatorios (Contacto, Empresa, Deal)
- Campo contacto siempre visible (antes condicional)

---

## 📝 Notas técnicas

### Migration 005 (task_assignees)
- FK a `profiles(id)` (no `organization_members.user_id`)
- Índices: task_id, user_id, assigned_by
- RLS policies: miembros del proyecto pueden ver/modificar

### API Changes
- `/api/project-members` ahora accesible para miembros (no solo admins)
- `/api/tasks` devuelve array `assignees` con perfiles completos
- Especificación explícita de FK paths para evitar ambigüedad Supabase

### Bugs corregidos
- React loop infinito en checkbox (eliminado onClick conflictivo con onCheckedChange)
- FK ambiguity error (especificado `task_assignees!task_assignees_task_id_fkey`)
- Usuarios sin perfil mostraban "Usuario" (ahora busca email en auth.users)
- Dashboard no recargaba al volver de otra app (listener timing fix)
- TypeScript error en task-notifications: projects/subprojects inferidos como `never` (fix: `as any[]` en loop)
- PopoverTrigger `asChild` prop no soportado en @base-ui/react (removido, Button como hijo directo)

---

## 🐛 Fix Storage: URLs firmadas para bucket privado

**Fecha:** 7 de mayo de 2026  
**Commit:** 87eed50  
**Problema:**  
Error "Bucket not found" al intentar ver comprobantes de gastos. El bucket `finances` existe en Supabase y tiene las 4 políticas RLS correctamente configuradas, pero los archivos no se podían visualizar.

**Causa raíz:**  
El bucket `finances` es **privado** (correcto por seguridad). Sin embargo, el código usaba `getPublicUrl()` que solo funciona con buckets públicos. Cuando intentas acceder a una URL pública de un bucket privado, Supabase retorna error 404 o "Bucket not found".

**Solución implementada:**
1. **TransactionForm.tsx:**  
   - Reemplazado `getFilePublicUrl()` con `getFileSignedUrl()` (async)
   - Agregado estado `fileUrl` para almacenar la URL firmada
   - useEffect carga la URL firmada cuando `initialData.fileUrl` existe
   - Link del comprobante usa `fileUrl` con validación (muestra error si aún no carga)

2. **finances/page.tsx:**  
   - Reemplazado `getFilePublicUrl()` con `getFileSignedUrl()` (async)
   - Creado componente `<FileLink>` que maneja carga de URL firmada con estado
   - Muestra spinner mientras carga, oculta botón si falla
   - Cada transacción con archivo genera su URL firmada al renderizar

3. **Herramientas de diagnóstico:**
   - Script `diagnose-storage.ts` para verificar bucket, políticas, y acceso
   - Comando `npm run diagnose:storage` para troubleshooting
   - Instalado `dotenv` para cargar `.env.local` en scripts

**URLs firmadas vs públicas:**
- `createSignedUrl(path, expiresIn)`: Genera URL temporal (1h) que funciona con buckets privados
- `getPublicUrl(path)`: Genera URL permanente que SOLO funciona con buckets públicos
- Las URLs firmadas son seguras: incluyen token JWT que expira

**Policies RLS vigentes:**
1. INSERT: usuarios pueden subir a `receipts/{user_id}/*` (su carpeta)
2. SELECT: miembros de organización pueden VER todos los archivos
3. DELETE: usuarios pueden eliminar solo sus propios archivos
4. UPDATE: usuarios pueden actualizar solo sus propios archivos

**Seguridad:** Bucket privado + URLs firmadas + RLS policies = acceso controlado y auditable ✅

**Mejoras UX (commit 58ed49a - mismo día):**
Problema secundario: al hacer clic en el archivo, quedaba en "Cargando archivo..." indefinidamente sin indicación visual de qué estaba pasando. Usuario no sabía si estaba cargando o si falló.

**Solución:**
1. **TransactionForm.tsx:**
   - Estado `loadingFileUrl` para tracking de carga
   - 3 estados visuales: Spinner animado (cargando) / Link clickeable (éxito) / Mensaje rojo (error)
   - Logging detallado: `[TransactionForm] Cargando URL firmada para: {path}`
   - Toast de error si falla la generación de URL
   - Mensajes informativos: "No se pudo cargar el archivo. Verifica los permisos."

2. **finances/page.tsx (FileLink):**
   - Estado `error` para distinguir entre loading y fallo
   - 3 estados visuales: Spinner (loading) / Ícono verde clickeable (success) / Ícono rojo deshabilitado (error)
   - Logging detallado: `[FileLink] Solicitando URL firmada para: {path}` + resultado
   - Tooltip "Error al cargar archivo" en estado de error
   - Manejo de excepciones con try/catch

**Debugging mejorado:**
- Todos los logs tienen prefijo `[TransactionForm]` o `[FileLink]` para identificar origen
- Se logea la ruta del archivo solicitado
- Se logea el éxito o error de la operación
- Permite identificar problemas de permisos RLS o rutas incorrectas en BD

**Resultado:** Usuario siempre sabe qué está pasando (cargando / abierto / error) en lugar de quedarse sin feedback.
