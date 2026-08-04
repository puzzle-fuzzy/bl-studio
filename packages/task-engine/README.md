# @bailian-studio/task-engine

Pure task state machine and retry backoff library. It validates task-domain
pairings, legal transitions, retry limits, and next-run scheduling.

- No DB, provider, framework, or runtime-app dependencies.
- Persistence and worker orchestration stay in repository/worker layers.
- Public API is `transitionTask`, retry helpers, and task domain types from
  `src/index.ts`.
