# @bailian-studio/generation-repository

Persistence seam for the generation lifecycle. It owns generation records,
durable task transitions, idempotency, usage/audit records, artifact and share
lifecycle, and the `generation_events` outbox.

- Depends on `db`, `sse-protocol`, `model-core`, and `task-engine`; the model
  catalog is supplied through the injected `ModelManifestResolver` port, so
  this repository stays provider-neutral.
- The DashScope catalog is a test-only dependency for `src/test-utils.ts` and
  package tests; runtime wiring must always provide `modelResolver` explicitly.
- `src/factory.ts` contains runtime `createGenerationRepositoryFromUrl`; test
  database helpers remain isolated in `src/test-utils.ts`.
- `src/notify.ts` owns generation-specific trigger DDL; generic notification
  transport is re-exported from `db`.
- Task claiming uses PostgreSQL row locks and repository methods are the only
  sanctioned state mutation path.
