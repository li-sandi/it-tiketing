import "server-only";

import { Redis } from "@upstash/redis";

let client: Redis | undefined;

export function getRedisClient() {
  if (client) return client;

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    throw new Error(
      "UPSTASH_REDIS_REST_URL dan UPSTASH_REDIS_REST_TOKEN harus diset.",
    );
  }

  client = new Redis({ url, token });
  return client;
}

export function remoteSecretKey(ticketId: string) {
  return `ticket:${ticketId}:remote-secret`;
}

export async function allowRateLimitedRequest(
  key: string,
  limit: number,
  windowSeconds: number,
) {
  const redis = getRedisClient();
  const created = await redis.set(key, "0", { nx: true, ex: windowSeconds });
  const count = await redis.incr(key);
  return created === "OK" || count <= limit;
}

export async function storeRemoteSecret(
  ticketId: string,
  secret: { anydeskPassword?: string; uvPassword?: string },
) {
  if (!secret.anydeskPassword && !secret.uvPassword) return;

  const result = await getRedisClient().set(
    remoteSecretKey(ticketId),
    secret,
    { ex: 300, nx: true },
  );
  if (result !== "OK") {
    throw new Error("Password sementara untuk tiket ini sudah pernah disimpan.");
  }
}
