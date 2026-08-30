import { expect, test } from "bun:test";
import { LocalDocCaptureRequestSchema } from "../../src/contract";
import { createWebCaptureRequest } from "../src/request";

test("扩展将页面结果转换为服务端采集契约", () => {
  const request = createWebCaptureRequest(
    {
      ok: true,
      sourceUrl: "https://help.aliyun.com/zh/model-studio/models",
      title: "模型列表",
      content: "Qwen 模型支持文本输入。",
      capturedAt: "2026-08-26T08:00:00.000Z",
      contentHash: `sha256:${"a".repeat(64)}`,
    },
    "0.1.0",
    "550e8400-e29b-41d4-a716-446655440000",
  );

  expect(LocalDocCaptureRequestSchema.parse(request)).toEqual({
    clientRequestId: "550e8400-e29b-41d4-a716-446655440000",
    sourceUrl: "https://help.aliyun.com/zh/model-studio/models",
    title: "模型列表",
    content: "Qwen 模型支持文本输入。",
    capturedAt: "2026-08-26T08:00:00.000Z",
    contentHash: `sha256:${"a".repeat(64)}`,
    extensionVersion: "0.1.0",
  });
});
