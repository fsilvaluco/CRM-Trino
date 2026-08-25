# Roles y control de acceso en Artist Pro

**Última actualización:** 24 ago 2026 — se agregó la sección 0 con el modelo de roles **decidido** ese
día (rediseño hacia "solo proyecto"), y se reordenaron los pendientes en base a esa decisión. El resto
del documento (secciones 1 a 9) describe el **estado actual del código**, que todavía es el modelo viejo
(organización + proyecto) — queda como referencia mientras se implementa el rediseño. Es un documento
vivo — no es un resumen de una sola sesión.

**Para qué sirve este documento:** es la referencia de trabajo para (a) entender cómo funciona HOY el
sistema de roles y permisos de Artist Pro, y (b) el plan decidido de hacia dónde va, para que Francisco
lo use al planificar la intranet de trabajadores de la app (no del proyecto/CRM) y para guiar la
implementación del rediseño.

---

## 0. Modelo decidido el 24 ago 2026 — "solo proyecto" (todavía NO implementado)

Francisco planteó que tener dos capas (organización + proyecto) es confuso e innecesario para el día a
día, y hoy es exactamente lo que causó el bug del 23 ago. Se decidió simplificar a **una sola capa
visible de permisos: el proyecto.** Esto es el objetivo a implementar — las secciones 1-9 describen el
estado actual (todavía sin este cambio).

### 0.1 Qué pasa con "organización"

**No se borra de la base de datos** — `organization_id` sigue existiendo como el límite técnico de
"instalación/cliente" (relevante si Artist Pro se instala para otro negocio distinto de Trino en el
futuro). Pero **desaparece por completo como capa de permisos y de UI**:

- Nadie ve un "rol de organización" en ninguna pantalla.
- No hay panel de "Equipo y Acceso" a nivel organización — todo se gestiona por proyecto.
- El bypass `is_org_admin()` que hoy vive en RLS (hallazgo 8.2) se elimina como parte de este cambio —
  ya no debería quedar ninguna regla de acceso que dependa de organización, ni en la app ni en RLS.
- El dropdown que hoy mezcla rol de organización y rol de proyecto al invitar gente (hallazgo 9.4)
  también se resuelve solo: al no existir más el rol de organización, ese selector pasa a ser
  simplemente "rol de proyecto".

### 0.2 Modelo de permisos: matriz por persona × módulo (revisado el mismo 24 ago, tras ver casos reales)

**Esta sección reemplaza una versión anterior de la misma tarde** que proponía una tabla única de 4
roles fijos (`admin`/`member`/`artist`/`staff`) con un permiso fijo por módulo para cada uno. Al revisar
casos reales de gente que se va a sumar (Rodrick, Gonzalo, Daniela -- ver 0.2.3), quedó claro que
**ninguno de los 4 roles fijos alcanza a describir lo que cada persona necesita** -- cada una tiene una
combinación distinta de qué módulo ve, edita, y si ve ingresos/costos. Se reemplaza la tabla única por
una **matriz editable persona × módulo**, y el "rol" baja de categoría: pasa de ser lo que determina el
permiso a ser solo una **plantilla de partida** (una etiqueta visible al agregar a alguien y al mirar el
listado de gente, pero editable persona por persona después).

#### 0.2.1 Gestión de gente del proyecto (independiente de la matriz de módulos)

Poder invitar, dar de baja o cambiar la matriz de otra persona del proyecto es **su propio interruptor**,
no depende de cuánto acceso tenga esa persona al resto de los módulos -- así alguien puede tener acceso
total a todos los módulos y aun así no poder gestionar gente, o viceversa.

- `puede_gestionar_equipo`: sí/no, por persona y por proyecto. Si es sí, incluye poder **crear cuentas
  nuevas de cero** (un email que nunca existió en Artist Pro) y gestionar a cualquiera del proyecto --
  incluidos otros que también tengan este permiso, sin jerarquía especial entre ellos.
- La plantilla "Admin" trae este interruptor en `sí` por defecto; el resto de las plantillas lo traen en
  `no` -- pero es editable aparte, igual que el resto de la matriz.

#### 0.2.2 Matriz por módulo

Por cada persona, en cada proyecto donde tiene acceso, se define fila por fila:

| Dimensión | Valores | Aplica a |
|---|---|---|
| Ver | sí/no | Todos los módulos |
| Editar | sí/no (solo tiene sentido si Ver = sí) | Todos los módulos |
| **Eliminar** | sí/no (solo tiene sentido si Editar = sí) | Todos los módulos -- **separada de Editar** (decisión del 24 ago): alguien puede poder editar un registro sin poder borrarlo. |
| Ve ingresos | sí/no | Deals (el monto del trato), Eventos |
| Ve costos | sí/no | Eventos (Deals es un solo monto, no distingue ingreso/costo) |

La Utilidad de un evento (ingresos − costos) se oculta automáticamente si falta cualquiera de las dos.
Cuando `ve_ingresos`/`ve_costos` = no, se oculta **todo** -- no solo el total: ningún monto individual
de línea (cada tier de entrada, cada sponsor, cada ítem de costo) queda visible tampoco (decisión del
24 ago, más estricta que "solo ocultar el resumen").

**Módulos cubiertos:** Contactos, Empresas, Deals, Tareas, Eventos (incluye su logística: setlist,
timing, invitados), Campañas, **Finanzas** (`/finances`, `/prestamos` -- agregado el 24 ago, ver 0.2.5).

**Visibilidad parcial entre módulos (decisión del 24 ago):** si alguien no tiene acceso al módulo
Contactos/Empresas pero sí ve un Deal o una Tarea que referencia a un contacto o empresa, **ve el
nombre** (para poder ubicarse -- "con quién es este trato"), pero **no accede al resto del registro**
(teléfono, email, notas, historial) -- eso sigue exigiendo acceso directo al módulo Contactos/Empresas.
Es un permiso intermedio, no calca ni el "todo visible" ni el "todo oculto".

**Se deja fuera de esta primera versión** (se agrega después si aparece un caso real que lo necesite):
un "alcance" por debajo de Ver/Editar -- por ejemplo "solo lo que tengo asignado a mí" en vez de todo el
proyecto. Ninguno de los casos reales de hoy lo necesita (decisión del 24 ago).

#### 0.2.3 Casos reales, probados contra este diseño

| Persona | Contactos | Empresas | Deals | Tareas | Eventos | Campañas | Finanzas | Gestiona equipo |
|---|---|---|---|---|---|---|---|---|
| **Rodrick** (sonidista, variante de `staff`) | No | No | Ve, no edita, sin $ | Ve y edita | Ve, no edita, sin $ | Ve, no edita, sin $ | No | No |
| **Gonzalo** (artista) | Ve, no edita | Ve, no edita | Ve, no edita, con $ | Ve y edita | Ve, no edita, con $ (ingresos y costos) | Ve y edita, incluso crea | Ve, no edita | No |
| **Daniela** (logística de eventos, variante de `staff`) | No | No | Ve, no edita, sin $ | Ve y edita | Ve y edita (ingresos y costos, incluye sumar costos) | Ve y edita | No | No |
| **Joaquín** (admin) | Ve y edita | Ve y edita | Ve y edita, con $ | Ve y edita | Ve y edita, con $ | Ve y edita | Ve y edita | **Sí** |
| Plantilla `admin` | Ve y edita | Ve y edita | Ve y edita, con $ | Ve y edita | Ve y edita, con $ | Ve y edita | Ve y edita | **Sí** |
| Plantilla `member` | Ve y edita | Ve y edita | Ve y edita, con $ | Ve y edita | Ve y edita, con $ | Ve y edita | **Ve, no edita** | No |
| Plantilla `artist` | Ve, no edita | Ve, no edita | Ve, no edita, con $ | Ve y edita | Ve, no edita, con $ | Ve y edita | Ve, no edita | No |
| Plantilla `staff` | No | No | No | Ve y edita | Ve y edita, sin $ | Ve y edita, sin $ | No | No |

**Confirmado el 24 ago** (ya no son inferencias): Gonzalo **ve pero no edita** Contactos/Empresas (igual
que Deals); y tanto Gonzalo como Daniela **ven y editan** Campañas (Gonzalo incluso puede crearlas). Con
esto, la fila de Gonzalo pasa a ser directamente la definición de la plantilla `artist` -- no necesitó
ningún ajuste particular. Nota importante que corrige la primera versión de este documento (antes de la
sección 0): ahí se había asumido que `artist` **no ve ningún número de plata** -- el caso real de Gonzalo
confirma que sí ve ingresos y costos, solo que no edita nada. La regla de "sin plata" es de `staff`, no
de `artist`.

**Lo que este ejercicio confirma:** Rodrick y Daniela siguen siendo variantes de `staff` que necesitan
ajuste puntual (Rodrick pierde $ en todo pero gana ver -sin editar- Deals/Eventos/Campañas; Daniela gana
editar Eventos y ver -sin $- Deals). Gonzalo, en cambio, terminó calzando exacto con la plantilla
`artist` una vez corregida. Esto es el comportamiento esperado del modelo de matriz: la plantilla da un
punto de partida razonable, y la persona real a veces no necesita ningún ajuste (Gonzalo) y a veces sí
(Rodrick, Daniela).

#### 0.2.4 Otras reglas de comportamiento (decididas el 24 ago, tras revisar casos técnicos)

- **Comentar es independiente de Editar.** Alguien con solo `puede_ver = sí` en un módulo puede
  comentar en un Deal/Tarea igual, sin tener `puede_editar`. Un `artist` como Gonzalo puede opinar en un
  Deal que no puede editar.
- **Referenciar contenido de un módulo bloqueado está permitido**, aunque la persona no tenga ni
  `puede_ver` ahí. Por ejemplo: alguien sin acceso a Deals puede igual crear una Tarea y engancharla a un
  Deal existente (para que otro con más acceso la revise) -- no hace falta poder ver el Deal para poder
  referenciarlo desde otro módulo.
- **Protección contra que un proyecto se quede sin nadie que pueda gestionar el equipo**: no se puede
  guardar un estado donde ningún miembro del proyecto tenga `puede_gestionar_equipo = sí` -- ni
  quitándoselo a la última persona que lo tiene, ni sacándola del proyecto sin traspasarlo antes a otra
  persona. `owner` queda como única vía de rescate manual si igual pasara.
- **El "Gestor de Integrantes" (matriz completa del equipo) es visible solo para quien tiene
  `puede_gestionar_equipo = sí`** en ese proyecto -- el resto de la gente del proyecto no ve la matriz
  fina de sus compañeros, solo interactúa con ellos dentro de cada módulo.
- **"Referenciar sin Ver" sigue acotado al mismo proyecto**: el módulo bloqueado solo afecta qué se
  ve/edita DENTRO de un proyecto al que la persona ya pertenece -- nunca abre acceso a datos de un
  proyecto ajeno.
- **Reportar un gasto de evento (`event_cost_submissions`) es independiente de `puede_editar` en
  Eventos.** Ya existe como funcionalidad (`/api/eventos/[id]/cost-submissions`, usada desde
  `/eventos/[id]/gastos`): cualquiera con `puede_ver` en Eventos puede enviar su propio gasto con monto y
  comprobante, queda en estado "pendiente" y no toca los costos reales hasta que alguien con
  `puede_editar` + `ve_costos` lo aprueba. Es la vía por la que un `artist` como Gonzalo -- que no puede
  editar Eventos -- igual puede reportar un gasto suyo. Cada quien solo ve sus propios envíos hasta que
  tiene permiso de revisar (eso ya está construido así en el código); lo que falta es migrar el chequeo
  de "quién puede revisar/aprobar" de `isAdmin` (organización) a `puede_editar` + `ve_costos` de proyecto.
- **Firmar el cierre de caja de un evento exige `ve_ingresos` Y `ve_costos`** en ese proyecto -- nadie
  firma una aprobación de números que no puede revisar. Es consistente con que `artist` vea todo el $ del
  evento aunque no lo edite: ese acceso de solo-ver es justamente lo que le permite firmar con criterio.
- **Los archivos adjuntos a un costo (comprobantes, boletas) heredan `ve_costos`**: sin ese permiso,
  tampoco se puede ver ni descargar el archivo, aunque se tenga acceso al resto del evento.
- **Si a alguien le sacan acceso a un módulo mientras tiene contenido asignado ahí** (ej. Tareas activas
  asignadas a Rodrick, y le sacan Tareas), **ese contenido queda asignado igual, solo que la persona ya
  no lo puede ver ni editar** -- no hay reasignación automática; alguien con acceso tiene que notarlo y
  reasignarlo a mano.
- **`self_managed` (Autogestionado) se retira** -- queda reemplazado por la matriz: el mismo resultado
  (un `artist` editando sus propios Deals) se logra poniendo `Deals: Editar = sí` en la fila de esa
  persona puntual, sin necesitar un flag aparte a nivel de proyecto completo. Incluye retirar la policy
  de RLS `deals_artist_selfmanaged_write` y la columna `projects.self_managed` (o dejarla sin uso si se
  prefiere no tocar el esquema todavía).
- **La matriz de una persona en un proyecto se borra cuando se elimina su fila de `project_members`** en
  ese proyecto -- no queda guardada para si vuelve a entrar más adelante; si vuelve, se configura de
  cero.
- **Las notificaciones (push, digest por email) no necesitan aplicar la matriz.** En vez de chequear
  permisos en cada notificación, la regla es de redacción: ningún texto de notificación incluye montos --
  ej. "hay un gasto nuevo reportado en Evento X", nunca "se reportó un gasto de $45.000 en Evento X". Así
  no hace falta filtrar destinatarios por `ve_ingresos`/`ve_costos` en ningún canal de aviso.

#### 0.2.5 Finanzas (`/finances`, `/prestamos`) -- agregado el 24 ago 2026

Esta sección quedaba explícitamente fuera de alcance en la primera versión del documento (sección 3) --
se corrige acá: **toda transacción pertenece a un proyecto, sin excepción.** Hoy `transactions.project_id`
es nullable en la base y el código lo permite (hay transacciones "generales de la agencia" sin proyecto)
-- eso se considera un problema de datos a corregir, no una excepción de diseño a sostener.

- **Finanzas se agrega como séptimo módulo de la matriz**, con las mismas dimensiones que el resto
  (Ver/Editar/Eliminar/Ve ingresos/Ve costos).
- **Perfil de permiso por defecto, distinto al resto de los módulos**: en Finanzas, `member` **no** tiene
  el mismo poder que `admin` -- queda igualado a `artist` (ve, no edita). Solo `admin` (y `owner` cuando
  actúa con ese rol en el proyecto) edita. `staff` no ve nada de Finanzas, igual que en el resto de los
  módulos con plata.

  | Plantilla | Finanzas |
  |---|---|
  | `admin` / `owner` | Ve y edita |
  | `member` | **Ve, no edita** (excepción -- en el resto de los módulos member = admin) |
  | `artist` | Ve, no edita |
  | `staff` | No ve nada |

- **La herencia por sello (0.6) se sigue aplicando igual que en el resto de los módulos** -- si alguien
  tiene matriz en Trino y esa da acceso a Finanzas, también accede a Finanzas de Gamuza por herencia,
  igual que accede a sus Deals/Eventos.
- **Lo que NO se hereda ni se mezcla es la vista agregada de datos.** El agrupamiento de listas que hoy
  existe para Deals/Eventos/Contactos/Empresas (sección 4: al seleccionar la madre, se listan también los
  registros de los hijos) **no debe aplicarse a Finanzas** -- las finanzas de Trino y las de cada proyecto
  hijo son libros separados que no se suman ni se mezclan en ningún reporte, aunque la persona tenga
  acceso a ambos por herencia de matriz.
- **Hoy `GET /api/finances` no tiene ningún chequeo de proyecto ni de rol** -- si no se manda
  `?projectId=` en la URL, devuelve todas las transacciones de todos los proyectos de la organización a
  cualquiera autenticado. Es una brecha del mismo tipo que la que motivó la corrección del 23 ago, solo
  que en un módulo que había quedado fuera de esa corrección -- prioridad alta en el roadmap (ver §11).

### 0.3 Crear proyectos nuevos

**Regla general: nadie excepto `owner` puede crear un proyecto nuevo.** Ni siquiera un `admin` de
proyecto puede crear otro proyecto — solo puede operar dentro de los proyectos donde ya tiene rol.

### 0.4 Alcance de `owner`

Se decidió explícitamente que **`owner` NO tiene bypass ni siquiera para editar** — se rige por la misma
regla que todos: sin un proyecto seleccionado, no edita nada (ver 0.5). La única atribución especial que
conserva `owner` es poder crear proyectos nuevos (0.3). Esto es consistente con la decisión ya tomada el
23 ago de que "nadie tiene bypass, ni siquiera el dueño" — ahora se extiende también a la regla de
selección de proyecto.

### 0.5 Selector de proyecto y modo "ver todos los proyectos"

El modo "Todos los proyectos" se mantiene, pero cambia su comportamiento:

- Solo muestra los proyectos a los que la persona ya está asignada (nunca todos los de la
  organización).
- Es **exclusivamente de lectura** — no se puede crear ni editar nada estando en este modo, sin
  excepción de rol (ni siquiera `owner`).
- **Respeta el rol de cada proyecto individualmente dentro de la vista agregada** — si alguien es
  `staff` en el Proyecto A (sin ver $) y `admin` en el Proyecto B, la vista agregada le sigue ocultando
  la plata del Proyecto A. No es un resumen plano sin distinción de rol.
- Si alguien intenta editar algo estando en este modo, la interfaz debe mostrar un mensaje de
  advertencia ("Selecciona un proyecto para editar") en vez de dejarlo pasar o fallar en silencio. Esto
  es lo que evita el problema real que motivó el cambio: cosas quedando guardadas sin proyecto asignado.

### 0.6 Qué se hereda del modelo actual sin cambios

- **Proyecto madre / sello** (`parent_project_id`, sección 4): se mantiene igual — el rol se sigue
  heredando de la madre hacia los hijos, y las listas se siguen agrupando. Un `admin` heredado de Trino
  en Gamuza puede invitar/gestionar gente en Gamuza igual que un admin directo, por la misma lógica de
  herencia. **Con el modelo de matriz (0.2), lo que se hereda es la matriz completa tal cual está en la
  madre** -- decisión explícita del 24 ago, no hay matriz aparte por proyecto hijo. Si alguien necesita
  ver menos/más en un hijo puntual que en la madre, hoy eso no está cubierto (quedaría para una versión
  futura si aparece un caso real, igual que "alcance" en 0.2.2).
- **`self_managed`**: **corrección** -- ya no se mantiene igual, se retira (ver 0.2.4). Esta línea decía
  originalmente "se mantiene igual" y quedó desactualizada apenas se revisó el caso técnico ese mismo día.

### 0.7 Otras superficies de acceso a alinear con la matriz (halladas el 24 ago, fuera de la app web)

La matriz cubre la aplicación web (Next.js). Hay al menos una superficie más que toca los mismos datos y
que hoy queda completamente afuera de cualquier control de acceso:

- **Servidor MCP** (`mcp/crm-server.ts`, `npm run mcp`) -- documentado en `CLAUDE.md` como "MCP Mode"
  para conectar Claude Desktop/Web al CRM. Hoy está desalineado con la arquitectura real de la app: se
  conecta directo a una base SQLite local (`src/db/`, sin tocar desde el 17 jul) mientras que la
  aplicación real corre sobre Supabase desde hace tiempo. No tiene ningún chequeo de autenticación,
  organización, proyecto ni matriz -- abre lectura y escritura completa sobre lo que sea que haya en esa
  base. Hoy no expone datos reales porque esa base quedó vieja/desconectada, pero es una función
  documentada como si estuviera activa. **Decisión del 24 ago: se retira por ahora** -- se saca de
  `CLAUDE.md` como función soportada (o se marca claramente como no disponible) hasta que alguien la
  reescriba de cero contra Supabase, autenticada, respetando la matriz nueva. No se reescribe todavía.

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

**Tampoco cubre hoy el módulo de Tareas** (`/tasks`, `task_assignees`) **ni Campañas** (`/campanas`,
subproyectos) -- ambos módulos existen y funcionan en el código, pero sin ninguna distinción de rol:
cualquiera con acceso al proyecto puede ver, crear, editar y asignar tareas o campañas, sin importar si
es `admin`, `member`, `artist` o `staff`. Esto es justamente lo que cubre por primera vez el modelo nuevo
decidido el 24 ago (sección 0.2) -- no es una corrección de un comportamiento roto, es agregar reglas
donde hoy no existe ninguna.

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
separadas del selector (si quieres ver solo Gamuza sin el resto de Trino, tendrías que estar agregado
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

## 11. Roadmap de implementación del modelo "solo proyecto" (decidido 24 ago 2026)

Reordenado en base a las decisiones de la sección 0. Antes esta lista era "ideas sueltas" -- ahora es la
secuencia recomendada para implementar el rediseño, de mayor a menor prioridad. Nada de esto está
implementado todavía.

### Prioridad 1 -- base del modelo nuevo (sin esto, el resto no tiene dónde pararse)

**Estado (25 ago 2026): Prioridad 1 completa -- los 12 ítems implementados y aplicados en producción.**
En el camino aparecieron varias correcciones que no estaban en la lista original (redacción de $ en
Deals, aislamiento de `deals/[id]`, exportación CSV sin ningún chequeo de proyecto, comentarios de
Deals/Tareas sin ningún chequeo de proyecto, `POST /api/eventos`/`subprojects`/`tasks`/`companies` sin
ningún chequeo de proyecto -- ver el detalle en cada ítem). Ítem 3: de 38 endpoints con `isAdmin`, 26
migrados a la matriz, 12 se dejan a propósito como acciones de organización (billing, integraciones,
gestión de gente -- ver detalle del ítem, son trabajo de Prioridad 2). Probado en producción contra 3
cuentas de prueba
reales (Rodrick/Gonzalo/Daniela en el proyecto
Prueba 2) vía login por API -- ver bitácora del 24-25 ago.

1. ✅ **Crear la tabla de matriz de permisos** (0.2.2) -- migración `084_permission_matrix.sql`, aplicada.
   `project_member_permissions`: una fila por persona × módulo (Contactos, Empresas, Deals, Tareas,
   Eventos, Campañas, Finanzas), con `puede_ver`, `puede_editar`, `puede_eliminar`, `ve_ingresos`,
   `ve_costos` + constraints que impiden estados inválidos (`editar` exige `ver`, `eliminar` exige
   `editar`, `ve_ingresos`/`ve_costos` exigen `ver`). `project_members.puede_gestionar_equipo` agregado
   como columna aparte (0.2.1). **Pendiente todavía dentro de este ítem:** la lógica de visibilidad
   parcial entre módulos (nombre de contacto visible en Deals aunque el módulo esté bloqueado) y el
   ocultamiento de montos línea por línea -- esas dos viven en cada endpoint de lectura, no en el
   esquema; se van resolviendo módulo por módulo (ver ítems 8+ y Prioridad 2).
2. ✅ **Migrar las 4 plantillas actuales a filas precargadas** -- hecho como backfill de la misma
   migración: las 30 filas de `project_members` existentes (14 admin, 15 member, 1 artist) se
   convirtieron en 210 filas de matriz según la tabla de 0.2.3. `admin` recibió `puede_gestionar_equipo`.
3. ✅ **Sacar el rol de organización del cálculo de permisos** -- de los 38 endpoints encontrados, **26
   migrados** a `allowedProjectIds` + la matriz de proyecto, sin ningún bypass de organización. **12
   quedan con `isAdmin` a propósito** -- son acciones genuinamente de organización, no de un proyecto
   puntual (billing, invitar/gestionar gente -- Prioridad 2 todavía no construye el flujo de
   `puede_gestionar_equipo` para invitar/crear cuentas, así que este tramo sigue en `isAdmin` hasta que
   se implemente --, importación/broadcast a nivel de organización, alias de email, conexiones de Gmail
   con chequeo de dueño de la conexión). Detalle de los 26 migrados y los 12 que se dejaron:

   **Migrados (bypass de `isAdmin` sacado, solo `allowedProjectIds` + matriz):** `webhook`, `loans` (4
   archivos), `lead-candidates`, `smartlinks` (3), `projects/[id]/theme`, `projects/[id]/avatar`, `qr` (3),
   `venues` (3), `loan-contributions` (2), `import`, `eventos/[id]/signatures` (además se sacó el bypass
   "admin de organización siempre puede firmar" del propio `canSign` -- nadie tiene bypass, ni siquiera
   para firmar), `eventos/[id]/cost-submissions` (2 -- revisar/aprobar gastos ahora exige `puede_editar` +
   `ve_costos` de Eventos del proyecto del evento, no `isAdmin`; el push de aviso ahora notifica a quien
   puede revisar en ESE proyecto, no a "admins de organización"), `tasks/[id]` (borrar tarea, exige
   `puede_eliminar` de Tareas del proyecto), `contacts/merge` (exige `puede_editar` de Contactos en TODOS
   los proyectos involucrados), `projects/[id]` (editar exige `puede_gestionar_equipo` de ESE proyecto;
   eliminar exige `owner`, mismo criterio que crear -- 0.3), `projects` GET (el rol mostrado por proyecto
   ya no se fuerza a "admin" solo por ser admin de organización -- mismo hallazgo que motivó todo esto el
   23 ago, pero en el listado de proyectos), `activity-logs` (exige `puede_gestionar_equipo` en al menos
   un proyecto, no `isAdmin` de organización).

   **Se dejan con `isAdmin` a propósito, son de organización:** `billing/create-payment`,
   `billing/payments` (billing es inherentemente de organización, no de proyecto), `admin/broadcast`,
   `admin/import/commit`, `admin/import/parse` (acciones administrativas de organización), `settings/
   alias-rules` (2 -- configuración de organización), `integrations/gmail/connections` (2 -- ya validan
   dueño de la conexión, `isAdmin` es solo el caso de "un admin soluciona la conexión de otra persona"),
   `org-members` (2), `org-members/profile`, `project-members` -- **estos 4 últimos son gestión de
   gente**, que sigue siendo el trabajo pendiente de Prioridad 2 (ítems 13-17): hoy no existe todavía el
   flujo de invitar/crear cuentas con `puede_gestionar_equipo` por proyecto, así que se mantienen en
   `isAdmin` hasta que se construya esa pieza -- migrarlos ahora sin esa base rompería la única forma que
   existe hoy de agregar gente nueva al sistema.
4. ✅ **Gatear la creación de proyectos a solo `owner`** (0.3) -- `POST /api/projects` ahora exige
   `role === "owner"` en vez de `isAdmin`.
5. ✅ **"Sin proyecto seleccionado, no se edita"** en el frontend (0.5) -- bloqueado (botón deshabilitado +
   advertencia) en: crear/editar Deal (`CrmPageClient.tsx`, incluye el "+" por columna), crear/editar
   evento (`eventos/page.tsx`, botón y lápiz de editar), crear/adjuntar en Finanzas (`finances/page.tsx`),
   crear Contacto, crear Empresa (2 puntos de entrada: botón principal y `EmptyState`). Campañas ya lo
   tenía de antes. **Drag-and-drop del Kanban de Deals** (`KanbanBoard.tsx`): antes solo el servidor lo
   bloqueaba (con un error genérico tras revertir la tarjeta) -- ahora se corta antes de llamar a la API,
   con el mismo mensaje específico que el resto. **Tareas verificado**: su formulario exige elegir
   proyecto adentro del form mismo (`projectId` es obligatorio en el schema de validación) -- ya cubría
   la regla con una UX distinta (selector dentro del form en vez de botón deshabilitado), no necesitó
   cambios. Bug real encontrado en el camino: `CompanyForm` guardaba `projectId: null` en silencio si no
   había proyecto activo -- exactamente el problema que motivó esta regla -- corregido con el mismo
   patrón que `ContactForm`.
6. ✅ **Vista agregada respeta la matriz de cada proyecto individualmente** (0.5) -- resuelto para los 6
   módulos restantes (Deals y Finanzas ya estaban resueltos de la sesión anterior). **Se encontraron
   brechas graves al implementar, del mismo patrón que Finanzas -- endpoints sin ningún chequeo de
   proyecto en absoluto**, no solo "falta filtrar la vista agregada":
   - `GET`/`POST /api/eventos`: el `POST` **no tenía ningún chequeo de proyecto ni de permiso** --
     cualquiera autenticado podía crear un evento (con cualquier monto de fee/ingreso/costo) en cualquier
     proyecto ajeno. El `GET` no redactaba `fee`/`ticketIncome`/`expenses` por fila. Corregidos ambos,
     mismo criterio que `eventos/[id]` (`canViewEventCosts`/`canEditEventCosts`).
   - `GET`/`POST /api/subprojects` (Campañas): el `GET` **devolvía TODAS las campañas de la organización
     sin ningún filtro**, y el `POST` no chequeaba proyecto en absoluto. Corregidos ambos.
   - `GET`/`POST /api/tasks`: el `POST` no chequeaba proyecto en absoluto -- cualquiera podía crear una
     tarea en cualquier proyecto ajeno. El `GET` no filtraba por matriz en modo agregado (impacto bajo
     hoy porque las 4 plantillas dan `tareas.ver = sí` a todos, pero corregido para cuando alguien
     customice su matriz).
   - `GET`/`POST /api/contacts`, `GET`/`POST /api/companies`: ya tenían aislamiento por proyecto
     (corregido 23 ago), les faltaba el chequeo de módulo (`canViewModule`/`canEditModule`) y el filtro
     por matriz en modo agregado. **De paso, se cerró el hallazgo 9.3**: `POST /api/companies` aceptaba
     `projectId = null` en silencio -- mismo bug que se había corregido en `CompanyForm` del lado del
     cliente, ahora también bloqueado en el servidor (defensa en profundidad real: alguien podía haber
     llamado a la API directo, saltándose el formulario).
7. ✅ **`project-roles.ts` reescrito para leer la matriz** -- `getProjectRole()` reemplazado por
   `getProjectPermissions()` (misma herencia por sello, ahora trae la matriz completa en vez de un rol).
   `canViewDeals`/`canEditDeals`/`canViewEventCosts`/`canEditEventCosts` migrados a leer
   `ProjectPermissions` en vez del enum; se agregaron `canDeleteDeals`, `canViewEvent`, `canEditEvent`,
   `canViewModule`/`canEditModule`/`canDeleteModule` genéricos y `canManageTeam`. Los 10 endpoints que
   usaban las funciones viejas (`deals`, `eventos/[id]`, `eventos/[id]/costs/*`, `pipeline`) migrados y
   verificados con `tsc --noEmit` sin errores. `canEditEventCosts` ahora exige `puedeEditar && veCostos`
   del módulo Eventos (antes era solo rol admin/member) -- semántica equivalente, expresada en la matriz.
8. ✅ **Comentarios como permiso independiente** (0.2.4) -- **hallazgo al implementar: ninguno de los dos
   endpoints (`deal_comments`, `task_comments`, GET y POST) tenía NINGÚN chequeo de proyecto**, ni
   siquiera `puede_ver` -- no era "hay que relajar de Editar a Ver", era "no había nada que chequear".
   Corregido: `deal_comments` exige `allowedProjectIds` + `canViewDeals`; `task_comments` exige
   `allowedProjectIds` + `canViewModule(tareas)` cuando la tarea tiene proyecto asignado (las tareas sin
   proyecto, permitido hoy a diferencia de otros módulos, quedan sin chequeo adicional para no romperlas).
   **Referencias sin exigir Ver ya funcionaba así por defecto** -- crear una Tarea con `dealId`/
   `contactId`/`companyId` nunca validó acceso al módulo referenciado, no hizo falta tocar nada ahí.
9. ✅ **Endpoints de exportación (`/api/export`)** -- **hallazgo grave: no tenían NINGÚN chequeo de
   proyecto**, exportaban TODOS los contactos/deals de la organización completa a cualquiera autenticado,
   sin importar en qué proyectos tuviera fila. Corregido: ambos tipos (`contacts`, `deals`) ahora filtran
   por `allowedProjectIds`, filtran por `canViewModule`/`canViewDeals` fila por fila (matriz de cada
   proyecto, mismo patrón que listados agregados), y el CSV de Deals oculta el valor cuando
   `ve_ingresos = no` -- antes el CSV se llevaba el monto completo aunque la pantalla lo ocultara.
10. ✅ **Cerrada la brecha de `/api/finances`** (0.2.5) -- `GET`/`POST` de `finances/route.ts` y
    `PUT`/`PATCH`/`DELETE` de `finances/[id]/route.ts` **no tenían NINGÚN chequeo de proyecto ni de rol**
    (solo `organization_id`) -- se agregó el mismo patrón de aislamiento que Deals/Eventos
    (`allowedProjectIds` + `getProjectPermissions` + `canViewModule`/`canEditModule`/`canDeleteModule`
    sobre el módulo `finanzas`), más redacción de `amount`/comprobantes/adjuntos línea por línea cuando
    `ve_ingresos = no` (antes se veían igual, sin importar el rol). El listado agregado (sin
    `?projectId=`) ahora respeta la matriz de cada proyecto individualmente (mismo patrón que se aplicó a
    Deals, ver ítem 1 -- ver 0.5).
11. ✅ **Migración de datos: `transactions.project_id` deja de aceptar nulos** (0.2.5) -- verificado antes
    de migrar: 0 transacciones existentes en la base (total y sin proyecto), así que la constraint
    `NOT NULL` se aplicó directo en la misma migración 084, sin backfill necesario.
12. ✅ **Finanzas excluida del agrupamiento de listas por sello** (0.2.5) -- el filtro de proyecto en
    `finances/route.ts` es `.eq("project_id", projectId)` exacto, nunca se expande a proyectos hijos como
    sí hacen Deals/Eventos -- son libros separados, no se mezclan.

**También corregido de paso, encontrado al hacer esto (no estaba en la lista original):**
- **`GET /api/deals` (sin `projectId`, ej. Pipeline) y `GET /api/deals/[id]` no redactaban montos**
  (`value`/`percentageValue`/`commissionRate`) según `ve_ingresos` -- se veían igual sin importar el rol.
  Confirmado en vivo con la cuenta de prueba Rodrick antes de corregirlo (ver conversación). Corregido en
  ambos endpoints + `POST /api/deals`; el listado sin `projectId` ahora también respeta la matriz de cada
  proyecto individualmente (mismo patrón que ítem 6, aplicado primero acá).
- **`GET /api/deals/[id]` no tenía NINGÚN chequeo de aislamiento entre proyectos** -- ni `allowedProjectIds`
  ni `canViewDeals`, a diferencia de `eventos/[id]` que sí lo tenía desde el 23 ago. Cualquiera autenticado
  en la organización podía pedir cualquier deal por ID. Corregido con el mismo patrón que eventos.
  `linkedEventUtilidad` (plata de un evento vinculado) ahora exige ver ingresos Y costos del módulo
  Eventos, no `ve_ingresos` de Deals -- son módulos distintos.
- **Visibilidad parcial de Contactos dentro de Deals** (0.2.2): `contactEmail` en el listado de Deals
  ahora se oculta si la persona no tiene `puede_ver` en Contactos -- el nombre se sigue mostrando.

### Prioridad 2 -- gestión de gente (nueva superficie que hoy no tiene reglas)

13. **Independizar `puede_gestionar_equipo` del resto de la matriz** (0.2.1) -- no depende de cuánto
    acceso a módulos tenga la persona. Incluye poder invitar y **crear cuentas nuevas de cero**, con
    alcance limitado a los proyectos donde esa persona ya tiene `puede_gestionar_equipo = sí` -- endpoint
    nuevo o reescritura de `/api/project-members`.
14. **Sin jerarquía especial entre personas con `puede_gestionar_equipo = sí`** del mismo proyecto
    (0.2.1) -- cualquiera con este permiso puede gestionar a cualquier otra, incluidos otros con el mismo
    permiso.
15. **Aplicar el aislamiento por proyecto a la gestión de accesos en sí** (hallazgo 9.2, sigue vigente en
    el modelo nuevo): alguien solo puede invitar/gestionar gente en proyectos donde él mismo tiene
    `puede_gestionar_equipo`, nunca en proyectos ajenos.
16. **Protección contra que un proyecto se quede sin nadie que pueda gestionar equipo** (0.2.4): validar
    en el backend -- no solo advertir en el frontend -- antes de guardar cualquier cambio que deje a
    `puede_gestionar_equipo = sí` en cero personas para un proyecto.
17. **Restringir el "Gestor de Integrantes" (matriz completa del equipo) a quien tiene
    `puede_gestionar_equipo = sí`** (0.2.4) -- el resto de la gente del proyecto no debería poder pedir
    esa lista vía API tampoco, no solo que la UI no la muestre.
18. **Completar la instrumentación de `activity_logs`** -- hoy solo 12 de los ~38 endpoints que
    editan/borran algo llaman a `logActivity()` (Companies, Project-Members, Org-Members, Cost-Items,
    Ticket-Tiers, Setlist y otros quedan sin registrar). Es la causa real de "el cuadro de logs no
    funciona" -- no está roto, está incompleto. De paso, migrar `GET /api/activity-logs` de exigir
    `isAdmin` (rol de organización, que se retira) a exigir `puede_gestionar_equipo` en al menos un
    proyecto.
19. **Migrar `/api/eventos/[id]/cost-submissions`** (0.2.4) de `isAdmin` (organización) a `puede_editar` +
    `ve_costos` de proyecto, tanto para decidir quién puede revisar/aprobar un gasto reportado como para
    decidir a quién avisar por push cuando llega uno nuevo (hoy notifica a "admins de organización").
20. **Gatear la firma de cierre de caja a `ve_ingresos` + `ve_costos`** (0.2.4) y **el acceso a
    comprobantes/archivos adjuntos de costos a `ve_costos`** (0.2.4) en
    [`SignedFileLink.tsx`](src/components/finances/SignedFileLink.tsx) y el endpoint de attachment de
    costos (`/api/eventos/[id]/costs/attachment`).

### Prioridad 3 -- cerrar la brecha de seguridad en RLS (además queda más simple con el modelo nuevo)

21. **Cerrar la brecha de RLS de eventos** (sección 8.1) -- sigue siendo la más urgente en términos de
    datos sensibles expuestos: `shows` y sus 8 tablas hijas no tienen scoping por proyecto en la base de
    datos, solo en la aplicación.
22. **Eliminar el bypass `is_org_admin()` de las policies de RLS** (`contacts`, `companies`, `deals`,
    `transactions`, hallazgo 8.2) -- con el rediseño esto deja de ser opcional: si "organización" ya no
    es una capa de permisos en la app, tampoco puede seguir siéndolo en RLS.
23. **Escribir una función SQL de herencia de proyecto madre** (`is_project_member_or_parent(project_id)`)
    para reemplazar `is_project_member()` en RLS -- hoy esa lógica de herencia solo vive en TypeScript
    (`getProjectRole()`).
24. **Retirar `self_managed`** (0.2.4): eliminar la policy de RLS `deals_artist_selfmanaged_write` y
    decidir si se elimina la columna `projects.self_managed` o se deja sin uso -- queda reemplazado por
    la matriz persona por persona.
25. **Reflejar la matriz de permisos en RLS**, no solo en la aplicación -- una vez que la matriz
    reemplace al enum de rol (Prioridad 1), las policies que hoy miran `role` directamente quedan
    desalineadas igual que pasó con el modelo de roles el 23 ago. Requiere decidir si RLS consulta la
    tabla de matriz en cada policy o si se mantiene una copia simplificada a nivel de fila para no pagar
    el costo de un join en cada chequeo. **Importante:** RLS solo puede cubrir la parte de "ver la fila
    completa o no verla en absoluto" -- la redacción fina (nombre de contacto visible pero teléfono
    oculto, montos ocultos línea por línea) no es algo que RLS resuelva bien a nivel de columna; esa
    parte va a seguir viviendo en la capa de aplicación pase lo que pase con este ítem.

### Prioridad 4 -- huecos menores de aplicación, ya documentados, siguen vigentes

26. Endpoints de detalle por ID sin chequeo de proyecto: `contacts/[id]`, `companies/[id]`, `venues/[id]`
    (hallazgo 9.1).
27. `POST /api/companies` no chequea proyecto en absoluto (hallazgo 9.3).

### Prioridad 5 -- limpieza de datos, no bloquea nada del rediseño

28. **Consolidar las cuentas duplicadas de Francisco** (`francisco@somostrino.cl` /
    `francisco@katarsis.music`) -- mejor hacerlo antes de repartir permisos nuevos bajo el modelo de
    matriz, para no configurar dos veces.
29. Decidir si **La Sagrada** y **Prueba 2** deberían tener alguien con `puede_gestionar_equipo` asignado
    -- hoy nadie de los 3 administradores actuales tiene acceso ahí.
30. **Retirar el servidor MCP como función soportada** (0.7) -- sacarlo o marcarlo claramente como no
    disponible en `CLAUDE.md` hasta que se reescriba contra Supabase con la matriz nueva.

### Prioridad 6 -- intranet de trabajadores (lo que motivó este rediseño)

31. **Dashboard por proyecto**: listado de usuarios activos por proyecto y su matriz de permisos
    resumida -- la vista que Francisco describió como objetivo de la intranet.
32. **Gestor de Integrantes visual**: matriz editable con checkboxes/toggles por persona × módulo (la
    tabla de 0.2.2), reemplazando el selector de un solo rol que existe hoy en `MemberAccessSheet.tsx`.
33. **Vista agregada de solo lectura para quien tenga acceso a varios proyectos** (no un "admin global"
    con bypass -- ver 0.4): un resumen de salud de todos los proyectos a los que la persona ya tiene
    acceso, respetando la matriz de cada uno, sin entrar al detalle editable de ninguno sin seleccionarlo
    primero.
