import { isAllowedLocalDocCaptureUrl } from "../../src/contract";

export function canonicalizePageUrl(value: string): string | undefined {
  try {
    const parsed = new URL(value.trim());
    if (!isAllowedLocalDocCaptureUrl(parsed.toString())) return undefined;
    parsed.hash = "";
    parsed.search = "";
    return parsed.toString();
  } catch {
    return undefined;
  }
}

/**
 * 默认只在当前文档产品目录内前进，例如 /zh/model-studio/，避免从一个帮助页
 * 误跳到整个 help.aliyun.com 的其他产品。
 */
export function deriveDefaultScopePrefix(
  sourceUrl: string,
): string | undefined {
  try {
    const parsed = new URL(sourceUrl);
    const segments = parsed.pathname.split("/").filter(Boolean);
    const prefixSegments = segments.slice(0, Math.min(2, segments.length));
    if (prefixSegments.length === 0) return "/";
    return `/${prefixSegments.join("/")}/`;
  } catch {
    return undefined;
  }
}

export function isWithinScope(sourceUrl: string, scopePrefix: string): boolean {
  try {
    const parsed = new URL(sourceUrl);
    const normalizedPrefix = `/${scopePrefix.trim().replace(/^\/+|\/+$/gu, "")}/`;
    const prefixWithoutTrailingSlash = normalizedPrefix.slice(0, -1);
    return (
      parsed.origin === "https://help.aliyun.com" &&
      (parsed.pathname === prefixWithoutTrailingSlash ||
        parsed.pathname.startsWith(normalizedPrefix))
    );
  } catch {
    return false;
  }
}

export function isVisited(
  visitedUrls: readonly string[],
  candidateUrl: string,
): boolean {
  return visitedUrls.includes(candidateUrl);
}
