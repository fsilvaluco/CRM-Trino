import type { LiveShow, SetlistItem, CostItem, TimingItem, TicketTier, EventContact } from "@/types/shows";
import type { ApprovalData } from "@/components/events/ApprovalCard";

// Vía por la que se actualizaron por última vez los tramos de venta
// (migración 094). Se muestra junto a la fecha para saber si los números
// vienen de un pantallazo leído con IA, del link de la ticketera, o a mano.
export type TicketsSource = "pantallazo" | "link" | "manual";

export type EventDetail = LiveShow & { setlist: SetlistItem[]; costItems: CostItem[]; timing: TimingItem[]; ticketTiers: TicketTier[]; eventContacts: EventContact[]; canViewCosts?: boolean; canEditCosts?: boolean };

export interface CostSubmission {
  id: string;
  label: string;
  category: string | null;
  responsable: string | null;
  amount: number;
  comprobanteUrl: string | null;
  notes: string | null;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
  submitterName: string | null;
}

export type SignatureData = ApprovalData;

export type PrintSection = "costs" | "timing" | "setlist" | "contacts" | "todo";

// Banderas de "cambios sin guardar" por sección. Viven en un ref del padre
// (ver page.tsx) para que `load()` las lea sin quedar pegado a un closure
// obsoleto, y cada `saveX()` baja la suya a mano antes de recargar.
export interface DirtyFlags {
  setlist: boolean;
  timing: boolean;
  tickets: boolean;
  contacts: boolean;
  costs: boolean;
  details: boolean;
}

export type DirtyRef = React.MutableRefObject<DirtyFlags>;

export type SuggestionFetcher = (query: string) => Promise<Array<{ label: string; value: string }>>;
