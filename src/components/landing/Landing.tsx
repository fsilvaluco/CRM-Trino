import Link from "next/link";
import { ArrowRight, Sparkles, Users, BarChart3, CalendarClock } from "lucide-react";

const FEATURES = [
  {
    icon: Sparkles,
    title: "Bandeja de Leads con IA",
    description:
      "Lee tu correo, detecta oportunidades de negocio y tareas de seguimiento, y te las deja listas para revisar — nunca crea nada sin tu aprobación.",
  },
  {
    icon: Users,
    title: "Un CRM por catálogo, no por artista",
    description:
      "Gestiona tratos, contactos y tareas de todo tu roster desde un solo lugar, con la visibilidad correcta para cada sello y cada artista.",
  },
  {
    icon: BarChart3,
    title: "Métricas reales, no estimadas",
    description:
      "Instagram, Spotify, Shopify y más — conectados de verdad, sincronizados solos, sin pantallazos ni planillas sueltas.",
  },
  {
    icon: CalendarClock,
    title: "Cronogramas que se cargan solos",
    description:
      "Pega el plan de lanzamiento de un contrato o distribuidora y la IA te propone cada hito como tarea, lista para asignar y hacer seguimiento.",
  },
];

export function Landing() {
  return (
    <div className="landing-root min-h-screen w-full bg-[#FAFAFB] text-[#14162B] overflow-x-hidden">
      <style>{`
        .landing-root { font-family: var(--font-sans), system-ui, sans-serif; }
        .landing-display { font-family: var(--font-display), var(--font-sans), system-ui, sans-serif; }
        @keyframes landing-float {
          0%, 100% { transform: translateY(0px) rotate(-2deg); }
          50% { transform: translateY(-10px) rotate(-1deg); }
        }
        .landing-signature { animation: landing-float 6s ease-in-out infinite; }
        @keyframes landing-rise {
          from { opacity: 0; transform: translateY(14px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .landing-rise { animation: landing-rise 0.6s ease-out both; }
      `}</style>

      {/* Nav */}
      <nav className="max-w-6xl mx-auto flex items-center justify-between px-6 py-6">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-[#4338CA] flex items-center justify-center">
            <span className="landing-display text-white text-sm font-bold">AP</span>
          </div>
          <span className="landing-display text-lg font-semibold">Artist Pro</span>
        </div>
        <Link
          href="/login"
          className="text-sm font-medium px-4 py-2 rounded-full border border-[#14162B]/10 hover:border-[#4338CA]/40 hover:text-[#4338CA] transition-colors"
        >
          Iniciar sesión
        </Link>
      </nav>

      {/* Hero */}
      <section className="max-w-6xl mx-auto px-6 pt-12 pb-20 grid md:grid-cols-2 gap-12 items-center">
        <div className="landing-rise">
          <span className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1 rounded-full bg-[#EEF0FF] text-[#4338CA] mb-5">
            Hecho para managers de música reales
          </span>
          <h1 className="landing-display text-4xl sm:text-5xl font-bold leading-[1.1] tracking-tight mb-5">
            Tu catálogo entero,
            <br />
            en un solo lugar.
          </h1>
          <p className="text-base sm:text-lg text-[#14162B]/70 leading-relaxed mb-8 max-w-md">
            Artist Pro es el CRM y panel de métricas para agencias y sellos que manejan varios artistas
            a la vez — leads, tratos, tareas y redes conectadas de verdad, sin planillas sueltas.
          </p>
          <div className="flex items-center gap-4">
            <Link
              href="/login"
              className="inline-flex items-center gap-2 text-sm font-semibold px-6 py-3 rounded-full bg-[#4338CA] text-white hover:bg-[#372FB0] transition-colors"
            >
              Entrar a Artist Pro
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>

        {/* Firma visual: la tarjeta de tarea real, con la etiqueta de
            proyecto/artista que existe hoy dentro de la app */}
        <div className="relative hidden md:block">
          <div className="landing-signature relative mx-auto w-72 rounded-2xl bg-white shadow-[0_20px_60px_-15px_rgba(67,56,202,0.35)] border border-[#14162B]/5 p-4">
            <p className="text-sm font-medium mb-3">Armar Contrato ENNIO X TRINO</p>
            <div className="flex gap-1.5 mb-3">
              <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-[#FFE4D6] text-[#C2410C]">
                Alta
              </span>
              <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-[#EEF0FF] text-[#4338CA]">
                En curso
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[#4338CA] text-[8px] font-bold text-white">
                T
              </span>
              <span className="text-xs text-[#14162B]/60">Trino</span>
            </div>
          </div>
          <div className="absolute -bottom-6 -left-6 w-56 rounded-2xl bg-white shadow-[0_20px_60px_-15px_rgba(240,101,61,0.35)] border border-[#14162B]/5 p-3.5 rotate-[4deg]">
            <p className="text-xs font-medium mb-2">Seguidores — Instagram</p>
            <p className="landing-display text-2xl font-bold text-[#F0653D]">+1.7 / día</p>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="max-w-6xl mx-auto px-6 py-16 border-t border-[#14162B]/5">
        <h2 className="landing-display text-2xl sm:text-3xl font-bold mb-10 max-w-lg">
          Todo lo que hoy haces a mano, en un solo lugar.
        </h2>
        <div className="grid sm:grid-cols-2 gap-6">
          {FEATURES.map((feature) => (
            <div
              key={feature.title}
              className="rounded-2xl border border-[#14162B]/8 bg-white p-6 hover:border-[#4338CA]/30 transition-colors"
            >
              <div className="h-10 w-10 rounded-xl bg-[#EEF0FF] flex items-center justify-center mb-4">
                <feature.icon className="h-5 w-5 text-[#4338CA]" />
              </div>
              <h3 className="landing-display font-semibold text-lg mb-2">{feature.title}</h3>
              <p className="text-sm text-[#14162B]/65 leading-relaxed">{feature.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA final */}
      <section className="max-w-6xl mx-auto px-6 py-20">
        <div className="rounded-3xl bg-[#4338CA] px-8 sm:px-16 py-14 text-center">
          <h2 className="landing-display text-2xl sm:text-3xl font-bold text-white mb-4">
            Menos planillas, más manejo real.
          </h2>
          <Link
            href="/login"
            className="inline-flex items-center gap-2 text-sm font-semibold px-6 py-3 rounded-full bg-white text-[#4338CA] hover:bg-white/90 transition-colors"
          >
            Entrar a Artist Pro
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      <footer className="max-w-6xl mx-auto px-6 py-8 text-xs text-[#14162B]/40 flex items-center justify-between">
        <span>Artist Pro</span>
        <span>Hecho en Chile 🇨🇱</span>
      </footer>
    </div>
  );
}
