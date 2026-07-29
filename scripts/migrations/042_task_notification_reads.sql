-- ============================================================
-- Migration 042: Task Notification Reads - estado "leído" por tarea
-- Target: Supabase (Postgres).
-- ============================================================
-- Las notificaciones de tareas (atrasadas / próximas) no son filas
-- persistidas -- se calculan en vivo desde tasks.due_date cada vez que se
-- pide /api/task-notifications. Para poder marcarlas como "leídas" sin que
-- desaparezcan (estilo Facebook: se quedan pero mas atenuadas), esta tabla
-- guarda, por usuario y tarea, la ultima vez que se marcaron como vistas.
-- Es intencional que sea 1 fila por (user_id, task_id) sin importar si la
-- tarea estaba "atrasada" o "próxima" al momento de marcarla -- es un ack
-- sobre la tarea, no sobre la categoria puntual.
-- ============================================================

CREATE TABLE IF NOT EXISTS task_notification_reads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  read_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, task_id)
);

CREATE INDEX IF NOT EXISTS idx_task_notification_reads_user_id ON task_notification_reads(user_id);
CREATE INDEX IF NOT EXISTS idx_task_notification_reads_task_id ON task_notification_reads(task_id);

ALTER TABLE task_notification_reads ENABLE ROW LEVEL SECURITY;

CREATE POLICY task_notification_reads_own ON task_notification_reads FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ============================================================
-- VERIFICATION QUERIES
-- ============================================================
-- SELECT * FROM pg_policies WHERE tablename = 'task_notification_reads';
