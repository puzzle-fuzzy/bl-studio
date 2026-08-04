# Generation repository Bailian boundary

These instructions apply to `packages/generation-repository`. The canonical cross-package rules are in `../../docs/bailian/PACKAGE_BOUNDARY.md`.

- This package owns persistence transactions, task/record state transitions, idempotency, and stored cost snapshots.
- Its Bailian adapter usage is intentionally narrow: price estimation/calculation results and the stable adapter error used to map validation failures.
- Never import the Bailian SDK or `@bailian-studio/provider-dashscope`, call DashScope HTTP, resolve provider endpoints, or maintain a second contract/price table.
- Do not move provider response parsing, retry classification, or runtime configuration into the repository.
- Persist money as integer CNY cents and preserve input/output/billed usage separately when supplied.
- Repository changes require DB-backed tests in addition to boundary, typecheck, and root verify gates.
