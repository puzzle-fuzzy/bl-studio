# @bailian-studio/model-core

Declarative product model registry. It owns manifests, parameter validation and
defaults, provider request/output requirements, pricing estimates, actual usage
pricing, and registry consistency checks.

- Near-leaf package: no DB, provider SDK, runtime app, Elysia, or React imports.
- Add a model by adding a manifest and registry entry; provider orchestration
  should not gain model-id-specific branches.
- Manifests are deep-frozen at load time. Consumers use `getModelById`,
  `listModels`, validation, and pricing exports from the package root.
