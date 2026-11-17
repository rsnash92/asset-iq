import { CONTENT_TYPES } from "@asset-iq/core/types";
import { z } from "zod";

export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

export const ALLOWED_FILES = {
  pdf: "application/pdf",
  md: "text/markdown",
  markdown: "text/markdown",
  txt: "text/plain",
} as const;

export function fileKind(fileName: string): keyof typeof ALLOWED_FILES | null {
  const ext = fileName.toLowerCase().split(".").pop() ?? "";
  return ext in ALLOWED_FILES ? (ext as keyof typeof ALLOWED_FILES) : null;
}

/** Storage-safe file name: ascii, no path separators, bounded length. */
export function safeFileName(fileName: string): string {
  const base = fileName.split(/[\\/]/).pop() ?? "file";
  const cleaned = base.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^\w.\-]+/g, "_").replace(/_+/g, "_").replace(/^[._]+/, "");
  return (cleaned || "file").slice(-120);
}

export const UploadInitSchema = z.object({
  fileName: z.string().min(1).max(255),
  size: z.number().int().positive().max(MAX_UPLOAD_BYTES, "Files must be 20 MB or smaller"),
});

export const UploadCompleteSchema = z.object({
  path: z.string().min(1).max(500),
  title: z.string().trim().min(1).max(300),
  contentType: z.enum(CONTENT_TYPES),
  industry: z
    .string()
    .trim()
    .max(60)
    .transform((s) => s.toLowerCase().replace(/\s+/g, "-"))
    .optional()
    .or(z.literal("").transform(() => undefined)),
  publishedAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .or(z.literal("").transform(() => undefined)),
});
