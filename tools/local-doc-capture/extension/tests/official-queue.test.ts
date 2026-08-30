import { expect, test } from "bun:test";
import { createOfficialCaptureQueue } from "../src/official-queue";

test("官方队列去重并在构建前过滤明确无关页面", () => {
  const queue = createOfficialCaptureQueue([
    {
      path: "model/1.md",
      nodeId: 1,
      url: "https://help.aliyun.com/zh/model-studio/model-a",
      navigationPath: ["API参考（模型）", "文本生成", "模型 A"],
      origin: "model-api-reference",
    },
    {
      path: "token/2.md",
      nodeId: 2,
      url: "https://help.aliyun.com/zh/model-studio/token-plan-overview",
      navigationPath: ["用户指南", "Token Plan"],
      origin: "supplemental",
    },
    {
      path: "duplicate/3.md",
      nodeId: 3,
      url: "https://help.aliyun.com/zh/model-studio/model-a",
      navigationPath: ["API参考（模型）", "重复入口"],
      origin: "supplemental",
    },
  ]);

  expect(queue).toHaveLength(1);
  expect(queue[0]?.url).toBe("https://help.aliyun.com/zh/model-studio/model-a");
});
