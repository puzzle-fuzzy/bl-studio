# @bailian-studio/bailian-adapter

Anti-corruption boundary around `@puzzle-fuzzy/bailian-sdk`. It owns SDK
versioning, catalog coverage, contract validation, endpoint trust checks, and
provider lifecycle mappings.

- It is the only package allowed to import the Bailian SDK.
- Depends on `@bailian-studio/model-core`; it must not import DB, Elysia, React,
  or runtime apps.
- Consumers use only the package-root exports and the documented operation
  capability checks.
