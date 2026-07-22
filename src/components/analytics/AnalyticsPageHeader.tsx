import type { LucideIcon } from "lucide-react";

interface AnalyticsPageHeaderProps {
  icon: LucideIcon;
  title: string;
  description: string;
}

export function AnalyticsPageHeader({ icon: Icon, title, description }: AnalyticsPageHeaderProps) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        <p className="text-muted-foreground text-sm">{description}</p>
      </div>
      <Icon className="h-6 w-6 text-muted-foreground/40" />
    </div>
  );
}
