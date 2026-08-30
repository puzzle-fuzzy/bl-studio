export type DocumentFilterInput = {
  sourceUrl: string;
  title: string;
};

export type DocumentFilterDecision =
  | { action: "capture" }
  | { action: "skip"; ruleId: string; reason: string };

type DocumentFilterRule = {
  id: string;
  reason: string;
  patterns: readonly RegExp[];
};

/**
 * 这些规则只用于本地辅助采集，不影响正式产品的模型清单。
 *
 * 规则故意只匹配明确的计费/套餐类词语：例如“Token 鉴权”仍然保留，
 * “查询模型限流”也仍然保留，因为它们属于 API 接入或模型限制资料。
 */
const DEFAULT_SKIP_RULES: readonly DocumentFilterRule[] = [
  {
    id: "token-plan",
    reason: "Token Plan/Token 套餐类文档",
    patterns: [
      /token[\s_-]*(?:plan|套餐|计划)/iu,
      /(?:token|令牌)[\s_-]*(?:套餐|计划)/iu,
    ],
  },
  {
    id: "plans-and-billing",
    reason: "套餐、额度、计费、价格或账单类文档",
    patterns: [
      /\b(?:billing|price|pricing)\b/iu,
      /(?:coding-plan|savings-plan|resource-package|new-free-quota)/iu,
      /(?:计费|计价|价格|账单|充值|费用)/u,
    ],
  },
];

export function shouldCaptureDocument(
  input: DocumentFilterInput,
): DocumentFilterDecision {
  if (isModelCatalogPage(input.sourceUrl)) return { action: "capture" };

  const searchableText = `${input.sourceUrl}\n${input.title}`;
  const matchedRule = DEFAULT_SKIP_RULES.find((rule) =>
    rule.patterns.some((pattern) => pattern.test(searchableText)),
  );

  return matchedRule === undefined
    ? { action: "capture" }
    : {
        action: "skip",
        ruleId: matchedRule.id,
        reason: matchedRule.reason,
      };
}

function isModelCatalogPage(sourceUrl: string): boolean {
  try {
    const pathname = new URL(sourceUrl).pathname.replace(/\/+$/u, "");
    return /\/(?:models|newly-released-models)$/iu.test(pathname);
  } catch {
    return false;
  }
}
