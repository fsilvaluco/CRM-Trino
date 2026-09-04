-- ============================================================
-- Migration 090: Emisor/Receptor en transacciones + lectura con IA
-- ============================================================
-- Antes solo había una "Descripción" libre. Ahora se guarda por separado
-- quién envió la plata (emisor) y quién la recibió (receptor) cuando el
-- comprobante es una transferencia -- se pueden llenar a mano o
-- autocompletar leyendo el comprobante con IA (ver /api/finances/extract,
-- que reusa extractReceiptFromImage/Text de src/lib/openai.ts, ya usado
-- por "Adjuntar comprobante (IA)").
-- ============================================================

ALTER TABLE transactions ADD COLUMN IF NOT EXISTS emisor TEXT;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS receptor TEXT;
