"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users } from "lucide-react";
import { OrgMembersPanel } from "@/components/settings/OrgMembersPanel";

export default function TeamSettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Equipo y Acceso</h1>
        <p className="text-muted-foreground">
          Gestiona los miembros de la organización y el acceso a proyectos.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="h-4 w-4" />
              Usuarios de la organización
            </CardTitle>
          </CardHeader>
          <CardContent>
            <OrgMembersPanel />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
