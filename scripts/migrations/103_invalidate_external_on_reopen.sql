-- ============================================================
-- Migration 103: Reabrir la caja tambien tumba la firma del cliente
-- externo
-- ============================================================
-- Al reabrir el cierre se borran las firmas internas
-- (event_closing_signatures, ver costs/reopen/route.ts): si se reabre es
-- porque algo va a cambiar, y esas firmas quedarian aprobando una planilla
-- que ya no existe. La firma externa (migracion 099) se estaba quedando
-- viva -- hallazgo de Francisco (16 sep 2026): el cliente tambien tiene que
-- volver a firmar si cambian los numeros.
--
-- Pero una firma externa NO se borra, a diferencia de las internas: es el
-- respaldo frente a un tercero y ya se le mando su comprobante en PDF. Se
-- marca como invalidada, conservando entera su evidencia (datos del
-- firmante, IP, hash y snapshot del documento que SI firmo en su momento).
-- Deja de contar como firma vigente, su link deja de servir, y para tener
-- su conformidad del cierre nuevo hay que emitirle uno nuevo.
--
-- Esto obliga a aflojar el trigger de la 099: hasta ahora una fila firmada
-- era 100% inmutable salvo `receipt_sent_at`. Ahora tambien se pueden
-- escribir `invalidated_at`/`invalidated_reason` -- que no tocan la firma,
-- solo dicen que el documento que aprobaba quedo obsoleto.
-- ============================================================

ALTER TABLE event_external_signers ADD COLUMN IF NOT EXISTS invalidated_at TIMESTAMPTZ;
ALTER TABLE event_external_signers ADD COLUMN IF NOT EXISTS invalidated_reason TEXT;

CREATE OR REPLACE FUNCTION event_external_signers_lock_signed()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.signed_at IS NOT NULL THEN
    IF TG_OP = 'DELETE' THEN
      RAISE EXCEPTION 'Una firma externa ya registrada no se puede borrar';
    END IF;
    -- Lo unico editable despues de firmar: el acuse del comprobante y la
    -- invalidacion por reapertura del cierre. La firma en si (quien,
    -- cuando, desde donde, que documento) es inmutable.
    IF (to_jsonb(NEW) - 'receipt_sent_at' - 'invalidated_at' - 'invalidated_reason')
       IS DISTINCT FROM
       (to_jsonb(OLD) - 'receipt_sent_at' - 'invalidated_at' - 'invalidated_reason') THEN
      RAISE EXCEPTION 'Una firma externa ya registrada no se puede modificar';
    END IF;
    -- Y una vez invalidada, no se "des-invalida".
    IF OLD.invalidated_at IS NOT NULL AND NEW.invalidated_at IS NULL THEN
      RAISE EXCEPTION 'Una firma externa invalidada no se puede reactivar';
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- VERIFICATION QUERIES
-- ============================================================
-- SELECT signer_name, signed_at, invalidated_at, invalidated_reason
--   FROM event_external_signers WHERE invalidated_at IS NOT NULL;
