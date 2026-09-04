-- ============================================================
-- Migration 087: Liquidaciones (regalías, merchandising, y otros pagos
-- recurrentes entre partes que NO están atados a un evento puntual)
-- ============================================================
-- Distinto de `transactions` (gastos/ingresos sueltos de Finanzas) y de
-- `shows.profit_split_*` (reparto de UN evento): esto es para pagos
-- periódicos entre dos partes (ej. Gamuza le paga 20% de regalías a
-- Trino cada distribución, o Trino le paga a Gamuza el % del
-- merchandising vendido cada mes). Genérico por diseño (`type`) para no
-- tener que agregar una tabla nueva cada vez que aparezca otro tipo de
-- pago recurrente.
-- ============================================================

CREATE TABLE IF NOT EXISTS settlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('regalias', 'merch', 'otro')),
  period_month SMALLINT CHECK (period_month BETWEEN 1 AND 12),
  period_year SMALLINT,
  payer_name TEXT NOT NULL,
  payee_name TEXT NOT NULL,
  -- Monto de origen: lo retirado de regalías, o lo vendido en merch ese mes
  source_amount INTEGER NOT NULL DEFAULT 0,
  source_proof_path TEXT,
  source_proof_name TEXT,
  -- % aplicado sobre source_amount para llegar a payout_amount (editable,
  -- no se recalcula solo -- puede haber ajustes manuales)
  percentage NUMERIC(5, 2) NOT NULL DEFAULT 0,
  payout_amount INTEGER NOT NULL DEFAULT 0,
  payout_proof_path TEXT,
  payout_proof_name TEXT,
  paid BOOLEAN NOT NULL DEFAULT false,
  paid_at TIMESTAMPTZ,
  notes TEXT,
  created_by UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_settlements_project ON settlements(project_id);
CREATE INDEX IF NOT EXISTS idx_settlements_org ON settlements(organization_id);

ALTER TABLE settlements ENABLE ROW LEVEL SECURITY;

-- Mismo patrón org-wide que transactions/event_cost_items: el filtrado
-- fino por PROYECTO (matriz de roles) lo hace la API route, no RLS.
CREATE POLICY "org access settlements select" ON settlements
  FOR SELECT USING (
    organization_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid())
  );

CREATE POLICY "org access settlements insert" ON settlements
  FOR INSERT WITH CHECK (
    created_by = auth.uid()
    AND organization_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid())
  );

CREATE POLICY "org access settlements update" ON settlements
  FOR UPDATE USING (
    organization_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid())
  );

-- Sin DELETE policy: se borra vía soft delete (deleted_at), como transactions.

-- ============================================================
-- Firma de aprobación -- mismo patrón que event_closing_signatures
-- (migración 067): un hecho irreversible, no se edita ni se borra desde
-- la app.
-- ============================================================
CREATE TABLE IF NOT EXISTS settlement_signatures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  settlement_id UUID NOT NULL REFERENCES settlements(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  signed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (settlement_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_settlement_signatures_settlement ON settlement_signatures(settlement_id);

ALTER TABLE settlement_signatures ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org access settlement signatures select" ON settlement_signatures
  FOR SELECT USING (
    settlement_id IN (
      SELECT id FROM settlements WHERE organization_id IN (
        SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "org access settlement signatures insert" ON settlement_signatures
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
    AND settlement_id IN (
      SELECT id FROM settlements WHERE organization_id IN (
        SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
      )
    )
  );

-- ============================================================
-- VERIFICATION QUERIES
-- ============================================================
-- SELECT * FROM settlements ORDER BY created_at DESC LIMIT 10;
-- SELECT * FROM settlement_signatures ORDER BY signed_at DESC LIMIT 10;
