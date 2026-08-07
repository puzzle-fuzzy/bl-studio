# DashScope provider boundary

These instructions apply to everything under `packages/provider-dashscope`. Read `../../docs/bailian/PACKAGE_BOUNDARY.md` first.

## Ownership

This package is the protocol execution layer. It owns request construction, HTTP submit/poll/chat execution, provider response parsing, and provider error classification.

## Hard rules

- Consume `@bailian-studio/model-core` only through the package-root export.
- Never deep-import `packages/*/src/*`.
- Do not depend on DB, repositories, task-engine, event-bus, API, Worker, apps, Elysia, or React.
- Manifest is the single source of truth: endpoint templates, status values, headers, pricing, and parameter constraints all come from the manifest. Do not create parallel tables here.
- Transport target resolution (`resolveSubmit/Poll/CancelTarget`) and trusted-host assertion live in this package; product defaults and capability classification stay in `model-core`.
- Business retries, task terminal decisions, persistence, and final cost writes stay in Worker/Repository.
- Keep transport injectable for tests. Never send credentials to a URL that has not passed trusted-target validation.

## Required verification

Every wire change needs request/response/error tests. Run this package's tests, boundary checks, root typecheck, and root verify.
