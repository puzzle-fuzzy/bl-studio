# DashScope provider boundary

These instructions apply to everything under `packages/provider-dashscope`. Read `../../docs/bailian/PACKAGE_BOUNDARY.md` first.

## Ownership

This package is the protocol execution layer. It owns request construction, HTTP submit/poll/chat execution, provider response parsing, and provider error classification.

## Hard rules

- Consume `@bailian-studio/bailian-adapter` and `@bailian-studio/model-core` only through package-root exports.
- Never import, declare, dynamically load, or re-export `@puzzle-fuzzy/bailian-sdk`.
- Never deep-import `packages/bailian-adapter/src/*`.
- Do not depend on DB, repositories, task-engine, event-bus, API, Worker, apps, Elysia, or React.
- SDK contract validation, trusted target resolution, lifecycle meaning, and official price authority stay in the adapter. Do not create parallel tables here.
- Product defaults and capability classification stay in `model-core`.
- Business retries, task terminal decisions, persistence, and final cost writes stay in Worker/Repository.
- Keep transport injectable for tests. Never send credentials to a URL that has not passed adapter target validation.

## Required verification

Every wire change needs request/response/error tests and, for Contract v3 operations, `tests/sdk-compatibility.test.ts`. Run this package's tests, boundary checks, root typecheck, and root verify.
