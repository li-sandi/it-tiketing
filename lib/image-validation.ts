export const MAX_IMAGE_FILE_SIZE = 5 * 1024 * 1024;

export const IMAGE_FORMATS = [
  {
    mimeType: "image/jpeg",
    extension: "jpg",
    matches: (bytes: Uint8Array) =>
      bytes.length >= 3 &&
      bytes[0] === 0xff &&
      bytes[1] === 0xd8 &&
      bytes[2] === 0xff,
  },
  {
    mimeType: "image/png",
    extension: "png",
    matches: (bytes: Uint8Array) =>
      bytes.length >= 8 &&
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47 &&
      bytes[4] === 0x0d &&
      bytes[5] === 0x0a &&
      bytes[6] === 0x1a &&
      bytes[7] === 0x0a,
  },
  {
    mimeType: "image/gif",
    extension: "gif",
    matches: (bytes: Uint8Array) =>
      bytes.length >= 6 &&
      ["GIF87a", "GIF89a"].includes(
        String.fromCharCode(...bytes.subarray(0, 6)),
      ),
  },
  {
    mimeType: "image/webp",
    extension: "webp",
    matches: (bytes: Uint8Array) =>
      bytes.length >= 12 &&
      String.fromCharCode(...bytes.subarray(0, 4)) === "RIFF" &&
      String.fromCharCode(...bytes.subarray(8, 12)) === "WEBP",
  },
] as const;

export type ImageFormat = (typeof IMAGE_FORMATS)[number];

export async function validateImageFile(file: File): Promise<
  | { ok: true; format: ImageFormat }
  | { ok: false; error: string }
> {
  if (file.size === 0 || file.size > MAX_IMAGE_FILE_SIZE) {
    return {
      ok: false,
      error: "Ukuran file harus lebih dari 0 dan maksimal 5 MB.",
    };
  }
  const header = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const format =
    IMAGE_FORMATS.find(
      (candidate) =>
        candidate.mimeType === file.type && candidate.matches(header),
    ) ?? null;

  if (!format) {
    return {
      ok: false,
      error: "File harus berupa gambar JPEG, PNG, WebP, atau GIF yang valid.",
    };
  }
  return { ok: true, format };
}
