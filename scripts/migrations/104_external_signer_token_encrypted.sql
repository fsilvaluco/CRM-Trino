-- ============================================================
-- Migration 104: Token del link de firma externa, cifrado
-- ============================================================
-- Hasta ahora en la base vivia SOLO el SHA-256 del token (migracion 099):
-- perfecto para validar un link, imposible para volver a mostrarlo. Eso
-- obligaba a emitir uno nuevo -- matando el anterior -- cada vez que habia
-- que reenviarselo al cliente, y dejaba sin boton "Copiar link" a la ficha
-- del evento.
--
-- Punto medio elegido por Francisco (16 sep 2026): ademas del hash se
-- guarda el token cifrado con AES-256-GCM. La llave vive en
-- LINK_TOKEN_SECRET (variable de entorno), NO en la base: quien se robe un
-- dump se lleva ciphertext inservible. El hash sigue siendo lo que valida
-- cada request -- esto es solo para poder mostrarle el link de vuelta a
-- quien ya puede administrar el cierre.
--
-- Los links emitidos antes de esta migracion quedan con la columna en NULL
-- y simplemente no se pueden copiar; para esos sigue estando "Reenviar",
-- que emite uno nuevo. Ver src/lib/link-token-crypto.ts.
-- ============================================================

ALTER TABLE event_external_signers ADD COLUMN IF NOT EXISTS token_encrypted TEXT;

-- ============================================================
-- VERIFICATION QUERIES
-- ============================================================
-- SELECT id, invited_name, token_encrypted IS NOT NULL AS se_puede_copiar
--   FROM event_external_signers ORDER BY created_at DESC LIMIT 10;
