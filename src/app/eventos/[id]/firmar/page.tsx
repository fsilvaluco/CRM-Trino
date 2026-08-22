import type { Metadata } from "next";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { createAdminClient } from "@/lib/supabase-admin";
import FirmarClient from "./FirmarClient";

const SITE_URL = "https://artistpro.app";

function formatDate(d: string) {
  try {
    return format(new Date(`${d}T00:00:00`), "d MMM yyyy", { locale: es });
  } catch {
    return d;
  }
}

// Metadata para que el preview de WhatsApp/Slack/etc. al compartir el link
// de firma diga de que se trata (solicitud de aprobacion de cierre de caja)
// en vez de mostrar solo "artistpro.app" pelado. El contenido real de la
// pagina sigue protegido por la API (solo project_members la pueden ver).
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const admin = createAdminClient();

  const { data: show } = await admin
    .from("shows")
    .select("name, date, venue, project_id")
    .eq("id", id)
    .single();

  if (!show) {
    return { title: "Cierre de caja no encontrado — Artist Pro" };
  }

  const { data: project } = show.project_id
    ? await admin.from("projects").select("name").eq("id", show.project_id).single()
    : { data: null };

  const title = `Firma de cierre de caja -- ${show.name}`;
  const description = `Solicitud de aprobación del cierre de caja${project?.name ? ` de ${project.name}` : ""} -- ${formatDate(show.date)} en ${show.venue}.`;
  const imageUrl = `${SITE_URL}/icons/icon-512.png`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      images: [{ url: imageUrl, width: 512, height: 512 }],
      type: "website",
    },
    twitter: {
      card: "summary",
      title,
      description,
      images: [imageUrl],
    },
  };
}

export default async function FirmarCierrePage() {
  return <FirmarClient />;
}
