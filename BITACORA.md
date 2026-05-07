# Bitácora de Trabajo — Auto-CRM
_Última actualización: 7 de mayo de 2026_

> **Formato de tracking:** Registro histórico de trabajo realizado + pendientes actuales.  
> Cada entrada incluye fecha, estado (🔨 En Progreso / ✅ Hecho), y notas de implementación detalladas.

---

## 🔴 Crítico (arreglar primero)

_Ninguno — todos resueltos ✅_

---

## 🟠 Importante (esta semana)

**1. Finanzas — edición y asignación de usuario** _(creado: 6 may 2026)_
- Permitir editar transacciones ya creadas (cambiar monto, estado, descripción)
- Poder marcar/desmarcar "pendiente" (casos: devoluciones, ajustes)
- Asignar usuario responsable de la transacción
- **Estado:** Pendiente
- **Estimado:** 3-4 horas

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