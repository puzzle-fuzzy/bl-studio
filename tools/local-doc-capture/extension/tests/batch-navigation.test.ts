import { expect, test } from "bun:test";
import {
  canonicalizePageUrl,
  deriveDefaultScopePrefix,
  isVisited,
  isWithinScope,
} from "../src/batch-navigation";

test("批量采集规范化 URL 并去掉 fragment", () => {
  expect(
    canonicalizePageUrl(
      "https://help.aliyun.com/zh/model-studio/models?spm=test#parameters",
    ),
  ).toBe("https://help.aliyun.com/zh/model-studio/models");
  expect(
    canonicalizePageUrl("https://evil-help.aliyun.com/page"),
  ).toBeUndefined();
});

test("默认范围锁定在当前百炼文档目录", () => {
  const prefix = deriveDefaultScopePrefix(
    "https://help.aliyun.com/zh/model-studio/models",
  );
  expect(prefix).toBe("/zh/model-studio/");
  expect(
    isWithinScope(
      "https://help.aliyun.com/zh/model-studio/model-api-reference",
      prefix ?? "",
    ),
  ).toBe(true);
  expect(
    isWithinScope("https://help.aliyun.com/zh/oss/overview", prefix ?? ""),
  ).toBe(false);
});

test("已访问 URL 不重复跟随", () => {
  expect(
    isVisited(
      ["https://help.aliyun.com/zh/model-studio/models"],
      "https://help.aliyun.com/zh/model-studio/models",
    ),
  ).toBe(true);
});
