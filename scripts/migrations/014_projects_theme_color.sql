-- Theming por artista (Fase 2.3 del plan maestro): cada proyecto puede
-- elegir una de 8 paletas de color para sentir el espacio como propio y
-- para que el color mismo confirme en qué proyecto está parado el usuario.

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS theme_color TEXT NOT NULL DEFAULT 'azul';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'projects'::regclass
      AND conname = 'projects_theme_color_check'
  ) THEN
    ALTER TABLE projects
      ADD CONSTRAINT projects_theme_color_check
      CHECK (theme_color IN ('verde', 'morado', 'rojo', 'naranjo', 'celeste', 'crema', 'azul', 'rosa'));
  END IF;
END $$;

-- Gamuza → verde, Simplemente Yo → morado (pedido explícito, ver plan maestro).
-- Ajusta los nombres si difieren del registro real en tu base.
UPDATE projects SET theme_color = 'verde' WHERE name ILIKE 'Gamuza';
UPDATE projects SET theme_color = 'morado' WHERE name ILIKE 'Simplemente Yo';
