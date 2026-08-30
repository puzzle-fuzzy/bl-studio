import { z } from "zod";

export const LOCAL_DOC_CAPTURE_CONTRACT_VERSION = "v1";
export const LOCAL_DOC_CAPTURE_SERVER_ORIGIN = "http://127.0.0.1:43127";
export const LOCAL_DOC_CAPTURE_ALLOWED_ORIGINS = [
  "https://help.aliyun.com",
] as const;
export const MAX_LOCAL_DOC_CAPTURE_CONTENT_CHARACTERS = 500_000;

const HttpUrlSchema = z
  .string()
  .trim()
  .url()
  .max(2048)
  .refine((value) => /^https?:$/u.test(new URL(value).protocol), {
    message: "网页来源必须是 HTTP(S) 地址",
  });

const Sha256ContentHashSchema = z.string().regex(/^sha256:[0-9a-f]{64}$/u);

export const LocalDocCaptureRequestSchema = z
  .object({
    clientRequestId: z.string().uuid(),
    sourceUrl: HttpUrlSchema,
    title: z.string().trim().max(300),
    content: z.string().min(1).max(MAX_LOCAL_DOC_CAPTURE_CONTENT_CHARACTERS),
    capturedAt: z.string().datetime(),
    contentHash: Sha256ContentHashSchema,
    extensionVersion: z.string().trim().min(1).max(64),
  })
  .strict();

export type LocalDocCaptureRequest = z.infer<
  typeof LocalDocCaptureRequestSchema
>;

export const LocalDocCaptureAcceptedResponseSchema = z.object({
  ok: z.literal(true),
  data: z.object({
    captureId: z.string().uuid(),
    status: z.literal("stored"),
    markdownPath: z.string().min(1),
  }),
});

export const LocalDocCaptureErrorResponseSchema = z.object({
  ok: z.literal(false),
  message: z.string().min(1),
});

export function normalizeLocalDocCaptureSourceUrl(value: string): string {
  const parsed = new URL(value.trim());
  if (!/^https?:$/u.test(parsed.protocol)) {
    throw new Error("网页来源必须是 HTTP(S) 地址");
  }
  if (parsed.username || parsed.password) {
    throw new Error("网页来源 URL 不能包含用户名或密码");
  }
  parsed.hash = "";
  return parsed.toString();
}

export function isAllowedLocalDocCaptureUrl(value: string): boolean {
  let sourceUrl: URL;
  try {
    sourceUrl = new URL(normalizeLocalDocCaptureSourceUrl(value));
  } catch {
    return false;
  }
  return LOCAL_DOC_CAPTURE_ALLOWED_ORIGINS.some(
    (allowedOrigin) => sourceUrl.origin === allowedOrigin,
  );
}
