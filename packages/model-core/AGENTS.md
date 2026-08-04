# Model core boundary

These instructions apply to everything under `packages/model-core`. Read `../../docs/bailian/PACKAGE_BOUNDARY.md` before changing a Bailian manifest or operation requirement.

## Ownership

This package owns Bailian Studio's product-facing model identity: product model IDs, capabilities, categories, product parameters/defaults, provider model IDs, execution mode requirements, and declarative manifest bindings.

## Hard rules

- Never import the Bailian SDK, `@bailian-studio/bailian-adapter`, or `@bailian-studio/provider-dashscope`.
- Do not add HTTP clients, environment access, database code, runtime orchestration, or official SDK pricing tables.
- Official request/response fields, error codes, endpoint rules, status meanings, and prices come from the SDK through the adapter.
- Keep every enabled manifest represented exactly once in the Bailian operation requirement map.
- Unknown or retired product parameters must fail validation; never silently discard them.
- A new model requires manifest consistency tests and an explicit Contract v3-covered or legacy decision. Do not assume coverage from a similar model name.

Run model-core tests, boundary checks, root typecheck, and root verify after changes.
