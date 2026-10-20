import { timingSafeEqual } from "node:crypto";

export function cekCronSecret(request: Request) {
  const expected = process.env.CRON_SECRET;
  if (!expected) throw new Error("CRON_SECRET belum diset.");

  const bearer = request.headers.get("authorization");
  const provided =
    request.headers.get("x-cron-secret") ??
    (bearer?.startsWith("Bearer ") ? bearer.slice(7) : null);
  if (!provided) return false;

  const providedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(expected);
  return (
    providedBuffer.length === expectedBuffer.length &&
    timingSafeEqual(providedBuffer, expectedBuffer)
  );
}
