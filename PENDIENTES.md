# Lista de trabajo — Auto-CRM
_Actualizado: 6 de mayo de 2026_

---

## 🔴 Crítico (arreglar primero)

**1. Dashboard no carga al volver de otra app**
- El bug actual. Token expira en background, `visibilitychange` falla silenciosamente, `TOKEN_REFRESHED` dispara pero quizás el listener no está activo aún.
- Hipótesis pendiente: puede ser un timing issue con el listener de Supabase dentro del componente — explorar si conviene manejarlo desde `auth-context` en lugar del componente.

---

## 🟠 Importante (esta semana)

**2. Finanzas — edición y asignación de usuario**
- Permitir editar transacciones ya creadas (cambiar monto, estado, descripción)
- Poder marcar/desmarcar "pendiente" (casos: devoluciones, ajustes)
- Asignar usuario responsable de la transacción

**3. Kanban de tareas — delay de 2 segundos**
- Investigar si el delay viene del optimistic update o de la query de revalidación
- Implementar actualización optimista real (actualizar UI antes de que confirme el server)
- Ayuda en multiusuario también (no esperar respuesta para mostrar el cambio)

**4. Botón de notificaciones — no funciona**
- Revisar qué tiene que hacer actualmente y conectarlo

---

## 🟡 Mejoras UX (próximas semanas)

**5. Importar / Exportar tablas**
- Exportar: Tareas a CSV, Contactos con sus empresas a CSV
- Importar: subir CSV de tareas, contactos
- El endpoint `/api/export` ya existe para contactos/deals — extender a tareas

**6. Vista Carta Gantt en Tareas**
- Vista visual de tareas con fechas de inicio / deadline en línea de tiempo
- Requiere que las tareas tengan `start_date` y `due_date` bien definidos
- Librería candidata: `gantt-task-react` o implementación custom con CSS grid

---

## 🟢 Funcionalidad nueva (futuro cercano)

**7. Notificaciones push** *(prerequisito: responsables de tareas ✅ YA LISTO)*
- Backend: endpoint para enviar notificaciones cuando se asigna tarea
- Frontend: solicitar permiso de notificaciones
- Opciones: Web Push API nativa o servicio como OneSignal
- Trigger: cuando se crea tarea con assignees o se agrega assignee a tarea existente

---

## 🔵 Futuro lejano

**8. Módulo de seguimiento RRSS** (TikTok, Instagram, etc.)
- Registrar publicaciones, métricas, campañas
- Conectar con deals/contactos

---

## ✅ Completado recientemente

**✅ Asignar responsables a tareas** _(6 mayo 2026)_
- Tabla `task_assignees` con relación many-to-many tasks ↔ users
- API endpoints actualizados (GET/POST)
- UI multi-select estilo Notion con búsqueda, chips, avatares
- Filtro "Asignadas a mí"
- Solo muestra usuarios del proyecto activo
- Fallback a email cuando falta nombre completo
- Kanban muestra avatares de asignados (primeros 3 + contador)

**✅ Simplificar formulario de tareas** _(6 mayo 2026)_
- Campo proyecto removido (usa proyecto activo automáticamente)
- Subproyecto reordenado arriba de contacto
- Labels "(opcional)" agregados a campos no obligatorios

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
