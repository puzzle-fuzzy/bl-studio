# Incremental Official Document Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Persist each successfully fetched Bailian official document immediately while marking incomplete runs as partial checkpoints.

**Architecture:** Keep each Markdown file atomically written after its own successful fetch. Write the current full registry plus a partial sync state after every successful document, then write a complete state only after all documents succeed. Snapshot verification must reject partial states explicitly, so saved progress is visible without being mistaken for a complete official source snapshot.

**Tech Stack:** TypeScript, Node `fs/promises`, pnpm, Vitest.

## Global Constraints

- Never write challenge pages or failed document responses into `docs/bailian/official/raw`.
- Preserve atomic file replacement through the existing temporary-file plus rename helper.
- Preserve absolute and root-relative trusted `help.aliyun.com` URL validation.
- Keep runtime model manifests separate from official documentation snapshots.
- Keep the existing legacy schema-version-1 complete snapshot readable.

### Task 1: Add checkpoint-aware snapshot state and paths

**Files:**
- Modify: `infra/scripts/sync-bailian-official-docs.ts`
- Test: `infra/scripts/sync-bailian-official-docs.test.ts`

**Interfaces:**
- `OfficialSyncState` gains `schemaVersion: 2`, `status: 'partial' | 'complete'`, and `expectedDocumentCount`.
- `SyncOfficialDocumentsOptions` accepts an optional minimum document count and test snapshot paths.
- `verifyOfficialSnapshot` accepts optional snapshot paths and rejects partial states.

- [x] **Step 1: Add a temporary-directory test that fails after the second fetch and asserts the first document is persisted.**
- [x] **Step 2: Run the focused test and confirm the current all-or-nothing implementation fails it.**
- [x] **Step 3: Implement per-document atomic writes and checkpoint metadata after every successful fetch.**
- [x] **Step 4: Mark the state complete only after the entire registry has succeeded; retain legacy schema-version-1 complete snapshot validation.**
- [x] **Step 5: Run the focused test and snapshot validation tests.**

### Task 2: Update documentation and CLI failure reporting

**Files:**
- Modify: `infra/scripts/sync-bailian-official-docs.ts`
- Modify: `docs/bailian/official/README.md`

- [x] **Step 1: Include saved progress and expected/complete counts in interrupted-sync errors.**
- [x] **Step 2: Document that failed runs retain successful documents with `status: partial`, and that a later sync resumes from the saved checkpoint when the current registry is unchanged.**
- [x] **Step 3: Run `pnpm run docs:bailian:snapshot:check` and verify an intentionally partial test fixture is rejected.**

### Task 3: Verify, run local sync, and publish

**Files:**
- No additional source files unless verification finds a regression.

- [x] **Step 1: Run the focused sync tests and root typecheck.**
- [x] **Step 2: Run `pnpm run docs:bailian:sync` locally; confirm successful documents are present even if Aliyun rate limiting interrupts the batch.**
- [x] **Step 3: Inspect `git diff` and confirm no runtime manifest files changed.**
- [ ] **Step 4: Commit and push the implementation.**
