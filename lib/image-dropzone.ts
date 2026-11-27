export const ACCEPTED_IMAGE_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
] as const;

export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb < 10 ? kb.toFixed(1) : Math.round(kb)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(2)} MB`;
}

export function computeScaledDimensions(
  width: number,
  height: number,
  maxDimension = 1920,
): { width: number; height: number; scaled: boolean } {
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0 ||
    !Number.isFinite(maxDimension) ||
    maxDimension <= 0
  ) {
    return { width: 0, height: 0, scaled: false };
  }

  const largest = Math.max(width, height);
  if (largest <= maxDimension) {
    return {
      width: Math.round(width),
      height: Math.round(height),
      scaled: false,
    };
  }

  const ratio = maxDimension / largest;
  return {
    width: Math.max(1, Math.round(width * ratio)),
    height: Math.max(1, Math.round(height * ratio)),
    scaled: true,
  };
}

export function buildCompressedFileName(
  originalName: string,
  mimeType: string,
): string {
  const extMap: Record<string, string> = {
    "image/webp": "webp",
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/gif": "gif",
  };
  const nextExt = extMap[mimeType] ?? "webp";
  const cleaned = originalName.trim() || "lampiran";
  const dotIndex = cleaned.lastIndexOf(".");
  const baseName = dotIndex > 0 ? cleaned.slice(0, dotIndex) : cleaned;
  return `${baseName}.${nextExt}`;
}

export function normalizeMaxFiles(
  maxFiles: number | undefined,
  fallback = 1,
): number {
  const safeFallback =
    typeof fallback === "number" && Number.isFinite(fallback)
      ? Math.max(1, Math.floor(fallback))
      : 1;
  if (typeof maxFiles !== "number" || !Number.isFinite(maxFiles)) {
    return safeFallback;
  }
  return Math.max(1, Math.floor(maxFiles));
}

export function normalizeMaxSizeMB(
  maxSizeMB: number | undefined,
  fallback = 5,
): number {
  const safeFallback =
    typeof fallback === "number" && Number.isFinite(fallback)
      ? Math.max(1, fallback)
      : 5;
  if (typeof maxSizeMB !== "number" || !Number.isFinite(maxSizeMB)) {
    return safeFallback;
  }
  return Math.max(1, maxSizeMB);
}

export function mergeDropzoneFiles(
  existing: File[],
  incoming: File[],
  maxFiles: number,
): { nextFiles: File[]; skippedCount: number } {
  const safeMax = normalizeMaxFiles(maxFiles, 1);
  if (incoming.length === 0) {
    return { nextFiles: existing.slice(0, safeMax), skippedCount: 0 };
  }

  if (safeMax === 1) {
    return {
      nextFiles: [incoming[0]],
      skippedCount: Math.max(0, incoming.length - 1),
    };
  }

  const combined = [...existing];
  let skippedCount = 0;

  for (const file of incoming) {
    if (combined.length >= safeMax) {
      skippedCount += 1;
      continue;
    }
    const isDuplicate = combined.some(
      (item) =>
        item.name === file.name &&
        item.size === file.size &&
        item.lastModified === file.lastModified,
    );
    if (isDuplicate) {
      skippedCount += 1;
      continue;
    }
    combined.push(file);
  }

  return { nextFiles: combined, skippedCount };
}
