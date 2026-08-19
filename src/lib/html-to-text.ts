// Convierte HTML a texto legible: saca <script>/<style>, tags, y decodifica
// las entidades más comunes. No es un parser perfecto, pero para páginas de
// noticias/estadísticas simples (sin mucho JS-rendering) alcanza -- mismo
// helper usado por tickets-extract (páginas de ticketeras) y por la lectura
// de links de prensa.
export function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}
