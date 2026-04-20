"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/lib/supabase";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    setSubmitting(true);

    const configuredUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();
    const origin = configuredUrl && configuredUrl.length > 0 ? configuredUrl : window.location.origin;
    const baseUrl = origin.endsWith("/") ? origin.slice(0, -1) : origin;
    const redirectTo = `${baseUrl}/auth/callback?next=/reset-password&flow=recovery`;
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo,
    });

    if (resetError) {
      setError(resetError.message);
      setSubmitting(false);
      return;
    }

    setMessage("Si tu correo existe en el sistema, recibirás instrucciones para restablecer tu contraseña.");
    setSubmitting(false);
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-6 p-8 rounded-2xl border bg-card shadow-sm">
        <div className="text-center space-y-1">
          <h1 className="text-2xl font-bold tracking-tight">Recuperar contraseña</h1>
          <p className="text-sm text-muted-foreground">Te enviaremos un enlace para crear una nueva contraseña.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tu@email.com"
              required
            />
          </div>

          {error && <p className="text-sm text-destructive text-center">{error}</p>}
          {message && <p className="text-sm text-emerald-600 text-center">{message}</p>}

          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? "Enviando..." : "Enviar enlace"}
          </Button>
        </form>

        <p className="text-center text-xs text-muted-foreground">
          <Link href="/login" className="hover:text-foreground">
            Volver al inicio de sesión
          </Link>
        </p>
      </div>
    </div>
  );
}