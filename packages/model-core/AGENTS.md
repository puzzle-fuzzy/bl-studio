# Model core boundary

These instructions apply to everything under `packages/model-core`. Read `../../docs/bailian/PACKAGE_BOUNDARY.md` before changing a model manifest or the operation requirement map.

## Ownership

This package is the **single source of truth for model knowledge**: the 51 model manifests (39 enabled; 12 vidu models 暂未开通 / not-yet-activated — parameters, cross-field `rules`, provider `transport`, official `pricing.rates`, `availability`, request bindings, output mapping) and the pure-function layer (`validateModelParams`, `estimateModelCost` / `calculateUsageCostCents`, `classifyTaskStatus`, `assertResponseShape`, `ModelCoreError`) shared by API / worker / web. Git is the version — there is no external SDK, npm publish, or coverage hash ceremony.

## Hard rules

- Never import `@bailian-studio/provider-dashscope` or any other `@bailian-studio/*` beyond `shared`.
- Do not add HTTP clients, environment access, database code, runtime orchestration, or a second contract/pricing table.
- Model knowledge (transport endpoints, error codes, status meanings, prices) lives **in the manifests** — changing it means changing manifest data, not provider/API code.
- **Availability drives runtime visibility.** `MODEL_REGISTRY` holds every manifest, but `listModels()` / `getModelById()` return only `availability.enabled === true`, and `listModelCatalogItems()` projects the whole registry (disabled models appear greyed in the frontend). A model whose Bailian product card is not yet activated (the whole vidu family) must be `enabled: false` with a non-empty `availability.notActivated` reason — `assertAvailability` in `registry-check.ts` enforces `notActivated ⇒ enabled:false`. Submit / worker lookups reject it via `getModelById`. When the product card is activated, flip `enabled: true` to ship it.
- Keep every registered manifest represented exactly once in the Bailian operation requirement map — disabled 暂未开通 models included, since their capabilities still project into the catalog.
- Unknown or retired product parameters must fail validation; never silently discard them.
- A new model requires manifest consistency tests. Do not assume coverage or transport from a similar model name.

Run model-core tests, boundary checks, root typecheck, and root verify after changes.
