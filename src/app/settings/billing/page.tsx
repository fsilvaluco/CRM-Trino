"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CreditCard } from "lucide-react";
import { BillingPanel } from "@/components/settings/BillingPanel";

export default function BillingSettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Facturación</h1>
        <p className="text-muted-foreground">
          Cobros vía Flow — sandbox por ahora, hasta configurar credenciales de producción.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <CreditCard className="h-4 w-4" />
              Cobros
            </CardTitle>
          </CardHeader>
          <CardContent>
            <BillingPanel />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
