import { mkdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  createOfficialCaptureQueue,
  type OfficialDocumentQueueEntry,
  type OfficialQueueDocument,
} from "../src/official-queue";

const appRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const toolRoot = join(appRoot, "..");
const repositoryRoot = join(toolRoot, "..", "..");
const outputDirectory = join(appRoot, "dist");
const officialRegistryPath = join(
  repositoryRoot,
  "docs",
  "bailian",
  "official",
  "registry.json",
);
const configuredOrigin =
  process.env.LOCAL_DOC_CAPTURE_SERVER_ORIGIN ?? "http://127.0.0.1:43127";
const normalizedOrigin = new URL(configuredOrigin).origin;
const parsedOrigin = new URL(normalizedOrigin);
if (
  parsedOrigin.protocol !== "http:" ||
  parsedOrigin.hostname !== "127.0.0.1"
) {
  throw new Error("本地扩展只能指向 http://127.0.0.1 上的采集服务。");
}
const configuredToken = process.env.LOCAL_DOC_CAPTURE_TOKEN?.trim();
const token =
  configuredToken ??
  (
    await readFile(join(toolRoot, "data", ".token"), "utf8").catch(() => "")
  ).trim();
if (!token) {
  throw new Error(
    "找不到本地采集令牌，请先启动 bun run tools/local-doc-capture/src/server.ts。",
  );
}

const officialQueue = await readOfficialQueue(officialRegistryPath);
console.log(`官方文档采集队列：${officialQueue.length} 个 URL`);

const result = await Bun.build({
  entrypoints: [
    join(appRoot, "src/background.ts"),
    join(appRoot, "src/popup.ts"),
  ],
  outdir: outputDirectory,
  target: "browser",
  define: {
    __LOCAL_CAPTURE_SERVER_ORIGIN__: JSON.stringify(normalizedOrigin),
    __LOCAL_DOC_CAPTURE_TOKEN__: JSON.stringify(token),
    __LOCAL_DOC_CAPTURE_QUEUE__: JSON.stringify(officialQueue),
  },
});

if (!result.success) {
  throw new Error("浏览器扩展构建失败。");
}

await mkdir(outputDirectory, { recursive: true });
const popup = await readFile(join(appRoot, "src/popup.html"), "utf8");
const manifest = JSON.parse(
  await readFile(join(appRoot, "manifest.template.json"), "utf8"),
) as Record<string, unknown>;
manifest.host_permissions = [
  "https://help.aliyun.com/*",
  `${normalizedOrigin}/*`,
];

await Bun.write(join(outputDirectory, "popup.html"), popup);
await Bun.write(
  join(outputDirectory, "manifest.json"),
  `${JSON.stringify(manifest, null, 2)}\n`,
);

async function readOfficialQueue(
  registryPath: string,
): Promise<OfficialDocumentQueueEntry[]> {
  const raw = await readFile(registryPath, "utf8").catch(() => undefined);
  if (raw === undefined) {
    throw new Error(
      `找不到官方文档登记表：${registryPath}。请先运行 bun run docs:bailian:sync。`,
    );
  }

  let value: unknown;
  try {
    value = JSON.parse(raw) as unknown;
  } catch (error) {
    throw new Error("官方文档登记表不是有效 JSON。", { cause: error });
  }
  if (!isRecord(value) || value.schemaVersion !== 1) {
    throw new Error("官方文档登记表 schemaVersion 不受支持。请重新同步。");
  }
  if (value.source !== "https://help.aliyun.com/zh/model-studio") {
    throw new Error("官方文档登记表来源不是百炼模型文档。");
  }
  if (!Array.isArray(value.documents)) {
    throw new Error("官方文档登记表缺少 documents 数组。");
  }

  const documents = value.documents.map((document, index) =>
    parseQueueDocument(document, index),
  );
  const normalizedDocuments = documents.map((document) => ({
    ...document,
    url: trustedOfficialUrl(document.url),
  }));
  const queue = createOfficialCaptureQueue(normalizedDocuments);
  if (queue.length === 0) {
    throw new Error("官方文档登记表没有可采集的模型文档 URL。");
  }
  return queue;
}

function parseQueueDocument(
  value: unknown,
  index: number,
): OfficialQueueDocument {
  if (!isRecord(value)) {
    throw new Error(`官方文档登记表 documents[${index}] 不是对象。`);
  }
  if (
    typeof value.path !== "string" ||
    typeof value.nodeId !== "number" ||
    typeof value.url !== "string" ||
    !Array.isArray(value.navigationPath) ||
    !value.navigationPath.every((segment) => typeof segment === "string") ||
    (value.origin !== "model-api-reference" && value.origin !== "supplemental")
  ) {
    throw new Error(`官方文档登记表 documents[${index}] 字段无效。`);
  }
  return {
    path: value.path,
    nodeId: value.nodeId,
    url: value.url,
    navigationPath: value.navigationPath,
    origin: value.origin,
  };
}

function trustedOfficialUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch (error) {
    throw new Error(`官方文档 URL 无效：${value}`, { cause: error });
  }
  if (
    url.protocol !== "https:" ||
    url.hostname !== "help.aliyun.com" ||
    url.username ||
    url.password
  ) {
    throw new Error(`官方文档 URL 不在精确白名单内：${value}`);
  }
  url.search = "";
  url.hash = "";
  if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/u, "");
  return url.toString();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
