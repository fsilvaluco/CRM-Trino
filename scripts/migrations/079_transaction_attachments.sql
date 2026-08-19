-- ============================================================
-- Migration 079: Múltiples comprobantes por transacción de Finanzas.
--
-- Motivo (19 ago 2026, pedido de Francisco): una misma línea de
-- presupuesto se puede pagar en 2+ cuotas (ej. "Fotografía LUR" pagada
-- en 2 transferencias separadas a Kuyen). El campo único
-- transactions.file_path solo alcanzaba para un comprobante -- se
-- necesita poder ir sumando comprobantes sin perder los anteriores.
--
-- transactions.file_path/file_name se DEJAN como están (compat con
-- código/datos viejos) -- no se migran filas existentes automáticamente
-- acá porque el propio endpoint de lectura ya sabe mostrar ambos
-- (columna vieja + esta tabla nueva) sin duplicar.
-- ============================================================

CREATE TABLE IF NOT EXISTS transaction_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  file_name TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_transaction_attachments_transaction ON transaction_attachments(transaction_id);

ALTER TABLE transaction_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org access transaction_attachments" ON transaction_attachments FOR ALL USING (
  organization_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid())
);
