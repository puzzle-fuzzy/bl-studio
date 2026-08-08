# TODO Remediation Plan

**Goal:** Review `TODO.md` against the current source and implement every still-real, actionable issue in priority order, while documenting false positives and intentional design decisions.

**Architecture:** Keep authentication responsibilities in `packages/auth`, persistence and migrations in `packages/db`, HTTP wiring in `apps/api`, and user-facing recovery/account controls in `apps/web`. Add explicit password capability state for OAuth-only accounts rather than inferring it from a random password hash. Keep metrics authenticated and non-sensitive. Keep the seven-day absolute session TTL unchanged because changing it to sliding sessions is a product/security policy decision, not a safe bug fix.

**Tech Stack:** Bun/pnpm monorepo, TypeScript, Hono, Drizzle/PostgreSQL, Zod, React/Vite, Vitest, Turbo.

**Global constraints:** Preserve unrelated changes; use the existing migration generator; use official provider documentation for model pricing/IDs; no credentials in logs or metrics; run typecheck, boundary/manifest checks, focused tests, root tests, build, and the repository verification command before committing.

## Priority batches

### P0/P1 — provider facts, auth recovery, and OAuth consistency

1. Verify P1-36 against official Alibaba Model Studio documentation, update the stale Qwen price comment, and mark the DeepSeek V4 model-ID concern as verified rather than changing correct IDs.
2. Add an explicit `passwordAuthEnabled` user capability with a generated Drizzle migration. Normal registration and password reset enable it; GitHub-only registration disables it; password changes return a safe domain error until a password is set.
3. Make GitHub profile email selection require a primary verified email, handle concurrent OAuth user creation/linking without leaking a database unique violation, and add an authenticated unlink flow with a safety guard for accounts that would otherwise lose their only sign-in method.
4. Return server-provided resend cooldown timestamps from the resend endpoint and consume them in the web auth store/check-email UI. Preserve generic login errors while offering a resend path where the current email is known.

### P1 — maintainability and observability

5. Remove the unused ThemeToggle component/import, correct stale admin-route documentation, add Catalog loading/error states, add admin bundle splitting, and make the web coverage command real and part of verification.
6. Expose a redacted admin-only API metrics snapshot and emit worker metrics snapshots on an interval. Add auth-state pruning for expired/revoked sessions and action tokens, invoked by the API maintenance loop.
7. Fix logger cycle tracking so shared non-cyclic objects are not falsely labeled circular, and make console logger tests isolate `LOG_FORMAT` from other test files.

### P2 — cleanup, fixtures, and test coverage

8. Delete the confirmed-unused web UI primitives, remove the unused GenerationDetail import, add focused tests for chunk recovery/presets/logger/worker fixture ownership, and assert integration tests leave no queued tasks.
9. Enforce `expectedWorkerId` in `FakeRepository.saveTask`; document the archived legacy-Vue E2E fixture and the already-consumed generation capability APIs accurately.
10. Review Docker runtime dependency filtering and dependency/dual-Zod notes. Apply the filtered runtime install only if it remains valid for the root migration/runtime scripts; otherwise document why the current install is intentional.

## Verification checkpoints

- After auth/database changes: generate migration, run auth/API focused tests and `pnpm run typecheck`.
- After frontend/worker changes: run package tests, `pnpm run check:boundaries`, and `pnpm run check:manifests`.
- Final: run `pnpm run verify`, `pnpm run build`, inspect `git diff` and `git status`, then commit and push the completed changes to the existing `main` remote as requested by the repository instructions.
