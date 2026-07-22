import { FolderOpen } from "lucide-react";
import { cn } from "@/lib/utils";

interface ProjectIconProps {
  avatarUrl?: string | null;
  name?: string;
  size?: "sm" | "md";
  className?: string;
}

const SIZE_CLASSES: Record<NonNullable<ProjectIconProps["size"]>, string> = {
  sm: "h-4 w-4",
  md: "h-8 w-8",
};

export function ProjectIcon({ avatarUrl, name, size = "sm", className }: ProjectIconProps) {
  if (avatarUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={avatarUrl}
        alt={name ? `Ícono de ${name}` : "Ícono del proyecto"}
        className={cn(SIZE_CLASSES[size], "rounded-full object-cover shrink-0", className)}
      />
    );
  }

  return <FolderOpen className={cn(SIZE_CLASSES[size], "text-primary shrink-0", className)} />;
}
