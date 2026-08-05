# Bailian adapter boundary

These instructions apply to everything under `packages/bailian-adapter`. Read `../../docs/bailian/PACKAGE_BOUNDARY.md` first; it is the canonical boundary specification.

## Ownership

This package is the only anti-corruption layer and the only package allowed to import or declare `@puzzle-fuzzy/bailian-sdk`.

It owns only:

- exact SDK coverage and immutable baseline metadata;
- stable Bailian Studio wrappers for SDK payload/request/response validation;
- trusted endpoint and task lifecycle normalization;
- official pricing lookup/calculation wrappers;
- the read-only contract snapshot exposed to runtime consumers.

## Hard rules

- Import only `@puzzle-fuzzy/bailian-sdk` and `@bailian-studio/model-core`; never add DB, repository, service, Elysia, React, Worker, task-engine, or provider dependencies.
- Do not perform HTTP requests, read environment variables, persist state, schedule retries, or make product workflow decisions here.
- Do not export raw mutable SDK objects or unstable SDK implementation types. Normalize them into this package's stable readonly types.
- Downstream imports must use this package's `src/index.ts` root export. Add intentional public API there; never tell callers to deep-import a file.
- Keep the SDK dependency as `catalog:`. The exact version belongs only in the root workspace catalog.
- For `maintenance: official-sync`, generate `BAILIAN_STUDIO_BAILIAN_COVERAGE_BASELINE` only from the exact installed SDK with `pnpm run bailian:baseline:sync`; never edit generated hashes, counts, or covered IDs. The historical `manual` lane keeps its human-approval requirement.
- Legacy means unverified by Contract v3. Do not route a legacy operation through the SDK contract path without representative compatibility tests and approval.

## Required verification

Run `pnpm --filter @bailian-studio/bailian-adapter test`, `pnpm run check:boundaries`, `pnpm run typecheck:root`, and the root `pnpm run verify` before claiming an adapter change is complete.
