import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export interface ModelSyncPaths {
  registryPath: string;
  capturesPath: string;
  statePath: string;
}

export const DEFAULT_MODEL_SYNC_PATHS: ModelSyncPaths = {
  registryPath: join("docs", "bailian", "official", "registry.json"),
  capturesPath: join("tools", "local-doc-capture", "data", "captures"),
  statePath: join(
    "tools",
    "local-doc-capture",
    "data",
    "model-sync-state.json",
  ),
};

export type ModelSyncPriority = "focus" | "reference" | "skip";
export type ModelSyncStatus =
  | "pending"
  | "reviewing"
  | "updated"
  | "verified"
  | "blocked"
  | "skipped";

export interface ModelSyncCapture {
  count: number;
  latestCaptureId: string;
  latestCapturedAt: string;
  contentHash: string;
}

export type ModelManifestChangeAction =
  | "none"
  | "created"
  | "updated"
  | "unchanged";

export interface ModelManifestChange {
  action: ModelManifestChangeAction;
  modelIds: string[];
  files: string[];
  summary?: string;
}

export type ModelSyncTestResultStatus =
  | "passed"
  | "failed"
  | "blocked"
  | "not-run";

export interface ModelSyncTestResult {
  command: string;
  status: ModelSyncTestResultStatus;
  recordedAt: string;
  note?: string;
}

export interface ModelSyncCommit {
  sha: string;
  message: string;
  pushed: boolean;
  recordedAt: string;
}

export interface ModelSyncRun {
  status: "in-progress" | "complete" | "blocked";
  startedAt: string;
  completedAt?: string;
  tests: ModelSyncTestResult[];
  commit: ModelSyncCommit | null;
}

export interface ModelSyncItem {
  path: string;
  url: string;
  title: string;
  priority: ModelSyncPriority;
  classificationReason: string;
  documentHash: string | null;
  capture: ModelSyncCapture | null;
  status: ModelSyncStatus;
  manifest?: ModelManifestChange;
  note?: string;
}

export interface ModelSyncState {
  schemaVersion: 2;
  updatedAt: string;
  source: {
    registryPath: string;
    registryHash: string;
    snapshotHash: string;
    registryDocumentCount: number;
    captureFileCount: number;
    captureSourceUrlCount: number;
  };
  counts: Record<ModelSyncPriority, number>;
  run: ModelSyncRun;
  items: ModelSyncItem[];
}

type OfficialRegistry = {
  documents: Array<{
    path: string;
    url: string;
    navigationPath?: string[];
  }>;
};

type CaptureMetadata = {
  captureId: string;
  sourceUrl: string;
  title: string;
  capturedAt: string;
  contentHash: string;
};

type CaptureIndexEntry = {
  count: number;
  latest: CaptureMetadata;
};

const focusDocuments = new Map<string, string>([
  [
    "万相/3049634-万相3.0-视频生成.md",
    "当前创作链路的主视频模型 API，包含文生视频、图生视频和异步任务限制",
  ],
  [
    "千问/3047054-千问-图像生成与编辑3.0.md",
    "当前创作链路的主图像模型 API，包含文生图、图生图和参数限制",
  ],
  [
    "更多/3042878-查询模型列表.md",
    "模型目录的官方发现入口，用于确认最新模型 ID 和模态能力",
  ],
  [
    "更多/3042879-查询模型限流.md",
    "模型调用限制的官方查询入口，用于补充服务端限流事实",
  ],
  ["更多/3050809-查询模型授权.md", "模型可用性和授权状态的官方查询入口"],
  [
    "更多/2858866-管理异步任务.md",
    "视频和图像异步任务的查询、取消及状态处理基础",
  ],
  [
    "更多/2869454-上传文件获取临时URL.md",
    "向图像/视频模型提交用户素材前所需的临时 URL 能力",
  ],
  [
    "使用 API/2712195-获取与配置 API Key.md",
    "Provider 调用所需的 API Key 配置边界",
  ],
  ["使用 API/2712216-错误码.md", "统一 Provider 错误映射和可重试性判断的基础"],
]);

const skipPattern =
  /python|java|android|ios|c\+\+|electron|linux|\bsdk\b|\bcli\b|部署|调优|微调|fine[-_ ]?tun|checkpoint|模型压缩|模型导入|计费|计价|价格|账单|套餐|充值|费用|billing|pricing|model-pricing|早期|legacy/iu;

export function classifyModelSyncDocument(document: {
  path: string;
  title?: string;
}): { priority: ModelSyncPriority; reason: string } {
  const focusReason = focusDocuments.get(document.path);
  if (focusReason !== undefined)
    return { priority: "focus", reason: focusReason };

  const searchableText = `${document.path}\n${document.title ?? ""}`;
  if (skipPattern.test(searchableText)) {
    return {
      priority: "skip",
      reason:
        "当前阶段不处理 Python/其他语言 SDK、部署、调优、导入、压缩和计费类资料",
    };
  }

  return {
    priority: "reference",
    reason: "保留为后续参考，不进入当前重点 Manifest 更新队列",
  };
}

function hash(value: string): string {
  return `sha256:${createHash("sha256").update(value, "utf8").digest("hex")}`;
}

function createRun(startedAt = new Date().toISOString()): ModelSyncRun {
  return {
    status: "in-progress",
    startedAt,
    tests: [],
    commit: null,
  };
}

function normalizeManifestChange(
  value: unknown,
): ModelManifestChange | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const candidate = value as Partial<ModelManifestChange>;
  if (
    candidate.action !== "none" &&
    candidate.action !== "created" &&
    candidate.action !== "updated" &&
    candidate.action !== "unchanged"
  )
    return undefined;
  const modelIds = Array.isArray(candidate.modelIds)
    ? candidate.modelIds.filter(
        (item): item is string => typeof item === "string",
      )
    : [];
  const files = Array.isArray(candidate.files)
    ? candidate.files.filter((item): item is string => typeof item === "string")
    : [];
  return {
    action: candidate.action,
    modelIds,
    files,
    ...(typeof candidate.summary === "string"
      ? { summary: candidate.summary }
      : {}),
  };
}

function isTestResultStatus(
  value: unknown,
): value is ModelSyncTestResultStatus {
  return (
    value === "passed" ||
    value === "failed" ||
    value === "blocked" ||
    value === "not-run"
  );
}

function normalizeRun(value: unknown, fallbackStartedAt: string): ModelSyncRun {
  if (typeof value !== "object" || value === null)
    return createRun(fallbackStartedAt);
  const candidate = value as Partial<ModelSyncRun>;
  const tests = Array.isArray(candidate.tests)
    ? candidate.tests.flatMap((item) => {
        if (typeof item !== "object" || item === null) return [];
        const test = item as Partial<ModelSyncTestResult>;
        if (
          typeof test.command !== "string" ||
          !isTestResultStatus(test.status) ||
          typeof test.recordedAt !== "string"
        )
          return [];
        return [
          {
            command: test.command,
            status: test.status,
            recordedAt: test.recordedAt,
            ...(typeof test.note === "string" ? { note: test.note } : {}),
          },
        ];
      })
    : [];
  const rawCommit = candidate.commit;
  const commit =
    typeof rawCommit === "object" && rawCommit !== null
      ? (() => {
          const item = rawCommit as Partial<ModelSyncCommit>;
          return typeof item.sha === "string" &&
            typeof item.message === "string" &&
            typeof item.pushed === "boolean" &&
            typeof item.recordedAt === "string"
            ? {
                sha: item.sha,
                message: item.message,
                pushed: item.pushed,
                recordedAt: item.recordedAt,
              }
            : null;
        })()
      : null;
  return {
    status:
      candidate.status === "complete" || candidate.status === "blocked"
        ? candidate.status
        : "in-progress",
    startedAt:
      typeof candidate.startedAt === "string"
        ? candidate.startedAt
        : fallbackStartedAt,
    ...(typeof candidate.completedAt === "string"
      ? { completedAt: candidate.completedAt }
      : {}),
    tests,
    commit,
  };
}

function migratePreviousState(value: unknown): ModelSyncState | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const candidate = value as Partial<ModelSyncState>;
  if (!Array.isArray(candidate.items) || typeof candidate.source !== "object")
    return undefined;
  const source = candidate.source as Partial<ModelSyncState["source"]>;
  if (
    typeof source.registryPath !== "string" ||
    typeof source.registryHash !== "string" ||
    typeof source.registryDocumentCount !== "number" ||
    typeof source.captureFileCount !== "number" ||
    typeof source.captureSourceUrlCount !== "number"
  )
    return undefined;
  const fallbackStartedAt =
    typeof candidate.updatedAt === "string"
      ? candidate.updatedAt
      : new Date(0).toISOString();
  const items = candidate.items.flatMap((value) => {
    if (typeof value !== "object" || value === null) return [];
    const item = value as Partial<ModelSyncItem>;
    if (
      typeof item.path !== "string" ||
      typeof item.url !== "string" ||
      typeof item.title !== "string" ||
      (item.priority !== "focus" &&
        item.priority !== "reference" &&
        item.priority !== "skip") ||
      typeof item.classificationReason !== "string" ||
      !isStatus(item.status)
    )
      return [];
    const rawCapture = item.capture;
    const capture =
      typeof rawCapture === "object" && rawCapture !== null
        ? (rawCapture as ModelSyncCapture)
        : null;
    const documentHash =
      typeof item.documentHash === "string"
        ? item.documentHash
        : (capture?.contentHash ?? null);
    return [
      {
        path: item.path,
        url: item.url,
        title: item.title,
        priority: item.priority,
        classificationReason: item.classificationReason,
        documentHash,
        capture,
        status: item.status,
        ...(normalizeManifestChange(item.manifest) === undefined
          ? {}
          : { manifest: normalizeManifestChange(item.manifest) }),
        ...(typeof item.note === "string" ? { note: item.note } : {}),
      },
    ];
  });
  const counts = {
    focus: items.filter((item) => item.priority === "focus").length,
    reference: items.filter((item) => item.priority === "reference").length,
    skip: items.filter((item) => item.priority === "skip").length,
  } satisfies Record<ModelSyncPriority, number>;
  return {
    schemaVersion: 2,
    updatedAt:
      typeof candidate.updatedAt === "string"
        ? candidate.updatedAt
        : fallbackStartedAt,
    source: {
      registryPath: source.registryPath,
      registryHash: source.registryHash,
      snapshotHash:
        typeof source.snapshotHash === "string"
          ? source.snapshotHash
          : source.registryHash,
      registryDocumentCount: source.registryDocumentCount,
      captureFileCount: source.captureFileCount,
      captureSourceUrlCount: source.captureSourceUrlCount,
    },
    counts,
    run: normalizeRun(candidate.run, fallbackStartedAt),
    items,
  };
}

function canonicalizeUrl(value: string): string {
  const url = new URL(value);
  url.hash = "";
  url.search = "";
  if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/u, "");
  return url.toString();
}

function isCaptureMetadata(value: unknown): value is CaptureMetadata {
  if (typeof value !== "object" || value === null) return false;
  const item = value as Partial<CaptureMetadata>;
  return (
    typeof item.captureId === "string" &&
    typeof item.sourceUrl === "string" &&
    typeof item.title === "string" &&
    typeof item.capturedAt === "string" &&
    typeof item.contentHash === "string"
  );
}

async function readCaptureIndex(capturesRoot: string): Promise<{
  entries: Map<string, CaptureIndexEntry>;
  fileCount: number;
  sourceUrlCount: number;
}> {
  const entries = new Map<string, CaptureIndexEntry>();
  const names = await readdir(capturesRoot).catch(() => [] as string[]);
  const metadataNames = names.filter((name) => name.endsWith(".json"));
  for (const name of metadataNames) {
    const raw = await readFile(join(capturesRoot, name), "utf8").catch(
      () => undefined,
    );
    if (raw === undefined) continue;
    let value: unknown;
    try {
      value = JSON.parse(raw) as unknown;
    } catch {
      continue;
    }
    if (!isCaptureMetadata(value)) continue;
    let sourceUrl: string;
    try {
      sourceUrl = canonicalizeUrl(value.sourceUrl);
    } catch {
      continue;
    }
    const current = entries.get(sourceUrl);
    if (current === undefined) {
      entries.set(sourceUrl, { count: 1, latest: value });
      continue;
    }
    current.count += 1;
    if (value.capturedAt > current.latest.capturedAt) current.latest = value;
  }
  return {
    entries,
    fileCount: metadataNames.length,
    sourceUrlCount: entries.size,
  };
}

async function readPreviousState(
  stateFile: string,
): Promise<ModelSyncState | undefined> {
  const raw = await readFile(stateFile, "utf8").catch(() => undefined);
  if (raw === undefined) return undefined;
  try {
    return migratePreviousState(JSON.parse(raw) as unknown);
  } catch {
    return undefined;
  }
}

async function atomicWrite(path: string, content: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = `${path}.${process.pid}.tmp`;
  await writeFile(temporaryPath, content, "utf8");
  await rename(temporaryPath, path);
}

function itemDocumentHash(item: ModelSyncItem | undefined): string | null {
  return item?.documentHash ?? item?.capture?.contentHash ?? null;
}

function refreshRunStatus(
  state: ModelSyncState,
  now = new Date().toISOString(),
): void {
  const focusItems = state.items.filter((item) => item.priority === "focus");
  const hasBlockedItem = focusItems.some((item) => item.status === "blocked");
  const hasFailedTest = state.run.tests.some(
    (test) => test.status === "failed" || test.status === "blocked",
  );
  const allFocusVerified =
    focusItems.length > 0 &&
    focusItems.every((item) => item.status === "verified");
  const allManifestRecordsPresent = focusItems.every(
    (item) => item.manifest !== undefined,
  );
  const allTestsPassed =
    state.run.tests.length > 0 &&
    state.run.tests.every((test) => test.status === "passed");
  const canComplete =
    allFocusVerified &&
    allManifestRecordsPresent &&
    allTestsPassed &&
    state.run.commit !== null;

  if (canComplete) {
    state.run.status = "complete";
    state.run.completedAt ??= now;
    return;
  }

  state.run.status =
    hasBlockedItem || hasFailedTest ? "blocked" : "in-progress";
  delete state.run.completedAt;
}

function snapshotHash(
  registryHash: string,
  items: readonly ModelSyncItem[],
): string {
  const documentHashes = items
    .map((item) => `${item.path}\u0000${item.documentHash ?? "missing"}`)
    .sort((left, right) => left.localeCompare(right, "zh-CN"));
  return hash([registryHash, ...documentHashes].join("\n"));
}

async function writeState(
  paths: ModelSyncPaths,
  state: ModelSyncState,
): Promise<void> {
  await atomicWrite(paths.statePath, `${JSON.stringify(state, null, 2)}\n`);
}

export async function createOrRefreshModelSyncState(
  paths: ModelSyncPaths = DEFAULT_MODEL_SYNC_PATHS,
): Promise<ModelSyncState> {
  const registryRaw = await readFile(paths.registryPath, "utf8");
  const registry = JSON.parse(registryRaw) as OfficialRegistry;
  const captureIndex = await readCaptureIndex(paths.capturesPath);
  const previous = await readPreviousState(paths.statePath);
  const previousItems = new Map(
    previous?.items.map((item) => [item.path, item]) ?? [],
  );
  let focusSourceChanged = previous === undefined;
  const items = registry.documents.map((document) => {
    const classification = classifyModelSyncDocument(document);
    const captureEntry = captureIndex.entries.get(
      canonicalizeUrl(document.url),
    );
    const capture =
      captureEntry === undefined
        ? null
        : {
            count: captureEntry.count,
            latestCaptureId: captureEntry.latest.captureId,
            latestCapturedAt: captureEntry.latest.capturedAt,
            contentHash: captureEntry.latest.contentHash,
          };
    const prior = previousItems.get(document.path);
    const documentHash = capture?.contentHash ?? null;
    const sourceUnchanged =
      prior !== undefined &&
      prior.url === document.url &&
      prior.priority === classification.priority &&
      itemDocumentHash(prior) === documentHash;
    if (classification.priority === "focus" && !sourceUnchanged)
      focusSourceChanged = true;
    const defaultStatus: ModelSyncStatus =
      classification.priority === "skip"
        ? "skipped"
        : capture === null
          ? "blocked"
          : "pending";
    const status =
      sourceUnchanged && prior !== undefined ? prior.status : defaultStatus;
    const note = sourceUnchanged ? prior?.note : undefined;
    return {
      path: document.path,
      url: document.url,
      title: document.navigationPath?.at(-1) ?? document.path,
      priority: classification.priority,
      classificationReason: classification.reason,
      documentHash,
      capture,
      status,
      ...(sourceUnchanged && prior?.manifest === undefined
        ? {}
        : sourceUnchanged && prior?.manifest !== undefined
          ? { manifest: prior.manifest }
          : {}),
      ...(note === undefined ? {} : { note }),
    } satisfies ModelSyncItem;
  });
  const counts = {
    focus: items.filter((item) => item.priority === "focus").length,
    reference: items.filter((item) => item.priority === "reference").length,
    skip: items.filter((item) => item.priority === "skip").length,
  } satisfies Record<ModelSyncPriority, number>;
  const now = new Date().toISOString();
  const run =
    previous === undefined || focusSourceChanged
      ? createRun(now)
      : normalizeRun(previous.run, now);
  const state = {
    schemaVersion: 2,
    updatedAt: now,
    source: {
      registryPath: paths.registryPath,
      registryHash: hash(registryRaw),
      snapshotHash: snapshotHash(hash(registryRaw), items),
      registryDocumentCount: registry.documents.length,
      captureFileCount: captureIndex.fileCount,
      captureSourceUrlCount: captureIndex.sourceUrlCount,
    },
    counts,
    run,
    items,
  } satisfies ModelSyncState;
  refreshRunStatus(state, now);
  await writeState(paths, state);
  return state;
}

function requiredArgument(name: string, args: readonly string[]): string {
  const value = args.find((arg) => arg.startsWith(`${name}=`));
  if (value === undefined || value.slice(name.length + 1).trim() === "")
    throw new Error(`缺少参数 ${name}=...`);
  return value.slice(name.length + 1);
}

function isStatus(value: unknown): value is ModelSyncStatus {
  return (
    typeof value === "string" &&
    [
      "pending",
      "reviewing",
      "updated",
      "verified",
      "blocked",
      "skipped",
    ].includes(value)
  );
}

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function commaSeparatedArgument(
  name: string,
  args: readonly string[],
): string[] {
  const value = args.find((arg) => arg.startsWith(`${name}=`));
  if (value === undefined) return [];
  return uniqueStrings(value.slice(name.length + 1).split(","));
}

function optionalArgument(
  name: string,
  args: readonly string[],
): string | undefined {
  const value = args.find((arg) => arg.startsWith(`${name}=`));
  return value === undefined ? undefined : value.slice(name.length + 1);
}

async function readRequiredState(
  paths: ModelSyncPaths,
): Promise<ModelSyncState> {
  const state = await readPreviousState(paths.statePath);
  if (state === undefined) throw new Error("进度账本不存在，请先执行 --init");
  return state;
}

function findItem(state: ModelSyncState, documentPath: string): ModelSyncItem {
  const item = state.items.find((candidate) => candidate.path === documentPath);
  if (item === undefined) throw new Error(`进度账本中不存在：${documentPath}`);
  return item;
}

async function persistState(
  paths: ModelSyncPaths,
  state: ModelSyncState,
): Promise<void> {
  state.updatedAt = new Date().toISOString();
  refreshRunStatus(state, state.updatedAt);
  await writeState(paths, state);
}

export async function setModelSyncItemStatus(
  documentPath: string,
  status: ModelSyncStatus,
  note: string | undefined = undefined,
  paths: ModelSyncPaths = DEFAULT_MODEL_SYNC_PATHS,
): Promise<void> {
  const state = await readRequiredState(paths);
  const item = findItem(state, documentPath);
  item.status = status;
  if (note !== undefined) item.note = note;
  await persistState(paths, state);
}

export interface RecordManifestChangeInput {
  documentPath: string;
  action: ModelManifestChangeAction;
  modelIds: string[];
  files: string[];
  summary?: string;
  status?: ModelSyncStatus;
}

export async function recordManifestChange(
  input: RecordManifestChangeInput,
  paths: ModelSyncPaths = DEFAULT_MODEL_SYNC_PATHS,
): Promise<void> {
  const state = await readRequiredState(paths);
  const item = findItem(state, input.documentPath);
  item.manifest = {
    action: input.action,
    modelIds: uniqueStrings(input.modelIds),
    files: uniqueStrings(input.files),
    ...(input.summary === undefined ? {} : { summary: input.summary }),
  };
  if (input.status !== undefined) item.status = input.status;
  else if (input.action === "created" || input.action === "updated")
    item.status = "updated";
  await persistState(paths, state);
}

export interface RecordModelSyncTestInput {
  command: string;
  status: ModelSyncTestResultStatus;
  note?: string;
}

export async function recordModelSyncTest(
  input: RecordModelSyncTestInput,
  paths: ModelSyncPaths = DEFAULT_MODEL_SYNC_PATHS,
): Promise<void> {
  const state = await readRequiredState(paths);
  const result: ModelSyncTestResult = {
    command: input.command,
    status: input.status,
    recordedAt: new Date().toISOString(),
    ...(input.note === undefined ? {} : { note: input.note }),
  };
  const existingIndex = state.run.tests.findIndex(
    (test) => test.command === input.command,
  );
  if (existingIndex === -1) state.run.tests.push(result);
  else state.run.tests[existingIndex] = result;
  await persistState(paths, state);
}

export interface RecordModelSyncCommitInput {
  sha: string;
  message: string;
  pushed: boolean;
}

export async function recordModelSyncCommit(
  input: RecordModelSyncCommitInput,
  paths: ModelSyncPaths = DEFAULT_MODEL_SYNC_PATHS,
): Promise<void> {
  if (!/^[0-9a-f]{7,40}$/iu.test(input.sha))
    throw new Error("提交 SHA 必须是 7 至 40 位十六进制字符串");
  const state = await readRequiredState(paths);
  state.run.commit = {
    sha: input.sha,
    message: input.message,
    pushed: input.pushed,
    recordedAt: new Date().toISOString(),
  };
  await persistState(paths, state);
}

function printStatus(state: ModelSyncState): void {
  const summarize = (priority: ModelSyncPriority) => {
    const items = state.items.filter((item) => item.priority === priority);
    return {
      total: items.length,
      pending: items.filter((item) => item.status === "pending").length,
      reviewing: items.filter((item) => item.status === "reviewing").length,
      updated: items.filter((item) => item.status === "updated").length,
      verified: items.filter((item) => item.status === "verified").length,
      blocked: items.filter((item) => item.status === "blocked").length,
      skipped: items.filter((item) => item.status === "skipped").length,
    };
  };
  console.log(
    JSON.stringify(
      {
        updatedAt: state.updatedAt,
        source: state.source,
        run: state.run,
        focus: summarize("focus"),
        reference: summarize("reference"),
        skip: summarize("skip"),
      },
      null,
      2,
    ),
  );
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.includes("--init")) {
    const state = await createOrRefreshModelSyncState(DEFAULT_MODEL_SYNC_PATHS);
    printStatus(state);
    return;
  }
  const state = await readRequiredState(DEFAULT_MODEL_SYNC_PATHS);
  if (args.includes("--status")) {
    printStatus(state);
    return;
  }
  if (args.includes("--next")) {
    console.log(
      JSON.stringify(
        state.items.filter(
          (item) =>
            item.priority === "focus" &&
            ["pending", "reviewing", "updated", "blocked"].includes(
              item.status,
            ),
        ),
        null,
        2,
      ),
    );
    return;
  }
  if (args.includes("--set")) {
    const documentPath = requiredArgument("--path", args);
    const rawStatus = requiredArgument("--status", args);
    if (!isStatus(rawStatus)) throw new Error(`不支持的状态：${rawStatus}`);
    await setModelSyncItemStatus(
      documentPath,
      rawStatus,
      optionalArgument("--note", args),
    );
    return;
  }
  if (args.includes("--manifest")) {
    const rawAction = requiredArgument("--manifest-action", args);
    if (
      rawAction !== "none" &&
      rawAction !== "created" &&
      rawAction !== "updated" &&
      rawAction !== "unchanged"
    )
      throw new Error(`不支持的 Manifest 修改动作：${rawAction}`);
    const rawStatus = optionalArgument("--item-status", args);
    if (rawStatus !== undefined && !isStatus(rawStatus))
      throw new Error(`不支持的状态：${rawStatus}`);
    await recordManifestChange({
      documentPath: requiredArgument("--path", args),
      action: rawAction,
      modelIds: commaSeparatedArgument("--model-ids", args),
      files: commaSeparatedArgument("--manifest-files", args),
      summary: optionalArgument("--summary", args),
      ...(rawStatus === undefined ? {} : { status: rawStatus }),
    });
    return;
  }
  if (args.includes("--test")) {
    const rawResult = requiredArgument("--result", args);
    if (!isTestResultStatus(rawResult))
      throw new Error(`不支持的测试结果：${rawResult}`);
    await recordModelSyncTest({
      command: requiredArgument("--command", args),
      status: rawResult,
      note: optionalArgument("--note", args),
    });
    return;
  }
  if (args.includes("--commit")) {
    const pushed = optionalArgument("--pushed", args);
    if (pushed !== undefined && pushed !== "true" && pushed !== "false")
      throw new Error("--pushed 只能是 true 或 false");
    await recordModelSyncCommit({
      sha: requiredArgument("--sha", args),
      message: requiredArgument("--message", args),
      pushed: pushed === "true",
    });
    return;
  }
  throw new Error(
    "用法：--init | --status | --next | --set | --manifest | --test | --commit",
  );
}

if (import.meta.main) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
