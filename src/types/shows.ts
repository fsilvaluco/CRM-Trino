export type ShowStatus = "cotizando" | "confirmado" | "realizado" | "cancelado";

export interface LiveShow {
  id: string;
  projectId: string | null;
  artistName: string;
  dealId: string | null;
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
  createdAt: string;
  updatedAt: string;
  projectName: string | null;
  dealTitle: string | null;
}
