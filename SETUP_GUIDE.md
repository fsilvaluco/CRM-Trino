# Guia de Uso - Auto-CRM

Esta guia te ensena como usar y personalizar tu CRM.

## Primeros Pasos

### 1. Personalizar tu CRM

Abre el proyecto con Claude Code y escribe `/setup`. El asistente te preguntara:

- **Tipo de negocio**: Retail, Servicios, SaaS, Agencia, etc.
- **Industria**: Tu sector (tecnologia, salud, finanzas, etc.)
- **Pipeline**: Puedes usar las etapas por defecto o crear las tuyas
- **Fuentes de leads**: De donde vienen tus prospectos
- **Preferencias**: Idioma y tema visual

### 2. Agregar tus primeros contactos

Tienes tres opciones:

**Opcion A - Interfaz web:**
1. Ve a http://localhost:3000/contacts
2. Haz clic en "Nuevo Contacto"
3. Llena el formulario

**Opcion B - Conversacional (recomendado):**
1. En Claude Code, escribe `/add-lead`
2. Describe al lead naturalmente: "Maria Garcia de TechStartup, nos contacto por WhatsApp, interesada en nuestro servicio premium"
3. Claude extrae los datos y los agrega automaticamente

**Opcion C - Importacion masiva:**
1. En Claude Code, escribe `/import-contacts`
2. Indica la ruta de tu archivo CSV
3. Claude mapea las columnas y las importa

### 3. Crear Deals

1. Ve a http://localhost:3000/deals
2. Haz clic en "Nuevo Deal"
3. Selecciona el contacto, valor, etapa y probabilidad

### 4. Usar el Pipeline

1. Ve a http://localhost:3000/pipeline
2. Veras tus deals organizados por etapa
3. Arrastra y suelta entre columnas para mover deals
4. El color y nombre de cada etapa se configura en `/setup`

## Comandos de Claude Code

### /add-lead
Agrega leads conversacionalmente. Solo describele el prospecto a Claude y el extraera los datos relevantes.

### /analyze-pipeline
Claude analiza tu pipeline y te dice:
- Deals estancados que necesitan atencion
- Cuellos de botella en tu proceso
- Recomendaciones de accion prioritarias
- Leads calientes sin seguimiento

### /daily-briefing
Un resumen ejecutivo del dia:
- Follow-ups pendientes y vencidos
- Deals que cierran pronto
- Leads nuevos sin actividad
- Top 3 prioridades

### /import-contacts
Importa contactos desde un archivo CSV. Claude detecta las columnas automaticamente.

### /customize
Modifica tu configuracion sin reiniciar todo. Puedes cambiar:
- Etapas del pipeline
- Fuentes de leads
- Tema visual
- Idioma

## Clasificacion de Leads

### Sin API Key (Rule-based)
El CRM usa reglas para clasificar leads automaticamente:
- **Score basado en**: datos de contacto, actividad, recencia
- **Temperatura**: Frio (<40), Tibio (40-70), Caliente (>70)

### Con API Key (IA)
Si configuras `ANTHROPIC_API_KEY`:
- Claude analiza el contexto de cada interaccion
- Detecta intencion de compra
- Sugiere el mejor siguiente paso
- Clasifica con mayor precision

## Preguntas Frecuentes

**Necesito una API key?**
No. El CRM funciona completamente sin API key. Los comandos de Claude Code usan tu sesion activa.

**Donde se guardan los datos?**
En `data/crm.db`, un archivo SQLite local. Puedes respaldarlo simplemente copiando el archivo.

**Puedo usar esto para mi negocio?**
Si. Es open-source y gratuito. Usalo como quieras.

**Como agrego campos personalizados?**
Pidele a Claude Code que modifique el schema en `src/db/schema.ts` y las interfaces en `src/types/index.ts`.

**Puedo conectar WhatsApp/Email?**
El CRM esta disenado para expandirse. Pidele a Claude Code que agregue integraciones. Puedes usar MCP servers para conectar con servicios externos.

**Como uso el CRM desde Claude Desktop o Claude.ai?**
El proyecto incluye un servidor MCP. Agrega esto a tu config de Claude Desktop (`~/.claude/claude_desktop_config.json`):
```json
{
  "mcpServers": {
    "auto-crm": {
      "command": "npx",
      "args": ["tsx", "/ruta/completa/a/auto-crm/mcp/crm-server.ts"]
    }
  }
}
```
Ahora puedes hablar con tu CRM desde cualquier chat de Claude: "Dame un resumen de mi pipeline", "Agrega un lead nuevo", etc.

**Como despliego el CRM para que siempre este corriendo?**
Tienes tres opciones:
1. **`npm run local`** — Build y corre en produccion (puerto 3000)
2. **Docker** — `docker compose up -d` (corre en background, se reinicia automatico)
3. **Manual** — `npm run build && npm start` con un process manager como pm2

**Como hago backup de mis datos?**
Copia el archivo `data/crm.db`. Es un archivo SQLite que contiene todo. Para restaurar, simplemente reemplazalo.
