"use client";

import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";

export default function SinAccesoPage() {
  const { user, signOut } = useAuth();

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-full max-w-sm space-y-4 p-8 rounded-2xl border bg-card shadow-sm text-center">
        <h1 className="text-xl font-semibold">Sin acceso</h1>
        <p className="text-sm text-muted-foreground">
          Tu cuenta <strong>{user?.email}</strong> no tiene una organización asignada.
          Contacta al administrador para que te agregue.
        </p>
        <Button
          variant="outline"
          className="w-full"
          onClick={async () => {
            await signOut();
            window.location.href = "/login";
          }}
        >
          Cerrar sesión
        </Button>
      </div>
    </div>
  );
}
