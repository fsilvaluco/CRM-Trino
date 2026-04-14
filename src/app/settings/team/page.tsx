"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, ShieldCheck } from "lucide-react";
import { OrgMembersPanel } from "@/components/settings/OrgMembersPanel";
import { ProjectAccessPanel } from "@/components/settings/ProjectAccessPanel";
import { useProject } from "@/lib/project-context";

export default function TeamSettingsPage() {
  const router = useRouter();
  const { isAdmin, orgRole } = useProject();

  useEffect(() => {
    if (orgRole !== null && !isAdmin) {
      router.replace("/");
    }
  }, [isAdmin, orgRole, router]);

  if (orgRole === null) return null; // loading

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

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <ShieldCheck className="h-4 w-4" />
              Acceso por proyecto
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ProjectAccessPanel />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
