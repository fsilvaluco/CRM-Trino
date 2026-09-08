import type { Metadata } from "next";
import { createAdminClient } from "@/lib/supabase-admin";
import { DossierPublicClient } from "./DossierPublicClient";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const admin = createAdminClient();

  const { data: dossier } = await admin.from("dossiers").select("name").eq("id", id).single();

  if (!dossier) {
    return { title: "Dossier no encontrado — Artist Pro" };
  }

  return {
    title: `${dossier.name} — Dossier`,
    description: "Dossier con datos en vivo, generado con Artist Pro.",
  };
}

export default async function DossierPublicPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <DossierPublicClient id={id} />;
}
