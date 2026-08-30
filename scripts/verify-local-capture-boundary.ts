import { readFile } from "node:fs/promises";
import { join } from "node:path";

const root = process.cwd();
const productionFiles = [
  "apps/api/src/app.ts",
  "apps/api/src/index.ts",
  "apps/api/package.json",
  "packages/db/src/schema.ts",
  "packages/db/src/index.ts",
  "packages/db/package.json",
] as const;
const forbiddenProductionTokens =
  /web[-_]capture|WebCapture|WEB_CAPTURE|browser-extension/iu;

for (const relativePath of productionFiles) {
  const path = join(root, relativePath);
  const content = await readFile(path, "utf8");
  if (forbiddenProductionTokens.test(content)) {
    throw new Error(`正式文件仍包含本地采集实现：${relativePath}`);
  }
}

const extensionPackagePath = join(
  root,
  "apps",
  "browser-extension",
  "package.json",
);
try {
  await readFile(extensionPackagePath, "utf8");
  throw new Error(
    "apps/browser-extension 仍是根工作区包；本地扩展必须位于 tools/。",
  );
}
catch (error) {
  if (error instanceof Error && "code" in error && error.code === "ENOENT") {
    // Expected: the local capture extension lives under tools/ and is not a workspace package.
  }
  else {
    throw error;
  }
}

const rootPackage = JSON.parse(
  await readFile(join(root, "package.json"), "utf8"),
) as { workspaces?: string[] | { packages?: string[] } };
const workspacePatterns = Array.isArray(rootPackage.workspaces)
  ? rootPackage.workspaces
  : rootPackage.workspaces?.packages ?? [];
if (workspacePatterns.some((workspace) => workspace.includes("tools"))) {
  throw new Error("根工作区不能包含 tools/，否则本地采集可能进入正式构建。");
}

console.log("Local capture production boundary: PASS");
