import type { Metadata } from "next";
import { after } from "next/server";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase-admin";
import { isLinkPreviewBot } from "@/lib/link-preview-bots";
import { getPlatformDef } from "@/lib/smartlink-platforms";
import { PlatformIcon } from "@/components/smartlinks/PlatformIcon";
import { ChevronRight, Music2 } from "lucide-react";

export const dynamic = "force-dynamic";

interface SmartlinkLink {
  id: string;
  platform: string;
  url: string;
  label: string | null;
}

interface SmartlinkData {
  id: string;
  slug: string;
  title: string;
  artistName: string | null;
  coverImageUrl: string | null;
  links: SmartlinkLink[];
}

async function getSmartlink(slug: string): Promise<SmartlinkData | null> {
  const supabase = createAdminClient();
  const { data: smartlink } = await supabase
    .from("smartlinks")
    .select("id, slug, title, artist_name, cover_image_url, smartlink_links ( id, platform, url, label, position )")
    .eq("slug", slug)
    .maybeSingle();

  if (!smartlink) return null;

  return {
    id: smartlink.id,
    slug: smartlink.slug,
    title: smartlink.title,
    artistName: smartlink.artist_name,
    coverImageUrl: smartlink.cover_image_url,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    links: (smartlink.smartlink_links as any[])
      .slice()
      .sort((a, b) => a.position - b.position)
      .map((l) => ({ id: l.id, platform: l.platform, url: l.url, label: l.label })),
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

  return (
    <div className="min-h-screen bg-[#14162B] text-white flex flex-col items-center px-4 py-10">
      <div className="w-full max-w-sm space-y-6">
        <div className="aspect-square w-full rounded-2xl overflow-hidden bg-white/10 shadow-xl">
          {smartlink.coverImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={smartlink.coverImageUrl} alt={smartlink.title} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Music2 className="h-12 w-12 text-white/30" />
            </div>
          )}
        </div>

        <div className="text-center space-y-1">
          <h1 className="text-xl font-bold">{smartlink.title}</h1>
          {smartlink.artistName && <p className="text-white/60 text-sm">{smartlink.artistName}</p>}
        </div>

        <div className="space-y-2.5">
          {smartlink.links.map((link) => {
            const def = getPlatformDef(link.platform);
            const label = link.platform === "other" ? (link.label || "Link") : def.label;
            return (
              <a
                key={link.id}
                href={`/s/${slug}/go/${link.id}`}
                className="flex items-center gap-3 bg-white text-[#14162B] rounded-xl px-4 py-3 hover:bg-white/90 transition-colors"
              >
                <PlatformIcon platformKey={link.platform} size={22} />
                <span className="font-medium flex-1">{label}</span>
                <ChevronRight className="h-4 w-4 text-[#14162B]/40" />
              </a>
            );
          })}
        </div>

        <p className="text-center text-xs text-white/30 pt-4">Artist Pro</p>
      </div>
    </div>
  );
}
