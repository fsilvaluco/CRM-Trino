-- ============================================================
-- Migration 050: Shows en vivo -- logistica sobre la tabla shows existente
-- Target: Supabase (Postgres).
-- ============================================================
-- La tabla `shows` ya existia (usada por Metricas > Shows para cargar
-- fee/venta de entradas/gastos DESPUES de que el show ya paso). Esta
-- migracion la extiende para que tambien sirva ANTES del show: cuando
-- se esta cotizando o ya esta confirmado, con hora, direccion y estado.
-- Es el MISMO registro en toda su vida -- no una tabla paralela.
--
-- deal_id es opcional a proposito: un show puede nacer de un Deal
-- ganado (marcado como "Es un show") o crearse suelto/autogestionado.
-- ============================================================

ALTER TABLE shows ADD COLUMN IF NOT EXISTS event_time TEXT; -- hora libre, ej "20:00" -- para cuando se sincronice con Google Calendar despues
ALTER TABLE shows ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE shows ADD COLUMN IF NOT EXISTS deal_id UUID REFERENCES deals(id) ON DELETE SET NULL;
ALTER TABLE shows ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'confirmado'
  CHECK (status IN ('cotizando', 'confirmado', 'realizado', 'cancelado'));

CREATE INDEX IF NOT EXISTS idx_shows_deal_id ON shows(deal_id);
CREATE INDEX IF NOT EXISTS idx_shows_status ON shows(status);

-- Los 3 shows de prueba que ya existen tienen numeros financieros
-- cargados -- se asume que ya pasaron.
UPDATE shows SET status = 'realizado'
WHERE status = 'confirmado' AND (fee > 0 OR ticket_income > 0 OR expenses > 0);

-- ============================================================
-- Flag en deals: "Es un show" -- activa el popup de armado de show al
-- ganar el deal (ver logica de app, no hay trigger de DB para esto).
-- ============================================================

ALTER TABLE deals ADD COLUMN IF NOT EXISTS is_show BOOLEAN NOT NULL DEFAULT false;

-- ============================================================
-- VERIFICATION QUERIES
-- ============================================================
-- SELECT status, count(*) FROM shows GROUP BY status;
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'deals' AND column_name = 'is_show';
