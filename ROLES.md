# Roles y control de acceso en Artist Pro

**Última actualización:** 23 ago 2026 — este documento se escribió el mismo día que se hizo la
corrección grande de aislamiento entre proyectos (ver `BITACORA.md`), así que refleja el estado justo
después de esa corrección. Es un documento vivo — está pensado para seguir trabajándolo, no es un
resumen de una sola sesión.

**Para qué sirve este documento:** es una auditoría completa de cómo funciona hoy el sistema de roles y
permisos de Artist Pro — qué existe, cómo se calcula el acceso en el código, dónde ya se aplica bien,
dónde NO se aplica todavía (y por qué eso importa), y las inconsistencias encontradas entre lo que dice
la base de datos, lo que hace el código de la aplicación, y lo que dice la interfaz. Está pensado para
que Francisco lo use como referencia de trabajo al planificar la intranet de trabajadores de la app (no
del proyecto/CRM) y cualquier rediseño futuro del sistema de permisos.

---

## 1. Los 3 niveles de rol

Artist Pro tiene **tres capas independientes** de rol, y es fácil confundirlas porque comparten nombres
parecidos:

```
Organización (Trino, la agencia)
 └─ organization_members.role: owner | admin | member
      │
      │ controla: acciones administrativas de la organización en sí
      │ (invitar gente, billing, borrar la organización)
      │
      │ NO controla (desde el 23 ago 2026): acceso a los datos de un
      │ proyecto puntual -- eso es 100% del nivel de abajo
      ▼
Proyecto (Gamuza, Los Últimos Románticos, Trino como sello, etc.)
 └─ project_members.role: admin | member | artist | staff
      │
      │ controla: qué puede ver/editar esa persona DENTRO de ese
      │ proyecto puntual (Deals, Costos de eventos, etc.)
      │
      │ se hereda hacia abajo si el proyecto tiene una "madre":
      ▼
Proyecto madre / hijo (projects.parent_project_id)
   Trino es madre de: Deni Li, Gamuza, Los Últimos Románticos, Simplemente Yo
   El rol que alguien tiene en la madre aplica igual en los hijos.
```

**La confusión más común, y la que causó el bug que arrancó todo esto (23 ago 2026):** que alguien sea
`admin` de la ORGANIZACIÓN no significa que tenga acceso a todos los PROYECTOS. Son cosas separadas.
Antes del 23 ago, el código sí trataba "admin de organización" como un pase libre a todo — eso ya no es
así (ver sección 6).

---

## 2. Nivel 1: rol de organización (`organization_members`)

Tabla: `organization_members` — columnas relevantes: `user_id`, `organization_id`, `role`, `status`
(`pending`/`active`).

| Rol | Qué es | Qué controla hoy |
|---|---|---|
| `owner` | El dueño de la cuenta de la organización. Solo puede haber transferirse manualmente, no se asigna desde la UI. | Único rol que no se puede editar/eliminar desde `/api/org-members` (ver sección 7). Por lo demás, **funciona igual que `admin`** para todo lo que es acceso a datos de proyectos (desde el 23 ago 2026, ya no tiene bypass especial ahí). |
| `admin` | Manager/productor de la agencia. | Puede invitar/eliminar/cambiar el rol de otros miembros de la organización (`/api/org-members`), asignar gente a proyectos (`/api/project-members`) -- **sin que el propio código verifique que ese admin tenga acceso al proyecto al que está asignando gente** (ver hallazgo en sección 8.2). Ve el selector de proyecto con "Todos los proyectos" como opción. |
| `member` | Cualquier otra persona de la organización -- managers, y también artistas/staff (no hay un rol de organización separado para ellos, se diferencian a nivel de PROYECTO). | Nada especial a nivel de organización -- todo su acceso real viene del nivel de proyecto. |

**Importante:** no existe un rol de organización "artist" o "staff" -- esa distinción es SOLO a nivel de
proyecto. Un artista de "Los Últimos Románticos" tiene `organization_members.role = member`, y
`project_members.role = artist` (o lo que corresponda) en el proyecto LUR específicamente.

### Estado actual de la organización (Trino), 23 ago 2026

| Usuario | Rol de organización | Roles de proyecto (`project_members`) |
|---|---|---|
| `francisco@katarsis.music` | **owner** | member en los 9 proyectos (Deni Li, Gamuza, Katarsis, La Sagrada, LUR, Prueba 2, Simplemente Yo, SiSoy, Trino) |
| `francisco@somostrino.cl` | admin | admin en Prueba 2 y Trino **(hereda Deni Li/Gamuza/LUR/Simplemente Yo por ser admin de Trino, la madre de esos 4 -- ver sección 4)** |
| `joaquin@somostrino.cl` | admin | admin en Deni Li, Gamuza, Katarsis, Simplemente Yo, SiSoy, Trino **(hereda LUR por Trino)** |
| `diego@somostrino.cl` | admin | admin en Deni Li, Gamuza, Katarsis, Simplemente Yo, SiSoy, Trino **(hereda LUR por Trino)** |
| `gonzaloanaism@gmail.com` | member | artist en Gamuza |
| `ignaciopizarro2h@gmail.com` | member | member en Los Últimos Románticos |
| `denis.lizama.bobadilla@gmail.com` | member | member en Deni Li |
| `simplementeyomusica@gmail.com` | member | member en Los Últimos Románticos y en Simplemente Yo |

Dos cuentas con dominio distinto para la misma persona (`francisco@katarsis.music` vs
`francisco@somostrino.cl`) -- probablemente una es legacy. Vale la pena que Francisco decida cuál es la
cuenta "real" antes de seguir asignando accesos, para no duplicar trabajo de configuración.

**Ninguno de los 3 admins (Francisco/Joaquín/Diego) tiene fila directa ni heredada en Katarsis... espera,
sí la tienen directa.** Los únicos proyectos que NINGUNO de los 3 puede ver hoy son **La Sagrada** y
**Prueba 2** (Francisco sí tiene Prueba 2 directo). Si eso no es intencional, hay que agregarlos a mano
desde "Equipo y Acceso".

---

## 3. Nivel 2: rol de proyecto (`project_members`)

Tabla: `project_members` — columnas: `id`, `project_id`, `user_id`, `organization_id`, `role`,
`created_at`. Constraint única: `(project_id, user_id)` -- una persona tiene UN rol por proyecto (puede
tener roles distintos en proyectos distintos).

Fuente de verdad del código: [`src/lib/project-roles.ts`](src/lib/project-roles.ts).

| Rol | Deals | Costos de eventos (ver) | Costos de eventos (editar/cerrar caja) |
|---|---|---|---|
| `admin` | Ver y editar/mover/borrar | Sí | Sí |
| `member` | Ver y editar/mover/borrar | Sí | Sí |
| `artist` | Ver, **no** editar/mover/borrar | Sí (de solo lectura -- es firmante requerido del cierre de caja) | **No** |
| `staff` | Módulo Deals/CRM **oculto por completo** | **No** ve nada de plata del evento | **No** |
| *(sin fila)* | **Sin acceso a nada de ese proyecto** -- desde el 23 ago 2026. Antes de esa fecha, "sin fila" se trataba como "no restringir" -- ese era el hueco de seguridad original. | | |

`admin` y `member` de PROYECTO son funcionalmente idénticos hoy -- la distinción es solo jerárquica /
informativa, no cambia qué se puede ver o hacer (`FULL_ACCESS_ROLES` en el código).

**Lo que este sistema de roles deliberadamente NO cubre todavía** (según el propio código,
`project-roles.ts`): Finanzas general (`/finances`, `/prestamos`) y Métricas -- ahí no hay
distinción de rol de proyecto en la aplicación, solo lo que ya cubre RLS a nivel de organización (ver
sección 8, sí hay algo de scoping por proyecto a nivel de RLS en `transactions` que la app no usa
todavía).

---

## 4. Nivel 3: proyecto madre / sello (`projects.parent_project_id`)

Columna `parent_project_id` en la tabla `projects` -- un proyecto puede señalar a otro como su "madre".
Hoy en Trino:

```
Trino (madre)
 ├─ Deni Li
 ├─ Gamuza
 ├─ Los Últimos Románticos
 └─ Simplemente Yo

Sin madre (proyectos independientes):
 Katarsis, La Sagrada, Prueba 2, SiSoy
```

Se configura desde el formulario de proyecto ("Sello" — [`ProjectForm.tsx`](src/components/projects/ProjectForm.tsx) /
[`SelloPanel.tsx`](src/components/settings/SelloPanel.tsx)), campo `parentProjectId`.

**Qué hace tener una madre, hoy:**

1. **Agrupa listas** -- Deals, Eventos, Contactos, Empresas: cuando el proyecto activo del selector es
   una madre, las listas muestran también los registros de los proyectos hijos (`project_id.in.(madre,
   hijo1, hijo2...)` en cada endpoint de listado).
2. **Hereda rol de acceso** (agregado el 23 ago 2026, junto con el fix de aislamiento): si alguien no
   tiene fila directa de `project_members` en un proyecto, pero SÍ tiene fila en la madre de ese
   proyecto, se usa el rol de la madre. Esto es lo que hace que Joaquín/Diego (admin directo de Trino)
   puedan abrir el detalle de un evento puntual de Gamuza sin tener una fila explícita ahí.

**Un flag relacionado, `self_managed` (checkbox "Autogestionado" en el proyecto):** si un proyecto hijo
está marcado autogestionado, sus propios `project_members` pueden EDITAR sus deals directamente (no solo
verlos) -- esto vive a nivel de RLS (`deals_artist_selfmanaged_write`, ver sección 8), la aplicación
todavía no lo expone explícitamente vía `project-roles.ts`.

**Importante -- asimetría entre capas:** la herencia de rol vía proyecto madre **solo existe a nivel de
aplicación** (`getProjectRole()` en `project-roles.ts`). El RLS de la base de datos NO sabe nada de
`parent_project_id` -- su función `is_project_member()` solo mira la fila directa. Ver sección 8 para
por qué esto importa.

---

## 5. Cómo se calcula el acceso, paso a paso (flujo real del código)

Cuando llega un request a un endpoint de la API (ej. `GET /api/eventos/[id]`):

1. **`requireAuth()`** ([`src/lib/supabase-server.ts`](src/lib/supabase-server.ts)) se llama primero en
   casi todos los endpoints. Devuelve:
   - `user` -- el usuario autenticado (o error 401 si no hay sesión).
   - `orgId` -- la organización del usuario (o error 403 si no tiene organización).
   - `role` -- `owner`/`admin`/`member` de ORGANIZACIÓN.
   - `isAdmin` -- `true` si `role` es `owner` o `admin`. **Ya NO implica acceso a proyectos** (desde el
     23 ago) -- solo se usa hoy para gatear acciones administrativas de organización (`/api/org-members`,
     `/api/project-members`).
   - `allowedProjectIds` -- array de IDs de proyecto: los que tienen fila directa en `project_members`
     para este usuario, **más los hijos de cualquier proyecto madre asignado**. Se calcula siempre, para
     todos los roles de organización por igual (antes de hoy, solo se calculaba para `member`).

2. **Para una acción sobre UN proyecto puntual** (ej. ver un evento, crear un deal), el endpoint hace dos
   cosas, normalmente en este orden:
   - Chequea que el `project_id` del recurso esté en `allowedProjectIds` -- si no, 403/404.
   - Llama a **`getProjectRole(supabase, userId, projectId)`** para saber el rol GRANULAR
     (`admin`/`member`/`artist`/`staff`) y decide qué mostrar/permitir con las funciones `can*`
     (`canViewDeals`, `canEditDeals`, `canViewEventCosts`, `canEditEventCosts`).

3. **`getProjectRole()`** ([`src/lib/project-roles.ts`](src/lib/project-roles.ts)):
   - Busca fila directa en `project_members` para `(projectId, userId)`.
   - Si no hay, busca `parent_project_id` de ese proyecto, y si tiene madre, busca la fila del usuario
     en la MADRE -- ese es el rol efectivo.
   - Si tampoco hay nada ahí, devuelve `null` = sin acceso.

4. **Para LISTADOS sin un proyecto puntual** (ej. `GET /api/deals` sin `?projectId=`), el patrón correcto
   (aplicado el 23 ago a Eventos, Deals, Pipeline, Contactos, Empresas) es filtrar la query por
   `.in("project_id", allowedProjectIds)` -- nunca devolver todo sin restringir.

### El selector de proyecto (frontend)

[`src/lib/project-context.tsx`](src/lib/project-context.tsx) -- al cargar la app, consulta
`project_members` directamente (mismo criterio para TODOS los roles de organización, incluido owner/admin
desde el 23 ago) y arma la lista de proyectos que aparecen en el selector de arriba a la izquierda. Solo
lista proyectos con fila DIRECTA -- los hijos heredados vía proyecto madre no aparecen como entradas
separadas del selector (si querés ver solo Gamuza sin el resto de Trino, tendrías que estar agregado
directamente a Gamuza).

`activeProject === null` = "Todos los proyectos" -- solo alcanzable si hay más de un proyecto en la
lista. En ese modo, el cliente no manda `?projectId=` en los requests, así que no se aplica la
restricción 2 de la lista de arriba (pero SÍ se sigue aplicando la restricción por `allowedProjectIds`).

---

## 6. Qué se corrigió el 23 ago 2026 (y por qué existía el hueco)

Cronología de la sesión (detalle completo en `BITACORA.md`, sección "Aislamiento entre proyectos"):

1. **Reporte inicial de Francisco**: con "Los Últimos Románticos" seleccionado, podía abrir un evento de
   "Gamuza" igual.
2. **Primer fix**: se agregó el chequeo de `allowedProjectIds` a `/api/eventos/[id]`, pero con un bypass
   `if (!isAdmin && ...)` -- cualquier admin de ORGANIZACIÓN seguía viendo todo, sin importar el
   proyecto.
3. **Francisco corrigió el enfoque**: "que Joaquín o Diego sean admin de organización no significa que
   tengan acceso a todos los proyectos -- cada uno es admin/member/artist en cada proyecto de forma
   independiente". Confirmado en la base: Joaquín y Diego (admin de organización) NO tenían fila en "Los
   Últimos Románticos" ni "La Sagrada", pese a ser admin de organización.
4. **Segundo fix, sin bypass para nadie**: se sacó el parámetro `isOrgAdmin` de las funciones `can*`, se
   cambió el default de "sin fila = permitir" a "sin fila = denegar", y `allowedProjectIds` pasó a
   calcularse para todos los roles de organización por igual. Decisión explícita de Francisco: "nadie
   tiene bypass, ni siquiera el dueño".
5. **Francisco señaló el concepto de proyecto madre**: ya existía en el esquema (`parent_project_id`) y
   ya se usaba para agrupar listas, pero el fix del punto 4 no lo tenía en cuenta -- alguien con acceso
   solo a Trino podía ver la lista agregada de Gamuza pero no el detalle de un evento puntual.
6. **Tercer fix**: `getProjectRole()` sube a la madre si no encuentra fila directa; `allowedProjectIds`
   incluye los hijos de cualquier madre asignada. De paso se corrigió el mismo patrón de bypass y de
   "listar sin filtro" en Deals, Pipeline, Contactos y Empresas.

**Efecto neto:** el modelo pasó de "cualquier admin de organización ve todo, cualquier miembro sin fila
explícita también ve todo por default" a "el acceso a un proyecto se rige 100% por `project_members`,
directo o heredado vía proyecto madre -- sin excepciones de rol de organización".

---

## 7. Cómo se gestiona hoy (UI)

**"Equipo y Acceso"** (`/settings/team`, componente [`OrgMembersPanel.tsx`](src/components/settings/OrgMembersPanel.tsx)):
lista los miembros de la organización. "Invitar usuario" crea la cuenta con un rol de organización
(`admin`/`member`/`artist`/`staff` -- **ojo, este dropdown mezcla roles de organización con roles de
proyecto en una sola lista**, ver hallazgo 9.4) y opcionalmente la asigna a un proyecto de una.

**"Gestionar Acceso"** (`MemberAccessSheet.tsx`, se abre desde cada fila): permite editar nombre/email/
teléfono, y -- lo importante -- una lista de TODOS los proyectos con checkbox + selector de rol por
proyecto. Así se ve hoy la matriz completa: quién está en qué proyecto y con qué rol. **Este panel es,
en la práctica, el editor real de `project_members`.**

**Texto desactualizado encontrado en este panel** (`MemberAccessSheet.tsx`, se muestra cuando el usuario
es `owner`): *"Propietario tiene acceso total a todos los proyectos — no se gestiona por proyecto."*
Esto ya NO es preciso desde el fix del 23 ago -- el owner ya no tiene ningún bypass especial, se rige
por `project_members` exactamente igual que todos. Hay que corregir este texto (o decidir a propósito
que el owner SÍ debería tener bypass, lo cual contradice la decisión que tomó Francisco ese mismo día).

---

## 8. Nivel de base de datos (RLS) -- lo que el código de la app NO es lo único que protege

Esto es la parte más importante para tener en cuenta antes de seguir construyendo sobre este sistema:
**las correcciones del 23 ago 2026 se hicieron todas a nivel de aplicación (Next.js API routes). El RLS
de Supabase, que es la última línea de defensa si alguien accediera a la base directamente (con la
`anon key` + una sesión válida, sin pasar por la API de Next.js), NO se actualizó en la misma sesión y
hoy está desalineado en varios puntos.**

### 8.1 Tablas de Eventos -- sin ningún scoping por proyecto en RLS

`shows`, `event_cost_items`, `event_ticket_tiers`, `event_setlist_items`, `event_timing_items`,
`event_contacts`, `event_closing_signatures`, `event_cost_submissions` -- **todas** sus policies RLS
solo verifican que el usuario pertenezca a la misma ORGANIZACIÓN que el evento (`organization_id IN
(...)`). Ninguna usa `is_project_member()`.

**Esto significa que todo el aislamiento por proyecto que se armó en `/api/eventos/*` el 23 ago es
enforcement de aplicación únicamente.** Cualquier persona de la organización con una sesión válida podría,
en teoría, leer/escribir cualquier evento de cualquier proyecto llamando directo a la API REST de
Supabase (saltándose el Next.js), sin que RLS se lo impida. **Es la brecha más importante que queda
abierta hoy** -- recomendado agregar una policy con `is_project_member(project_id)` (con la misma lógica
de herencia de proyecto madre, que hoy no existe como función SQL) a estas 8 tablas.

### 8.2 Tablas con scoping por proyecto en RLS, pero con el mismo bypass de admin que ya se sacó de la app

`contacts`, `companies`, `deals`, `transactions` -- SÍ tienen policies con `is_project_member(project_id)`,
pero **todas** están escritas como:

```sql
(project_id IS NULL) OR is_org_admin(organization_id) OR is_project_member(project_id)
```

`is_org_admin()` devuelve `true` para cualquier `owner`/`admin` de ORGANIZACIÓN -- exactamente el bypass
que se sacó de `project-roles.ts` el 23 ago, pero que sigue vivo a nivel de RLS. Si se quiere que el
modelo "nadie tiene bypass" sea real de punta a punta (no solo en la capa de aplicación), estas policies
también habría que reescribirlas sin `is_org_admin()`.

`is_project_member()` (la función SQL) tampoco sabe de proyecto madre -- solo mira `project_members`
directo, a diferencia de `getProjectRole()` en la aplicación que ya sube a la madre. Otra asimetría a
resolver si se quiere consistencia real.

### 8.3 Tablas sin scoping por proyecto en absoluto (ni en RLS ni en la app)

`venues`, `loans`, `loan_repayments`, `loan_contributions` -- policies puramente por organización. No hay
plan hoy de restringir esto por proyecto (Finanzas/Préstamos está fuera del alcance actual según el
propio `project-roles.ts`), pero queda documentado por si se decide cubrirlo más adelante.

### 8.4 Funciones SQL relevantes (`SECURITY DEFINER`, viven en el schema `public`)

| Función | Qué hace |
|---|---|
| `get_user_org_id()` | Organización del usuario autenticado actual. |
| `get_user_org_role()` | Rol de organización del usuario actual (solo si `status = 'active'`). |
| `is_org_admin(org_id)` | `true` si el usuario es `owner`/`admin` de esa organización -- el bypass mencionado en 8.2. |
| `is_org_staff()` | Nombre confuso -- en realidad significa "es `owner`/`admin`/`member` de organización" (cualquier rol activo), NO tiene relación con el rol de proyecto `staff`. Usada en `deals_staff_all`. |
| `is_project_member(project_id)` | `true` si hay fila directa en `project_members` para ese proyecto -- sin herencia de proyecto madre. |
| `is_self_managed(project_id)` | `true` si `projects.self_managed = true` para ese proyecto. |

### 8.5 Tabla resumen de RLS por tabla

| Tabla | Scoping en RLS | Bypass de admin en RLS | Sabe de proyecto madre |
|---|---|---|---|
| `shows` y sub-tablas de eventos (8 tablas) | Solo organización | N/A (no hay scoping de proyecto que bypasear) | No |
| `contacts`, `companies`, `deals`, `transactions` | Organización + proyecto (`is_project_member`) | **Sí** (`is_org_admin`) | No |
| `venues`, `loans` y afines | Solo organización | N/A | No |
| `projects` | Solo organización (cualquier miembro puede leer/escribir cualquier proyecto de su org) | N/A | N/A |
| `project_members` | Org admin tiene `ALL` sin scoping de proyecto propio (`project_members_admin_full`) | **Sí** | No |
| `organization_members` | Insert/delete solo owner/admin de organización | N/A (es a nivel de organización, no de proyecto) | N/A |

---

## 9. Otros hallazgos y gaps abiertos (aplicación)

Además de la brecha de RLS de la sección 8, quedan estos pendientes a nivel de aplicación (Next.js):

**9.1 -- Listados sin filtro, todavía sin corregir:**
`contacts/[id]`, `companies/[id]`, `venues/[id]` (endpoints de detalle por ID) no tienen el mismo
chequeo de `allowedProjectIds` que se agregó a `eventos/[id]` -- alguien podría, en teoría, pedir el
detalle de un contacto/empresa/venue de un proyecto ajeno por ID directo (a diferencia de los LISTADOS,
que ya se corrigieron el 23 ago).

**9.2 -- `/api/org-members` y `/api/project-members`: gestión de gente sin scoping de proyecto propio.**
Ambos endpoints (invitar gente, asignar a un proyecto, cambiar rol, eliminar) solo verifican
`isAdmin` (rol de ORGANIZACIÓN) -- no verifican que el admin que está haciendo la acción tenga acceso
él mismo al proyecto al que está asignando/editando gente. Un admin de organización sin ninguna fila en
"La Sagrada" podría hoy, desde "Equipo y Acceso", agregar o sacar gente de "La Sagrada" igual, o cambiar
el rol de alguien ahí -- exactamente el tipo de acceso cruzado entre proyectos que se corrigió para
lectura de datos, pero no para la gestión de accesos en sí. Es la continuación lógica de todo este
trabajo.

**9.3 -- `POST /api/companies` no chequea proyecto en absoluto** (ni `isAdmin`, ni `allowedProjectIds`) --
cualquiera de la organización puede crear una empresa etiquetada a cualquier proyecto. Impacto bajo (no
expone datos ajenos, solo permite etiquetar mal una empresa nueva), pero inconsistente con el resto.

**9.4 -- El dropdown "rol" al invitar gente (`OrgMembersPanel.tsx`) mezcla dos conceptos.** Ofrece
`admin`/`member`/`artist`/`staff` como si fuera un solo rol, pero ese valor se usa para DOS cosas
distintas simultáneamente: el rol de ORGANIZACIÓN que se guarda en `organization_members.role` (que en
teoría solo debería ser `admin`/`member`, nunca `artist`/`staff`) Y, si se pasa un proyecto, el rol de
PROYECTO en `project_members.role` (que sí puede ser cualquiera de los 4). Hoy funciona porque
`organization_members` no valida el rol contra un enum estricto, pero conceptualmente son cosas
distintas que este único selector confunde. Vale la pena separarlos visualmente cuando se rediseñe esta
pantalla.

**9.5 -- Dos cuentas de Francisco.** `francisco@somostrino.cl` (admin) y `francisco@katarsis.music`
(owner) parecen ser la misma persona con dos logins distintos, con accesos a proyectos muy distintos
entre sí (ver tabla de la sección 2). Vale la pena decidir cuál es la cuenta "real" y consolidar, para
no seguir manteniendo dos configuraciones de acceso en paralelo para la misma persona.

---

## 10. Glosario rápido

- **Organización**: la agencia (Trino). Todo el sistema es multi-organización a nivel de esquema, pero
  hoy en la práctica solo existe una organización real en uso.
- **Proyecto**: un artista, o un "sello" (agencia/madre) como Trino. Viven en la tabla `projects`.
- **Sello / proyecto madre**: un proyecto que agrupa a otros como hijos (`parent_project_id`). Trino es
  el único sello hoy.
- **Autogestionado (`self_managed`)**: flag de un proyecto hijo que le permite a sus propios
  `project_members` editar sus deals directamente, no solo verlos (vive a nivel de RLS).
- **`project_members`**: la tabla que de verdad determina quién ve qué. Es la fuente de verdad práctica
  de todo este documento.
- **`allowedProjectIds`**: lista calculada en cada request (`requireAuth()`) de los proyectos a los que
  esa persona tiene acceso, directo o heredado.
- **RLS (Row Level Security)**: las reglas que Postgres/Supabase aplican a nivel de fila, independiente
  de lo que haga o deje de hacer el código de Next.js. Es la última línea de defensa.

---

## 11. Para cuando se trabaje esto en serio (intranet de trabajadores de la app)

Ideas que surgieron de esta auditoría, sin implementar todavía -- quedan acá para no perderlas:

1. **Cerrar la brecha de RLS de eventos** (sección 8.1) es probablemente lo más urgente de todo lo que
   quedó pendiente -- es la única tabla de datos sensibles (montos, comprobantes) sin ningún tipo de
   scoping por proyecto a nivel de base de datos.
2. **Decidir el modelo de "owner" de una vez**: ¿tiene bypass total o no? Hoy el código dice que no, pero
   la UI todavía dice que sí. Esto también determina si vale la pena escribir una función SQL
   `is_org_owner()` separada de `is_org_admin()` para las policies de RLS.
3. **Escribir una función SQL de herencia de proyecto madre** (`is_project_member_or_parent(project_id)`
   o similar) para poder usarla en RLS igual que se usa `getProjectRole()` en la aplicación -- hoy esa
   lógica solo vive en TypeScript.
4. **Separar visualmente rol de organización vs. rol de proyecto** en la UI de invitación (hallazgo 9.4).
5. **Aplicar el aislamiento por proyecto a la gestión de accesos en sí** (`/api/org-members`,
   `/api/project-members` -- hallazgo 9.2), no solo a la lectura de datos.
6. **Consolidar las cuentas duplicadas de Francisco** antes de seguir configurando accesos por encima.
