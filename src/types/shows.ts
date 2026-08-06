export type ShowStatus = "cotizando" | "confirmado" | "realizado" | "cancelado";

export interface TicketTier {
  id: string;
  position: number;
  label: string;
  unitPrice: number;
  quantitySold: number;
  capacity: number | null;
  statusLabel: string | null;
}

export interface TimingItem {
  id: string;
  position: number;
  timeLabel: string | null;
  activity: string;
  responsable: string | null;
  responsableContactId: string | null;
  notes: string | null;
}

export interface SetlistItem {
  id: string;
  position: number;
  title: string;
  notes: string | null;
}

export interface CostItem {
  id: string;
  position: number;
  label: string;
  responsable: string | null;
  responsableContactId: string | null;
  comprobanteUrl: string | null;
  esBhe: boolean;
  liquidoAmount: number | null;
  amount: number;
  notes: string | null;
}

export interface LiveShow {
  id: string;
  projectId: string | null;
  artistName: string;
  dealId: string | null;
  venueId: string | null;
  name: string;
  date: string;
  eventTime: string | null;
  venue: string;
  address: string | null;
  city: string | null;
  status: ShowStatus;
  notes: string | null;
  fee: number | null;
  ticketIncome: number | null;
  expenses: number | null;
  eventLink: string | null;
  riderLocal: string | null;
  riderBanda: string | null;
  costSheetClosedAt: string | null;
  createdAt: string;
  updatedAt: string;
  projectName: string | null;
  dealTitle: string | null;
}
