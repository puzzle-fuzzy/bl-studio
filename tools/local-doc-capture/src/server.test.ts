import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LocalDocCaptureAcceptedResponseSchema } from "./contract";
import { handleLocalCaptureRequest, hashContent } from "./server";

const content = "Qwen 模型支持文本输入。";
const baseRequest = {
  clientRequestId: "550e8400-e29b-41d4-a716-446655440000",
  sourceUrl: "https://help.aliyun.com/zh/model-studio/models#models",
  title: "模型列表",
  content,
  capturedAt: "2026-08-26T08:00:00.000Z",
  contentHash: hashContent(content),
  extensionVersion: "0.1.0",
};

describe("local capture server", () => {
  test("rejects an invalid token before reading page content", async () => {
    const response = await handleLocalCaptureRequest(
      new Request("http://127.0.0.1:43127/capture", {
        method: "POST",
        body: JSON.stringify(baseRequest),
      }),
      "expected-token",
    );

    expect(response.status).toBe(401);
  });

  test("stores verified public-doc content and metadata locally", async () => {
    const outputRoot = await mkdtemp(join(tmpdir(), "bailian-capture-test-"));
    try {
      const response = await handleLocalCaptureRequest(
        new Request("http://127.0.0.1:43127/capture", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-local-doc-capture-token": "expected-token",
          },
          body: JSON.stringify(baseRequest),
        }),
        "expected-token",
        { capturesRoot: outputRoot },
      );

      expect(response.status).toBe(201);
      const accepted = LocalDocCaptureAcceptedResponseSchema.parse(
        await response.json(),
      );
      const markdownPath = join(outputRoot, `${accepted.data.captureId}.md`);
      const metadataPath = join(outputRoot, `${accepted.data.captureId}.json`);
      expect(await readFile(markdownPath, "utf8")).toContain(content);
      expect(await readFile(metadataPath, "utf8")).toContain(
        "https://help.aliyun.com/zh/model-studio/models",
      );
    } finally {
      await rm(outputRoot, { recursive: true, force: true });
    }
  });

  test("rejects a non-allowlisted source", async () => {
    const response = await handleLocalCaptureRequest(
      new Request("http://127.0.0.1:43127/capture", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-local-doc-capture-token": "expected-token",
        },
        body: JSON.stringify({
          ...baseRequest,
          sourceUrl: "https://evil-help.aliyun.com/page",
        }),
      }),
      "expected-token",
    );

    expect(response.status).toBe(403);
  });
});
