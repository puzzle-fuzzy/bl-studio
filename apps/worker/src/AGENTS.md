# Worker Bailian boundary

These instructions apply to Worker source. Read `../../../docs/bailian/PACKAGE_BOUNDARY.md` first; `providers/AGENTS.md` adds stricter runner rules.

- `bailian-runtime.ts` may read the immutable adapter snapshot for the startup gate; it must not rebuild coverage logic.
- `config.ts` may use the adapter's stable workspace/locale validation helpers; it must not inspect SDK catalog internals.
- Provider HTTP execution belongs under `providers/` through `@bailian-studio/provider-dashscope`.
- Direct imports of `@bailian-studio/provider-dashscope` are limited to `src/providers/`, `src/config.ts`, and test fixtures; task handlers must use the `ProviderRunner` seam.
- Task handlers consume normalized `ProviderRunner` results and composition-root injected `modelRegistry`/`modelCatalog` ports, and own orchestration only. They must not understand SDK payload/response schemas or call DashScope.
- `provider-error-mapping.ts` may convert stable provider errors into task errors; it must not maintain an independent provider error-code catalog.
- Never import the external SDK, use package subpaths, deep-import package sources, or bypass the provider with literal DashScope HTTP calls.
- Keep generation, media, and artifact handlers single-purpose and preserve structured bilingual diagnostics across boundaries.

Worker changes require Worker tests, boundary checks, root typecheck, and DB-backed root verify.
