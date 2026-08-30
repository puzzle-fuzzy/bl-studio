import { describe, expect, test } from "bun:test";
import {
  isAllowedLocalDocCaptureUrl,
  normalizeLocalDocCaptureSourceUrl,
} from "./contract";

describe("local document capture boundary", () => {
  test("allows only the exact public Bailian help origin", () => {
    expect(
      isAllowedLocalDocCaptureUrl("https://help.aliyun.com/zh/model-studio"),
    ).toBe(true);
    expect(
      isAllowedLocalDocCaptureUrl("https://evil-help.aliyun.com/page"),
    ).toBe(false);
    expect(isAllowedLocalDocCaptureUrl("http://help.aliyun.com/page")).toBe(
      false,
    );
  });

  test("removes fragments and rejects URL credentials", () => {
    expect(
      normalizeLocalDocCaptureSourceUrl(
        "https://help.aliyun.com/zh/model-studio#models",
      ),
    ).toBe("https://help.aliyun.com/zh/model-studio");
    expect(() =>
      normalizeLocalDocCaptureSourceUrl(
        "https://user:password@help.aliyun.com",
      ),
    ).toThrow();
  });
});
