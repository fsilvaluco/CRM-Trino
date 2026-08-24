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

export interface EventContact {
  id: string;
  position: number;
  role: string | null;
  name: string;
  contactId: string | null;
  phone: string | null;
  visibleOnShare: boolean;
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
  category: string | null;
  responsable: string | null;
  responsableContactId: string | null;
  comprobanteUrl: string | null;
  pagado: boolean;
  comprobantePagoUrl: string | null;
  esBhe: boolean;
  liquidoAmount: number | null;
  amount: number;
  notes: string | null;
  // Solo para categoría "Bencina" -- detalle de cómo se llegó al monto
  // (km del trayecto × factor $/km), para poder editarlo sin perder el
  // cálculo. `amount` sigue siendo la fuente de verdad del gasto.
  km: number | null;
  kmRate: number | null;
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
  // Eventos de antes de que se empezara a llevar el detalle de costos en
  // la app (esa plata vive en un Excel aparte) -- fee/ticketIncome/expenses
  // quedan en 0 así que la Utilidad calculada ahí sería un número falso.
  // La UI debe mostrar "Sin información" en vez de calcularla.
  financialsUntracked: boolean;
  eventLink: string | null;
  riderLocal: string | null;
  riderBanda: string | null;
  costSheetClosedAt: string | null;
  costSheetClosingFilePath: string | null;
  costSheetClosingFileName: string | null;
  costSheetInformedAt: string | null;
  ticketSalesUrl: string | null;
  tour: string | null;
  // Descuentos sobre la venta bruta de entradas (todos % editables,
  // siempre manuales por evento) + % de esa venta neta que le corresponde
  // al proyecto (el resto se lo queda el venue/productora y nunca entra a
  // las finanzas del evento). null = no configurado -- "Usar como
  // Entradas del evento" usa el bruto sin descuentos, igual que antes.
  ticketIvaPct: number | null;
  ticketComisionPct: number | null;
  ticketScdPct: number | null;
  ticketSplitProjectPct: number | null;
  profitSplitNote: string | null;
  // Reparto de utilidad estructurado -- % de cada lado (null = usar el
  // default 70/30 en el front) y el comprobante de la transferencia
  // (se sube después de que todos firman -- es el cierre final del evento).
  profitSplitProjectPct: number | null;
  profitSplitTrinoPct: number | null;
  profitSplitTransferProofUrl: string | null;
  profitSplitTransferredAt: string | null;
  createdAt: string;
  updatedAt: string;
  projectName: string | null;
  dealTitle: string | null;
}
