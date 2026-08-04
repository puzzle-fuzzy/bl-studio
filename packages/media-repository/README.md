# @bailian-studio/media-repository

Repository for media jobs/assets that are outside the generation core. It
provides media task identifiers, lifecycle transitions, and test isolation
helpers.

- Depends on `@bailian-studio/db`, `@bailian-studio/shared`, and
  `@bailian-studio/task-engine`.
- Keep media-job persistence here; do not couple API routes directly to Drizzle
  tables.
- Public types and factories are exported from `src/index.ts`.
