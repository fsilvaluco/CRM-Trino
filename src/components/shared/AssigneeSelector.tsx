"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";

// ─── Selector de responsables, compartido por Tareas y Tratos ───────────────
// Extraido de TaskForm.tsx, donde vivia inline. Misma UI, mismo
// comportamiento -- solo ahora la puede usar cualquier formulario que
// reciba una lista de miembros del proyecto activo.

export interface OrgMember {
  user_id: string;
  profiles: {
    full_name: string | null;
    email: string | null;
    avatar_url: string | null;
  };
}

function initialsFor(fullName: string | null, email: string | null) {
  if (fullName) {
    return fullName.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
  }
  if (email) return email.slice(0, 2).toUpperCase();
  return "?";
}

export function AssigneeSelector({
  orgMembers,
  selectedAssignees,
  onChange,
}: {
  orgMembers: OrgMember[];
  selectedAssignees: string[];
  onChange: (ids: string[]) => void;
}) {
  const [search, setSearch] = useState("");

  if (orgMembers.length === 0) return null;

  const filtered = orgMembers.filter((member) => {
    const name = member.profiles?.full_name || member.profiles?.email || "";
    return name.toLowerCase().includes(search.toLowerCase());
  });

  return (
    <div className="space-y-2">
      <Label>Asignar a:</Label>

      {selectedAssignees.length > 0 && (
        <div className="flex flex-wrap gap-1.5 p-2 bg-muted/30 rounded-md">
          {selectedAssignees.map((userId) => {
            const member = orgMembers.find((m) => m.user_id === userId);
            if (!member) return null;
            const fullName = member.profiles?.full_name;
            const email = member.profiles?.email;
            const displayName = fullName || email || "Usuario";
            const initials = initialsFor(fullName, email);
            return (
              <div key={userId} className="flex items-center gap-1 bg-primary text-primary-foreground px-2 py-1 rounded-md text-xs">
                <span className="font-medium">{initials}</span>
                <span>{displayName}</span>
                <button
                  type="button"
                  onClick={() => onChange(selectedAssignees.filter((id) => id !== userId))}
                  className="ml-1 hover:opacity-70"
                >
                  ×
                </button>
              </div>
            );
          })}
        </div>
      )}

      <Input
        type="text"
        placeholder="Buscar personas..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="text-sm"
      />

      <div className="border rounded-md max-h-48 overflow-y-auto">
        {filtered.map((member) => {
          const isChecked = selectedAssignees.includes(member.user_id);
          const fullName = member.profiles?.full_name;
          const email = member.profiles?.email;
          const displayName = fullName || email || "Usuario";
          const initials = initialsFor(fullName, email);
          return (
            <div
              key={member.user_id}
              className="flex items-center gap-2 p-2 hover:bg-muted/50 border-b last:border-b-0"
            >
              <Checkbox
                checked={isChecked}
                onCheckedChange={(checked) => {
                  if (checked) {
                    onChange([...selectedAssignees, member.user_id]);
                  } else {
                    onChange(selectedAssignees.filter((id) => id !== member.user_id));
                  }
                }}
              />
              <div className="w-7 h-7 rounded-full bg-primary/10 text-primary text-xs flex items-center justify-center font-medium">
                {initials}
              </div>
              <span className="text-sm flex-1">{displayName}</span>
            </div>
          );
        })}
        {filtered.length === 0 && (
          <div className="p-4 text-center text-sm text-muted-foreground">
            No se encontraron personas
          </div>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        {selectedAssignees.length === 0
          ? "Sin asignar - selecciona personas de la lista"
          : `${selectedAssignees.length} persona${selectedAssignees.length > 1 ? "s" : ""} seleccionada${selectedAssignees.length > 1 ? "s" : ""}`}
      </p>
    </div>
  );
}
