# @bailian-studio/provider-dashscope

DashScope runtime protocol implementation. It builds manifest-driven requests,
submits and polls provider tasks, parses normalized artifacts, reads chat usage,
and classifies provider failures.

- Depends on `@bailian-studio/bailian-adapter` and `@bailian-studio/model-core`.
- Consumed only by `apps/worker`; API and repository code must not call the
  provider directly.
- Provider model selection comes from manifests, not model-id conditionals in
  the runner.
