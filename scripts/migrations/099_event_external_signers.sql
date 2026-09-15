-- ============================================================
-- Migration 099: Firma externa del cierre de caja (sin cuenta en la app)
-- ============================================================
-- Una fila = un link de firma emitido para alguien de AFUERA: el cliente /
-- productor de un evento que Trino produjo (booking, ticketera, produccion)
-- pero que no es un proyecto de la cartera y por lo tanto nunca va a tener
-- usuario, ni project_members, ni matriz de permisos.
--
-- Por que una tabla aparte y no reusar event_closing_signatures: esa exige
-- user_id -> profiles, y el punto de esto es justamente que el firmante NO
-- tiene perfil. Ademas la aprobacion interna y la conformidad del cliente
-- son dos cosas distintas -- la externa NO cuenta para el "X/Y firmaron"
-- del cierre, es un respaldo frente al cliente.
--
-- El link es el secreto: se guarda solo el SHA-256 del token
-- (`token_hash`), nunca el token en claro -- si alguien se roba la base no
-- puede abrir ningun link vigente. Lo mismo con el codigo de verificacion
-- que se manda al correo (`otp_hash`, salteado con el token_hash).
--
-- Una firma es un hecho irreversible: no hay UPDATE despues de `signed_at`
-- (lo impide el trigger de mas abajo) ni endpoint de "des-firmar". Para
-- anular un link que todavia no se firmo se usa `revoked_at`, no DELETE --
-- asi queda el rastro de que se emitio.
-- ============================================================

CREATE TABLE IF NOT EXISTS event_external_signers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  show_id UUID NOT NULL REFERENCES shows(id) ON DELETE CASCADE,

  -- Quien es esta persona para el evento, segun quien emitio el link
  -- (ej. "Cliente / Productor", "Ennio", "ennio@correo.cl"). Si
  -- `invited_email` viene cargado, el codigo de verificacion SOLO se puede
  -- mandar a esa casilla -- el firmante no puede redirigirlo a otra.
  role_label TEXT,
  invited_name TEXT,
  invited_email TEXT,

  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  first_viewed_at TIMESTAMPTZ,

  -- Lo que declara el firmante al identificarse
  signer_name TEXT,
  signer_rut TEXT,
  signer_email TEXT,
  signer_phone TEXT,

  -- Verificacion por codigo al correo (prueba de control de esa casilla)
  otp_hash TEXT,
  otp_sent_to TEXT,
  otp_sent_at TIMESTAMPTZ,
  otp_expires_at TIMESTAMPTZ,
  otp_attempts INTEGER NOT NULL DEFAULT 0,
  otp_verified_at TIMESTAMPTZ,

  -- La firma propiamente tal + su evidencia
  signed_at TIMESTAMPTZ,
  ip_address TEXT,
  user_agent TEXT,
  -- SHA-256 del documento exacto que se le mostro al firmar, y el
  -- documento completo tal cual estaba en ese momento. Si despues alguien
  -- reabre la caja y cambia un monto, el hash deja de calzar y se nota.
  document_hash TEXT,
  document_snapshot JSONB,
  receipt_sent_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_event_external_signers_show ON event_external_signers(show_id);
CREATE INDEX IF NOT EXISTS idx_event_external_signers_token ON event_external_signers(token_hash);

ALTER TABLE event_external_signers ENABLE ROW LEVEL SECURITY;

-- Mismo patron org-wide que event_cost_items/event_closing_signatures
-- (migraciones 054/067) -- el filtrado fino por PROYECTO y el chequeo de
-- "puede editar costos de Eventos" los hace la API route.
--
-- Ojo: las rutas publicas (/api/public/firma/[token]) NO pasan por estas
-- policies -- usan el service role (createAdminClient) porque el firmante
-- es anonimo. Su control de acceso es el token, y cada campo que devuelven
-- se elige a mano.
CREATE POLICY "org access external signers select" ON event_external_signers
  FOR SELECT USING (
    show_id IN (
      SELECT id FROM shows WHERE organization_id IN (
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
  );

-- Solo para revocar un link pendiente -- lo de mas arriba (datos del
-- firmante, OTP, firma) lo escribe el service role desde las rutas
-- publicas, que no pasa por RLS.
CREATE POLICY "org access external signers update" ON event_external_signers
  FOR UPDATE USING (
    show_id IN (
      SELECT id FROM shows WHERE organization_id IN (
        SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
      )
    )
  );

-- Una firma no se edita ni se borra, ni siquiera con el service role: una
-- vez que `signed_at` quedo escrito, la fila es historia. La unica
-- excepcion es `receipt_sent_at`, que se llena justo despues de firmar
-- cuando sale el correo con el comprobante.
CREATE OR REPLACE FUNCTION event_external_signers_lock_signed()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.signed_at IS NOT NULL THEN
    IF TG_OP = 'DELETE' THEN
      RAISE EXCEPTION 'Una firma externa ya registrada no se puede borrar';
    END IF;
    IF (to_jsonb(NEW) - 'receipt_sent_at') IS DISTINCT FROM (to_jsonb(OLD) - 'receipt_sent_at') THEN
      RAISE EXCEPTION 'Una firma externa ya registrada no se puede modificar';
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_event_external_signers_lock_signed ON event_external_signers;
CREATE TRIGGER trg_event_external_signers_lock_signed
  BEFORE UPDATE OR DELETE ON event_external_signers
  FOR EACH ROW EXECUTE FUNCTION event_external_signers_lock_signed();

-- ============================================================
-- VERIFICATION QUERIES
-- ============================================================
-- SELECT id, show_id, role_label, invited_name, signed_at, document_hash
--   FROM event_external_signers ORDER BY created_at DESC LIMIT 10;
