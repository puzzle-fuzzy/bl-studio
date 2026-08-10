# Bailian provider contract checklist

This checklist keeps three different signals separate:

1. The repository's offline manifest and fixture matrix.
2. Drift in the official Bailian documentation and compatible chat model list.
3. A real provider canary, which requires credentials and is intentionally run by the operator.

The first two gates are safe to run on Windows and in CI. They do not prove that a live provider request will succeed.

## Before changing a manifest

- Check the relevant snapshot under `docs/bailian/official/raw` and its provenance in `docs/bailian/official/registry.json`.
- Run `pnpm run docs:bailian:snapshot:check` to validate the committed snapshot without network access.
- For compatible chat models, run `pnpm run sync:bailian-docs` with `DASHSCOPE_API_KEY` available. This checks the machine-readable model list only; it does not validate media models or pricing.
- Update the manifest transport, request bindings, response normalization, validation rules, and pricing together. Keep `packages/model-core` as the runtime source of truth.

## Offline regression gate

```powershell
pnpm run check:manifests
pnpm run model:acceptance
pnpm run docs:bailian:snapshot:check
pnpm run verify
```

`pnpm run model:acceptance` builds and parses fixture requests for every enabled manifest. It intentionally does not call Bailian.

## Operator-owned live canary

Run one model at a time after the offline gate:

```powershell
pnpm run model:acceptance -- --live=<model-id>
```

Record the model ID, operation mode, request ID or provider task ID, normalized artifact type, usage/cost result, and provider error code. Do not record API keys, signed URLs, raw private media, or full sensitive prompts. A successful official-document sync or offline fixture run must never be reported as live provider readiness.

If a canary exposes protocol drift, update the manifest and its fixtures first, then repeat the offline gate and the affected live canary. Do not add provider-specific model-ID branches to the worker runner.
