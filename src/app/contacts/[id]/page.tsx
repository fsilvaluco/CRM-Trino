import { requireAuth } from "@/lib/supabase-server";
import { notFound, redirect } from "next/navigation";
import { ContactDetailClient } from "@/components/contacts/ContactDetail";

export const dynamic = "force-dynamic";

export default async function ContactDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { supabase, user } = await requireAuth();
  if (!user) redirect("/login");

  const { data: contact } = await supabase
    .from("contacts")
    .select("*, companies(name)")
    .eq("id", id)
    .is("deleted_at", null)
    .single();

  if (!contact) notFound();

  const [{ data: rawDeals }, { data: rawActivities }] = await Promise.all([
    supabase
      .from("deals")
      .select("id, title, value, stage_id, probability, created_at, pipeline_stages ( name, color )")
      .eq("contact_id", id)
      .is("deleted_at", null),
    supabase
      .from("activities")
      .select("*")
      .eq("contact_id", id)
      .order("created_at", { ascending: false }),
  ]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const contactDeals = (rawDeals ?? []).map((d: any) => ({
    id: d.id,
    title: d.title,
    value: d.value,
    stageId: d.stage_id,
    probability: d.probability,
    createdAt: d.created_at,
    stageName: d.pipeline_stages?.name ?? null,
    stageColor: d.pipeline_stages?.color ?? null,
  }));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const contactActivities = (rawActivities ?? []).map((a: any) => ({
    id: a.id,
    type: a.type,
    description: a.description,
    contactId: a.contact_id,
    dealId: a.deal_id,
    scheduledAt: a.scheduled_at,
    completedAt: a.completed_at,
    createdAt: a.created_at,
  }));

  const contactMapped = {
    id: contact.id,
    name: contact.name,
    email: contact.email,
    phone: contact.phone,
    company: Array.isArray(contact.companies)
      ? contact.companies[0]?.name ?? null
      : contact.companies?.name ?? null,
    companyId: contact.company_id,
    source: contact.source,
    temperature: contact.temperature,
    score: contact.score,
    notes: contact.notes,
    createdAt: contact.created_at,
    updatedAt: contact.updated_at,
  };

  return (
    <ContactDetailClient
      contact={contactMapped as Parameters<typeof ContactDetailClient>[0]["contact"]}
      deals={contactDeals as Parameters<typeof ContactDetailClient>[0]["deals"]}
      activities={contactActivities as Parameters<typeof ContactDetailClient>[0]["activities"]}
    />
  );
}
