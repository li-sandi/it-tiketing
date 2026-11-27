"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import {
  ACCEPTED_IMAGE_MIME_TYPES,
  buildCompressedFileName,
  computeScaledDimensions,
  formatFileSize,
  mergeDropzoneFiles,
  normalizeMaxFiles,
  normalizeMaxSizeMB,
} from "@/lib/image-dropzone";
import { IMAGE_FORMATS, validateImageFile } from "@/lib/image-validation";

type ImageDropzoneProps = {
  files: File[];
  onChange: (files: File[]) => void;
  maxFiles?: number;
  maxSizeMB?: number;
  disabled?: boolean;
  label?: string;
  helperText?: string;
  id?: string;
  required?: boolean;
  enableGlobalPaste?: boolean;
};

type PreviewItem = {
  key: string;
  file: File;
  url: string;
};

const COMPRESS_THRESHOLD_BYTES = 800 * 1024;
const handledPasteEvents = new WeakSet<Event>();

function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Gagal membaca dimensi gambar."));
    img.src = src;
  });
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  mimeType: string,
  quality: number,
): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), mimeType, quality);
  });
}

async function compressImageIfNeeded(
  file: File,
  maxBytes: number,
): Promise<{ ok: true; file: File } | { ok: false; error: string }> {
  if (file.size <= 0) {
    return {
      ok: false,
      error: "File gambar kosong dan tidak dapat diunggah.",
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

  let candidateFile = file;

  if (
    format.mimeType !== "image/gif" &&
    (file.size > COMPRESS_THRESHOLD_BYTES || file.size > maxBytes)
  ) {
    const objectUrl = URL.createObjectURL(file);
    try {
      const img = await loadImageElement(objectUrl);
      const { width, height, scaled } = computeScaledDimensions(
        img.naturalWidth,
        img.naturalHeight,
        1920,
      );

      if (width > 0 && height > 0 && (scaled || file.size > COMPRESS_THRESHOLD_BYTES)) {
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          let blob = await canvasToBlob(canvas, "image/webp", 0.85);
          if (!blob) {
            blob = await canvasToBlob(canvas, "image/jpeg", 0.85);
          }
          if (
            blob &&
            blob.size > 0 &&
            (blob.size < file.size || file.size > maxBytes)
          ) {
            const compressedName = buildCompressedFileName(file.name, blob.type);
            candidateFile = new File([blob], compressedName, {
              type: blob.type,
              lastModified: file.lastModified,
            });
          }
        }
      }
    } catch {
      // Fallback to original file if canvas decode fails
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  }

  if (candidateFile.size > maxBytes) {
    const maxMBLabel = Number.isInteger(maxBytes / (1024 * 1024))
      ? `${maxBytes / (1024 * 1024)} MB`
      : formatFileSize(maxBytes);
    return {
      ok: false,
      error: `Ukuran file melebihi batas maksimal ${maxMBLabel}.`,
    };
  }

  const finalCheck = await validateImageFile(candidateFile);
  if (!finalCheck.ok) {
    return { ok: false, error: finalCheck.error };
  }

  return { ok: true, file: candidateFile };
}

export default function ImageDropzone({
  files,
  onChange,
  maxFiles = 1,
  maxSizeMB = 5,
  disabled = false,
  label = "Lampiran Gambar",
  helperText,
  id,
  required = false,
  enableGlobalPaste = false,
}: ImageDropzoneProps) {
  const generatedId = useId();
  const inputId = id ?? `image-dropzone-${generatedId}`;
  const inputRef = useRef<HTMLInputElement | null>(null);
  const dropzoneRef = useRef<HTMLDivElement | null>(null);

  const [dragActive, setDragActive] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previews, setPreviews] = useState<PreviewItem[]>([]);

  const safeMaxFiles = normalizeMaxFiles(maxFiles, 1);
  const safeMaxSizeMB = normalizeMaxSizeMB(maxSizeMB, 5);
  const maxBytes = safeMaxSizeMB * 1024 * 1024;

  useEffect(() => {
    const created: PreviewItem[] = files.map((file, idx) => ({
      key: `${file.name}-${file.size}-${file.lastModified}-${idx}`,
      file,
      url: URL.createObjectURL(file),
    }));

    const frame = window.requestAnimationFrame(() => {
      setPreviews(created);
    });

    return () => {
      window.cancelAnimationFrame(frame);
      for (const item of created) {
        URL.revokeObjectURL(item.url);
      }
    };
  }, [files]);

  const handleIncomingFiles = useCallback(
    async (rawList: File[]) => {
      if (disabled || rawList.length === 0) return;

      setProcessing(true);
      setError(null);

      try {
        const validated: File[] = [];
        let firstError: string | null = null;

        for (const rawFile of rawList) {
          const result = await compressImageIfNeeded(rawFile, maxBytes);
          if (result.ok) {
            validated.push(result.file);
          } else if (!firstError) {
            firstError = result.error;
          }
        }

        if (validated.length > 0) {
          const { nextFiles, skippedCount } = mergeDropzoneFiles(
            files,
            validated,
            safeMaxFiles,
          );
          onChange(nextFiles);
          if (firstError) {
            setError(firstError);
          } else if (skippedCount > 0 && safeMaxFiles > 1) {
            setError(
              `Maksimal ${safeMaxFiles} gambar. Sebagian file dilewati.`,
            );
          }
        } else if (firstError) {
          setError(firstError);
        }
      } finally {
        setProcessing(false);
        if (inputRef.current) {
          inputRef.current.value = "";
        }
      }
    },
    [disabled, files, maxBytes, onChange, safeMaxFiles],
  );

  const extractClipboardImages = useCallback((clipboardData: DataTransfer | null) => {
    if (!clipboardData) return [] as File[];
    const extracted: File[] = [];
    for (const item of Array.from(clipboardData.items)) {
      if (item.kind === "file" && item.type.startsWith("image/")) {
        const file = item.getAsFile();
        if (file) {
          const fallbackName =
            file.name && file.name !== "image.png"
              ? file.name
              : `screenshot-${Date.now()}.png`;
          extracted.push(
            file.name === fallbackName
              ? file
              : new File([file], fallbackName, {
                  type: file.type,
                  lastModified: Date.now(),
                }),
          );
        }
      }
    }
    return extracted;
  }, []);

  useEffect(() => {
    if (!enableGlobalPaste || disabled) return;

    function onDocumentPaste(e: ClipboardEvent) {
      if (handledPasteEvents.has(e)) return;

      const activeEl = document.activeElement;
      const closestZone = activeEl?.closest("[data-image-dropzone='true']");
      if (closestZone && closestZone !== dropzoneRef.current) {
        return;
      }

      const images = extractClipboardImages(e.clipboardData);
      if (images.length === 0) return;

      handledPasteEvents.add(e);
      e.preventDefault();
      void handleIncomingFiles(images);
    }

    document.addEventListener("paste", onDocumentPaste);
    return () => document.removeEventListener("paste", onDocumentPaste);
  }, [disabled, enableGlobalPaste, extractClipboardImages, handleIncomingFiles]);

  function handleRemove(index: number) {
    if (disabled) return;
    setError(null);
    onChange(files.filter((_, idx) => idx !== index));
  }

  const defaultHelper = `Format JPEG, PNG, WebP, atau GIF (maks. ${safeMaxSizeMB} MB${
    safeMaxFiles > 1 ? `, hingga ${safeMaxFiles} file` : ""
  }). Mendukung drag-and-drop atau Ctrl+V tempel tangkapan layar.`;

  return (
    <div className="space-y-2">
      {label && (
        <label
          htmlFor={inputId}
          className="block text-sm font-medium text-[var(--foreground)]"
        >
          {label}
          {required && <span className="ml-1 text-red-700">*</span>}
        </label>
      )}

      <div
        ref={dropzoneRef}
        data-image-dropzone="true"
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-disabled={disabled}
        aria-label={label || "Unggah lampiran gambar"}
        onClick={() => {
          if (!disabled) inputRef.current?.click();
        }}
        onKeyDown={(e) => {
          if (disabled) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragEnter={(e) => {
          e.preventDefault();
          if (!disabled) setDragActive(true);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setDragActive(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          if (
            e.currentTarget === e.target ||
            !e.currentTarget.contains(e.relatedTarget as Node | null)
          ) {
            setDragActive(false);
          }
        }}
        onDrop={(e) => {
          e.preventDefault();
          setDragActive(false);
          if (disabled) return;
          const dropped = Array.from(e.dataTransfer.files);
          void handleIncomingFiles(dropped);
        }}
        onPaste={(e) => {
          if (disabled) return;
          const nativeEvent = e.nativeEvent ?? e;
          if (handledPasteEvents.has(nativeEvent)) return;
          const images = extractClipboardImages(e.clipboardData);
          if (images.length === 0) return;
          handledPasteEvents.add(nativeEvent);
          e.preventDefault();
          e.stopPropagation();
          void handleIncomingFiles(images);
        }}
        className={`flex flex-col items-center justify-center rounded-xl border border-dashed px-4 py-5 text-center transition-colors ${
          disabled
            ? "cursor-not-allowed border-[var(--border)] bg-[var(--surface-muted)] opacity-60"
            : dragActive
              ? "border-[var(--accent)] bg-[var(--accent-soft)]"
              : "cursor-pointer border-[var(--border-strong)] bg-[var(--surface)] hover:border-[var(--accent)] hover:bg-[var(--surface-muted)]"
        }`}
      >
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept={ACCEPTED_IMAGE_MIME_TYPES.join(",")}
          multiple={safeMaxFiles > 1}
          disabled={disabled}
          className="sr-only"
          onChange={(e) => {
            const selected = Array.from(e.target.files ?? []);
            void handleIncomingFiles(selected);
          }}
        />

        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.75}
          className="mb-2 h-7 w-7 text-[var(--accent)]"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5"
          />
        </svg>

        <p className="text-sm font-medium text-[var(--foreground)]">
          {processing
            ? "Memproses dan mengompresi gambar..."
            : "Klik untuk pilih gambar, seret file ke sini, atau tekan Ctrl+V"}
        </p>
        <p className="mt-1 text-xs text-[var(--muted)]">
          {helperText ?? defaultHelper}
        </p>
      </div>

      {error && (
        <p
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700"
        >
          {error}
        </p>
      )}

      {previews.length > 0 && (
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {previews.map((item, idx) => (
            <li
              key={item.key}
              className="flex items-center gap-3 rounded-xl border bg-[var(--surface)] p-2.5 shadow-xs"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={item.url}
                alt={item.file.name}
                className="h-12 w-12 shrink-0 rounded-lg border object-cover"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium text-[var(--foreground)]">
                  {item.file.name}
                </p>
                <p className="tabular-nums text-[11px] text-[var(--muted)]">
                  {formatFileSize(item.file.size)}
                </p>
              </div>
              <button
                type="button"
                disabled={disabled}
                onClick={() => handleRemove(idx)}
                aria-label={`Hapus ${item.file.name}`}
                className="inline-flex min-h-8 items-center rounded-lg border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-100 disabled:opacity-50"
              >
                Hapus
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
