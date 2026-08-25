# 创意资产与引用协议

本协议是短剧素材平台的领域层协议。它描述“用户选择了哪个创意资产版本”，不描述某一家模型服务商的请求格式。

## 领域边界

- `user_assets` 是物理媒体文件：图片、视频、音频或其他上传/生成文件。
- `creative_assets` 是可复用的语义实体：`character`、`environment`、`prop`、`style`。
- `creative_projects` 是用户整理素材的项目边界，例如一部短剧、一个 IP 或一组
  独立创作任务；它未来可以承载剧本，但当前不承载分镜和剪辑时间线。
- `creative_project_assets` 是项目与资产的多对多整理关系。同一个资产可以被多个项目
  复用，项目删除或移除资产不会删除资产实体。
- `creative_asset_versions` 是不可变的资产版本。一个资产在未软删除范围内最多有一个 `approved` 版本，作为 canonical version。
- `creative_asset_references` 把物理媒体绑定到资产版本，并用 `role` 表达正面、侧面、全身、环境全景等语义。
- `creative_generation_contexts` 是 generation record 在创意资产域的快照，保存协议版本、用途、提示词、配方和模型能力快照。
- `creative_generation_context_assets` 与 `creative_generation_context_references` 记录一次生成使用的资产版本和具体参考图。

资产域不包含剧本、分集、镜头排序或最终剪辑时间线。`shot_image` / `shot_video` 只表示“一次单镜头生成请求”。

项目只是检索和组织边界，不是资产所有权边界。服务端必须同时校验当前用户对项目和资产
的所有权，不能仅凭客户端传入的 `projectId` 或 `assetId` 建立跨用户关系。

## 引用结构

```json
{
  "protocolVersion": 1,
  "purpose": "shot_video",
  "projectId": "project-night-runner",
  "prompt": "角色走进医院走廊，镜头缓慢向前推进",
  "negativePrompt": "脸部变形，服装变化，多余人物",
  "modelId": "video-model-id",
  "assetBindings": [
    {
      "assetVersionId": "character-version-id",
      "role": "character",
      "position": 0,
      "referenceIds": ["character-front-reference", "character-face-reference"]
    },
    {
      "assetVersionId": "environment-version-id",
      "role": "environment",
      "position": 0,
      "referenceIds": ["environment-wide-reference"]
    },
    {
      "assetVersionId": "watch-version-id",
      "role": "prop",
      "position": 0,
      "referenceIds": ["watch-isolated-reference"]
    }
  ],
  "recipe": {
    "aspectRatio": "9:16",
    "durationSeconds": 5
  },
  "capabilitySnapshot": {
    "supportsCharacterReference": true,
    "supportsEnvironmentReference": true,
    "maxReferenceImages": 4
  }
}
```

## 不变量

1. provider adapter 只接收协议转换后的请求，不直接依赖文件名、UI 顺序或自然语言中的 `@名称`。
2. `role + position` 是稳定的引用槽位。同一生成上下文不能出现重复槽位。
3. `referenceIds` 明确本次使用的参考图，不能用“当前资产版本下所有图片”隐式推断。
4. 资产版本被生成上下文引用后不能原地覆盖；修改身份、服装、空间锚点或生成配方必须创建新版本。
5. 资产类型和参考图 role 的兼容性由共享协议层和 repository 双重校验；数据库只负责校验 role 属于总集合。
6. 生成历史通过数据库外键保留到具体的资产版本和参考图，即使资产库后来新增或软删除其他参考图，历史语义也不改变。
7. 同一创意资产的 canonical 版本只有一个。候选版本必须先通过人工或质量检查，再切换为 `approved`。

## 版本状态

```text
draft -> generating -> candidate -> approved -> archived
                         \-> rejected
```

`approved` 不是“模型保证绝对一致”，而是平台认可的稳定引用基准。实际生成结果仍然需要由用户比较、取舍和剪辑。
`rejected` 版本保留为历史记录；重新生成或修改身份时创建新的版本，不重新打开旧版本。
