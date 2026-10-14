import { ArrowDown, ArrowUp, Minus } from "lucide-react";
import type { SpotifyGeoSnapshot } from "@/types/analytics";

export const NUM = new Intl.NumberFormat("es-CL");
export const PCT = new Intl.NumberFormat("es-CL", { style: "percent", maximumFractionDigits: 1 });

export function geoKey(r: Pick<SpotifyGeoSnapshot, "scope" | "country" | "city">): string {
  return `${r.scope}|${r.country}|${r.city}`;
}

/** Variación vs el corte anterior. null si no hay con qué comparar. */
export function change(now: number | null, before: number | null | undefined): number | null {
  if (now == null || before == null || before === 0) return null;
  return now / before - 1;
}

/** Texto en tinta neutra; la flecha (no solo el color) lleva la dirección. */
export function ChangeText({ value }: { value: number | null }) {
  if (value == null) return <span className="text-muted-foreground">—</span>;
  const up = value > 0.005;
  const down = value < -0.005;
  const Icon = up ? ArrowUp : down ? ArrowDown : Minus;
  return (
    <span className="inline-flex items-center gap-0.5 tabular-nums text-muted-foreground">
      <Icon className={`h-3 w-3 ${up ? "text-emerald-600" : down ? "text-rose-600" : ""}`} />
      {up ? "+" : ""}
      {PCT.format(value)}
    </span>
  );
}
