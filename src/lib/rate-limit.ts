import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

// Protege endpoints publicos de abuso (floods, fuerza bruta, scraping) --
// ver auditoria de seguridad del 2 sep 2026. Usa Upstash Redis para que el
// limite se comparta entre instancias de Railway y sobreviva a reinicios
// (un limite en memoria no sirve porque cada instancia/deploy lo resetea).
//
// Sin las env vars configuradas, cae a "permitir siempre" -- asi el
// desarrollo local sigue funcionando sin depender de una cuenta externa.
const redis =
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
    ? new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.UPSTASH_REDIS_REST_TOKEN,
      })
    : null;

if (!redis && process.env.NODE_ENV === "production") {
  console.warn(
    "[rate-limit] UPSTASH_REDIS_REST_URL/TOKEN no configuradas -- rate limiting deshabilitado en produccion."
  );
}

// Endpoints publicos/anonimos (webhook de leads, login, reset-password):
// limite estricto por IP, son el vector de abuso mas directo.
const strictLimiter = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(10, "60 s"),
      analytics: true,
      prefix: "ratelimit:strict",
    })
  : null;

// Red de seguridad general para el resto de /api/*.
const defaultLimiter = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(60, "60 s"),
      analytics: true,
      prefix: "ratelimit:default",
    })
  : null;

export type RateLimitResult = {
  success: boolean;
  limit: number;
  remaining: number;
  reset: number;
};

const ALLOW_ALL: RateLimitResult = { success: true, limit: 0, remaining: 0, reset: 0 };

export async function checkRateLimit(identifier: string, strict: boolean): Promise<RateLimitResult> {
  const limiter = strict ? strictLimiter : defaultLimiter;
  if (!limiter) return ALLOW_ALL;
  return limiter.limit(identifier);
}
