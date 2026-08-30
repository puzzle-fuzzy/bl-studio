# Worker provider integration boundary

These instructions apply to Worker provider runners. Read `../../../../docs/bailian/PACKAGE_BOUNDARY.md` first.

- The Worker coordinates provider execution with task/repository state; it does not own the DashScope HTTP protocol implementation.
- The manifest is the single source of truth: provider request/transport/status contracts live in `@bailian-studio/dashscope-manifests`, while shared validation and pricing live in `@bailian-studio/model-core`. Execute through `@bailian-studio/provider-dashscope` and keep provider-aware classification in the manifest package.
- Never deep-import a package, or call a literal DashScope URL with `fetch`/`Request`.
- Do not duplicate catalog, endpoint, contract, status, error-code, or pricing tables in the runner.
- Convert provider results into the Worker discriminated union and preserve structured bilingual diagnostics. Retry decisions must honor stable provider classifications and task retry budgets.
- Keep dependency injection for transport so tests never need real provider credentials.

Run provider runner tests, Worker tests, boundary checks, root typecheck, and root verify after changes.
