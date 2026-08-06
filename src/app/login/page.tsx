"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Eye, EyeOff, Users, BarChart3, CalendarClock } from "lucide-react";

const FEATURES = [
  { icon: Users, label: "Un CRM por catálogo, no por artista" },
  { icon: BarChart3, label: "Métricas reales, no estimadas" },
  { icon: CalendarClock, label: "Cronogramas que se cargan solos" },
];

export default function LoginPage() {
  const { signIn, user, loading } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Si ya hay sesión activa, ir al dashboard
  useEffect(() => {
    if (!loading && user) {
      router.replace("/");
    }
  }, [user, loading, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    const { error } = await signIn(email, password);

    if (error) {
      setError(error);
      setSubmitting(false);
      return;
    }

    router.replace("/");
  };

  if (loading) return null;

  return (
    <div className="min-h-screen w-full flex bg-white text-slate-900 auth-light-theme">
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

      {/* Panel de marca */}
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

          {/* Firma visual: un ecualizador sutil, guiño al catálogo musical */}
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

          <h2 className="text-2xl font-bold tracking-tight text-[#14162B] mb-1">Bienvenido</h2>
          <p className="text-sm text-muted-foreground mb-8">Inicia sesión en tu cuenta</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email" className="sr-only">
                Correo electrónico
              </Label>
              <Input
                id="email"
                type="email"
                placeholder="Correo electrónico"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
                className="h-11 px-3.5"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password" className="sr-only">
                Contraseña
              </Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Contraseña"
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

            <div className="text-right">
              <Link href="/forgot-password" className="text-xs text-[#4338CA] hover:underline">
                ¿Olvidaste tu contraseña?
              </Link>
            </div>

            {error && <p className="text-sm text-destructive text-center">{error}</p>}

            <Button type="submit" className="w-full h-11" disabled={submitting}>
              {submitting ? "Ingresando..." : "Iniciar sesión"}
            </Button>
          </form>

          <p className="text-center text-xs text-muted-foreground mt-8">
            ¿No tienes acceso? Solicítalo al administrador.
          </p>
        </div>
      </div>
    </div>
  );
}
