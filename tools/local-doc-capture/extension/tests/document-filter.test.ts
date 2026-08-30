import { expect, test } from "bun:test";
import { shouldCaptureDocument } from "../src/document-filter";

test("跳过 Token Plan 页面", () => {
  const result = shouldCaptureDocument({
    sourceUrl: "https://help.aliyun.com/zh/model-studio/token-plan",
    title: "Token Plan",
  });

  expect(result).toEqual({
    action: "skip",
    ruleId: "token-plan",
    reason: "Token Plan/Token 套餐类文档",
  });
});

test("跳过计费和价格页面", () => {
  expect(
    shouldCaptureDocument({
      sourceUrl: "https://help.aliyun.com/zh/model-studio/model-pricing",
      title: "模型调用计费",
    }).action,
  ).toBe("skip");
  expect(
    shouldCaptureDocument({
      sourceUrl:
        "https://help.aliyun.com/zh/model-studio/savings-plan-and-resource-package",
      title: "节省计划和资源包账单",
    }).action,
  ).toBe("skip");
});

test("保留 Token 鉴权和模型限流页面", () => {
  expect(
    shouldCaptureDocument({
      sourceUrl:
        "https://help.aliyun.com/zh/model-studio/realtime-token-authentication",
      title: "Token鉴权",
    }),
  ).toEqual({ action: "capture" });
  expect(
    shouldCaptureDocument({
      sourceUrl: "https://help.aliyun.com/zh/model-studio/list-quotas",
      title: "查询模型限流",
    }),
  ).toEqual({ action: "capture" });
});

test("保留模型大全和新模型动态页面", () => {
  expect(
    shouldCaptureDocument({
      sourceUrl: "https://help.aliyun.com/zh/model-studio/models",
      title: "模型大全功能规格与计费",
    }),
  ).toEqual({ action: "capture" });
  expect(
    shouldCaptureDocument({
      sourceUrl:
        "https://help.aliyun.com/zh/model-studio/newly-released-models",
      title: "模型上下架与更新",
    }),
  ).toEqual({ action: "capture" });
});
