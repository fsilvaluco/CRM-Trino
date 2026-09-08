interface FontFaceInput {
  name: string;
  url: string;
  format: "woff2" | "woff" | "truetype" | "opentype";
}

/** Inyecta un @font-face por cada tipografía propia del proyecto -- usado
 * tanto en el editor de Dossier como en la página pública, para que un
 * campo que usa una fuente subida a mano (ej. "New Spirit") se vea igual
 * en los dos lados. */
export function CustomFontFaces({ fonts }: { fonts: FontFaceInput[] }) {
  if (fonts.length === 0) return null;
  const css = fonts
    .map(
      (f) => `@font-face { font-family: "${f.name.replace(/"/g, '\\"')}"; src: url("${f.url}") format("${f.format}"); font-display: swap; }`
    )
    .join("\n");
  return <style dangerouslySetInnerHTML={{ __html: css }} />;
}
