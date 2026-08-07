import type { Metadata } from "next";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { createAdminClient } from "@/lib/supabase-admin";
import { PublicEventClient } from "./PublicEventClient";

const SITE_URL = "https://artistpro.app";

function formatDate(d: string) {
  try {
    return format(new Date(`${d}T00:00:00`), "d MMM yyyy", { locale: es });
  } catch {
    return d;
  }
}

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

  // Si el evento no existe, metadata generica -- la pagina misma muestra
  // el "no encontrado" al cargar en el cliente.
  if (!show) {
    return { title: "Evento no encontrado — Artist Pro" };
  }

  const { data: project } = show.project_id
    ? await admin.from("projects").select("name").eq("id", show.project_id).single()
    : { data: null };

  const title = show.name;
  const description = `${project?.name ? `${project.name} — ` : ""}${formatDate(show.date)} en ${show.venue}. Info generada con Artist Pro.`;
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

export default async function PublicEventPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <PublicEventClient id={id} />;
}
