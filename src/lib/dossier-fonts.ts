// Selector chico de tipografías para los campos del Dossier -- no es un
// editor de diseño (eso lo sigue haciendo Canva), solo lo mínimo para que
// el texto insertado calce visualmente con el PDF de base. Georgia/Arial
// son fuentes de sistema (no necesitan cargarse); el resto son Google
// Fonts, cargadas una sola vez vía GOOGLE_FONTS_HREF.

export const DOSSIER_SYSTEM_FONTS = ["Georgia", "Arial"];
export const DOSSIER_GOOGLE_FONTS = [
  "Inter",
  "Montserrat",
  "Poppins",
  "Playfair Display",
  "Oswald",
  "Merriweather",
  "Bebas Neue",
  "Roboto",
];

export const DOSSIER_FONTS = [...DOSSIER_GOOGLE_FONTS, ...DOSSIER_SYSTEM_FONTS];

export const GOOGLE_FONTS_HREF = `https://fonts.googleapis.com/css2?${DOSSIER_GOOGLE_FONTS.map(
  (f) => `family=${encodeURIComponent(f)}:wght@400;700`
).join("&")}&display=swap`;
