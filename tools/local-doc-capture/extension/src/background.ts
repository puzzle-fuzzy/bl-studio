import {
  isAllowedLocalDocCaptureUrl,
  LocalDocCaptureAcceptedResponseSchema,
  LocalDocCaptureErrorResponseSchema,
} from "../../src/contract";
import {
  canonicalizePageUrl,
  deriveDefaultScopePrefix,
  isVisited,
  isWithinScope,
} from "./batch-navigation";
import { shouldCaptureDocument } from "./document-filter";
import { capturePage, type PageCaptureResult } from "./page-capture";
import { createWebCaptureRequest } from "./request";

const LOCAL_CAPTURE_URL = `${__LOCAL_CAPTURE_SERVER_ORIGIN__}/capture`;
const OFFICIAL_DOC_QUEUE = __LOCAL_DOC_CAPTURE_QUEUE__;
const BATCH_STATE_KEY = "local-doc-capture.batch.v3";
const PAGE_RENDER_SETTLE_MS = 1_200;
const MAX_BATCH_PAGES = 500;

type BatchStatus = "running" | "paused" | "completed" | "stopped";
type BatchPhase = "capturing" | "waiting-for-navigation";

type BatchState = {
  version: 3;
  runId: string;
  status: BatchStatus;
  phase: BatchPhase;
  tabId: number;
  scopePrefix: string;
  maxPages: number;
  queueIndex: number;
  queueSize: number;
  capturedCount: number;
  skippedCount: number;
  visitedUrls: string[];
  currentUrl: string;
  nextUrl: string | null;
  lastSkippedUrl: string | null;
  lastSkippedReason: string | null;
  message: string | null;
};

type ExtensionMessage =
  | { type: "capture-active-tab" }
  | { type: "start-batch-capture"; maxPages: number }
  | { type: "stop-batch-capture" }
  | { type: "resume-batch-capture" }
  | { type: "get-batch-status" };

type ExtensionResponse =
  | { ok: true; captureId?: string; message: string }
  | { ok: false; message: string };

type CaptureSuccess = { ok: true; captureId: string; sourceUrl: string };
type CaptureFailure = { ok: false; message: string };
type CaptureResult = CaptureSuccess | CaptureFailure;
type SuccessfulPageCapture = Extract<PageCaptureResult, { ok: true }>;

const activeBatchRuns = new Set<string>();

chrome.runtime.onMessage.addListener(
  (message: unknown, _sender, sendResponse) => {
    if (!isExtensionMessage(message)) return;

    void dispatchMessage(message)
      .then(sendResponse)
      .catch((error: unknown) => {
        sendResponse({
          ok: false,
          message: error instanceof Error ? error.message : "本地采集失败。",
        } satisfies ExtensionResponse);
      });
    return true;
  },
);

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== "complete") return;
  void resumeAfterNavigation(tabId, changeInfo.url ?? tab.url).catch(
    (error: unknown) => {
      console.error("批量采集导航恢复失败", error);
    },
  );
});

async function dispatchMessage(
  message: ExtensionMessage,
): Promise<ExtensionResponse> {
  switch (message.type) {
    case "capture-active-tab":
      return captureActiveTab();
    case "start-batch-capture":
      return startBatchCapture(message.maxPages);
    case "stop-batch-capture":
      return stopBatchCapture();
    case "resume-batch-capture":
      return resumeBatchCapture();
    case "get-batch-status":
      return getBatchStatus();
  }
}

async function captureActiveTab(): Promise<ExtensionResponse> {
  const tab = await getActiveTab();
  if (tab?.id === undefined) {
    return { ok: false, message: "无法确定当前浏览器标签页。" };
  }

  const page = await readPageTab(tab.id);
  if (!page.ok) return page;
  if (!isAllowedLocalDocCaptureUrl(page.sourceUrl)) {
    return { ok: false, message: "当前页面不在百炼公开文档白名单内。" };
  }

  const filter = shouldCaptureDocument(page);
  if (filter.action === "skip") {
    return { ok: true, message: `已跳过当前页面：${filter.reason}。` };
  }

  const result = await storePage(page);
  return result.ok
    ? {
        ok: true,
        captureId: result.captureId,
        message: `已保存到本地：${result.captureId}`,
      }
    : result;
}

async function startBatchCapture(maxPages: number): Promise<ExtensionResponse> {
  const tab = await getActiveTab();
  if (tab?.id === undefined || tab.url === undefined) {
    return { ok: false, message: "无法确定当前浏览器标签页。" };
  }

  const currentUrl = canonicalizePageUrl(tab.url);
  const queueIndex =
    currentUrl === undefined
      ? -1
      : OFFICIAL_DOC_QUEUE.findIndex((entry) => entry.url === currentUrl);
  const initialQueueIndex = queueIndex >= 0 ? queueIndex : 0;
  const initialQueueEntry = OFFICIAL_DOC_QUEUE[initialQueueIndex];
  const scopePrefix = initialQueueEntry
    ? deriveDefaultScopePrefix(initialQueueEntry.url)
    : undefined;
  if (currentUrl === undefined) {
    return {
      ok: false,
      message: "批量采集只允许从 help.aliyun.com 的公开文档页面开始。",
    };
  }
  if (initialQueueEntry === undefined) {
    return {
      ok: false,
      message: "官方文档队列为空。请重新同步后构建插件。",
    };
  }
  if (scopePrefix === undefined) {
    return { ok: false, message: "无法确定官方模型文档队列的目录范围。" };
  }

  const normalizedMaxPages = Number.isInteger(maxPages)
    ? Math.min(Math.max(maxPages, 1), MAX_BATCH_PAGES)
    : Math.min(OFFICIAL_DOC_QUEUE.length, MAX_BATCH_PAGES);
  const state: BatchState = {
    version: 3,
    runId: crypto.randomUUID(),
    status: "running",
    phase: "capturing",
    tabId: tab.id,
    scopePrefix,
    maxPages: normalizedMaxPages,
    queueIndex: initialQueueIndex,
    queueSize: OFFICIAL_DOC_QUEUE.length,
    capturedCount: 0,
    skippedCount: 0,
    visitedUrls: [],
    currentUrl,
    nextUrl: null,
    lastSkippedUrl: null,
    lastSkippedReason: null,
    message: null,
  };
  await saveBatchState(state);
  if (currentUrl === initialQueueEntry.url) {
    launchBatch(state.runId);
  } else {
    await navigateBatchTo(state, initialQueueEntry.url);
  }
  return {
    ok: true,
    message: `批量采集已启动：官方队列 ${OFFICIAL_DOC_QUEUE.length} 页，最多保存 ${normalizedMaxPages} 页。`,
  };
}

async function stopBatchCapture(): Promise<ExtensionResponse> {
  const state = await readBatchState();
  if (
    state === null ||
    (state.status !== "running" && state.status !== "paused")
  ) {
    return { ok: false, message: "当前没有正在运行的批量采集。" };
  }

  const stopped: BatchState = {
    ...state,
    status: "stopped",
    message: "用户已停止批量采集。",
  };
  await saveBatchState(stopped);
  return { ok: true, message: stopped.message ?? "用户已停止批量采集。" };
}

async function resumeBatchCapture(): Promise<ExtensionResponse> {
  const state = await readBatchState();
  if (state === null || state.status !== "paused") {
    return { ok: false, message: "当前没有需要继续的批量采集。" };
  }

  const resumed: BatchState = {
    ...state,
    status: "running",
    phase: "capturing",
    message: null,
  };
  await saveBatchState(resumed);
  launchBatch(resumed.runId);
  return { ok: true, message: "已继续批量采集。" };
}

async function getBatchStatus(): Promise<ExtensionResponse> {
  const state = await readBatchState();
  if (state === null) return { ok: true, message: "当前没有批量采集记录。" };

  const skippedText =
    state.skippedCount > 0 ? `，已跳过 ${state.skippedCount} 页` : "";
  const queueProgress = `${Math.min(state.queueIndex + 1, state.queueSize)}/${state.queueSize}`;
  const statusText =
    state.status === "running"
      ? `批量采集中：队列 ${queueProgress}，已保存 ${state.capturedCount}/${state.maxPages} 页${skippedText}`
      : `批量采集${state.status === "completed" ? "已完成" : state.status === "paused" ? "已暂停" : "已停止"}：队列 ${queueProgress}，已保存 ${state.capturedCount} 页${skippedText}${state.message ? `。${state.message}` : ""}`;
  return { ok: true, message: statusText };
}

async function launchBatch(runId: string): Promise<void> {
  if (activeBatchRuns.has(runId)) return;
  activeBatchRuns.add(runId);
  try {
    await continueBatch(runId);
  } catch (error: unknown) {
    const state = await readBatchState();
    if (state?.runId === runId && state.status === "running") {
      await saveBatchState({
        ...state,
        status: "paused",
        phase: "capturing",
        message:
          error instanceof Error ? error.message : "批量采集发生未知错误。",
      });
    }
  } finally {
    activeBatchRuns.delete(runId);
  }
}

async function continueBatch(runId: string): Promise<void> {
  const state = await readBatchState();
  if (state === null || state.runId !== runId || state.status !== "running")
    return;
  if (state.phase === "waiting-for-navigation") return;

  await delay(PAGE_RENDER_SETTLE_MS);
  const latestState = await readBatchState();
  if (
    latestState === null ||
    latestState.runId !== runId ||
    latestState.status !== "running"
  )
    return;

  const page = await readPageTab(latestState.tabId);
  if (!page.ok) {
    await saveBatchState({
      ...latestState,
      status: "paused",
      phase: "capturing",
      message: page.message,
    });
    return;
  }

  if (!isAllowedLocalDocCaptureUrl(page.sourceUrl)) {
    await saveBatchState({
      ...latestState,
      status: "paused",
      phase: "capturing",
      message: "当前页面不再属于允许的百炼公开文档范围。",
    });
    return;
  }

  const currentUrl = canonicalizePageUrl(page.sourceUrl);
  if (
    currentUrl === undefined ||
    !isWithinScope(currentUrl, latestState.scopePrefix)
  ) {
    await saveBatchState({
      ...latestState,
      status: "completed",
      phase: "capturing",
      message: `当前页面已超出目录 ${latestState.scopePrefix}，已停止。`,
    });
    return;
  }

  const expectedQueueEntry = OFFICIAL_DOC_QUEUE[latestState.queueIndex];
  if (expectedQueueEntry?.url !== currentUrl) {
    await saveBatchState({
      ...latestState,
      status: "paused",
      phase: "capturing",
      message: "当前页面与官方文档队列不一致，请勿手动切换标签页后继续。",
    });
    return;
  }

  if (isVisited(latestState.visitedUrls, currentUrl)) {
    const duplicateState: BatchState = {
      ...latestState,
      currentUrl,
      message: "队列中的 URL 已访问，正在跳过重复项。",
    };
    await saveBatchState(duplicateState);
    await scheduleNextQueuePage(duplicateState);
    return;
  }

  const progressState: BatchState = {
    ...latestState,
    currentUrl,
    visitedUrls: [...latestState.visitedUrls, currentUrl],
    nextUrl: null,
  };

  const filter = shouldCaptureDocument(page);
  if (filter.action === "skip") {
    const skippedState: BatchState = {
      ...progressState,
      skippedCount: latestState.skippedCount + 1,
      lastSkippedUrl: currentUrl,
      lastSkippedReason: filter.reason,
      message: `已跳过：${filter.reason}。`,
    };
    await saveBatchState(skippedState);
    await scheduleNextQueuePage(skippedState);
    return;
  }

  const capture = await storePage(page);
  if (!capture.ok) {
    await saveBatchState({
      ...progressState,
      status: "paused",
      phase: "capturing",
      message: capture.message,
    });
    return;
  }

  const capturedCount = latestState.capturedCount + 1;
  const capturedState: BatchState = {
    ...progressState,
    capturedCount,
    message: null,
  };
  if (capturedCount >= latestState.maxPages) {
    await saveBatchState({
      ...capturedState,
      status: "completed",
      message: `已达到最大页数 ${latestState.maxPages}。`,
    });
    return;
  }

  await scheduleNextQueuePage(capturedState);
}

async function scheduleNextQueuePage(state: BatchState): Promise<void> {
  let nextIndex = state.queueIndex + 1;
  while (nextIndex < OFFICIAL_DOC_QUEUE.length) {
    const candidateUrl = OFFICIAL_DOC_QUEUE[nextIndex]?.url;
    if (
      candidateUrl !== undefined &&
      !isVisited(state.visitedUrls, candidateUrl)
    ) {
      break;
    }
    nextIndex += 1;
  }

  if (nextIndex >= OFFICIAL_DOC_QUEUE.length) {
    await saveBatchState({
      ...state,
      status: "completed",
      message:
        state.skippedCount > 0
          ? `官方文档队列已处理完成，已跳过 ${state.skippedCount} 页。`
          : "官方文档队列已处理完成。",
    });
    return;
  }

  const nextUrl = canonicalizePageUrl(OFFICIAL_DOC_QUEUE[nextIndex]?.url ?? "");
  if (nextUrl === undefined || !isAllowedLocalDocCaptureUrl(nextUrl)) {
    await saveBatchState({
      ...state,
      status: "completed",
      message: "官方文档队列包含不在白名单内的 URL，已停止。",
    });
    return;
  }
  if (!isWithinScope(nextUrl, state.scopePrefix)) {
    await saveBatchState({
      ...state,
      status: "completed",
      message: `官方文档队列 URL 已超出当前目录 ${state.scopePrefix}，已停止。`,
    });
    return;
  }

  await navigateBatchTo({ ...state, queueIndex: nextIndex }, nextUrl);
}

async function navigateBatchTo(
  state: BatchState,
  nextUrl: string,
): Promise<void> {
  const waitingState: BatchState = {
    ...state,
    phase: "waiting-for-navigation",
    nextUrl,
    message: null,
  };
  await saveBatchState(waitingState);
  try {
    await chrome.tabs.update(state.tabId, { url: nextUrl });
  } catch (error: unknown) {
    await saveBatchState({
      ...waitingState,
      status: "paused",
      phase: "capturing",
      message:
        error instanceof Error ? error.message : "官方文档页面导航失败。",
    });
  }
}

async function resumeAfterNavigation(
  tabId: number,
  updatedUrl: string | undefined,
): Promise<void> {
  if (updatedUrl === undefined) return;
  const state = await readBatchState();
  if (
    state === null ||
    state.status !== "running" ||
    state.phase !== "waiting-for-navigation" ||
    state.tabId !== tabId ||
    canonicalizePageUrl(updatedUrl) !== state.nextUrl
  )
    return;

  await saveBatchState({
    ...state,
    phase: "capturing",
    currentUrl: state.nextUrl,
    nextUrl: null,
  });
  launchBatch(state.runId);
}

async function readPageTab(tabId: number): Promise<PageCaptureResult> {
  let execution: Array<{ result?: PageCaptureResult }>;
  try {
    execution = await chrome.scripting.executeScript({
      target: { tabId },
      func: capturePage,
    });
  } catch {
    return {
      ok: false,
      message: "无法读取当前页面，请确认这是可访问的公开文档页面。",
    };
  }

  return (
    execution[0]?.result ?? {
      ok: false,
      message: "当前页面无法采集。",
    }
  );
}

async function storePage(page: SuccessfulPageCapture): Promise<CaptureResult> {
  if (!isAllowedLocalDocCaptureUrl(page.sourceUrl)) {
    return { ok: false, message: "当前页面不在百炼公开文档白名单内。" };
  }

  const request = createWebCaptureRequest(
    page,
    chrome.runtime.getManifest().version,
    crypto.randomUUID(),
  );
  let response: Response;
  try {
    response = await fetch(LOCAL_CAPTURE_URL, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "x-local-doc-capture-token": __LOCAL_DOC_CAPTURE_TOKEN__,
      },
      body: JSON.stringify(request),
    });
  } catch {
    return {
      ok: false,
      message: "无法连接本地采集服务，请确认本地服务窗口仍在运行。",
    };
  }

  const payload: unknown = await response.json().catch(() => undefined);
  const localError = LocalDocCaptureErrorResponseSchema.safeParse(payload);
  if (localError.success)
    return { ok: false, message: localError.data.message };

  const accepted = LocalDocCaptureAcceptedResponseSchema.safeParse(payload);
  if (!response.ok || !accepted.success) {
    return {
      ok: false,
      message: `本地服务响应异常（HTTP ${response.status}）。`,
    };
  }

  return {
    ok: true,
    captureId: accepted.data.data.captureId,
    sourceUrl: page.sourceUrl,
  };
}

async function getActiveTab(): Promise<chrome.tabs.Tab | undefined> {
  const [tab] = await chrome.tabs.query({
    active: true,
    currentWindow: true,
  });
  return tab;
}

async function readBatchState(): Promise<BatchState | null> {
  const values = await chrome.storage.local.get(BATCH_STATE_KEY);
  const value = values[BATCH_STATE_KEY];
  return isBatchState(value) ? value : null;
}

async function saveBatchState(state: BatchState): Promise<void> {
  await chrome.storage.local.set({ [BATCH_STATE_KEY]: state });
}

function isBatchState(value: unknown): value is BatchState {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<BatchState>;
  return (
    candidate.version === 3 &&
    typeof candidate.runId === "string" &&
    (candidate.status === "running" ||
      candidate.status === "paused" ||
      candidate.status === "completed" ||
      candidate.status === "stopped") &&
    (candidate.phase === "capturing" ||
      candidate.phase === "waiting-for-navigation") &&
    typeof candidate.tabId === "number" &&
    typeof candidate.scopePrefix === "string" &&
    typeof candidate.maxPages === "number" &&
    typeof candidate.queueIndex === "number" &&
    typeof candidate.queueSize === "number" &&
    Number.isInteger(candidate.queueIndex) &&
    Number.isInteger(candidate.queueSize) &&
    candidate.queueIndex >= 0 &&
    candidate.queueIndex < candidate.queueSize &&
    candidate.queueSize === OFFICIAL_DOC_QUEUE.length &&
    typeof candidate.capturedCount === "number" &&
    typeof candidate.skippedCount === "number" &&
    Array.isArray(candidate.visitedUrls) &&
    candidate.visitedUrls.every((url) => typeof url === "string") &&
    typeof candidate.currentUrl === "string" &&
    (candidate.nextUrl === null || typeof candidate.nextUrl === "string") &&
    (candidate.lastSkippedUrl === null ||
      typeof candidate.lastSkippedUrl === "string") &&
    (candidate.lastSkippedReason === null ||
      typeof candidate.lastSkippedReason === "string") &&
    (candidate.message === null || typeof candidate.message === "string")
  );
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function isExtensionMessage(message: unknown): message is ExtensionMessage {
  if (typeof message !== "object" || message === null || !("type" in message)) {
    return false;
  }
  const type = (message as { type?: unknown }).type;
  return (
    type === "capture-active-tab" ||
    type === "start-batch-capture" ||
    type === "stop-batch-capture" ||
    type === "resume-batch-capture" ||
    type === "get-batch-status"
  );
}
