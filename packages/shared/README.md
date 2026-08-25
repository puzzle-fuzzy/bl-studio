# @bailian-studio/shared

Shared cross-layer utilities: structured logging, metrics, runtime validation,
and the cross-layer error base (`BailianStudioError`, `ValidationError`, and
`ErrorCode`).

- The creative asset protocol is owned by
  `@bailian-studio/creative-asset-contracts`. This package may depend on that
  protocol package only to extend the generic generation input validation; it
  must not define or re-export creative asset schemas and types.
- Do not add dependencies on DB, provider, framework, or runtime app packages.
- Domain-specific errors belong to their owning package rather than being
  added here.
