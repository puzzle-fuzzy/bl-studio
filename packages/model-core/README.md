# @bailian-studio/model-core

Provider-neutral model contracts and pure functions. It owns parameter
validation/defaults, pricing estimates, actual usage pricing, and the manifest
contract. Concrete provider catalogs and provider-aware response/status checks
live in dedicated packages such as `@bailian-studio/dashscope-manifests`.

- Near-leaf package: no DB, provider SDK, runtime app, Elysia, or React imports.
- Provider packages own their manifest registry and deep-freeze policy; adding
  a second provider does not require adding another provider to this package.
- Consumers use validation and pricing exports from this package root, and import
  a provider catalog explicitly when they need provider-specific models.
