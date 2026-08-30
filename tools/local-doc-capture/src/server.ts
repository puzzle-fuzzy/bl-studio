import { createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import {
  isAllowedLocalDocCaptureUrl,
  LOCAL_DOC_CAPTURE_ALLOWED_ORIGINS,
  LocalDocCaptureAcceptedResponseSchema,
  type LocalDocCaptureRequest,
  LocalDocCaptureRequestSchema,
  normalizeLocalDocCaptureSourceUrl,
} from "./contract";

const toolRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const dataRoot = join(toolRoot, "data");
const capturesRoot = join(dataRoot, "captures");
const tokenPath = join(dataRoot, ".token");
const tokenHeader = "x-local-doc-capture-token";

const responseHeaders = {
  "access-control-allow-headers": `content-type, ${tokenHeader}`,
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-origin": "*",
  "cache-control": "no-store",
  "content-type": "application/json; charset=utf-8",
};

export function hashContent(content: string): string {
  return `sha256:${createHash("sha256").update(content, "utf8").digest("hex")}`;
}

export async function loadOrCreateLocalToken(
  path = tokenPath,
): Promise<string> {
  const configured = Bun.env.LOCAL_DOC_CAPTURE_TOKEN?.trim();
  if (configured) return configured;

  const existing = await readFile(path, "utf8").catch(() => undefined);
  if (existing?.trim()) return existing.trim();

  const token = randomBytes(32).toString("base64url");
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${token}\n`, { encoding: "utf8", flag: "wx" }).catch(
    async (error: unknown) => {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    },
  );
  return (await readFile(path, "utf8")).trim();
}

async function atomicWrite(path: string, content: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = `${path}.${process.pid}.tmp`;
  await writeFile(temporaryPath, content, "utf8");
  await rename(temporaryPath, path);
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: responseHeaders,
  });
}

function localPath(path: string): string {
  return relative(join(toolRoot, "..", ".."), path).replaceAll("\\", "/");
}

async function storeCapture(
  request: LocalDocCaptureRequest,
  outputRoot = capturesRoot,
): Promise<{
  captureId: string;
  markdownPath: string;
}> {
  const captureId = randomUUID();
  const markdownPath = join(outputRoot, `${captureId}.md`);
  const metadataPath = join(outputRoot, `${captureId}.json`);
  const sourceUrl = normalizeLocalDocCaptureSourceUrl(request.sourceUrl);
  const title = request.title.replaceAll(/[\r\n]+/gu, " ").trim();
  const markdown = title
    ? `# ${title}\n\n${request.content}\n`
    : `${request.content}\n`;
  const metadata = {
    schemaVersion: 1,
    captureId,
    sourceUrl,
    title: request.title,
    capturedAt: request.capturedAt,
    contentHash: request.contentHash,
    extensionVersion: request.extensionVersion,
    processedAt: new Date().toISOString(),
  };

  await atomicWrite(markdownPath, markdown);
  await atomicWrite(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`);
  return { captureId, markdownPath: localPath(markdownPath) };
}

export async function handleLocalCaptureRequest(
  request: Request,
  expectedToken: string,
  options: { capturesRoot?: string } = {},
): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: responseHeaders });
  }
  if (
    request.method !== "POST" ||
    new URL(request.url).pathname !== "/capture"
  ) {
    return jsonResponse(
      { ok: false, message: "本地采集服务只接受 POST /capture。" },
      404,
    );
  }
  if (request.headers.get(tokenHeader) !== expectedToken) {
    return jsonResponse({ ok: false, message: "本地采集令牌无效。" }, 401);
  }

  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > 2_000_000) {
    return jsonResponse(
      { ok: false, message: "请求体超过本地采集限制。" },
      413,
    );
  }

  const body = await request.json().catch(() => undefined);
  const parsed = LocalDocCaptureRequestSchema.safeParse(body);
  if (!parsed.success) {
    return jsonResponse(
      { ok: false, message: "本地采集请求不符合约束。" },
      400,
    );
  }

  const capture = parsed.data;
  if (!isAllowedLocalDocCaptureUrl(capture.sourceUrl)) {
    return jsonResponse(
      {
        ok: false,
        message: `只允许采集：${LOCAL_DOC_CAPTURE_ALLOWED_ORIGINS.join(", ")}`,
      },
      403,
    );
  }
  if (hashContent(capture.content) !== capture.contentHash) {
    return jsonResponse({ ok: false, message: "正文哈希校验失败。" }, 400);
  }

  const stored = await storeCapture(capture, options.capturesRoot);
  const response = {
    ok: true,
    data: {
      captureId: stored.captureId,
      status: "stored",
      markdownPath: stored.markdownPath,
    },
  } as const;
  LocalDocCaptureAcceptedResponseSchema.parse(response);
  return jsonResponse(response, 201);
}

async function main(): Promise<void> {
  const token = await loadOrCreateLocalToken();
  const port = Number(Bun.env.LOCAL_DOC_CAPTURE_PORT ?? "43127");
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("LOCAL_DOC_CAPTURE_PORT 必须是 1-65535 的整数。");
  }

  const server = Bun.serve({
    hostname: "127.0.0.1",
    port,
    fetch: (request) => handleLocalCaptureRequest(request, token),
  });
  console.log(`本地文档采集服务已启动：${server.url.origin}`);
  console.log(`仅允许来源：${LOCAL_DOC_CAPTURE_ALLOWED_ORIGINS.join(", ")}`);
  console.log(`本地输出目录：${localPath(capturesRoot)}`);
  console.log(
    "扩展构建：bun run tools/local-doc-capture/extension/scripts/build.ts",
  );
}

if (import.meta.main) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
