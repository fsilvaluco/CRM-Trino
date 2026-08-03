"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff, Loader2, Users, BarChart3, CalendarClock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/lib/supabase";
import { establishSessionFromUrl } from "@/lib/auth-onboarding";

const FEATURES = [
  { icon: Users, label: "Un CRM por catálogo, no por artista" },
  { icon: BarChart3, label: "Métricas reales, no estimadas" },
  { icon: CalendarClock, label: "Cronogramas que se cargan solos" },
];

// Si la validación se demora más que esto, algo quedó atascado (lock de
// Supabase, red lenta, etc.) — mejor mostrar un mensaje con salida que dejar
// el spinner girando para siempre.
const VALIDATION_TIMEOUT_MS = 10000;

export default function ActivatePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [validating, setValidating] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [timedOut, setTimedOut] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  useEffect(() => {
    let mounted = true;

    const timeoutId = window.setTimeout(() => {
      if (mounted) setTimedOut(true);
    }, VALIDATION_TIMEOUT_MS);

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
      // "magiclink" se acepta ademas de "invite" porque el reenvio a un
      // usuario que ya estaba "pendiente" (no confirmado) genera ese tipo
      // en vez de "invite" -- Supabase no permite generar un link de tipo
      // "invite" para alguien que ya existe, asi que el reenvio usa
      // magiclink, pero para esta persona sigue siendo su primera vez
      // activando la cuenta.
      const token = await establishSessionFromUrl({ allowedTypes: ["invite", "magiclink"] });
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
      window.clearTimeout(timeoutId);
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
    <div className="min-h-screen w-full flex bg-white">
      <style>{`
        @keyframes login-drift {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(-3%, 2%) scale(1.05); }
        }
        .login-orb { animation: login-drift 14s ease-in-out infinite; }
        .login-bar { transform-origin: bottom; animation: login-bars 2.6s ease-in-out infinite; }
        @keyframes login-bars {
          0%, 100% { transform: scaleY(0.4); }
          50% { transform: scaleY(1); }
        }
        .login-display { font-family: var(--font-display), var(--font-sans), system-ui, sans-serif; }
      `}</style>

      {/* Panel de marca — mismo panel que /login para mantener identidad consistente */}
      <div className="hidden lg:flex lg:w-[46%] relative overflow-hidden bg-[#14162B]">
        <div
          className="absolute -top-24 -right-24 h-[420px] w-[420px] rounded-full login-orb"
          style={{ background: "radial-gradient(circle, #4338CA 0%, transparent 70%)", opacity: 0.55 }}
        />
        <div
          className="absolute bottom-[-140px] left-[-100px] h-[360px] w-[360px] rounded-full"
          style={{ background: "radial-gradient(circle, #8B5CF6 0%, transparent 70%)", opacity: 0.35 }}
        />

        <div className="relative z-10 flex flex-col justify-between px-12 py-14 w-full text-white">
          <div className="flex items-center gap-2">
            <img src="/logo-icon.png" alt="" className="h-7 w-7" />
            <span className="login-display text-sm font-semibold tracking-wide uppercase text-white/70">
              Artist Pro
            </span>
          </div>

          <div>
            <h1 className="text-[2.75rem] leading-[1.08] font-bold tracking-tight mb-4">
              Tu catálogo entero,
              <br />
              en un solo lugar.
            </h1>
            <p className="text-white/60 text-base leading-relaxed max-w-sm mb-10">
              El CRM y panel de métricas para agencias que manejan varios artistas a la vez.
            </p>

            <div className="space-y-3">
              {FEATURES.map(({ icon: Icon, label }) => (
                <div
                  key={label}
                  className="flex items-center gap-3 rounded-xl bg-white/[0.06] border border-white/10 px-4 py-3.5"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/10">
                    <Icon className="h-4 w-4 text-white/90" />
                  </span>
                  <span className="text-sm font-medium text-white/90">{label}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-end gap-1 h-8 opacity-40">
            {[0.5, 0.8, 0.4, 1, 0.6, 0.9, 0.45, 0.7, 0.55].map((h, i) => (
              <span
                key={i}
                className="login-bar w-1 rounded-full bg-white"
                style={{ height: "100%", transform: `scaleY(${h})`, animationDelay: `${i * 0.15}s` }}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Panel de formulario */}
      <div className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          <img src="/logo-full.png" alt="Artist Pro" className="h-8 mb-10" />

          <h2 className="text-2xl font-bold tracking-tight text-[#14162B] mb-1">Activa tu cuenta</h2>
          <p className="text-sm text-muted-foreground mb-8">
            Define tu contraseña para ingresar al CRM por primera vez.
          </p>

          {validating ? (
            <div className="py-8 flex flex-col items-center justify-center text-sm text-muted-foreground gap-3">
              <div className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Validando enlace...
              </div>
              {timedOut && (
                <div className="text-center space-y-3 pt-2">
                  <p className="text-xs text-muted-foreground max-w-xs">
                    Esto está tomando más de lo normal. Prueba recargar la página.
                  </p>
                  <Button
                    variant="outline"
                    className="h-9"
                    onClick={() => window.location.reload()}
                  >
                    Recargar página
                  </Button>
                </div>
              )}
            </div>
          ) : tokenError ? (
            <div className="space-y-4">
              <p className="text-sm text-destructive text-center">{tokenError}</p>
              <Button className="w-full h-11" variant="outline" onClick={() => router.replace("/login")}>
                Ir a login
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="full-name">Nombre (opcional)</Label>
                <Input
                  id="full-name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Tu nombre"
                  className="h-11 px-3.5"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="password">Nueva contraseña</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="Mínimo 8 caracteres"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="h-11 px-3.5 pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-0 top-0 h-11 w-10 flex items-center justify-center text-muted-foreground hover:text-foreground cursor-pointer"
                    aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="confirm-password">Confirmar contraseña</Label>
                <div className="relative">
                  <Input
                    id="confirm-password"
                    type={showConfirmPassword ? "text" : "password"}
                    placeholder="Repite tu contraseña"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    className="h-11 px-3.5 pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword((v) => !v)}
                    className="absolute right-0 top-0 h-11 w-10 flex items-center justify-center text-muted-foreground hover:text-foreground cursor-pointer"
                    aria-label={showConfirmPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                  >
                    {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {formError && <p className="text-sm text-destructive text-center">{formError}</p>}

              <Button type="submit" className="w-full h-11" disabled={submitting}>
                {submitting ? "Activando..." : "Activar cuenta"}
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
