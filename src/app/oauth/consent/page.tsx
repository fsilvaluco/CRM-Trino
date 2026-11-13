import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ListChecks, MessageSquareText, RefreshCw, ShieldAlert, ShieldCheck } from "lucide-react";
import { createSupabaseServer } from "@/lib/supabase-server";
import { isTrustedRedirectUri, redirectHost } from "@/lib/mcp/oauth-clients";
import { decideAuthorization } from "./actions";

// Pantalla de autorizacion del servidor OAuth 2.1 de Supabase Auth. Cuando
// alguien conecta Claude con Artist Pro, Supabase lo manda aca con un
// `authorization_id`; aca la persona ve que aplicacion pide acceso y decide.
// La ruta debe coincidir con "Authorization Path" en Supabase
// (Authentication > OAuth Server).

export const metadata: Metadata = { title: "Autorizar acceso — Artist Pro" };

const PERMISSIONS = [
  { icon: ListChecks, label: "Ver las tareas que tienes asignadas y su detalle" },
  { icon: RefreshCw, label: "Cambiar el estado de tus tareas" },
  { icon: MessageSquareText, label: "Dejar comentarios en tareas a tu nombre" },
];

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-slate-50 px-4 py-10 text-slate-900 auth-light-theme">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="mb-6 flex items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-icon.png" alt="" className="h-7 w-7" />
          <span className="text-sm font-semibold uppercase tracking-wide text-slate-500">Artist Pro</span>
        </div>
        {children}
      </div>
    </div>
  );
}

function Notice({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Shell>
      <div className="flex items-start gap-3">
        <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" aria-hidden />
        <div>
          <h1 className="text-lg font-semibold">{title}</h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">{children}</p>
        </div>
      </div>
    </Shell>
  );
}

export default async function ConsentPage({
  searchParams,
}: {
  searchParams: Promise<{ authorization_id?: string; error?: string }>;
}) {
  const { authorization_id: authorizationId, error: decisionError } = await searchParams;

  if (!authorizationId) {
    return (
      <Notice title="Solicitud incompleta">
        Esta página se abre sola cuando conectas una aplicación (por ejemplo Claude) con Artist Pro. Vuelve a
        iniciar la conexión desde la aplicación.
      </Notice>
    );
  }

  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    const next = `/oauth/consent?authorization_id=${encodeURIComponent(authorizationId)}`;
    redirect(`/login?next=${encodeURIComponent(next)}`);
  }

  const { data: details, error } = await supabase.auth.oauth.getAuthorizationDetails(authorizationId);
  if (error || !details || decisionError) {
    return (
      <Notice title="La solicitud ya no es válida">
        El pedido de acceso venció o ya fue respondido. Vuelve a iniciar la conexión desde la aplicación.
      </Notice>
    );
  }

  // Sin `authorization_id` en la respuesta: ya habia consentimiento previo
  // para este cliente, Supabase entrega directo la URL de retorno.
  if (!("authorization_id" in details)) redirect(details.redirect_url);

  const clientName = details.client.name || "Una aplicación";
  const host = redirectHost(details.redirect_uri);

  if (!isTrustedRedirectUri(details.redirect_uri)) {
    return (
      <Notice title="Aplicación no permitida">
        «{clientName}» ({host}) pidió acceso a tu cuenta, pero no está en la lista de aplicaciones permitidas de
        Artist Pro. No se le dio acceso. Si esperabas conectar esta aplicación, avísale a quien administra
        Artist Pro.
      </Notice>
    );
  }

  return (
    <Shell>
      <h1 className="text-xl font-semibold leading-snug">{clientName} quiere conectarse a tu cuenta</h1>
      <p className="mt-2 text-sm text-slate-600">
        Vas a autorizar el acceso como <span className="font-medium text-slate-900">{user.email}</span>.
      </p>

      <ul className="mt-6 space-y-3">
        {PERMISSIONS.map(({ icon: Icon, label }) => (
          <li key={label} className="flex items-start gap-3 text-sm">
            <Icon className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600" aria-hidden />
            <span>{label}</span>
          </li>
        ))}
      </ul>

      <p className="mt-6 flex items-start gap-2 rounded-lg bg-slate-50 p-3 text-xs leading-relaxed text-slate-600">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" aria-hidden />
        <span>
          La aplicación actúa con tus mismos permisos de Artist Pro y todo queda registrado a tu nombre. Al
          autorizar volverás a <span className="font-medium">{host}</span>.
        </span>
      </p>

      <form action={decideAuthorization} className="mt-6 flex gap-3">
        <input type="hidden" name="authorization_id" value={authorizationId} />
        <button
          type="submit"
          name="decision"
          value="deny"
          className="h-10 flex-1 rounded-lg border border-slate-300 bg-white text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
        >
          Cancelar
        </button>
        <button
          type="submit"
          name="decision"
          value="approve"
          className="h-10 flex-1 rounded-lg bg-indigo-600 text-sm font-medium text-white transition-colors hover:bg-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
        >
          Autorizar
        </button>
      </form>
    </Shell>
  );
}
