# @bailian-studio/dashscope-manifests

DashScope-specific model catalog and manifest registry. It owns the concrete
Bailian model definitions, availability catalog, operation capability map,
manifest consistency checks, and DashScope response/status checks.

- Depends on the provider-neutral `@bailian-studio/model-core` contract and
  pure validation/pricing functions.
- This package is the composition root for the current DashScope catalog; the
  generic model-core package does not load provider model data.
- `DashScopeModelManifest` explicitly composes the current provider-specific
  mapping types with the generic model-core contract.
- Public API is the package-root export in `src/index.ts`.
