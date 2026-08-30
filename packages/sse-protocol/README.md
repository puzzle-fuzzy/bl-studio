# @bailian-studio/sse-protocol

Pure domain contracts for generation events and SSE encoding. It defines the
event map, status vocabulary, channel naming, event construction, and wire
encoding.

- Leaf package with no database, provider, Elysia, React, or runtime-app
  dependencies.
- Consumed by the API event listener/SSE hub and repository contracts.
- Public API is the package-root exports in `src/index.ts`.
