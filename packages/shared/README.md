# @bailian-studio/shared

Lowest-level shared utilities: structured logging, metrics, runtime validation,
and the cross-layer error base (`BailianStudioError`, `ValidationError`, and
`ErrorCode`).

- Must remain a leaf package and may not import another `@bailian-studio/*`
  package, DB, provider, framework, or runtime app.
- Domain-specific errors belong to their owning package rather than being
  added here.
