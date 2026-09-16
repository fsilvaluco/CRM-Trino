-- ============================================================
-- Migration 102: La firma interna del cierre pasa a ser firma electronica
-- simple de verdad (codigo al correo + evidencia)
-- ============================================================
-- Hasta ahora firmar por dentro era un click: estar logueado y ser
-- firmante requerido. Eso prueba que la sesion estaba abierta, no que la
-- persona quiso firmar ESE documento. La firma del cliente externo
-- (migracion 099) quedo con mucho mejor respaldo que la del propio equipo.
--
-- Pedido de Francisco (15 sep 2026): igualarlas. Ahora el firmante interno
-- declara sus datos, recibe un codigo de 6 digitos en el correo DE SU
-- CUENTA (no en el que declare -- ese correo es su identidad verificada) y
-- recien ahi firma. Queda guardada la misma evidencia que en la externa:
-- datos declarados, IP, dispositivo, hash del documento y el documento
-- completo tal como estaba al firmar.
--
-- Las firmas que ya existen se quedan como estan, con los campos nuevos en
-- NULL -- son historicas, no se pueden "completar" hacia atras.
-- ============================================================

-- ─── Evidencia en la firma ya registrada ────────────────────────────────
ALTER TABLE event_closing_signatures ADD COLUMN IF NOT EXISTS signer_name TEXT;
ALTER TABLE event_closing_signatures ADD COLUMN IF NOT EXISTS signer_rut TEXT;
ALTER TABLE event_closing_signatures ADD COLUMN IF NOT EXISTS signer_email TEXT;
ALTER TABLE event_closing_signatures ADD COLUMN IF NOT EXISTS signer_phone TEXT;
ALTER TABLE event_closing_signatures ADD COLUMN IF NOT EXISTS otp_verified_at TIMESTAMPTZ;
ALTER TABLE event_closing_signatures ADD COLUMN IF NOT EXISTS user_agent TEXT;
ALTER TABLE event_closing_signatures ADD COLUMN IF NOT EXISTS document_hash TEXT;
ALTER TABLE event_closing_signatures ADD COLUMN IF NOT EXISTS document_snapshot JSONB;

-- ─── Datos del firmante guardados en su perfil ──────────────────────────
-- Para no volver a pedirle el RUT y el telefono en cada cierre. Es un
-- prellenado, NO un atajo: el codigo al correo se pide siempre igual.
-- `phone` ya existe desde la migracion 051.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS rut TEXT;

-- ─── Codigo de verificacion en vuelo ────────────────────────────────────
-- Una fila = el codigo vigente de una persona para un evento. Se pisa con
-- cada reenvio y se borra al firmar. Igual que en la firma externa, se
-- guarda solo el hash del codigo, salteado con el id del evento y el del
-- usuario -- 6 digitos sueltos se revientan por fuerza bruta al instante.
CREATE TABLE IF NOT EXISTS event_signature_otps (
  show_id UUID NOT NULL REFERENCES shows(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  otp_hash TEXT NOT NULL,
  sent_to TEXT NOT NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  -- Lo que declaro al PEDIR el codigo. Al firmar solo se manda el codigo,
  -- asi que la identidad que queda firmada es siempre la que recibio el
  -- correo -- cambiar cualquier dato obliga a pedir un codigo nuevo.
  signer_name TEXT,
  signer_rut TEXT,
  signer_email TEXT,
  signer_phone TEXT,
  save_to_profile BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (show_id, user_id)
);

ALTER TABLE event_signature_otps ENABLE ROW LEVEL SECURITY;

-- Nadie lee ni escribe esta tabla desde el cliente: la maneja entera el
-- backend con el service role (el hash del codigo no tiene por que salir
-- nunca de ahi). Sin policies = sin acceso via anon/authenticated, que es
-- exactamente lo que se quiere.

-- ============================================================
-- VERIFICATION QUERIES
-- ============================================================
-- SELECT user_id, signed_at, signer_rut, otp_verified_at, document_hash
--   FROM event_closing_signatures ORDER BY signed_at DESC LIMIT 10;
-- SELECT * FROM event_signature_otps;
