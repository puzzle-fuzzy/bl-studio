# Worker provider integration boundary

These instructions apply to Worker provider runners. Read `../../../../docs/bailian/PACKAGE_BOUNDARY.md` first.

- The Worker coordinates provider execution with task/repository state; it does not own the SDK contract or HTTP protocol implementation.
- Import adapter and provider only from `@bailian-studio/bailian-adapter` and `@bailian-studio/provider-dashscope` package roots.
- Never import `@puzzle-fuzzy/bailian-sdk`, deep-import either package, or call a literal DashScope URL with `fetch`/`Request`.
- Do not duplicate catalog, endpoint, contract, status, error-code, or pricing tables in the runner.
- Convert provider results into the Worker discriminated union and preserve structured bilingual diagnostics. Retry decisions must honor stable provider/adapter classifications and task retry budgets.
- Keep dependency injection for transport so tests never need real provider credentials.

Run provider runner tests, Worker tests, boundary checks, root typecheck, and root verify after changes.
