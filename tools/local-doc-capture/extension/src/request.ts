import type { LocalDocCaptureRequest } from "../../src/contract";
import type { PageCaptureResult } from "./page-capture";

type SuccessfulPageCapture = Extract<PageCaptureResult, { ok: true }>;

export function createWebCaptureRequest(
  page: SuccessfulPageCapture,
  extensionVersion: string,
  clientRequestId: string,
): LocalDocCaptureRequest {
  return {
    clientRequestId,
    sourceUrl: page.sourceUrl,
    title: page.title,
    content: page.content,
    capturedAt: page.capturedAt,
    contentHash: page.contentHash,
    extensionVersion,
  };
}
