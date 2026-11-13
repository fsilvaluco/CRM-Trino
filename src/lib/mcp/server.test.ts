import test from "node:test";
import assert from "node:assert/strict";
import type { McpContext } from "./auth";
import { handleMcpMessage } from "./server";
import { isTrustedRedirectUri } from "./oauth-clients";
import { getSafeNextPath } from "../safe-next";

// El contexto no se usa en los caminos que se prueban aca (protocolo y
// validacion de parametros): ninguno llega a consultar la base.
const ctx = {} as McpContext;

test("initialize negocia la version del protocolo", async () => {
  const known = await handleMcpMessage(
    { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18" } },
    ctx
  );
  assert.equal((known?.result as { protocolVersion: string }).protocolVersion, "2025-06-18");

  const unknown = await handleMcpMessage(
    { jsonrpc: "2.0", id: 2, method: "initialize", params: { protocolVersion: "1999-01-01" } },
    ctx
  );
  assert.equal((unknown?.result as { protocolVersion: string }).protocolVersion, "2025-11-25");
});

test("tools/list expone solo las cuatro herramientas de tareas", async () => {
  const res = await handleMcpMessage({ jsonrpc: "2.0", id: 1, method: "tools/list" }, ctx);
  const tools = (res?.result as { tools: Array<{ name: string; inputSchema: { type: string } }> }).tools;
  assert.deepEqual(
    tools.map((t) => t.name),
    ["mis_tareas", "ver_tarea", "actualizar_estado", "comentar_tarea"]
  );
  for (const tool of tools) assert.equal(tool.inputSchema.type, "object");
});

test("las notificaciones no llevan respuesta", async () => {
  assert.equal(await handleMcpMessage({ jsonrpc: "2.0", method: "notifications/initialized" }, ctx), null);
});

test("metodo desconocido responde -32601", async () => {
  const res = await handleMcpMessage({ jsonrpc: "2.0", id: 7, method: "resources/list" }, ctx);
  assert.equal(res?.error?.code, -32601);
  assert.equal(res?.id, 7);
});

test("parametros invalidos y herramientas desconocidas vuelven como isError", async () => {
  const badArgs = await handleMcpMessage(
    { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "actualizar_estado", arguments: { tarea_id: "x", estado: "borrada" } } },
    ctx
  );
  assert.equal((badArgs?.result as { isError: boolean }).isError, true);

  const unknownTool = await handleMcpMessage(
    { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "borrar_todo", arguments: {} } },
    ctx
  );
  assert.equal((unknownTool?.result as { isError: boolean }).isError, true);
});

test("solo se confia en retornos de Claude o de la propia maquina", () => {
  assert.equal(isTrustedRedirectUri("https://claude.ai/api/mcp/auth_callback"), true);
  assert.equal(isTrustedRedirectUri("https://app.claude.com/callback"), true);
  assert.equal(isTrustedRedirectUri("http://localhost:53124/callback"), true);
  assert.equal(isTrustedRedirectUri("https://claude.ai.evil.example/callback"), false);
  assert.equal(isTrustedRedirectUri("https://evilclaude.ai/callback"), false);
  assert.equal(isTrustedRedirectUri("http://claude.ai/callback"), false);
  assert.equal(isTrustedRedirectUri("javascript:alert(1)"), false);
});

test("el destino post-login solo acepta rutas internas", () => {
  assert.equal(getSafeNextPath("?next=%2Foauth%2Fconsent%3Fauthorization_id%3Dabc"), "/oauth/consent?authorization_id=abc");
  assert.equal(getSafeNextPath("?next=https://evil.example"), "/");
  assert.equal(getSafeNextPath("?next=//evil.example"), "/");
  assert.equal(getSafeNextPath(""), "/");
});
