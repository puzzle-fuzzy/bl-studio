# Model core boundary

These instructions apply to everything under `packages/model-core`. Read `../../docs/bailian/PACKAGE_BOUNDARY.md` before changing a model manifest or the operation requirement map.

## Ownership

This package is the **provider-neutral contract and pure-function layer**: the shared `ModelManifest` shape plus parameter validation, pricing, response-shape checks, task-status classification, and model errors used by API / worker / web. Concrete DashScope model knowledge lives in `@bailian-studio/dashscope-manifests`. Git is the version — there is no external SDK, npm publish, or coverage hash ceremony.

## Hard rules

- Never import `@bailian-studio/provider-dashscope` or any concrete provider catalog.
- Do not add HTTP clients, environment access, database code, runtime orchestration, or a second contract/pricing table.
- Provider model knowledge (transport endpoints, error codes, status meanings, prices) lives **in the provider's manifest package** — changing it means changing manifest data, not API code.
- Unknown or retired product parameters must fail validation; never silently discard them.
- A new model requires manifest consistency tests. Do not assume coverage or transport from a similar model name.

Run model-core tests, boundary checks, root typecheck, and root verify after changes.
