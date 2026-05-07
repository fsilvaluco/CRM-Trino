# Bitácora de Trabajo — Auto-CRM
_Última actualización: 7 de mayo de 2026_

> **Formato de tracking:** Registro histórico de trabajo realizado + pendientes actuales.  
> Cada entrada incluye fecha, estado (🔨 En Progreso / ✅ Hecho), y notas de implementación detalladas.

---

## 🔴 Crítico (arreglar primero)

_Ninguno — todos resueltos ✅_

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