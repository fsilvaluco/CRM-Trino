-- ============================================================
-- Migration 077: Préstamos -- para financiamiento de proyectos (ej. LP
-- "Los Últimos Románticos") vía prestamistas externos, separado a
-- propósito de Finanzas (income/expense) porque NO es ingreso ni gasto
-- real del proyecto -- es deuda: plata que entra y tiene que devolverse.
-- ============================================================
-- loans: un prestamista = una fila, con su monto prestado y si ya llegó.
-- loan_repayments: pagos DE VUELTA a un prestamista puntual -- el saldo
--   pendiente de esa deuda se calcula solo (principal - sum(repayments)).
-- loan_contributions: aportes que juntan los artistas para poder pagarle
--   a los prestamistas -- un "fondo" de paso, no están atados a un
--   préstamo en particular (se reparten entre varios prestamistas).
--
-- Montos en CENTAVOS (integer) -- el estándar del resto de la app, NO el
-- de Finanzas/`transactions` (que guarda pesos directos, ver lección en
-- BITACORA.md 19 ago 2026 -- no confundir las dos convenciones).
-- ============================================================

CREATE TABLE IF NOT EXISTS loans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  lender_name TEXT NOT NULL,
  principal_amount INTEGER NOT NULL,
  received BOOLEAN NOT NULL DEFAULT false,
  received_at TIMESTAMPTZ,
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS loan_repayments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_id UUID NOT NULL REFERENCES loans(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL,
  repayment_date DATE,
  comprobante_url TEXT,
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS loan_contributions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  contributor_name TEXT NOT NULL,
  amount INTEGER NOT NULL,
  contribution_date DATE,
  comprobante_url TEXT,
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_loans_project ON loans(project_id);
CREATE INDEX IF NOT EXISTS idx_loan_repayments_loan ON loan_repayments(loan_id);
CREATE INDEX IF NOT EXISTS idx_loan_contributions_project ON loan_contributions(project_id);

ALTER TABLE loans ENABLE ROW LEVEL SECURITY;
ALTER TABLE loan_repayments ENABLE ROW LEVEL SECURITY;
ALTER TABLE loan_contributions ENABLE ROW LEVEL SECURITY;

-- Mismo patrón org-wide que event_cost_items/transactions -- el filtrado
-- fino por proyecto lo hace la API (allowedProjectIds), igual que Finanzas.
CREATE POLICY "org access loans" ON loans FOR ALL USING (
  organization_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid())
);
CREATE POLICY "org access loan_repayments" ON loan_repayments FOR ALL USING (
  loan_id IN (SELECT id FROM loans WHERE organization_id IN (
    SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
  ))
);
CREATE POLICY "org access loan_contributions" ON loan_contributions FOR ALL USING (
  organization_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid())
);
