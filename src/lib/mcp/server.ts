import type { McpContext } from "@/lib/mcp/auth";
import { callTool, listToolDescriptors, ToolError } from "@/lib/mcp/tools";

// Nucleo del servidor MCP: JSON-RPC 2.0 sobre el transporte "Streamable HTTP"
// en modo sin estado (cada POST se responde con JSON, sin sesiones ni SSE).
// Solo expone herramientas, asi que alcanza con initialize, ping,
// tools/list y tools/call.

const SUPPORTED_PROTOCOL_VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"];

const SERVER_INSTRUCTIONS =
  "Servidor de Artist Pro para el equipo. Permite ver las tareas asignadas a la persona conectada, " +
  "cambiarles el estado y dejar comentarios. Usa mis_tareas para saber que tiene pendiente; los IDs que " +
  "devuelve sirven para ver_tarea, actualizar_estado y comentar_tarea. Antes de cambiar un estado o " +
  "comentar, confirma con la persona de que tarea se trata si hay ambiguedad. Responde en espanol.";

interface JsonRpcRequest {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
}

export interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: string | number | null;
  result?: unknown;
  error?: { code: number; message: string };
}

function rpcError(id: JsonRpcResponse["id"], code: number, message: string): JsonRpcResponse {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

/**
 * Procesa UN mensaje JSON-RPC. Devuelve `null` para notificaciones (mensajes
 * sin `id`), que no llevan respuesta.
 */
export async function handleMcpMessage(raw: unknown, ctx: McpContext): Promise<JsonRpcResponse | null> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return rpcError(null, -32600, "Solicitud invalida");
  }
  const message = raw as JsonRpcRequest;
  const isNotification = message.id === undefined;
  if (typeof message.method !== "string") {
    // Respuestas del cliente (no las pedimos) o basura: se ignoran.
    return isNotification || "result" in message || "error" in message
      ? null
      : rpcError(message.id ?? null, -32600, "Solicitud invalida");
  }
  if (isNotification) return null;

  const id = message.id ?? null;
  const params = message.params ?? {};

  switch (message.method) {
    case "initialize": {
      const requested = typeof params.protocolVersion === "string" ? params.protocolVersion : "";
      return {
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion: SUPPORTED_PROTOCOL_VERSIONS.includes(requested)
            ? requested
            : SUPPORTED_PROTOCOL_VERSIONS[0],
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: "artist-pro", title: "Artist Pro", version: "1.0.0" },
          instructions: SERVER_INSTRUCTIONS,
        },
      };
    }
    case "ping":
      return { jsonrpc: "2.0", id, result: {} };
    case "tools/list":
      return { jsonrpc: "2.0", id, result: { tools: listToolDescriptors() } };
    case "tools/call": {
      if (typeof params.name !== "string") return rpcError(id, -32602, "Falta el nombre de la herramienta");
      try {
        const output = await callTool(ctx, params.name, params.arguments);
        return {
          jsonrpc: "2.0",
          id,
          result: { content: [{ type: "text", text: JSON.stringify(output, null, 2) }], isError: false },
        };
      } catch (err) {
        // Los errores de herramienta vuelven como resultado con isError para
        // que Claude pueda leerlos y explicarselos a la persona.
        if (!(err instanceof ToolError)) console.error("[mcp] error inesperado en", params.name, err);
        const text = err instanceof ToolError ? err.message : "Error interno al ejecutar la herramienta.";
        return { jsonrpc: "2.0", id, result: { content: [{ type: "text", text }], isError: true } };
      }
    }
    default:
      return rpcError(id, -32601, `Metodo no soportado: ${message.method}`);
  }
}
