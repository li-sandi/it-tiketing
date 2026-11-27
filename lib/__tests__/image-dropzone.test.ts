import { describe, expect, it } from "vitest";
import {
  buildCompressedFileName,
  computeScaledDimensions,
  formatFileSize,
  mergeDropzoneFiles,
  normalizeMaxFiles,
  normalizeMaxSizeMB,
} from "@/lib/image-dropzone";

describe("lib/image-dropzone", () => {
  it("formats file sizes cleanly across B, KB, and MB", () => {
    expect(formatFileSize(0)).toBe("0 B");
    expect(formatFileSize(512)).toBe("512 B");
    expect(formatFileSize(2048)).toBe("2.0 KB");
    expect(formatFileSize(153600)).toBe("150 KB");
    expect(formatFileSize(2 * 1024 * 1024)).toBe("2.00 MB");
  });

  it("computes scaled dimensions respecting maxDimension", () => {
    expect(computeScaledDimensions(800, 600, 1920)).toEqual({
      width: 800,
      height: 600,
      scaled: false,
    });
    expect(computeScaledDimensions(3840, 2160, 1920)).toEqual({
      width: 1920,
      height: 1080,
      scaled: true,
    });
    expect(computeScaledDimensions(0, 100, 1920)).toEqual({
      width: 0,
      height: 0,
      scaled: false,
    });
  });

  it("builds compressed filenames with the target mime extension", () => {
    expect(buildCompressedFileName("screenshot.png", "image/webp")).toBe(
      "screenshot.webp",
    );
    expect(buildCompressedFileName("photo.heic", "image/jpeg")).toBe(
      "photo.jpg",
    );
    expect(buildCompressedFileName("noext", "image/webp")).toBe("noext.webp");
  });

  it("merges incoming files for single-file and multi-file modes with deduplication", () => {
    const f1 = new File(["a"], "a.png", { type: "image/png", lastModified: 1 });
    const f2 = new File(["b"], "b.png", { type: "image/png", lastModified: 2 });
    const f3 = new File(["c"], "c.png", { type: "image/png", lastModified: 3 });

    const single = mergeDropzoneFiles([f1], [f2, f3], 1);
    expect(single.nextFiles).toEqual([f2]);
    expect(single.skippedCount).toBe(1);

    const multi = mergeDropzoneFiles([f1], [f1, f2, f3], 2);
    expect(multi.nextFiles).toEqual([f1, f2]);
    expect(multi.skippedCount).toBe(2);
  });

  it("guards NaN and non-finite bounds for maxFiles and maxSizeMB", () => {
    const f1 = new File(["a"], "a.png", { type: "image/png", lastModified: 1 });
    const f2 = new File(["b"], "b.png", { type: "image/png", lastModified: 2 });
    const f3 = new File(["c"], "c.png", { type: "image/png", lastModified: 3 });

    const nanResult = mergeDropzoneFiles([f1], [f2, f3], Number.NaN);
    expect(nanResult.nextFiles).toEqual([f2]);
    expect(nanResult.skippedCount).toBe(1);

    const infResult = mergeDropzoneFiles([f1], [f2, f3], Number.POSITIVE_INFINITY);
    expect(infResult.nextFiles).toEqual([f2]);
    expect(infResult.skippedCount).toBe(1);

    expect(normalizeMaxFiles(Number.NaN, 1)).toBe(1);
    expect(normalizeMaxFiles(3.8, 1)).toBe(3);
    expect(normalizeMaxSizeMB(Number.NaN, 5)).toBe(5);
    expect(normalizeMaxSizeMB(0, 5)).toBe(1);
  });
});
