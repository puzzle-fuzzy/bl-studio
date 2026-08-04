# @bailian-studio/db

Drizzle schema and database transport primitives. This package owns table
definitions, the `createDb` connection factory, and generic PostgreSQL
`LISTEN`/`NOTIFY` transport.

- Schema-only/data-access foundation; it does not own generation workflows or
  application use cases.
- Runtime apps must reach persistence through a repository/service boundary;
  they must not import this package directly.
- Generation event trigger DDL belongs to `@bailian-studio/generation-repository`.
- Test reset helpers are exposed through `@bailian-studio/db/test`, not the
  production barrel.
