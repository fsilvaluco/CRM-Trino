// Script de UNA SOLA VEZ para generar el "refresh token" de OAuth que el
// backup semanal usa para subir archivos a Google Drive como tu propia
// cuenta (no como una cuenta de servicio sin cuota de almacenamiento).
//
// Correlo localmente, en tu Mac, UNA vez:
//
//   GDRIVE_CLIENT_ID=... GDRIVE_CLIENT_SECRET=... node scripts/backup/get-refresh-token.mjs
//
// Te abre (o te da un link para abrir) el login de Google en el navegador,
// apruebas el acceso, y el script imprime el refresh token -- ese valor lo
// pegas en el secret GDRIVE_REFRESH_TOKEN de GitHub. No se guarda en ningun
// archivo ni se sube a ningun lado desde aca.

import { google } from "googleapis";
import http from "node:http";
import { URL } from "node:url";

const clientId = process.env.GDRIVE_CLIENT_ID;
const clientSecret = process.env.GDRIVE_CLIENT_SECRET;

if (!clientId || !clientSecret) {
  console.error("Faltan GDRIVE_CLIENT_ID / GDRIVE_CLIENT_SECRET como variables de entorno.");
  console.error("Uso: GDRIVE_CLIENT_ID=... GDRIVE_CLIENT_SECRET=... node scripts/backup/get-refresh-token.mjs");
  process.exit(1);
}

const PORT = 53682;
const redirectUri = `http://localhost:${PORT}`;

const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);

const authUrl = oauth2Client.generateAuthUrl({
  access_type: "offline",
  prompt: "consent", // fuerza que Google entregue un refresh_token incluso si ya autorizaste antes
  scope: ["https://www.googleapis.com/auth/drive.file"],
});

console.log("\nAbre este link en tu navegador (con la cuenta de Google donde quieres guardar los backups):\n");
console.log(authUrl);
console.log("\nEsperando que apruebes el acceso...\n");

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, redirectUri);
    const code = url.searchParams.get("code");

    if (!code) {
      res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("No llego ningun codigo de Google. Cierra esta pestana e intenta de nuevo.");
      return;
    }

    const { tokens } = await oauth2Client.getToken(code);

    res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Listo, ya puedes cerrar esta pestana y volver a la terminal.");

    console.log("Refresh token generado -- guarda este valor como el secret GDRIVE_REFRESH_TOKEN en GitHub:\n");
    console.log(tokens.refresh_token ?? "(No llego refresh_token -- revoca el acceso en https://myaccount.google.com/permissions y vuelve a correr este script)");
    console.log("");

    server.close();
    process.exit(0);
  } catch (err) {
    console.error("Error intercambiando el codigo por tokens:", err?.message ?? err);
    res.writeHead(500);
    res.end("Error, revisa la terminal.");
    server.close();
    process.exit(1);
  }
});

server.listen(PORT);
