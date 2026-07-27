"use client";

import { useState } from "react";
import { Search, Menu, FolderOpen } from "lucide-react";
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

      {activeProject?.driveUrl && (
        <Tooltip>
          <TooltipTrigger
            render={
              <Button variant="outline" size="sm" className="cursor-pointer shrink-0" />
            }
          >
            <a href={activeProject.driveUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5">
              <FolderOpen className="h-4 w-4" />
              <span className="hidden sm:inline">Drive</span>
            </a>
          </TooltipTrigger>
          <TooltipContent>Abrir carpeta de Drive de {activeProject.name}</TooltipContent>
        </Tooltip>
      )}

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

      <NotificationPopover />

      <UserMenu />
    </header>
  );
}
