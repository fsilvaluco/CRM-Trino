// Módulo de Giras. Montos en centavos (CLP x 100), igual que el resto de Artist Pro.

export type TourStatus = "planificacion" | "en_curso" | "cerrada" | "cancelada";

export type SponsorshipStatus =
  | "identificada"
  | "dossier_en_preparacion"
  | "dossier_listo"
  | "enviada"
  | "en_conversacion"
  | "confirmada"
  | "contraprestacion_entregada"
  | "rechazada"
  | "sin_respuesta";

export type SponsorshipCategory = "alojamiento" | "comida" | "transporte" | "afines" | "medios" | "otro";

export type BudgetCategory =
  | "transporte"
  | "alojamiento"
  | "comida"
  | "tecnica"
  | "difusion"
  | "imprevistos"
  | "otros";

export type PaceStatus =
  | "en_ritmo"
  | "bajo_meta"
  | "bajo_equilibrio"
  | "no_iniciada"
  | "sin_datos"
  | "realizada"
  | "caida";

export type AlertSeverity = "alta" | "media" | "baja";

export interface Tour {
  id: string;
  projectId: string;
  subprojectId: string | null;
  name: string;
  status: TourStatus;
  fundingSource: string | null;
  folio: string | null;
  startDate: string | null;
  endDate: string | null;
  targetOccupancyPct: number;
  breakevenPct: number | null;
  goalRemainderAmount: number | null;
  sponsorshipDeadline: string | null;
  lateSalesShare: number;
  lateSalesDays: number;
  driveFolderUrl: string | null;
  canvaFolderUrl: string | null;
  sponsorshipSheetId: string | null;
  notes: string | null;
}

export interface TourLeg {
  id: string;
  name: string;
  startDate: string | null;
  endDate: string | null;
  position: number;
}

export interface TourDate {
  showId: string;
  tourLegId: string | null;
  legName: string | null;
  date: string;
  city: string;
  venue: string;
  showName: string;
  showStatus: "cotizando" | "confirmado" | "realizado" | "cancelado";
  capacity: number | null;
  target: number | null;
  sold: number;
  comps: number;
  grossAmount: number | null;
  netAmount: number | null;
  salesStart: string;
  salesStartAssumed: boolean;
  daysLeft: number;
  expectedSold: number | null;
  pace7d: number | null;
  projectedSold: number | null;
  pctCapacity: number | null;
  projectedPct: number | null;
  ticketsUpdatedAt: string | null;
  paceStatus: PaceStatus;
}

export interface Sponsorship {
  id: string;
  brand: string;
  category: SponsorshipCategory;
  request: string | null;
  counterpart: string | null;
  city: string | null;
  showId: string | null;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  website: string | null;
  instagramUrl: string | null;
  igFollowers: number | null;
  responsibleName: string | null;
  status: SponsorshipStatus;
  estimatedValue: number | null;
  confirmedValue: number | null;
  budgetLineId: string | null;
  dossierUrl: string | null;
  dossierDone: boolean;
  sentAt: string | null;
  lastContactAt: string | null;
  nextFollowupAt: string | null;
  notes: string | null;
  updatedAt: string;
}

export interface SponsorshipUpdate {
  id: string;
  authorName: string | null;
  note: string | null;
  statusFrom: SponsorshipStatus | null;
  statusTo: SponsorshipStatus | null;
  createdAt: string;
}

export interface BudgetCategoryRow {
  category: BudgetCategory;
  budgeted: number;
  canjeConfirmado: number;
  canjeEnCurso: number;
  netBudget: number;
  realAmount: number;
  variance: number;
}

export interface BudgetLine {
  id: string;
  category: BudgetCategory;
  label: string;
  tourLegId: string | null;
  budgetedAmount: number;
  notes: string | null;
}

export interface TourCostItem {
  id: string;
  budgetLineId: string | null;
  label: string;
  amount: number;
  spentOn: string | null;
  responsable: string | null;
  pagado: boolean;
  notes: string | null;
}

export interface TourAlert {
  severity: AlertSeverity;
  kind: string;
  entityType: "sponsorship" | "show" | "task" | "tour" | "budget";
  entityId: string | null;
  title: string;
  detail: string | null;
  refDate: string | null;
}

export interface TourTask {
  id: string;
  title: string;
  status: string;
  priority: string;
  dueDate: string | null;
}

export interface TourDetail {
  tour: Tour;
  legs: TourLeg[];
  dates: TourDate[];
  sponsorships: Sponsorship[];
  budget: { categories: BudgetCategoryRow[]; lines: BudgetLine[]; costItems: TourCostItem[] } | null;
  alerts: TourAlert[];
  tasks: TourTask[];
  canEdit: boolean;
  canViewCosts: boolean;
}

export interface TourListItem {
  id: string;
  name: string;
  status: TourStatus;
  startDate: string | null;
  endDate: string | null;
  projectId: string;
  datesCount: number;
  capacity: number;
  sold: number;
  target: number;
  sponsorshipsConfirmed: number;
  sponsorshipsOpen: number;
  alertsHigh: number;
  alertsTotal: number;
}

export interface SalesPoint {
  showId: string;
  capturedAt: string;
  sold: number;
}
