"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BellRing } from "lucide-react";
import { BroadcastPanel } from "@/components/settings/BroadcastPanel";

export default function NotificationsSettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Notificaciones</h1>
        <p className="text-muted-foreground">
          Manda un aviso push con mensaje libre a toda la organización o a un proyecto específico.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 max-w-xl">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <BellRing className="h-4 w-4" />
              Enviar notificación
            </CardTitle>
          </CardHeader>
          <CardContent>
            <BroadcastPanel />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
