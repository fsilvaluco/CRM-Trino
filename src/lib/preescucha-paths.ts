// Validacion de las rutas de archivos de una preescucha dentro del bucket.
// Los nombres los genera el servidor (/api/preescuchas/upload-url) como
// {carpeta}/{uuid}.{ext}; cualquier otra forma se rechaza para que nadie
// pueda apuntar una preescucha a un archivo de otra carpeta.

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const TRACK_FILE_RE = new RegExp(`^${UUID}\\.mp3$`, "i");
const COVER_FILE_RE = new RegExp(`^${UUID}\\.(jpg|png|webp)$`, "i");

function fileNameInFolder(folder: string, path: string): string | null {
  const prefix = `${folder}/`;
  if (!path.startsWith(prefix)) return null;
  const name = path.slice(prefix.length);
  return name.includes("/") ? null : name;
}

export function isValidTrackPath(folder: string, path: string): boolean {
  const name = fileNameInFolder(folder, path);
  return name !== null && TRACK_FILE_RE.test(name);
}

export function isValidCoverPath(folder: string, path: string): boolean {
  const name = fileNameInFolder(folder, path);
  return name !== null && COVER_FILE_RE.test(name);
}
