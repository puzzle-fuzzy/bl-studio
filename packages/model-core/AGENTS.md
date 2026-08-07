# Model core boundary

These instructions apply to everything under `packages/model-core`. Read `../../docs/bailian/PACKAGE_BOUNDARY.md` before changing a model manifest or the operation requirement map.

## Ownership

This package is the **single source of truth for model knowledge**: the 45 model manifests (parameters, cross-field `rules`, provider `transport`, official `pricing.rates`, request bindings, output mapping) and the pure-function layer (`validateModelParams`, `estimateModelCost` / `calculateUsageCostCents`, `classifyTaskStatus`, `assertResponseShape`, `ModelCoreError`) shared by API / worker / web. Git is the version — there is no external SDK, npm publish, or coverage hash ceremony.

## Hard rules

- Never import `@bailian-studio/provider-dashscope` or any other `@bailian-studio/*` beyond `shared`.
- Do not add HTTP clients, environment access, database code, runtime orchestration, or a second contract/pricing table.
- Model knowledge (transport endpoints, error codes, status meanings, prices) lives **in the manifests** — changing it means changing manifest data, not provider/API code.
- Keep every enabled manifest represented exactly once in the Bailian operation requirement map.
- Unknown or retired product parameters must fail validation; never silently discard them.
- A new model requires manifest consistency tests. Do not assume coverage or transport from a similar model name.

Run model-core tests, boundary checks, root typecheck, and root verify after changes.
