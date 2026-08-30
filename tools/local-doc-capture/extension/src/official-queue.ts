import { shouldCaptureDocument } from "./document-filter";

export type OfficialQueueDocument = {
  path: string;
  nodeId: number;
  url: string;
  navigationPath: readonly string[];
  origin: string;
};

export type OfficialDocumentQueueEntry = {
  path: string;
  url: string;
  navigationPath: readonly string[];
  origin: string;
};

/**
 * 根据最新官方导航发现结果生成本地采集队列。这里先过滤明确无关的页面，
 * 运行时仍会再次根据真实页面标题过滤，避免登记表标题与页面内容出现偏差。
 */
export function createOfficialCaptureQueue(
  documents: readonly OfficialQueueDocument[],
): OfficialDocumentQueueEntry[] {
  const seenUrls = new Set<string>();
  const queue: OfficialDocumentQueueEntry[] = [];

  for (const document of documents) {
    if (seenUrls.has(document.url)) continue;
    const decision = shouldCaptureDocument({
      sourceUrl: document.url,
      title: document.navigationPath.join(" / "),
    });
    if (decision.action === "skip") continue;

    seenUrls.add(document.url);
    queue.push({
      path: document.path,
      url: document.url,
      navigationPath: [...document.navigationPath],
      origin: document.origin,
    });
  }

  return queue;
}
