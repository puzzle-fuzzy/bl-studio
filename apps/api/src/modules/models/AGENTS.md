# Models API Bailian boundary

These instructions apply to the API model routes. Read `../../../../../docs/bailian/PACKAGE_BOUNDARY.md` first.

- Model catalog responses come from `@bailian-studio/model-core` (`listModelCatalogItems`); do not rebuild model metadata in route code.
- Never import `@bailian-studio/provider-dashscope`, call DashScope, validate provider payloads, calculate official prices, or read provider credentials here.
- Keep response schemas strict in `@bailian-studio/api-client` (including the `rules` projection used by the web form's real-time validation) and add route/client tests when the public snapshot changes.
