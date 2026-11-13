import type { Metadata } from "next";
import { after } from "next/server";
import { headers } from "next/headers";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Headphones, Music2 } from "lucide-react";
import { createAdminClient } from "@/lib/supabase-admin";
import { isLinkPreviewBot } from "@/lib/link-preview-bots";
import { getActivePreescuchaBySlug } from "@/lib/preescuchas";
import { PublicPlayer, type PublicTrack } from "@/components/preescuchas/PublicPlayer";

export const dynamic = "force-dynamic";

// Pagina publica de una Preescucha: /escucha/{slug}. La abre prensa (sin
// cuenta) para oir un lanzamiento antes de que salga en plataformas. Deja
// de responder apenas pasa la fecha de vencimiento.

async function getPreescucha(slug: string) {
  const admin = createAdminClient();
  const preescucha = await getActivePreescuchaBySlug(admin, slug);
  if (!preescucha) return null;

  const { data: tracks } = await admin
    .from("preescucha_tracks")
    .select("id, title, duration_seconds, position")
    .eq("preescucha_id", preescucha.id)
    .not("file_path", "is", null)
    .order("position");

  return {
    ...preescucha,
    tracks: (tracks ?? []).map<PublicTrack>((t) => ({ id: t.id, title: t.title, durationSeconds: t.duration_seconds })),
  };
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const preescucha = await getPreescucha(slug);
  // Material inedito: que ningun buscador indexe estas paginas.
  const robots = { index: false, follow: false };
  if (!preescucha) return { title: "Artist Pro", robots };

  const title = preescucha.artist_name ? `${preescucha.title} — ${preescucha.artist_name}` : preescucha.title;
  const base = process.env.NEXT_PUBLIC_SITE_URL;
  const cover = preescucha.cover_path && base ? `${base}/api/public/preescuchas/${slug}/cover` : undefined;

  return {
    title: `${title} · Preescucha`,
    description: "Escucha anticipada, antes del lanzamiento.",
    robots,
    openGraph: {
      title: `${title} · Preescucha`,
      description: "Escucha anticipada, antes del lanzamiento.",
      images: cover ? [cover] : undefined,
    },
  };
}

export default async function PreescuchaPublicPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const preescucha = await getPreescucha(slug);

  if (!preescucha || preescucha.tracks.length === 0) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-[#14162B] text-white/70 text-sm px-6 text-center">
        <Headphones className="h-8 w-8 text-white/30" />
        <p>Esta preescucha ya no está disponible.</p>
        <p className="text-white/40 text-xs">El enlace venció o fue eliminado. Pídele uno nuevo a quien te lo envió.</p>
      </div>
    );
  }

  // Contador interno de visitas -- sin contar el fetch de vista previa de
  // WhatsApp/correo (mismo criterio que smartlinks).
  const headerList = await headers();
  if (!isLinkPreviewBot(headerList.get("user-agent"))) {
    after(async () => {
      const { error } = await createAdminClient().rpc("preescucha_register_event", {
        p_preescucha_id: preescucha.id,
        p_track_id: null,
        p_event_type: "view",
      });
      if (error) console.error("[preescuchas] no se pudo registrar la visita:", error.message);
    });
  }

  const expiresLabel = format(new Date(preescucha.expires_at), "d 'de' MMMM 'de' yyyy", { locale: es });

  return (
    <div className="min-h-screen bg-[#14162B] text-white flex flex-col items-center px-4 py-10">
      <div className="w-full max-w-md space-y-6">
        <div className="flex items-center justify-center gap-2 text-[11px] uppercase tracking-[0.2em] text-white/50">
          <Headphones className="h-3.5 w-3.5" />
          Preescucha
        </div>

        <div className="aspect-square w-full max-w-xs mx-auto rounded-2xl overflow-hidden bg-white/[0.06] shadow-xl">
          {preescucha.cover_path ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`/api/public/preescuchas/${slug}/cover?v=${encodeURIComponent(preescucha.updated_at)}`}
              alt={preescucha.title}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Music2 className="h-12 w-12 text-white/20" />
            </div>
          )}
        </div>

        <div className="text-center space-y-1">
          <h1 className="text-2xl font-bold text-balance">{preescucha.title}</h1>
          {preescucha.artist_name && <p className="text-white/60">{preescucha.artist_name}</p>}
        </div>

        {preescucha.message && (
          <p className="text-sm text-white/75 whitespace-pre-line text-center leading-relaxed">{preescucha.message}</p>
        )}

        <PublicPlayer slug={slug} tracks={preescucha.tracks} allowDownload={preescucha.allow_download === true} />

        <div className="text-center text-xs text-white/40 space-y-1 pt-2">
          <p>Disponible hasta el {expiresLabel}.</p>
          <p>Material inédito previo al lanzamiento. Por favor, no lo compartas.</p>
          <p className="pt-3">Artist Pro</p>
        </div>
      </div>
    </div>
  );
}
