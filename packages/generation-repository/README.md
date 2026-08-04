# @bailian-studio/generation-repository

Persistence seam for the generation lifecycle. It owns generation records,
durable task transitions, idempotency, usage/audit records, artifact and share
lifecycle, and the `generation_events` outbox.

- Depends on `db`, `event-bus`, `model-core`, `task-engine`, and the Bailian
  adapter; runtime apps must use this boundary instead of importing `db`.
- `src/factory.ts` contains runtime `createGenerationRepositoryFromUrl`; test
  database helpers remain isolated in `src/test-utils.ts`.
- `src/notify.ts` owns generation-specific trigger DDL; generic notification
  transport is re-exported from `db`.
- Task claiming uses PostgreSQL row locks and repository methods are the only
  sanctioned state mutation path.
