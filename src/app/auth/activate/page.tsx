"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/lib/supabase";
import { establishSessionFromUrl } from "@/lib/auth-onboarding";

export default function ActivatePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [validating, setValidating] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  useEffect(() => {
    let mounted = true;

    async function init() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const flow = searchParams.get("flow");

      // Primary path: callback already exchanged the code and produced a session.
      if (flow === "invite" && user) {
        const { data: memberships, error: membershipError } = await supabase
          .from("organization_members")
          .select("status")
          .eq("user_id", user.id)
          .limit(1);

        if (!mounted) return;

        if (membershipError) {
          setTokenError("No pudimos validar tu estado de activación.");
          setValidating(false);
          return;
        }

        const hasPending = (memberships ?? []).some((m) => m.status === "pending");
        if (!hasPending) {
          router.replace("/");
          return;
        }

        setFullName((user.user_metadata?.full_name as string | undefined) ?? "");
        setValidating(false);
        return;
      }

      // Secondary path: user is already signed in and still pending (e.g., redirected by guard).
      if (user) {
        const { data: memberships } = await supabase
          .from("organization_members")
          .select("status")
          .eq("user_id", user.id)
          .limit(1);

        if (!mounted) return;

        const hasPending = (memberships ?? []).some((m) => m.status === "pending");
        if (hasPending) {
          setFullName((user.user_metadata?.full_name as string | undefined) ?? "");
          setValidating(false);
          return;
        }

        router.replace("/");
        return;
      }

      // Legacy path: direct token/hash links without callback.
      const token = await establishSessionFromUrl({ allowedTypes: ["invite"] });
      if (!mounted) return;

      if (!token.ok) {
        setTokenError(token.error ?? "No se pudo validar el enlace de activación.");
        setValidating(false);
        return;
      }

      const {
        data: { user: afterTokenUser },
      } = await supabase.auth.getUser();

      if (!mounted) return;

      if (!afterTokenUser) {
        setTokenError("No se pudo iniciar tu sesión para activar la cuenta.");
        setValidating(false);
        return;
      }

      setFullName((afterTokenUser.user_metadata?.full_name as string | undefined) ?? "");
      setValidating(false);
    }

    init();

    return () => {
      mounted = false;
    };
  }, [router, searchParams]);

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

    const activationRes = await fetch("/api/auth/activate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        password,
        fullName: fullName.trim() || null,
      }),
    });

    if (!activationRes.ok) {
      const body = await activationRes.json().catch(() => ({ error: "Error activando cuenta" }));
      setFormError(body.error ?? "No se pudo activar la cuenta.");
      setSubmitting(false);
      return;
    }

    router.replace("/");
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-md space-y-6 p-8 rounded-2xl border bg-card shadow-sm">
        <div className="space-y-1 text-center">
          <h1 className="text-2xl font-bold tracking-tight">Activa tu cuenta</h1>
          <p className="text-sm text-muted-foreground">
            Define tu contraseña para ingresar al CRM por primera vez.
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
            <Button className="w-full" variant="outline" onClick={() => router.replace("/login")}>
              Ir a login
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="full-name">Nombre (opcional)</Label>
              <Input
                id="full-name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Tu nombre"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Nueva contraseña</Label>
              <Input
                id="password"
                type="password"
                placeholder="Mínimo 8 caracteres"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirm-password">Confirmar contraseña</Label>
              <Input
                id="confirm-password"
                type="password"
                placeholder="Repite tu contraseña"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />
            </div>

            {formError && <p className="text-sm text-destructive text-center">{formError}</p>}

            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? "Activando..." : "Activar cuenta"}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}