"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { toast } from "sonner";
import { UserPlus, Trash2, Loader2, ChevronDown, Pencil } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MemberAccessSheet } from "@/components/settings/MemberAccessSheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface Member {
  user_id: string;
  role: string;
  joined_at: string;
  status: "pending" | "active";
  profiles: { full_name: string | null; email: string | null; avatar_url: string | null } | null;
}

const ROLE_LABELS: Record<string, string> = {
  owner: "Propietario",
  admin: "Admin",
  member: "Miembro",
};

const ROLE_BADGE_CLASSNAMES: Record<string, string> = {
  owner: "bg-violet-500/15 text-violet-300 border-violet-500/40",
  admin: "bg-blue-500/15 text-blue-300 border-blue-500/40",
  member: "bg-slate-500/15 text-slate-300 border-slate-500/40",
};

const STATUS_LABELS: Record<Member["status"], string> = {
  pending: "Pendiente",
  active: "Activo",
};

export function OrgMembersPanel() {
  const router = useRouter();
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("member");
  const [inviting, setInviting] = useState(false);
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);
  const [accessSheetOpen, setAccessSheetOpen] = useState(false);
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);

  const loadMembers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/org-members");
      if (!res.ok) {
        const data = await res.json();
        toast.error("Error cargando usuarios: " + (data.error ?? res.statusText));
        return;
      }
      const data: Member[] = await res.json();
      setMembers(data);
    } catch {
      toast.error("Error cargando usuarios");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMembers();
  }, [loadMembers]);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail) return;
    setInviting(true);
    try {
      const res = await fetch("/api/org-members", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error ?? "Error al invitar"); return; }

      if (data.state === "already_active") {
        toast.info("El usuario ya está activo en la organización");
      } else if (data.state === "already_invited") {
        toast.success("Usuario ya invitado. Se volvió a intentar el envío de invitación.");
      } else {
        toast.success(`Invitación enviada a ${inviteEmail}`);
      }

      setInviteEmail("");
      await loadMembers();
      router.refresh();
    } finally {
      setInviting(false);
    }
  };

  const handleRemove = async (userId: string, name: string) => {
    if (!confirm(`¿Eliminar a ${name} de la organización?`)) return;
    setDeletingUserId(userId);
    try {
      const res = await fetch("/api/org-members", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });

      const data = await res.json().catch(() => null);
      if (!res.ok) {
        toast.error(
          "Error al eliminar: " +
            ((data && typeof data.error === "string" && data.error) || res.statusText)
        );
        return;
      }

      toast.success("Usuario eliminado");
      await loadMembers();
      router.refresh();
    } catch {
      toast.error("Error al eliminar usuario");
    } finally {
      setDeletingUserId(null);
    }
  };

  const handleManageAccess = (member: Member) => {
    setSelectedMember(member);
    setAccessSheetOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border/70 bg-card/60 backdrop-blur-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground p-4">
            <Loader2 className="h-4 w-4 animate-spin" /> Cargando...
          </div>
        ) : members.length === 0 ? (
          <p className="text-sm text-muted-foreground p-4">No hay usuarios en la organización.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30 hover:bg-muted/30">
                <TableHead className="pl-4">Usuario</TableHead>
                <TableHead>Rol actual</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right pr-4">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map((m) => {
                const name = m.profiles?.full_name ?? m.profiles?.email ?? "Usuario";
                const email = m.profiles?.email ?? "Sin email";
                const initials = (m.profiles?.full_name ?? m.profiles?.email ?? "?")
                  .slice(0, 2)
                  .toUpperCase();
                const isRowDeleting = deletingUserId === m.user_id;

                return (
                  <TableRow key={m.user_id} className="hover:bg-muted/20">
                    <TableCell className="pl-4">
                      <div className="flex items-center gap-3 min-w-0">
                        <Avatar className="h-8 w-8 shrink-0">
                          <AvatarImage src={m.profiles?.avatar_url ?? undefined} />
                          <AvatarFallback className="text-xs">{initials}</AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{name}</p>
                          <p className="text-xs text-muted-foreground truncate">{email}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={ROLE_BADGE_CLASSNAMES[m.role] ?? ROLE_BADGE_CLASSNAMES.member}
                      >
                        {ROLE_LABELS[m.role] ?? m.role}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={m.status === "pending" ? "secondary" : "outline"}
                        className={
                          m.status === "pending"
                            ? "bg-amber-500/15 text-amber-300 border-amber-500/40"
                            : "bg-emerald-500/15 text-emerald-300 border-emerald-500/40"
                        }
                      >
                        {STATUS_LABELS[m.status]}
                      </Badge>
                    </TableCell>
                    <TableCell className="pr-4">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8"
                          onClick={() => handleManageAccess(m)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          Gestionar Acceso
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-destructive"
                          disabled={m.role === "owner" || isRowDeleting}
                          onClick={() => handleRemove(m.user_id, name)}
                        >
                          {isRowDeleting ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Invitar nuevo usuario */}
      <div className="border-t pt-4">
        <p className="text-sm font-medium mb-3">Invitar usuario</p>
        <form onSubmit={handleInvite} className="flex gap-2">
          <Input
            type="email"
            placeholder="email@ejemplo.com"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            className="flex-1"
            required
          />
          <DropdownMenu>
            <DropdownMenuTrigger className="flex items-center gap-1 h-9 px-3 rounded border border-input bg-background text-sm hover:bg-accent cursor-pointer shrink-0">
              {ROLE_LABELS[inviteRole]}
              <ChevronDown className="h-3.5 w-3.5" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {["admin", "member"].map((r) => (
                <DropdownMenuItem key={r} onClick={() => setInviteRole(r)}>
                  {ROLE_LABELS[r]}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button type="submit" disabled={inviting} className="shrink-0">
            {inviting ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
            {inviting ? "Enviando..." : "Invitar"}
          </Button>
        </form>
        <p className="text-xs text-muted-foreground mt-2">
          El usuario recibirá un email con un enlace para acceder al CRM.
        </p>
      </div>

      <MemberAccessSheet
        open={accessSheetOpen}
        member={selectedMember}
        onClose={() => {
          setAccessSheetOpen(false);
          setSelectedMember(null);
        }}
        onSaved={async () => {
          await loadMembers();
          router.refresh();
        }}
      />
    </div>
  );
}
