// Datos NO sensibles de los sitios de testimonios, seguros para el bundle
// del navegador (menu y seccion Testimonios de la app). Los correos de los
// admins, los origenes permitidos y el resto de la configuracion viven en
// config.ts, que solo debe importarse desde codigo de servidor.

export interface TestimonialPublicSite {
  /** Clave del sitio (la misma que usa /api/public/testimonials). */
  key: string;
  projectId: string;
  /** Nombre de la marca que se muestra en la app y en los correos. */
  brandName: string;
}

export const TESTIMONIAL_PUBLIC_SITES = {
  sisoy: {
    key: "sisoy",
    projectId: "6258e9d5-a455-4d15-b331-5c09a5e85e0b",
    brandName: "SiSoy",
  },
} as const satisfies Record<string, TestimonialPublicSite>;

/** Ruta de la seccion Testimonios dentro de Artist Pro (menu Herramientas). */
export const TESTIMONIALS_APP_PATH = "/testimonios";

/**
 * Sitio de testimonios configurado para un proyecto (o null). Lo usa la
 * seccion Testimonios de la app para decidir si mostrarse.
 */
export function getTestimonialSiteForProject(projectId: string | null | undefined): TestimonialPublicSite | null {
  if (!projectId) return null;
  return Object.values(TESTIMONIAL_PUBLIC_SITES).find((s) => s.projectId === projectId) ?? null;
}
