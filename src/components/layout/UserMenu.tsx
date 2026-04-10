"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useRouter } from "next/navigation";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ProfileEditSheet } from "./ProfileEditSheet";
import { LogOut, UserCircle } from "lucide-react";

export function UserMenu() {
  const { user, signOut } = useAuth();
  const router = useRouter();
  const [profileOpen, setProfileOpen] = useState(false);

  const fullName =
    user?.user_metadata?.full_name ||
    user?.email?.split("@")[0] ||
    "Usuario";

  const avatarUrl = user?.user_metadata?.avatar_url ?? null;

  const initials = fullName
    .split(" ")
    .map((n: string) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const handleSignOut = async () => {
    await signOut();
    router.replace("/login");
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger className="flex items-center rounded-full outline-none cursor-pointer hover:ring-2 hover:ring-primary/30 transition-all p-0 bg-transparent border-0">
          <Avatar className="h-8 w-8">
            <AvatarImage src={avatarUrl ?? undefined} />
            <AvatarFallback className="text-xs">{initials}</AvatarFallback>
          </Avatar>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end" className="w-56">
          {/* Info del usuario dentro de un grupo para que GroupLabel funcione */}
          <DropdownMenuGroup>
            <DropdownMenuLabel>
              <div className="flex flex-col gap-0.5">
                <p className="text-sm font-medium text-foreground leading-none">{fullName}</p>
                <p className="text-xs text-muted-foreground leading-none mt-1 truncate">
                  {user?.email}
                </p>
              </div>
            </DropdownMenuLabel>
          </DropdownMenuGroup>

          <div className="h-px bg-border my-1" />

          <DropdownMenuItem
            className="cursor-pointer"
            onClick={() => setProfileOpen(true)}
          >
            <UserCircle className="h-4 w-4 mr-2" />
            Editar perfil
          </DropdownMenuItem>

          <div className="h-px bg-border my-1" />

          <DropdownMenuItem
            className="cursor-pointer text-destructive focus:text-destructive"
            onClick={handleSignOut}
          >
            <LogOut className="h-4 w-4 mr-2" />
            Cerrar sesión
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ProfileEditSheet
        open={profileOpen}
        onClose={() => setProfileOpen(false)}
      />
    </>
  );
}
