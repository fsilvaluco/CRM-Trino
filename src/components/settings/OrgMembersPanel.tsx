"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { toast } from "sonner";
import { UserPlus, Trash2, Loader2, ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth-context";

interface Member {
  user_id: string;
  role: string;
  joined_at: string;
  profiles: { full_name: string | null; email: string | null; avatar_url: string | null } | null;
}

const ROLE_LABELS: Record<string, string> = {
  owner: "Propietario",
  admin: "Admin",
  member: "Miembro",
};

const ROLE_COLORS: Record<string, "default" | "secondary" | "outline"> = {
  owner: "default",
  admin: "secondary",
  member: "outline",
};

export function OrgMembersPanel() {
  const { user } = useAuth();
  const [orgId, setOrgId] = useState<string | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("member");
  const [inviting, setInviting] = useState(false);

  // Obtener orgId del usuario actual
  useEffect(() => {
    if (!user) return;
    supabase
      .from("organization_members")
      .select("organization_id")
      .eq("user_id", user.id)
      .single()
      .then(({ data }) => setOrgId(data?.organization_id ?? null));
  }, [user]);

  const loadMembers = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);

    // Dos queries separadas para evitar ambigüedad de FK entre organization_members y profiles
    const { data: membersData, error: membersError } = await supabase
      .from("organization_members")
      .select("user_id, role, joined_at")
      .eq("organization_id", orgId)
      .order("joined_at");

    if (membersError) {
      toast.error("Error cargando usuarios: " + membersError.message);
      setLoading(false);
      return;
    }

    const userIds = (membersData ?? []).map((m) => m.user_id);
    const { data: profilesData } = userIds.length > 0
      ? await supabase.from("profiles").select("id, full_name, email, avatar_url").in("id", userIds)
      : { data: [] };

    const profileMap = new Map((profilesData ?? []).map((p) => [p.id, p]));
    const normalized: Member[] = (membersData ?? []).map((m) => ({
      ...m,
      profiles: profileMap.get(m.user_id) ?? null,
    }));
    setMembers(normalized);
  }, [orgId]);

  useEffect(() => { loadMembers(); }, [loadMembers]);

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
      toast.success(`Invitación enviada a ${inviteEmail}`);
      setInviteEmail("");
      await loadMembers();
    } finally {
      setInviting(false);
    }
  };

  const handleRoleChange = async (userId: string, role: string) => {
    if (!orgId) return;
    const { error } = await supabase
      .from("organization_members")
      .update({ role })
      .eq("user_id", userId)
      .eq("organization_id", orgId);
    if (error) { toast.error("Error al cambiar rol: " + error.message); return; }
    toast.success("Rol actualizado");
    await loadMembers();
  };

  const handleRemove = async (userId: string, name: string) => {
    if (!orgId) return;
    if (!confirm(`¿Eliminar a ${name} de la organización?`)) return;
    const { error } = await supabase
      .from("organization_members")
      .delete()
      .eq("user_id", userId)
      .eq("organization_id", orgId);
    if (error) { toast.error("Error al eliminar: " + error.message); return; }
    toast.success("Usuario eliminado");
    await loadMembers();
  };

  return (
    <div className="space-y-6">
      {/* Lista de miembros */}
      <div className="space-y-2">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Cargando...
          </div>
        ) : members.length === 0 ? (
          <p className="text-sm text-muted-foreground">No hay usuarios en la organización.</p>
        ) : (
          members.map((m) => {
            const name = m.profiles?.full_name ?? m.profiles?.email ?? m.user_id;
            const initials = name.slice(0, 2).toUpperCase();
            return (
              <div key={m.user_id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/40">
                <Avatar className="h-8 w-8 shrink-0">
                  <AvatarImage src={m.profiles?.avatar_url ?? undefined} />
                  <AvatarFallback className="text-xs">{initials}</AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{name}</p>
                  {m.profiles?.full_name && (
                    <p className="text-xs text-muted-foreground truncate">{m.profiles.email}</p>
                  )}
                </div>

                {/* Rol con dropdown para cambiar */}
                {m.role === "owner" ? (
                  <Badge variant="default" className="shrink-0">{ROLE_LABELS[m.role]}</Badge>
                ) : (
                  <DropdownMenu>
                    <DropdownMenuTrigger className="flex items-center gap-1 h-7 px-2 rounded border border-input bg-background text-xs hover:bg-accent cursor-pointer shrink-0">
                      <Badge variant={ROLE_COLORS[m.role] ?? "outline"} className="text-xs px-1.5 py-0">
                        {ROLE_LABELS[m.role] ?? m.role}
                      </Badge>
                      <ChevronDown className="h-3 w-3" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {["admin", "member"].map((r) => (
                        <DropdownMenuItem
                          key={r}
                          className={m.role === r ? "font-medium" : ""}
                          onClick={() => handleRoleChange(m.user_id, r)}
                        >
                          {ROLE_LABELS[r]}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}

                {m.role !== "owner" && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive shrink-0"
                    onClick={() => handleRemove(m.user_id, name)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            );
          })
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
    </div>
  );
}
