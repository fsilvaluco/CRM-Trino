# Bitácora de Trabajo — Auto-CRM
_Checkpoint v1.1 — 9 de agosto de 2026, ~23:30 hrs (cierre de sesión larga)_
_Checkpoint anterior: v1.0 — 7 de agosto de 2026_

> **Formato de tracking:** Registro histórico de trabajo realizado + pendientes actuales.  
> Cada entrada incluye fecha, estado (🔨 En Progreso / ✅ Hecho), y notas de implementación detalladas.
> Este checkpoint existe para poder empezar una conversación nueva sin perder contexto — si estás
> retomando desde acá, lee primero "🔴 Crítico" y "⚠️ Por verificar" antes de construir nada.

---

## 🔴 Crítico (arreglar primero)

**Confirmar que el último paquete se aplicó y se probó** _(pendiente al cierre de esta sesión)_
- Último envío: fixes de gráficos de Métricas (tooltip invisible, agrupación por mes en Eventos) — Francisco no había confirmado aplicar+probar todavía cuando se cerró la sesión
- Antes de seguir construyendo sobre Métricas/Eventos, confirmar que quedó bien

_Fuera de eso, ningún bug crítico conocido sin resolver._

---

## ⚠️ Por verificar / sin probar a fondo

**Google Maps — comuna en direcciones reales**
- Sigue sin probarse a fondo con muchas direcciones reales (ver checkpoint anterior)
- Ahora es más urgente: se crearon 10 venues nuevos con dirección "Por definir" (ver más abajo) que Francisco va a completar a mano — buen momento para validar que el autocompletado de comuna funciona bien con esas direcciones reales cuando las ingrese

**pdf-parse en producción**
- Sigue sin confirmación explícita de que funciona en Railway (ver checkpoint anterior) — pero Francisco hizo importaciones CSV grandes después de este fix sin quejarse de PDFs específicamente, así que probablemente esté bien. No hay confirmación 100% directa.

---

## 🟢 Diferido a propósito (decisión del usuario, no son bugs)

- **Notificaciones push**, **botón "Enviar"**, **Timing general de gira**, **agrupación por secciones en Timing**, **login con clave por evento en el link público**, **ícono de Instagram/redes en el header impreso** — sin cambios desde el checkpoint anterior, siguen todos pendientes tal como se dejaron
- **Revisión estética general (espaciados y tamaños)** — se avanzó *parcialmente*: se corrigió el tamaño de letra en Setlist/Contactos (heredaban `text-base` de 16px en celular en vez de `text-sm`/`text-xs` como el resto de las secciones) y se reordenaron varias filas para que no se corten en celular. Pero la revisión estética *general* con la app de referencia (Notifica Legal) que Francisco quería agendar en PC sigue sin hacerse — esto fueron fixes puntuales de bugs, no esa revisión completa.
- **Sync automático/periódico de venta de entradas** — hoy el botón "Sincronizar" en Venta de entradas es manual (lee el link de la ticketera al apretarlo). Un sync automático periódico requeriría un cron job, similar a como ya funciona la sincro de Instagram.
- **Direcciones reales de venues** — se crearon 10 fichas de Venue nuevas a partir de eventos ya cargados (ver sección de completado), pero quedaron con dirección "Por definir" — Francisco las va a completar a mano con las direcciones reales. Los 7 eventos de la gira "La Amistad Hecha Bolero" quedaron con venue "Por definir" (no una ficha real) porque no se sabía el venue real al momento de importar — van a necesitar edición manual cuando se sepan.

---

## 🟠 Importante (esta semana)

**2. Kanban de tareas — delay de 2 segundos** _(creado: 6 may 2026)_
- Investigar si el delay viene del optimistic update o de la query de revalidación
- Implementar actualización optimista real (actualizar UI antes de que confirme el server)
- Ayuda en multiusuario también (no esperar respuesta para mostrar el cambio)
- **Estado:** Diferido para después (decisión del usuario)
- **Estimado:** 2-3 horas

---

## 🟡 Mejoras UX (próximas semanas)

**4. Importar / Exportar tablas**
- Exportar: Tareas a CSV, Contactos con sus empresas a CSV
- Importar: subir CSV de tareas, contactos
- El endpoint `/api/export` ya existe para contactos/deals — extender a tareas

**5. Vista Carta Gantt en Tareas**
- Vista visual de tareas con fechas de inicio / deadline en línea de tiempo
- Requiere que las tareas tengan `start_date` y `due_date` bien definidos
- Librería candidata: `gantt-task-react` o implementación custom con CSS grid

---

## 🟢 Funcionalidad nueva (futuro cercano)

**6. Notificaciones push** _(prerequisito: responsables de tareas ✅ YA LISTO)_
- Backend: endpoint para enviar notificaciones cuando se asigna tarea
- Frontend: solicitar permiso de notificaciones
- Opciones: Web Push API nativa o servicio como OneSignal
- Trigger: cuando se crea tarea con assignees o se agrega assignee a tarea existente

---

## 🔵 Futuro lejano

**7. Módulo de seguimiento RRSS** (TikTok, Instagram, etc.)
- Registrar publicaciones, métricas, campañas
- Conectar con deals/contactos

---

## ✅ Completado recientemente

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