import "server-only";

import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

type LimitOutcome = {
  success: boolean;
  limit: number;
  remaining: number;
  reset: number;
};

const memoryBuckets = new Map<string, number[]>();

function memorySlidingLimit(
  key: string,
  limit: number,
  windowMinutes: number,
): LimitOutcome {
  const now = Date.now();
  const windowMs = windowMinutes * 60 * 1000;
  const cutoff = now - windowMs;
  const timestamps = (memoryBuckets.get(key) ?? []).filter((ts) => ts > cutoff);

  if (timestamps.length >= limit) {
    const oldest = timestamps[0] ?? now;
    memoryBuckets.set(key, timestamps);
    return {
      success: false,
      limit,
      remaining: 0,
      reset: oldest + windowMs,
    };
  }

  timestamps.push(now);
  memoryBuckets.set(key, timestamps);
  return {
    success: true,
    limit,
    remaining: Math.max(0, limit - timestamps.length),
    reset: now + windowMs,
  };
}

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function resolveRateLimitNumbers(overrides?: {
  publicLimit?: number;
  emergencyLimit?: number;
  windowMinutes?: number;
}) {
  return {
    publicLimit:
      overrides?.publicLimit ??
      parsePositiveInt(process.env.RATE_LIMIT_TIKET_PUBLIK, 20),
    emergencyLimit:
      overrides?.emergencyLimit ??
      parsePositiveInt(process.env.RATE_LIMIT_TIKET_DARURAT, 100),
    windowMinutes: overrides?.windowMinutes ?? 15,
  };
}

const upstashLimiters = new Map<string, Ratelimit>();

export async function checkPublicTicketRateLimit(params: {
  ip: string;
  bucket: "general" | "emergency";
  limit: number;
  windowMinutes: number;
}): Promise<LimitOutcome> {
  const { ip, bucket, limit, windowMinutes } = params;
  const backend = process.env.RATE_LIMIT_BACKEND?.trim().toLowerCase();
  const hasUpstash =
    Boolean(process.env.UPSTASH_REDIS_REST_URL) &&
    Boolean(process.env.UPSTASH_REDIS_REST_TOKEN);

  if (backend === "memory") {
    return memorySlidingLimit(`${bucket}:${ip}`, limit, windowMinutes);
  }

  if (!hasUpstash) {
    throw new Error("Konfigurasi Upstash Redis untuk rate limit belum lengkap.");
  }

  const cacheKey = `${bucket}:${limit}:${windowMinutes}`;
  let limiter = upstashLimiters.get(cacheKey);
  if (!limiter) {
    limiter = new Ratelimit({
      redis: Redis.fromEnv(),
      limiter: Ratelimit.slidingWindow(limit, `${windowMinutes} m`),
      analytics: false,
      prefix: `it-ticketing:public-ticket:${bucket}`,
    });
    upstashLimiters.set(cacheKey, limiter);
  }

  const result = await limiter.limit(ip);
  return {
    success: result.success,
    limit: result.limit,
    remaining: result.remaining,
    reset: result.reset,
  };
}
