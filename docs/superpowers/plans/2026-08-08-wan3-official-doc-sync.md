# Wan 3.0 and Official Bailian Document Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Register the three Wan 3.0 video operations and create a safe 12-hour official Bailian document snapshot workflow that never auto-promotes documentation into runtime manifests.

**Architecture:** Keep `packages/model-core` as the immutable runtime source of truth and split the multi-capability `wan3.0-video` provider contract into three product manifests, matching the existing Wan 2.7 pattern. Add an independent official-document snapshot layer under `docs/bailian/official`, using Aliyun's public navigation and document-detail endpoints, provenance hashes, atomic writes, and a GitHub Actions schedule. The sync layer only updates documentation and metadata; later AI-assisted manifest generation remains a reviewed repository change.

**Tech Stack:** TypeScript, pnpm, Vitest, Node 24 `fetch`, GitHub Actions, `turndown`, `turndown-plugin-gfm`.

## Global Constraints

- Do not let the official document sync modify `packages/model-core/src/manifests`, `registry.ts`, or `bailian-operations.ts`.
- Do not store API keys or print response bodies containing credentials.
- Only accept HTTPS sources on `help.aliyun.com` and the fixed Aliyun navigation endpoint.
- Preserve the previous local snapshot when a sync fails or returns an invalid/incomplete document set.
- Use `wan3.0-video` as the provider model ID for all three product manifests.
- Keep the three Wan 3.0 manifests enabled at `beta` so the user can perform the requested manual smoke tests.

### Task 1: Register Wan 3.0 operations

**Files:**
- Create: `packages/model-core/src/manifests/video/wan3-video.ts`
- Modify: `packages/model-core/src/registry.ts`
- Modify: `packages/model-core/src/bailian-operations.ts`
- Modify: `packages/model-core/src/index.ts`
- Modify: `packages/model-core/tests/bailian-operations.test.ts`
- Modify: `packages/model-core/tests/catalog.test.ts`
- Test: `tests/provider-fixture-compat.test.ts`

**Interfaces:**
- Consumes: the existing `ModelManifest`, `dashscope-video-task` bindings, `media-group` rules, and `wan3.0-video` Hub contract.
- Produces: `wan3T2V`, `wan3I2V`, and `wan3R2V`, each with the provider endpoint, polling contract, parameters, CN pricing, and product operation mapping.

- [ ] **Step 1: Add the shared Wan 3.0 manifest definitions.**
  Use `prompt`, `resolution`, `ratio`, `duration`, `audio`, `seed`, and `watermark` from the Hub contract. Represent `duration` as a `select` with `-1` smart duration plus `2..30` seconds so values `0` and `1` cannot pass local validation. Use `media-group` rules for the optional first/last-frame pair and for reference material totals.

- [ ] **Step 2: Register and map all three product IDs.**
  Add the import, registry entries, barrel exports, and exact operation mappings:
  `wan3-text-to-video → video.text-to-video`, `wan3-image-to-video → video.image-to-video`, and `wan3-reference-to-video → video.reference-to-video`.

- [ ] **Step 3: Add focused contract assertions.**
  Assert the provider model ID, operation mapping, default parameters, media limits, CN prices, and generated request media types. Existing all-enabled fixture coverage must also pass for the new models.

- [ ] **Step 4: Run the focused model tests.**
  Run `pnpm exec vitest run packages/model-core/tests/bailian-operations.test.ts packages/model-core/tests/catalog.test.ts tests/provider-fixture-compat.test.ts infra/scripts/check-model-manifests.test.ts` and expect all tests to pass.

### Task 2: Add official document snapshot synchronization

**Files:**
- Create: `infra/scripts/lib/official-bailian-documents.ts`
- Create: `infra/scripts/sync-bailian-official-docs.ts`
- Create: `infra/scripts/sync-bailian-official-docs.test.ts`
- Create: `docs/bailian/official/README.md`
- Create: `docs/bailian/official/registry.json`
- Create: `docs/bailian/official/sync-state.json`
- Modify: `package.json`
- Modify: `pnpm-workspace.yaml`
- Modify: `pnpm-lock.yaml`

**Interfaces:**
- Consumes: Aliyun model-studio navigation, document-detail JSON, and SSR fallback pages.
- Produces: Markdown source snapshots under `docs/bailian/official/raw`, a validated registry with source URLs/node IDs, SHA-256 content hashes, and sync state. `--check` reports drift without writing; default mode writes atomically.

- [ ] **Step 1: Add trusted navigation and page parsers.**
  Parse the fixed navigation payload, recursively collect valid documents below `/model-studio/model-api-reference`, reject unsafe paths and non-Aliyun URLs, and parse the official JSON page response with the SSR `window.__ICE_PAGE_PROPS__` fallback.

- [ ] **Step 2: Add deterministic Markdown conversion and snapshot writes.**
  Reuse the Hub conversion rules for API tables, fenced code blocks, scripts, SVGs, and GFM. Fetch sequentially with bounded retries and a small delay. Write each document and the registry through temporary files plus rename; only remove files that were previously listed in the managed registry and are no longer official.

- [ ] **Step 3: Add offline tests with mocked fetchers.**
  Cover navigation parsing, trusted-host rejection, page parsing, markdown conversion, atomic no-op behavior, stale detection, and the rule that a failed fetch leaves the old snapshot unchanged. No test may call the real Aliyun service.

- [ ] **Step 4: Add dependencies and scripts.**
  Add `turndown` and `turndown-plugin-gfm` to the workspace catalog/root dev dependencies and add `docs:bailian:sync` plus `docs:bailian:check` scripts.

### Task 3: Schedule and document the sync workflow

**Files:**
- Create: `.github/workflows/bailian-official-docs-sync.yml`
- Modify: `docs/bailian/official/README.md`

**Interfaces:**
- Consumes: `pnpm run docs:bailian:sync` and the existing `main` branch workflow conventions.
- Produces: a scheduled `00:00` and `12:00 UTC` workflow plus manual `workflow_dispatch`; it commits only changed official-document files and refuses to overwrite a concurrently advanced `main` branch.

- [ ] **Step 1: Add the scheduled workflow.**
  Use Node 24, pnpm 10.9.0, frozen install, `permissions: contents: write`, concurrency cancellation disabled, and `cron: '0 */12 * * *'`. No DashScope API key is needed because this sync uses public documentation endpoints.

- [ ] **Step 2: Add the AI handoff contract to the README.**
  Document that official raw Markdown and provenance are inputs for later AI review; the sync job must never generate or register runtime manifests. Explain the review path from source snapshot to candidate manifest to `check:manifests` and manual provider smoke testing.

### Task 4: Verify and hand off manual testing

**Files:**
- No additional source files unless verification finds a contract defect.

- [ ] **Step 1: Run model and boundary checks.**
  Run `pnpm run check:manifests`, `pnpm run check:boundaries`, and `pnpm run typecheck`.

- [ ] **Step 2: Run the focused and root tests.**
  Run the focused tests from Task 1, the sync script tests, and then `pnpm run test:root`.

- [ ] **Step 3: Run a live document sync only after offline checks pass.**
  Run `pnpm run docs:bailian:sync`, inspect the generated document count and diff, and do not claim provider runtime readiness from this documentation sync. The user performs the real Wan 3.0 submit/poll smoke tests.

- [ ] **Step 4: Report changed files, checks, and manual test payloads.**
  Provide the three model IDs, the three representative request shapes, and the exact commands/results needed for the user's manual validation.
