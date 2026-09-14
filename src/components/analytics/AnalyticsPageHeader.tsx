import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

interface AnalyticsPageHeaderProps {
  icon: LucideIcon;
  title: string;
  description: string;
  /** Acciones opcionales (ej. botón "Registrar estadísticas") al lado del ícono. */
  actions?: ReactNode;
}

export function AnalyticsPageHeader({ icon: Icon, title, description, actions }: AnalyticsPageHeaderProps) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        <p className="text-muted-foreground text-sm">{description}</p>
      </div>
      <div className="flex items-center gap-3">
        {actions}
        <Icon className="h-6 w-6 text-muted-foreground/40" />
      </div>
    </div>
  );
}
