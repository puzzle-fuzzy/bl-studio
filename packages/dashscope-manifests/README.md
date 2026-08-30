# @bailian-studio/dashscope-manifests

DashScope-specific model catalog and manifest registry. It owns the concrete
Bailian model definitions, availability catalog, operation capability map, and
manifest consistency checks.

- Depends on the provider-neutral `@bailian-studio/model-core` contract and
  pure validation/pricing functions.
- This package is the composition root for the current DashScope catalog; the
  generic model-core package does not load provider model data.
- Public API is the package-root export in `src/index.ts`.
