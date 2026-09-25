// Sitios publicos que pueden recibir y mostrar testimonios via
// /api/public/testimonials/*. Igual que en src/lib/leads/forms.ts, el
// navegador solo manda la clave del sitio: el project_id, los dominios
// permitidos y a quien se le pide moderar quedan fijos del lado del servidor.
//
// SOLO SERVIDOR: este archivo tiene los correos de los admins. El codigo
// del navegador (menu, pagina /testimonios) usa sites-public.ts, que solo
// expone projectId y brandName.

import { TESTIMONIAL_PUBLIC_SITES } from "./sites-public";

export { TESTIMONIALS_APP_PATH } from "./sites-public";

export interface TestimonialSiteConfig {
  projectId: string;
  /** Origenes permitidos (CORS). localhost se agrega solo fuera de produccion. */
  allowedOrigins: string[];
  /** Correos que reciben el testimonio verificado con los links aprobar/rechazar. */
  adminEmails: string[];
  /** Nombre de la marca en los correos. */
  brandName: string;
  /**
   * Si es true, /start manda un codigo de 6 digitos al correo y el testimonio
   * queda en pending_code hasta que se valide en /verify. Si es false, /start
   * deja el testimonio verificado directo y avisa al equipo para aprobar.
   */
  requireEmailCode: boolean;
}

export const TESTIMONIAL_SITES: Record<string, TestimonialSiteConfig> = {
  sisoy: {
    projectId: TESTIMONIAL_PUBLIC_SITES.sisoy.projectId,
    allowedOrigins: ["https://sisoy.pro", "https://www.sisoy.pro"],
    adminEmails: ["hola@sisoy.pro", "francisco@agenciakatarsis.cl"],
    brandName: TESTIMONIAL_PUBLIC_SITES.sisoy.brandName,
    requireEmailCode: false,
  },
};

export function getTestimonialSite(key: unknown): TestimonialSiteConfig | null {
  if (typeof key !== "string" || !Object.hasOwn(TESTIMONIAL_SITES, key)) return null;
  return TESTIMONIAL_SITES[key];
}

export function isAllowedTestimonialOrigin(site: TestimonialSiteConfig, origin: string | null): boolean {
  if (!origin) return false;
  if (site.allowedOrigins.includes(origin)) return true;
  if (process.env.NODE_ENV !== "production" && /^http:\/\/localhost(:\d+)?$/.test(origin)) return true;
  return false;
}

/** Configuracion completa (servidor) del sitio de testimonios de un proyecto, o null. */
export function getTestimonialSiteConfigForProject(projectId: string | null | undefined): TestimonialSiteConfig | null {
  if (!projectId) return null;
  return Object.values(TESTIMONIAL_SITES).find((s) => s.projectId === projectId) ?? null;
}

/** Busca el sitio cuyo dominio calza con el Origin (para responder el preflight). */
export function testimonialSiteForOrigin(origin: string | null): TestimonialSiteConfig | null {
  return Object.values(TESTIMONIAL_SITES).find((s) => isAllowedTestimonialOrigin(s, origin)) ?? null;
}

/** Vigencia del codigo enviado al correo. */
export const CODE_TTL_MINUTES = 15;
/** Intentos maximos por codigo. */
export const MAX_CODE_ATTEMPTS = 5;
/** Solicitudes (/start) maximas por correo por hora. */
export const MAX_STARTS_PER_EMAIL_PER_HOUR = 3;
/** Vigencia de los links de moderacion desde que se verifico el testimonio. */
export const MODERATION_TOKEN_TTL_DAYS = 30;
/** Maximo de testimonios que devuelve el listado publico. */
export const PUBLIC_LIST_LIMIT = 50;
