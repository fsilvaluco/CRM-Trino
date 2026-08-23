// Sube un archivo de backup a una carpeta de Google Drive usando una cuenta
// de servicio, y rota (borra) los backups mas antiguos para no acumular
// espacio indefinidamente. Pensado para correr desde el workflow de GitHub
// Actions .github/workflows/weekly-db-backup.yml, no a mano.
//
// Requiere:
//   GDRIVE_SA_KEY    -- contenido completo del JSON de la cuenta de servicio
//   GDRIVE_FOLDER_ID -- ID de la carpeta de Drive (compartida con la cuenta
//                       de servicio como Editor)
//
// Uso: node upload-to-drive.mjs <ruta-del-archivo> <nombre-en-drive>

import { google } from "googleapis";
import fs from "node:fs";

const KEEP_LAST_N_BACKUPS = 12; // ~3 meses si corre semanal

const [, , filePath, fileName] = process.argv;

if (!filePath || !fileName) {
  console.error("Uso: node upload-to-drive.mjs <archivo> <nombre-en-drive>");
  process.exit(1);
}

const folderId = process.env.GDRIVE_FOLDER_ID;
const saKeyRaw = process.env.GDRIVE_SA_KEY;

if (!folderId || !saKeyRaw) {
  console.error("Faltan las variables GDRIVE_FOLDER_ID o GDRIVE_SA_KEY.");
  process.exit(1);
}

if (!fs.existsSync(filePath)) {
  console.error(`No se encontro el archivo de backup: ${filePath}`);
  process.exit(1);
}

const stats = fs.statSync(filePath);
if (stats.size === 0) {
  console.error("El archivo de backup esta vacio -- algo fallo en el pg_dump. No se sube.");
  process.exit(1);
}

let credentials;
try {
  credentials = JSON.parse(saKeyRaw);
} catch {
  console.error("GDRIVE_SA_KEY no es un JSON valido.");
  process.exit(1);
}

const auth = new google.auth.GoogleAuth({
  credentials,
  scopes: ["https://www.googleapis.com/auth/drive.file"],
});

const drive = google.drive({ version: "v3", auth });

async function uploadBackup() {
  const res = await drive.files.create({
    requestBody: { name: fileName, parents: [folderId] },
    media: { mimeType: "application/gzip", body: fs.createReadStream(filePath) },
    fields: "id, name",
  });
  console.log(`Backup subido a Drive: ${res.data.name} (${res.data.id}), ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
}

async function rotateOldBackups() {
  const list = await drive.files.list({
    q: `'${folderId}' in parents and trashed = false`,
    fields: "files(id, name, createdTime)",
    orderBy: "createdTime desc",
    pageSize: 1000,
  });

  const files = list.data.files ?? [];
  const toDelete = files.slice(KEEP_LAST_N_BACKUPS);

  for (const file of toDelete) {
    await drive.files.delete({ fileId: file.id });
    console.log(`Backup antiguo eliminado: ${file.name}`);
  }

  if (toDelete.length === 0) {
    console.log(`Sin backups antiguos que rotar (hay ${files.length}, tope ${KEEP_LAST_N_BACKUPS}).`);
  }
}

async function main() {
  await uploadBackup();
  await rotateOldBackups();
}

main().catch((err) => {
  console.error("Error subiendo backup a Google Drive:", err?.message ?? err);
  process.exit(1);
});
