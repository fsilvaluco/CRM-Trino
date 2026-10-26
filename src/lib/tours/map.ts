import type {
  Tour,
  TourLeg,
  TourDate,
  Sponsorship,
  SponsorshipUpdate,
  BudgetCategoryRow,
  BudgetLine,
  TourCostItem,
  TourAlert,
  TourTask,
} from "@/types/tours";

// Conversión fila de Supabase (snake_case) -> tipos del front (camelCase).
// Las vistas devuelven numeric como string: num() lo normaliza.

/* eslint-disable @typescript-eslint/no-explicit-any */
const num = (v: any): number | null => (v === null || v === undefined || v === "" ? null : Number(v));
const num0 = (v: any): number => num(v) ?? 0;

export function mapTour(r: any): Tour {
  return {
    id: r.id,
    projectId: r.project_id,
    subprojectId: r.subproject_id ?? null,
    name: r.name,
    status: r.status,
    fundingSource: r.funding_source ?? null,
    folio: r.folio ?? null,
    startDate: r.start_date ?? null,
    endDate: r.end_date ?? null,
    targetOccupancyPct: num0(r.target_occupancy_pct),
    breakevenPct: num(r.breakeven_pct),
    goalRemainderAmount: num(r.goal_remainder_amount),
    sponsorshipDeadline: r.sponsorship_deadline ?? null,
    lateSalesShare: num(r.late_sales_share) ?? 0.4,
    lateSalesDays: num(r.late_sales_days) ?? 14,
    driveFolderUrl: r.drive_folder_url ?? null,
    canvaFolderUrl: r.canva_folder_url ?? null,
    sponsorshipSheetId: r.sponsorship_sheet_id ?? null,
    notes: r.notes ?? null,
  };
}

export function mapLeg(r: any): TourLeg {
  return { id: r.id, name: r.name, startDate: r.start_date ?? null, endDate: r.end_date ?? null, position: r.position ?? 0 };
}

export function mapDate(r: any, legName: string | null, withMoney: boolean): TourDate {
  return {
    showId: r.show_id,
    tourLegId: r.tour_leg_id ?? null,
    legName,
    date: r.date,
    city: r.city,
    venue: r.venue,
    showName: r.show_name,
    showStatus: r.show_status,
    capacity: num(r.capacity),
    target: num(r.target),
    sold: num0(r.sold),
    comps: num0(r.comps),
    grossAmount: withMoney ? num(r.gross_amount) : null,
    netAmount: withMoney ? num(r.net_amount) : null,
    salesStart: r.sales_start,
    salesStartAssumed: Boolean(r.sales_start_assumed),
    daysLeft: num0(r.days_left),
    expectedSold: num(r.expected_sold),
    pace7d: num(r.pace_7d),
    projectedSold: num(r.projected_sold),
    pctCapacity: num(r.pct_capacity),
    projectedPct: num(r.projected_pct),
    ticketsUpdatedAt: r.tickets_updated_at ?? null,
    paceStatus: r.pace_status,
  };
}

export function mapSponsorship(r: any, withMoney: boolean): Sponsorship {
  return {
    id: r.id,
    brand: r.brand,
    category: r.category,
    request: r.request ?? null,
    counterpart: r.counterpart ?? null,
    city: r.city ?? null,
    showId: r.show_id ?? null,
    contactName: r.contact_name ?? null,
    contactEmail: r.contact_email ?? null,
    contactPhone: r.contact_phone ?? null,
    website: r.website ?? null,
    instagramUrl: r.instagram_url ?? null,
    igFollowers: num(r.ig_followers),
    responsibleName: r.responsible_name ?? null,
    status: r.status,
    estimatedValue: withMoney ? num(r.estimated_value) : null,
    confirmedValue: withMoney ? num(r.confirmed_value) : null,
    budgetLineId: r.budget_line_id ?? null,
    dossierUrl: r.dossier_url ?? null,
    dossierDone: Boolean(r.dossier_done),
    sentAt: r.sent_at ?? null,
    lastContactAt: r.last_contact_at ?? null,
    nextFollowupAt: r.next_followup_at ?? null,
    notes: r.notes ?? null,
    updatedAt: r.updated_at,
  };
}

export function mapSponsorshipUpdate(r: any): SponsorshipUpdate {
  return {
    id: r.id,
    authorName: r.author_name ?? r.profiles?.full_name ?? null,
    note: r.note ?? null,
    statusFrom: r.status_from ?? null,
    statusTo: r.status_to ?? null,
    createdAt: r.created_at,
  };
}

export function mapBudgetCategory(r: any): BudgetCategoryRow {
  return {
    category: r.category,
    budgeted: num0(r.budgeted),
    canjeConfirmado: num0(r.canje_confirmado),
    canjeEnCurso: num0(r.canje_en_curso),
    netBudget: num0(r.net_budget),
    realAmount: num0(r.real_amount),
    variance: num0(r.variance),
  };
}

export function mapBudgetLine(r: any): BudgetLine {
  return {
    id: r.id,
    category: r.category,
    label: r.label,
    tourLegId: r.tour_leg_id ?? null,
    budgetedAmount: num0(r.budgeted_amount),
    notes: r.notes ?? null,
  };
}

export function mapCostItem(r: any): TourCostItem {
  return {
    id: r.id,
    budgetLineId: r.budget_line_id ?? null,
    label: r.label,
    amount: num0(r.amount),
    spentOn: r.spent_on ?? null,
    responsable: r.responsable ?? null,
    pagado: Boolean(r.pagado),
    notes: r.notes ?? null,
  };
}

export function mapAlert(r: any): TourAlert {
  return {
    severity: r.severity,
    kind: r.kind,
    entityType: r.entity_type,
    entityId: r.entity_id ?? null,
    title: r.title,
    detail: r.detail ?? null,
    refDate: r.ref_date ?? null,
  };
}

export function mapTask(r: any): TourTask {
  return { id: r.id, title: r.title, status: r.status, priority: r.priority, dueDate: r.due_date ?? null };
}

const SEVERITY_RANK = { alta: 0, media: 1, baja: 2 } as const;

export function sortAlerts(alerts: TourAlert[]): TourAlert[] {
  return [...alerts].sort(
    (a, b) =>
      SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
      (a.refDate ?? "9999").localeCompare(b.refDate ?? "9999")
  );
}
