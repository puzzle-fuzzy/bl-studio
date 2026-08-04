# @bailian-studio/auth

Authentication service for the API. It owns password hashing, JWT session
signing/verification, and the Drizzle-backed user/session repository.

- Depends on `@bailian-studio/db` and `@bailian-studio/shared`.
- Consumed by `apps/api`; workers and frontends must not depend on it.
- Public wiring: `createAuthServiceFromUrl`, `createAuthService`, and the
  password/JWT primitives exported from `src/index.ts`.
- Never log or persist plaintext passwords or session tokens.
