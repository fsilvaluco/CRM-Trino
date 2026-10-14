-- ============================================================
-- Migration 109: Liquidaciones con firma electronica simple (interna y
-- externa) y en mas de una moneda
-- ============================================================
-- Pedido de Francisco (14 oct 2026), a partir del cierre de la
-- distribucion de Dani Abarza: hay liquidaciones donde la contraparte NO
-- tiene ni va a tener cuenta en la app (una artista con la que ya no se
-- trabaja, a la que se le pagan las regalias historicas para cerrar). Tiene
-- que poder firmar su conformidad igual que el cliente externo de un
-- evento (migracion 099): link con token, RUT, codigo al correo, huella del
-- documento y comprobante en PDF.
--
-- Tres cambios:
--
-- 1. `event_external_signers` pasa a servir tambien para liquidaciones.
--    Una fila apunta a un evento O a una liquidacion, nunca a los dos. Se
--    reusa la misma tabla (y no una nueva) para no duplicar el link
--    cifrado, el OTP, el trigger que congela una firma ya hecha y la
--    pagina publica /firmar/[token]. El nombre de la tabla queda como esta
--    -- renombrarla tocaria todo el modulo de eventos por nada.
--
-- 2. La firma INTERNA de una liquidacion se iguala a la de eventos
--    (migracion 102): hasta ahora era un click. Ahora pide datos, codigo de
--    6 digitos al correo de la cuenta y guarda la misma evidencia. Las
--    firmas viejas se quedan como estan, con los campos nuevos en NULL.
--
-- 3. `settlements.currency`: hasta ahora todo era en pesos. Los montos
--    siguen siendo enteros en la unidad minima de la moneda -- pesos para
--    CLP (no tiene decimales) y centavos para USD -- asi que USD 40,53 se
--    guarda como 4053 sin redondear nada.
-- ============================================================

-- ─── 3. Moneda ──────────────────────────────────────────────────────────
ALTER TABLE settlements ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'CLP';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'settlements_currency_check') THEN
    ALTER TABLE settlements ADD CONSTRAINT settlements_currency_check CHECK (currency IN ('CLP', 'USD'));
  END IF;
END $$;

-- ─── 1. Firmante externo de una liquidacion ─────────────────────────────
ALTER TABLE event_external_signers ALTER COLUMN show_id DROP NOT NULL;
ALTER TABLE event_external_signers
  ADD COLUMN IF NOT EXISTS settlement_id UUID REFERENCES settlements(id) ON DELETE CASCADE;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'event_external_signers_one_target') THEN
    ALTER TABLE event_external_signers ADD CONSTRAINT event_external_signers_one_target
      CHECK ((show_id IS NOT NULL) <> (settlement_id IS NOT NULL));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_event_external_signers_settlement ON event_external_signers(settlement_id);

-- Las policies de la 099 solo miraban `shows`: una fila de liquidacion
-- quedaba invisible para el equipo. Se reescriben con las dos ramas. (Las
-- rutas publicas siguen usando el service role, que no pasa por aca.)
DROP POLICY IF EXISTS "org access external signers select" ON event_external_signers;
DROP POLICY IF EXISTS "org access external signers insert" ON event_external_signers;
DROP POLICY IF EXISTS "org access external signers update" ON event_external_signers;

CREATE POLICY "org access external signers select" ON event_external_signers
  FOR SELECT USING (
    show_id IN (
      SELECT id FROM shows WHERE organization_id IN (
        SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
      )
    )
    OR settlement_id IN (
      SELECT id FROM settlements WHERE organization_id IN (
        SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "org access external signers insert" ON event_external_signers
  FOR INSERT WITH CHECK (
    show_id IN (
      SELECT id FROM shows WHERE organization_id IN (
        SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
      )
    )
    OR settlement_id IN (
      SELECT id FROM settlements WHERE organization_id IN (
        SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "org access external signers update" ON event_external_signers
  FOR UPDATE USING (
    show_id IN (
      SELECT id FROM shows WHERE organization_id IN (
        SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
      )
    )
    OR settlement_id IN (
      SELECT id FROM settlements WHERE organization_id IN (
        SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
      )
    )
  );

-- ─── 2. Evidencia en la firma interna de una liquidacion ────────────────
ALTER TABLE settlement_signatures ADD COLUMN IF NOT EXISTS signer_name TEXT;
ALTER TABLE settlement_signatures ADD COLUMN IF NOT EXISTS signer_rut TEXT;
ALTER TABLE settlement_signatures ADD COLUMN IF NOT EXISTS signer_email TEXT;
ALTER TABLE settlement_signatures ADD COLUMN IF NOT EXISTS signer_phone TEXT;
ALTER TABLE settlement_signatures ADD COLUMN IF NOT EXISTS otp_verified_at TIMESTAMPTZ;
ALTER TABLE settlement_signatures ADD COLUMN IF NOT EXISTS user_agent TEXT;
ALTER TABLE settlement_signatures ADD COLUMN IF NOT EXISTS document_hash TEXT;
ALTER TABLE settlement_signatures ADD COLUMN IF NOT EXISTS document_snapshot JSONB;

-- Codigo en vuelo, igual que event_signature_otps (migracion 102): una
-- fila por persona y liquidacion, se pisa con cada reenvio y se borra al
-- firmar. Sin policies = solo el service role la toca.
CREATE TABLE IF NOT EXISTS settlement_signature_otps (
  settlement_id UUID NOT NULL REFERENCES settlements(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  otp_hash TEXT NOT NULL,
  sent_to TEXT NOT NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  signer_name TEXT,
  signer_rut TEXT,
  signer_email TEXT,
  signer_phone TEXT,
  save_to_profile BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (settlement_id, user_id)
);

ALTER TABLE settlement_signature_otps ENABLE ROW LEVEL SECURITY;

-- Una firma interna ya no se borra desde la app salvo que se cambien las
-- cifras de la liquidacion (ver PUT /api/settlements/[id]), y eso lo hace
-- el backend con el service role. Hace falta la policy DELETE para el
-- caso en que la ruta use la sesion del usuario -- se deja explicita y
-- acotada a la organizacion.
DROP POLICY IF EXISTS "org access settlement signatures delete" ON settlement_signatures;
CREATE POLICY "org access settlement signatures delete" ON settlement_signatures
  FOR DELETE USING (
    settlement_id IN (
      SELECT id FROM settlements WHERE organization_id IN (
        SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
      )
    )
  );

-- ============================================================
-- VERIFICATION QUERIES
-- ============================================================
-- SELECT id, settlement_id, show_id, invited_name, signed_at FROM event_external_signers
--   WHERE settlement_id IS NOT NULL ORDER BY created_at DESC;
-- SELECT id, currency, source_amount, payout_amount FROM settlements ORDER BY created_at DESC LIMIT 5;
-- SELECT settlement_id, user_id, signer_rut, otp_verified_at, document_hash FROM settlement_signatures
--   ORDER BY signed_at DESC LIMIT 10;
