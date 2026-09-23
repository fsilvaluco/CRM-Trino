// Formularios publicos que pueden crear leads via /api/leads/ingest.
// Cada formulario queda amarrado del lado del servidor a un proyecto, un
// precio y los dominios desde donde se acepta el envio: el navegador solo
// manda la clave del formulario, nunca un project_id (asi nadie puede
// inyectar tratos en otro proyecto cambiando el payload).

export interface LeadFormConfig {
  projectId: string;
  /** Origenes permitidos (CORS). localhost se agrega solo fuera de produccion. */
  allowedOrigins: string[];
  /** Nombre del producto para el titulo del trato y el evento de Meta. */
  productName: string;
  /** Valor del trato en centavos (convencion del CRM). */
  dealValueCents: number;
  /** Valor que se informa a Meta en el evento Lead (CLP, sin centavos). 0 = sin valor. */
  metaValue: number;
  /** Si el lead entra con Precio Fundador (default true). */
  promoFundador?: boolean;
}

export const LEAD_FORMS: Record<string, LeadFormConfig> = {
  "sisoy-podcast": {
    projectId: "6258e9d5-a455-4d15-b331-5c09a5e85e0b",
    allowedOrigins: ["https://sisoy.pro", "https://www.sisoy.pro"],
    productName: "SiSoy Podcast Live",
    dealValueCents: 636500_00, // Precio Fundador IVA incluido
    metaValue: 636500,
  },
  // Formulario general "Hablemos" de sisoy.pro: la pareja aun no eligio
  // servicio, asi que el trato parte en $0 y sin Precio Fundador.
  "sisoy-hablemos": {
    projectId: "6258e9d5-a455-4d15-b331-5c09a5e85e0b",
    allowedOrigins: ["https://sisoy.pro", "https://www.sisoy.pro"],
    productName: "SiSoy",
    dealValueCents: 0,
    metaValue: 0,
    promoFundador: false,
  },
};

export function isAllowedOrigin(form: LeadFormConfig, origin: string | null): boolean {
  if (!origin) return false;
  if (form.allowedOrigins.includes(origin)) return true;
  if (process.env.NODE_ENV !== "production" && /^http:\/\/localhost(:\d+)?$/.test(origin)) return true;
  return false;
}

/** Busca el formulario cuyo dominio calza con el Origin (para responder el preflight). */
export function formForOrigin(origin: string | null): LeadFormConfig | null {
  return Object.values(LEAD_FORMS).find((f) => isAllowedOrigin(f, origin)) ?? null;
}
