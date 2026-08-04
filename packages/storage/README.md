# @bailian-studio/storage

Object-storage abstraction used by API reads and worker writes. It supports a
local filesystem adapter for development and Alibaba Cloud OSS for deployment,
selected by `createStorageFromEnv`.

- Depends only on `@bailian-studio/shared`.
- Consumers use `StorageAdapter`; they must not branch on local-vs-OSS details.
- Local artifact paths are resolved and traversal-checked by this package.
