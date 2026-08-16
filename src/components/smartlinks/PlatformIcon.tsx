import { Link as LinkIcon } from "lucide-react";
import { getPlatformDef } from "@/lib/smartlink-platforms";

// Sin "use client" a proposito -- es puro SVG estatico, funciona tanto en
// server components (la pagina publica) como en client components (el
// formulario).
export function PlatformIcon({ platformKey, size = 20 }: { platformKey: string; size?: number }) {
  const def = getPlatformDef(platformKey);

  if (!def.icon) {
    return <LinkIcon className="text-muted-foreground" style={{ width: size, height: size }} />;
  }

  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill={`#${def.icon.hex}`}
      xmlns="http://www.w3.org/2000/svg"
      aria-label={def.label}
    >
      <path d={def.icon.path} />
    </svg>
  );
}
