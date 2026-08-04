# Models API Bailian boundary

These instructions apply to the API model routes. Read `../../../../../docs/bailian/PACKAGE_BOUNDARY.md` first.

- The API may use `@bailian-studio/bailian-adapter` only to expose the immutable, read-only contract snapshot.
- Never import the Bailian SDK or `@bailian-studio/provider-dashscope`, call DashScope, validate SDK payloads, calculate official prices, or read provider credentials here.
- Model catalog responses come from `@bailian-studio/model-core`; do not rebuild model metadata in route code.
- Keep response schemas strict in `@bailian-studio/api-client` and add route/client tests when the public snapshot changes.
