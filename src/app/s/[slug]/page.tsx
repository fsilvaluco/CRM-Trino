import type { Metadata } from "next";
import type { CSSProperties } from "react";
import { after } from "next/server";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase-admin";
import { isLinkPreviewBot } from "@/lib/link-preview-bots";
import { getPlatformDef } from "@/lib/smartlink-platforms";
import { getSmartlinkTheme, smartlinkThemeStyle } from "@/lib/smartlink-themes";
import { PlatformIcon } from "@/components/smartlinks/PlatformIcon";
import { ChevronRight, Music2 } from "lucide-react";

export const dynamic = "force-dynamic";

interface SmartlinkLink {
  id: string;
  platform: string;
  url: string;
  label: string | null;
  featured: boolean;
}

interface SmartlinkData {
  id: string;
  slug: string;
  title: string;
  artistName: string | null;
  coverImageUrl: string | null;
  theme: string;
  links: SmartlinkLink[];
}

async function getSmartlink(slug: string): Promise<SmartlinkData | null> {
  const supabase = createAdminClient();
  const { data: smartlink } = await supabase
    .from("smartlinks")
    .select("id, slug, title, artist_name, cover_image_url, theme, smartlink_links ( id, platform, url, label, position, featured )")
    .eq("slug", slug)
    .maybeSingle();

  if (!smartlink) return null;

  return {
    id: smartlink.id,
    slug: smartlink.slug,
    title: smartlink.title,
    artistName: smartlink.artist_name,
    coverImageUrl: smartlink.cover_image_url,
    theme: smartlink.theme,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    links: (smartlink.smartlink_links as any[])
      .slice()
      .sort((a, b) => a.position - b.position)
      .map((l) => ({ id: l.id, platform: l.platform, url: l.url, label: l.label, featured: l.featured === true })),
  };
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const smartlink = await getSmartlink(slug);
  if (!smartlink) return { title: "Artist Pro" };

  const title = smartlink.artistName ? `${smartlink.title} — ${smartlink.artistName}` : smartlink.title;

  return {
    title,
    description: "Escucha en tu plataforma favorita",
    openGraph: {
      title,
      description: "Escucha en tu plataforma favorita",
      images: smartlink.coverImageUrl ? [smartlink.coverImageUrl] : undefined,
    },
  };
}

export default async function SmartlinkPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const smartlink = await getSmartlink(slug);

  if (!smartlink) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#14162B] text-white/70 text-sm">
        Este link no existe o fue eliminado.
      </div>
    );
  }

  // No cuenta como "view" el preview-fetch de un bot de WhatsApp/etc (mismo
  // criterio que /q/[slug]) -- esta pagina la genera el server siempre, asi
  // que el bot SI ve los meta tags de generateMetadata sin ayuda extra; acá
  // solo evitamos inflar las vistas con esos fetches.
  const headerList = await headers();
  if (!isLinkPreviewBot(headerList.get("user-agent"))) {
    after(async () => {
      const supabase = createAdminClient();
      const { error } = await supabase.from("smartlink_events").insert({ smartlink_id: smartlink.id, event_type: "view" });
      if (error) console.error("[smartlink] no se pudo registrar la vista:", error.message);
    });
  }

  // Colores del tema como CSS variables: las clases de abajo las consumen
  // con `bg-[var(--sl-bg)]` etc. Asi el catalogo de temas es solo datos.
  const theme = getSmartlinkTheme(smartlink.theme);

  return (
    <div
      className="min-h-screen bg-[var(--sl-bg)] text-[var(--sl-fg)] flex flex-col items-center px-4 py-10"
      style={smartlinkThemeStyle(theme) as CSSProperties}
    >
      <div className="w-full max-w-sm space-y-6">
        <div className="aspect-square w-full rounded-2xl overflow-hidden bg-[var(--sl-surface)] shadow-xl">
          {smartlink.coverImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={smartlink.coverImageUrl} alt={smartlink.title} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Music2 className="h-12 w-12 text-[var(--sl-fg-faint)]" />
            </div>
          )}
        </div>

        <div className="text-center space-y-1">
          <h1 className="text-xl font-bold">{smartlink.title}</h1>
          {smartlink.artistName && <p className="text-[var(--sl-fg-muted)] text-sm">{smartlink.artistName}</p>}
        </div>

        <div className="space-y-2.5">
          {smartlink.links.map((link) => {
            const def = getPlatformDef(link.platform);
            // El label manual (si lo escribieron) siempre gana -- sirve para
            // distinguir, ej., "Último video" de "Canal de YouTube" cuando
            // hay dos botones de la misma plataforma. Sin label, usa el
            // nombre fijo de la plataforma ("Link" para Otra/Merch sin nombre).
            const label = link.label || (link.platform === "other" || link.platform === "merch" ? "Link" : def.label);
            // El destacado es la plataforma que se esta empujando en la
            // campana: mismo boton, con anillo del acento del tema y una
            // etiqueta "Recomendado" para que el ojo caiga ahi primero.
            return (
              <a
                key={link.id}
                href={`/s/${slug}/go/${link.id}`}
                className={`flex items-center gap-3 bg-[var(--sl-btn-bg)] text-[var(--sl-btn-fg)] rounded-xl px-4 py-3 hover:opacity-90 transition-opacity${
                  link.featured ? " ring-2 ring-[var(--sl-accent)] ring-offset-2 ring-offset-[var(--sl-bg)]" : ""
                }`}
              >
                <PlatformIcon platformKey={link.platform} size={22} />
                <span className="font-medium flex-1">{label}</span>
                {link.featured && (
                  <span className="text-[10px] font-semibold uppercase tracking-wide rounded-full px-2 py-0.5 bg-[var(--sl-accent-soft-bg)] text-[var(--sl-accent-soft-fg)]">
                    Recomendado
                  </span>
                )}
                <ChevronRight className="h-4 w-4 text-[var(--sl-btn-fg-faint)]" />
              </a>
            );
          })}
        </div>

        <p className="text-center text-xs text-[var(--sl-fg-faint)] pt-4">Artist Pro</p>
      </div>
    </div>
  );
}
