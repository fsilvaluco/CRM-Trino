"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/lib/supabase";
import { establishSessionFromUrl } from "@/lib/auth-onboarding";

export default function ResetPasswordPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [validating, setValidating] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  useEffect(() => {
    let mounted = true;

    async function init() {
      const flow = searchParams.get("flow");
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!mounted) return;

      // Primary path: callback exchange already created the session for a recovery flow.
      if (flow === "recovery" && user) {
        setValidating(false);
        return;
      }

      // Legacy fallback for direct token/hash links.
      const token = await establishSessionFromUrl({ allowedTypes: ["recovery"] });
      if (!mounted) return;

      if (!token.ok) {
        setTokenError(token.error ?? "No se pudo validar el enlace de recuperación.");
        setValidating(false);
        return;
      }

      const {
        data: { user: afterTokenUser },
      } = await supabase.auth.getUser();

      if (!mounted) return;

      if (!afterTokenUser) {
        setTokenError("No se pudo iniciar una sesión de recuperación. Solicita un nuevo enlace.");
      }

      setValidating(false);
    }

    init();

    return () => {
      mounted = false;
    };
  }, [searchParams]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);

    if (password.length < 8) {
      setFormError("La contraseña debe tener al menos 8 caracteres.");
      return;
    }

    if (password !== confirmPassword) {
      setFormError("Las contraseñas no coinciden.");
      return;
    }

    setSubmitting(true);
    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      setFormError(error.message);
      setSubmitting(false);
      return;
    }

    await supabase.auth.signOut();
    router.replace("/login");
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-6 p-8 rounded-2xl border bg-card shadow-sm">
        <div className="text-center space-y-1">
          <h1 className="text-2xl font-bold tracking-tight">Crea una nueva contraseña</h1>
          <p className="text-sm text-muted-foreground">
            Este cambio te permitirá volver a ingresar con email y contraseña.
          </p>
        </div>

        {validating ? (
          <div className="py-8 flex items-center justify-center text-sm text-muted-foreground gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Validando enlace...
          </div>
        ) : tokenError ? (
          <div className="space-y-4">
            <p className="text-sm text-destructive text-center">{tokenError}</p>
            <Button className="w-full" variant="outline" onClick={() => router.replace("/forgot-password")}>
              Solicitar nuevo enlace
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="password">Nueva contraseña</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Mínimo 8 caracteres"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirm-password">Confirmar contraseña</Label>
              <Input
                id="confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Repite tu contraseña"
                required
              />
            </div>

            {formError && <p className="text-sm text-destructive text-center">{formError}</p>}

            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? "Actualizando..." : "Actualizar contraseña"}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}