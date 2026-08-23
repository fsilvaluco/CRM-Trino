// Guard contra SSRF (Server-Side Request Forgery) para endpoints que hacen
// fetch() de una URL elegida por el usuario (ej. "lee esta nota de prensa",
// "lee esta pagina de venta de entradas"). Sin este chequeo, alguien podria
// mandar una URL que apunte a un recurso interno -- el ejemplo mas comun es
// http://169.254.169.254/... (el endpoint de metadata de la nube en AWS/
// GCP/Railway, que puede exponer credenciales del propio contenedor) o
// http://localhost:PUERTO/... (otro servicio interno).
//
// Estrategia: resolver el host por DNS ANTES de conectar y rechazar
// cualquier IP privada/reservada (RFC1918, loopback, link-local, etc.), y
// validar cada salto de redirect a mano -- un sitio malicioso podria
// devolver un 302 hacia una IP interna para saltarse el chequeo inicial.
//
// Limitacion conocida y aceptada: esto no protege 100% contra "DNS
// rebinding" (un atacante que controla su propio DNS podria, en teoria,
// cambiar el registro entre nuestro chequeo y la conexion real de fetch()).
// Mitiga la enorme mayoria de casos reales (URLs internas literales, IP de
// metadata, localhost) sin la complejidad de fijar la conexion a una IP
// especifica a mano.

import dns from "node:dns/promises";
import net from "node:net";

export class SsrfBlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SsrfBlockedError";
  }
}

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((p) => !Number.isInteger(p) || p < 0 || p > 255)) return null;
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

// Rangos privados/reservados de IPv4 (RFC 1918, loopback, link-local
// incluyendo el de metadata de la nube, multicast, reservado, etc.)
const IPV4_PRIVATE_RANGES: Array<[string, number]> = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
];

function isIPv4Private(ip: string): boolean {
  const ipInt = ipv4ToInt(ip);
  if (ipInt === null) return true; // formato irreconocible -- por seguridad, desconfiar
  return IPV4_PRIVATE_RANGES.some(([base, bits]) => {
    const baseInt = ipv4ToInt(base)!;
    const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
    return (ipInt & mask) === (baseInt & mask);
  });
}

function isIPv6Private(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === "::1" || lower === "::") return true;
  if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // fc00::/7 (unique local)
  if (/^fe[89ab]/.test(lower)) return true; // fe80::/10 (link-local)

  // IPv4 embebida en IPv6 (::ffff:a.b.c.d o 64:ff9b::a.b.c.d) -- revisar
  // tambien la IPv4 real que representa.
  const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/) ?? lower.match(/^64:ff9b::(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isIPv4Private(mapped[1]);

  return false;
}

const BLOCKED_HOSTNAMES = new Set(["localhost", "metadata.google.internal"]);

async function assertPublicHost(hostnameRaw: string): Promise<void> {
  // URL.hostname deja los literales IPv6 entre corchetes (ej. "[::1]") --
  // sacarlos para poder chequearlos como IP directa.
  const hostname = hostnameRaw.startsWith("[") && hostnameRaw.endsWith("]")
    ? hostnameRaw.slice(1, -1)
    : hostnameRaw;

  if (BLOCKED_HOSTNAMES.has(hostname.toLowerCase())) {
    throw new SsrfBlockedError(`No se permite acceder a "${hostname}".`);
  }

  // Si la URL ya trae una IP literal (v4 o v6), no hace falta resolver DNS
  // -- se chequea directo.
  const literalFamily = net.isIP(hostname);
  if (literalFamily === 4 && isIPv4Private(hostname)) {
    throw new SsrfBlockedError(`El host "${hostname}" es una dirección interna -- no permitido.`);
  }
  if (literalFamily === 6 && isIPv6Private(hostname)) {
    throw new SsrfBlockedError(`El host "${hostname}" es una dirección interna -- no permitido.`);
  }
  if (literalFamily !== 0) return; // IP literal pública, ya validada

  let records: { address: string; family: number }[];
  try {
    records = await dns.lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new SsrfBlockedError(`No se pudo resolver el host "${hostname}".`);
  }

  if (records.length === 0) {
    throw new SsrfBlockedError(`No se pudo resolver el host "${hostname}".`);
  }

  for (const record of records) {
    const isPrivate = record.family === 4 ? isIPv4Private(record.address) : isIPv6Private(record.address);
    if (isPrivate) {
      throw new SsrfBlockedError(`El host "${hostname}" resuelve a una dirección interna -- no permitido.`);
    }
  }
}

const MAX_REDIRECTS = 5;

/** fetch() seguro contra SSRF para URLs elegidas por el usuario. Resuelve
 * el host por DNS antes de conectar y rechaza IPs privadas/reservadas;
 * sigue redirects a mano (uno por uno) validando cada salto, en vez de
 * dejar que fetch() los siga solo. */
export async function fetchPublicUrl(url: string, init: RequestInit = {}): Promise<Response> {
  let current = new URL(url);

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (current.protocol !== "http:" && current.protocol !== "https:") {
      throw new SsrfBlockedError(`Protocolo no permitido: ${current.protocol}`);
    }

    await assertPublicHost(current.hostname);

    const res = await fetch(current.toString(), { ...init, redirect: "manual" });

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (location) {
        current = new URL(location, current);
        continue;
      }
    }

    return res;
  }

  throw new SsrfBlockedError("Demasiados redirects.");
}
