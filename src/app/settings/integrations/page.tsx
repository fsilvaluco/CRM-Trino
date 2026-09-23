"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Mail, Megaphone, Route, Target } from "lucide-react";
import { GmailConnectionsPanel } from "@/components/settings/GmailConnectionsPanel";
import { AliasRulesPanel } from "@/components/settings/AliasRulesPanel";
import { MetaCapiPanel } from "@/components/settings/MetaCapiPanel";
import { MetaLeadgenPanel } from "@/components/settings/MetaLeadgenPanel";

export default function IntegrationsSettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Integraciones</h1>
        <p className="text-muted-foreground">
          Conecta cuentas de Gmail para detectar leads automaticamente y configura como se
          enrutan los alias entre empresas.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Mail className="h-4 w-4" />
            Cuentas de Gmail
          </CardTitle>
        </CardHeader>
        <CardContent>
          <GmailConnectionsPanel />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Target className="h-4 w-4" />
            Meta Pixel y API de conversiones (proyecto activo)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <MetaCapiPanel />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Megaphone className="h-4 w-4" />
            Meta Lead Ads: formularios instantáneos (proyecto activo)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <MetaLeadgenPanel />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Route className="h-4 w-4" />
            Reglas de alias entre empresas
          </CardTitle>
        </CardHeader>
        <CardContent>
          <AliasRulesPanel />
        </CardContent>
      </Card>
    </div>
  );
}
