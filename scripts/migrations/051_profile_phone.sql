-- ============================================================
-- Migration 051: Teléfono en perfil de usuario
-- ============================================================
-- Campo opcional para guardar el teléfono de contacto de cada usuario
-- de la organización, capturado al invitar o editable después desde
-- "Gestionar Acceso". Sin validación de formato -- igual que reference_url,
-- en la práctica la gente pega números con o sin +56, espacios, etc.
-- ============================================================

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS phone TEXT;

-- ============================================================
-- VERIFICATION QUERIES
-- ============================================================
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'phone';
