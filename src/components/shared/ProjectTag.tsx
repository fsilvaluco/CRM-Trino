import { THEME_PALETTES, type ThemeColorKey } from "@/lib/theme-palettes";

// ─── Etiqueta de proyecto (logo o iniciales con el color del proyecto) ────────
// Usada tanto en la tarjeta de Kanban de Tareas como en la de Tratos, para
// que se vea igual en toda la app.

export function ProjectTag({
  name,
  color,
  avatarUrl,
}: {
  name: string;
  color?: string | null;
  avatarUrl?: string | null;
}) {
  const palette = color && color in THEME_PALETTES ? THEME_PALETTES[color as ThemeColorKey] : null;
  const hex = palette?.primary ?? "#94a3b8"; // gris neutro si el proyecto no tiene color asignado

  const initials = name
    .split(" ")
    .filter(Boolean)
    .map((word) => word[0])
    .join("")
    .toUpperCase()
    .slice(0, 3);

  return (
    <div className="flex items-center gap-1.5">
      {avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={avatarUrl}
          alt=""
          className="h-4 w-4 rounded-full object-cover shrink-0"
          style={{ boxShadow: `0 0 0 1px ${hex}` }}
        />
      ) : (
        <span
          className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[8px] font-bold text-white"
          style={{ backgroundColor: hex }}
        >
          {initials}
        </span>
      )}
      <span className="text-xs text-muted-foreground truncate">{name}</span>
    </div>
  );
}
