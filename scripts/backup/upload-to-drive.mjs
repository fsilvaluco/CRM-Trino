// Sube un archivo de backup a una carpeta de Google Drive y rota (borra)
// los backups mas antiguos para no acumular espacio indefinidamente.
// Pensado para correr desde el workflow de GitHub Actions
// .github/workflows/weekly-db-backup.yml, no a mano.
//
// Sube como TU cuenta de Google (OAuth), no como una cuenta de servicio --
// las cuentas de servicio no tienen cuota de almacenamiento propia en un
// Drive personal (solo funcionan con "Shared Drives" de Google Workspace),
// asi que suben usando tu cuota. El refresh token se genera una sola vez
// con scripts/backup/get-refresh-token.mjs.
//
// Requiere:
//   GDRIVE_CLIENT_ID      -- OAuth Client ID (tipo "Desktop app")
//   GDRIVE_CLIENT_SECRET  -- OAuth Client Secret
//   GDRIVE_REFRESH_TOKEN  -- generado una vez con get-refresh-token.mjs
//   GDRIVE_FOLDER_ID      -- ID de la carpeta de Drive donde se guardan
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
const clientId = process.env.GDRIVE_CLIENT_ID;
const clientSecret = process.env.GDRIVE_CLIENT_SECRET;
const refreshToken = process.env.GDRIVE_REFRESH_TOKEN;

if (!folderId || !clientId || !clientSecret || !refreshToken) {
  console.error("Faltan GDRIVE_FOLDER_ID / GDRIVE_CLIENT_ID / GDRIVE_CLIENT_SECRET / GDRIVE_REFRESH_TOKEN.");
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

const oauth2Client = new google.auth.OAuth2(clientId, clientSecret);
oauth2Client.setCredentials({ refresh_token: refreshToken });

const drive = google.drive({ version: "v3", auth: oauth2Client });

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
