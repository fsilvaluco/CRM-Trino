"use client";

import { useState } from "react";
import { Search, Menu } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { MobileNav } from "./MobileNav";
import { UserMenu } from "./UserMenu";
import { ProjectSelector } from "./ProjectSelector";
import { NotificationPopover } from "@/components/shared/NotificationPopover";
import { useProject } from "@/lib/project-context";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

function DriveIcon({ className }: { className?: string }) {
  // Forma triangular del logo de Drive (sin usar el asset de marca real,
  // solo la silueta generica que cualquier usuario reconoce como "Drive").
  return (
    <svg viewBox="0 0 87.3 78" className={className} xmlns="http://www.w3.org/2000/svg">
      <path
        d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8h-27.5c0 1.55.4 3.1 1.2 4.5z"
        fill="#0066da"
      />
      <path
        d="m43.65 25-13.75-23.8c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44a9.06 9.06 0 0 0 -1.2 4.5h27.5z"
        fill="#00ac47"
      />
      <path
        d="m73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5h-27.5l5.85 11.5z"
        fill="#ea4335"
      />
      <path
        d="m43.65 25 13.75-23.8c-1.35-.8-2.9-1.2-4.5-1.2h-18.5c-1.6 0-3.15.45-4.5 1.2z"
        fill="#00832d"
      />
      <path
        d="m59.8 53h-32.3l-13.75 23.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z"
        fill="#2684fc"
      />
      <path
        d="m73.4 26.5-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3l-13.75 23.8 16.15 28h27.45c0-1.55-.4-3.1-1.2-4.5z"
        fill="#ffba00"
      />
    </svg>
  );
}

export function Header() {
  const [searchQuery, setSearchQuery] = useState("");
  const { activeProject } = useProject();

  return (
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-4 border-b bg-card px-4 md:px-6 min-w-0 overflow-hidden">
      <Sheet>
        <SheetTrigger
          render={<Button variant="ghost" size="icon" className="md:hidden cursor-pointer" />}
        >
          <Menu className="h-5 w-5" />
        </SheetTrigger>
        <SheetContent side="left" className="w-64 p-0">
          <MobileNav />
        </SheetContent>
      </Sheet>

      <ProjectSelector />

      <div className="flex-1 min-w-0 flex items-center gap-4">
        <div className="relative w-full max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar contactos, deals..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 bg-muted/50"
          />
        </div>
      </div>

      {activeProject?.driveUrl && (
        <Tooltip>
          <TooltipTrigger
            render={
              <Button variant="ghost" size="icon" className="cursor-pointer shrink-0" />
            }
          >
            <a href={activeProject.driveUrl} target="_blank" rel="noopener noreferrer">
              <DriveIcon className="h-5 w-5" />
            </a>
          </TooltipTrigger>
          <TooltipContent>Abrir Drive de {activeProject.name}</TooltipContent>
        </Tooltip>
      )}

      <NotificationPopover />

      <UserMenu />
    </header>
  );
}
