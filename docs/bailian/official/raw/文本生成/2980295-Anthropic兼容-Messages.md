通过兼容 Anthropic 格式的 Messages API 调用模型，查看输入输出参数说明及调用示例。

通过修改以下配置，即可将原有的 Anthropic 应用迁移至阿里云百炼：

-   `api_key`：替换为[百炼 API Key](/zh/model-studio/get-api-key)。
-   `base_url`：替换为百炼的兼容端点地址（见下方接入信息）。
-   `model`：替换为百炼支持的模型名称（例如 `qwen3.7-plus`）。

**重要**阿里云百炼为华北2（北京）、新加坡地域推出了业务空间专属域名，**能够为推理请求提供卓越的性能和更高的稳定性**，建议迁移至新域名：

-   华北2（北京）地域：从 `https://dashscope.aliyuncs.com` 迁移至 `https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com`
-   新加坡地域：从 `https://dashscope-intl.aliyuncs.com` 迁移至 `https://{WorkspaceId}.ap-southeast-1.maas.aliyuncs.com`

其中 `{WorkspaceId}` 为您的业务空间 ID，可在阿里云百炼控制台的**业务空间详情**页面查看。现有域名仍可正常使用。

#### 华北2（北京）

SDK 调用配置的 `base_url`：`https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/apps/anthropic`

HTTP 请求地址：`POST https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/apps/anthropic/v1/messages`

#### 新加坡

SDK 调用配置的 `base_url`：`https://{WorkspaceId}.ap-southeast-1.maas.aliyuncs.com/apps/anthropic`

HTTP 请求地址：`POST https://{WorkspaceId}.ap-southeast-1.maas.aliyuncs.com/apps/anthropic/v1/messages`

#### 美国（弗吉尼亚）

SDK 调用配置的 `base_url`：`https://{WorkspaceId}.us-east-1.maas.aliyuncs.com/apps/anthropic`

HTTP 请求地址：`POST https://{WorkspaceId}.us-east-1.maas.aliyuncs.com/apps/anthropic/v1/messages`

#### 德国（法兰克福）

SDK 调用配置的 `base_url`：`https://{WorkspaceId}.eu-central-1.maas.aliyuncs.com/apps/anthropic`

HTTP 请求地址：`POST https://{WorkspaceId}.eu-central-1.maas.aliyuncs.com/apps/anthropic/v1/messages`

#### 日本（东京）

SDK 调用配置的 `base_url`：`https://{WorkspaceId}.ap-northeast-1.maas.aliyuncs.com/apps/anthropic`

HTTP 请求地址：`POST https://{WorkspaceId}.ap-northeast-1.maas.aliyuncs.com/apps/anthropic/v1/messages`

调用时请将`{WorkspaceId}`替换为真实的[业务空间ID](/zh/model-studio/obtain-the-app-id-and-workspace-id#732535cfc959h)。

认证方式：通过 `x-api-key` 请求头或 `Authorization: Bearer` 请求头传入[百炼 API Key](/zh/model-studio/get-api-key)，二者选其一即可。

## 与 Anthropic 官方 API 的主要差异

以下差异点汇总自本文正文，从 Anthropic 官方迁移时请重点确认：

<table><colgroup><col style="width:25%"><col style="width:75%"></colgroup><tbody><tr><td><p><strong>差异项</strong></p></td><td><p><strong>说明</strong></p></td></tr><tr><td><p>接入地址（Base URL）</p></td><td><p><code>base_url</code> 需替换为百炼兼容端点（形如 <code>https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/apps/anthropic</code>，各地域地址见上方接入信息），其中 <code>{WorkspaceId}</code> 需替换为真实的业务空间 ID。</p></td></tr><tr><td><p>鉴权方式</p></td><td><p><code>api_key</code> 需替换为百炼 API Key；支持通过 <code>x-api-key</code> 或 <code>Authorization: Bearer</code> 请求头传入，二者选其一即可。</p></td></tr><tr><td><p>模型名称</p></td><td><p><code>model</code> 需替换为百炼支持的模型名称（例如 <code>qwen3.7-plus</code>），完整列表见下方 <code>model</code> 参数说明。</p></td></tr><tr><td><p>temperature 取值范围</p></td><td><p>百炼取值范围为 [0, 2)，与 Anthropic 官方的 [0.0, 1.0] 不同，迁移时请确认该参数取值。</p></td></tr><tr><td><p>接口范围</p></td><td><p>仅提供 Messages 接口（<code>/v1/messages</code>），不提供模型列表接口（<code>/v1/models</code>）；客户端的模型发现请求会返回 404，处理方式见下方常见问题。</p></td></tr><tr><td><p>扩展参数</p></td><td><p><code>output_config</code>（结构化输出与思考强度 <code>effort</code>）为百炼平台扩展参数，官方 SDK 类型定义中不包含，需在请求体中透传（见右侧“结构化输出”示例）；<code>thinking.budget_tokens</code> 即将废弃，新接入建议使用 <code>output_config.effort</code> 控制思考强度。</p></td></tr></tbody></table>

<table bordertype="no-border"><colgroup><col style="width:57%"><col style="width:43%"></colgroup><tbody><tr><td><h2>请求体<span id="ac3a4b5c6d7f2"></span></h2><p><strong>model</strong> <code>string</code> <strong>（必选）</strong></p><p>模型名称，支持范围如下。</p><section class="collapse" id="accordion-支持的模型列表"><p>支持的模型列表</p><div><p><strong>千问Max</strong>：qwen3.8-max、qwen3.7-max、qwen3.7-max-2026-05-20、qwen3.7-max-2026-06-08、qwen3.6-max-preview、qwen3-max、qwen3-max-2026-01-23、qwen3-max-preview</p><p><strong>千问Plus</strong>：qwen3.7-plus、qwen3.7-plus-2026-05-26、qwen3.6-plus、qwen3.6-plus-2026-04-02、qwen3.5-plus、qwen3.5-plus-2026-04-20、qwen3.5-plus-2026-02-15、qwen-plus、qwen-plus-latest、qwen-plus-2025-09-11</p><p><strong>千问Flash</strong>：qwen3.8-flash、qwen3.7-flash、qwen3.7-flash-2026-07-15、qwen3.6-flash、qwen3.6-flash-2026-04-16、qwen3.5-flash、qwen3.5-flash-2026-02-23、qwen-flash、qwen-flash-2025-07-28</p><p><strong>千问Turbo</strong>：qwen-turbo</p><p><strong>千问Coder</strong>：qwen3-coder-next、qwen3-coder-plus、qwen3-coder-plus-2025-09-23、qwen3-coder-flash</p><p><strong>千问VL</strong>：qwen3-vl-plus、qwen3-vl-flash、qwen-vl-max、qwen-vl-plus</p><p><strong>千问开源模型</strong>：qwen3.6-27b、qwen3.5-397b-a17b、qwen3.5-122b-a10b、qwen3.5-27b、qwen3.5-35b-a3b、qwen3.8-2.4t-a95b、qwen3.8-27b</p><strong>第三方模型</strong><p>deepseek-v4-pro、deepseek-v4-pro-0813、deepseek-v4-flash、deepseek-v4-flash-0731、deepseek-v3.2、kimi-k2.7-code、kimi-k2.6、kimi-k2.5、kimi-k2-thinking、glm-5.2、glm-5.1、glm-5、glm-4.7、glm-4.6、MiniMax-M2.5、MiniMax-M2.1</p></div></section><p><strong>max_tokens</strong> <code>integer</code> <strong>（必选）</strong></p><ul><li><p>deepseek-v4-pro、deepseek-v4-pro-0813、deepseek-v4-flash、deepseek-v4-flash-0731、qwen3.8-max、qwen3.8-flash：模型回复内容和思维链内容之和的最大Token数，模型输出超过此值时生成将提前停止，<code>stop_reason</code> 为 <code>max_tokens</code>。</p><blockquote><p><code>max_tokens</code> 限制模型回复内容+思考过程的长度。开启深度思考时，<code>max_tokens</code> &gt; <code>thinking.budget_tokens</code></p></blockquote></li><li><p>glm-5.2：不传入 <code>thinking.budget_tokens</code> 参数时，<code>max_tokens</code> 为模型回复内容和思维链内容之和的最大Token数，模型输出超过此值时生成将提前停止，<code>stop_reason</code> 为 <code>max_tokens</code>；传入 <code>thinking.budget_tokens</code> 参数时，<code>max_tokens</code> 仅为模型回复内容的最大Token数，思考部分的 Token 数由 <code>thinking.budget_tokens</code> 单独控制。</p></li><li><p>其他模型：模型回复内容的最大 Token 数。若生成内容超过此值，生成将提前停止，<code>stop_reason</code> 为 <code>max_tokens</code>。</p><blockquote><p><code>max_tokens</code> 不限制思考过程的长度。开启深度思考时，思考部分的 Token 数由 <code>thinking.budget_tokens</code> 单独控制。</p></blockquote></li></ul><p><strong>system</strong> <code>string 或 array</code> （可选）</p><p>系统提示词，用于设定模型的角色或行为。</p><p>传入字符串等价于单个 <code>type="text"</code> 的内容块。当需要为系统提示词标记显式缓存断点（参见右侧"显式缓存"示例）时，必须传入数组形式。</p><section class="collapse" id="accordion-属性"><p>属性</p><div><p><strong>type</strong> <code>string</code> <strong>（必选）</strong></p><p>固定为 <code>text</code>。</p><p><strong>text</strong> <code>string</code> <strong>（必选）</strong></p><p>系统提示词文本。</p><p><strong>cache_control</strong> <code>object</code> （可选）</p><p>在该内容块上标记显式缓存断点（参见右侧"显式缓存"示例），命中后第二次及之后的请求按缓存读取计费。仅包含字段 <code>type</code>，取值固定为 <code>ephemeral</code>。</p></div></section><p><strong>messages</strong> <code>array</code> <strong>（必选）</strong></p><section class="collapse" id="accordion-messages-数组元素"><p>messages 数组元素</p><div><p><strong>role</strong> <code>string</code> <strong>（必选）</strong></p><p>消息角色，可选值：<code>user</code>、<code>assistant</code>、<code>system</code>。</p><p><strong>content</strong> <code>string 或 array</code> <strong>（必选）</strong></p><p>消息内容。可以是纯文本字符串，也可以是结构化内容数组。<code>content</code> 为字符串时，等价于单个 <code>type="text"</code> 的内容块。</p><section class="collapse" id="accordion-content-数组元素类型"><p>content 数组元素类型</p><div><strong>文本信息</strong><section class="collapse" id="accordion-属性-2"><p>属性</p><div><p><strong>type</strong> <code>string</code> <strong>（必选）</strong></p><p>固定为 <code>text</code>。</p><p><strong>text</strong> <code>string</code> <strong>（必选）</strong></p><p>文本内容。</p><p><strong>cache_control</strong> <code>object</code> （可选）</p><p>在该文本块上标记显式缓存断点（参见右侧"显式缓存"示例）。仅包含字段 <code>type</code>，取值固定为 <code>ephemeral</code>。</p></div></section><p><strong>图片信息</strong>（需使用视觉模型）</p><section class="collapse" id="accordion-属性-3"><p>属性</p><div><p><strong>type</strong> <code>string</code> <strong>（必选）</strong></p><p>固定为 <code>image</code>。</p><p><strong>source</strong> <code>object</code> <strong>（必选）</strong></p><p>图片数据来源。</p><section class="collapse" id="accordion-属性-4"><p>属性</p><div><p><strong>type</strong> <code>string</code> <strong>（必选）</strong></p><p>取值：<code>url</code>（公网图片地址）、<code>base64</code>（Base64 编码）。</p><p><strong>url</strong> <code>string</code></p><p>图片的公网地址。当 <code>type</code> 为 <code>url</code> 时必填。</p><p><strong>media_type</strong> <code>string</code></p><p>图片的 MIME 类型，如 <code>image/jpeg</code>。当 <code>type</code> 为 <code>base64</code> 时必填。</p><p><strong>data</strong> <code>string</code></p><p>Base64 编码的图片数据。当 <code>type</code> 为 <code>base64</code> 时必填。</p></div></section></div></section><p><strong>视频信息</strong>（需使用视觉模型）</p><section class="collapse" id="accordion-属性-5"><p>属性</p><div><p><strong>type</strong> <code>string</code> <strong>（必选）</strong></p><p>固定为 <code>video</code>。</p><p><strong>source</strong> <code>object</code> <strong>（必选）</strong></p><p>视频数据来源。</p><section class="collapse" id="accordion-属性-6"><p>属性</p><div><p><strong>type</strong> <code>string</code> <strong>（必选）</strong></p><p>取值：<code>url</code>（公网视频地址）、<code>base64</code>（Base64 编码）。</p><p><strong>url</strong> <code>string</code></p><p>视频的公网地址。当 <code>type</code> 为 <code>url</code> 时必填。</p><p><strong>media_type</strong> <code>string</code></p><p>视频的 MIME 类型，如 <code>video/mp4</code>。当 <code>type</code> 为 <code>base64</code> 时必填。</p><p><strong>data</strong> <code>string</code></p><p>Base64 编码的视频数据。当 <code>type</code> 为 <code>base64</code> 时必填。</p></div></section></div></section><p><strong>工具调用信息</strong>（assistant 角色，模型返回的工具调用指令）</p><section class="collapse" id="accordion-属性-7"><p>属性</p><div><p><strong>type</strong> <code>string</code> <strong>（必选）</strong></p><p>固定为 <code>tool_use</code>。</p><p><strong>id</strong> <code>string</code> <strong>（必选）</strong></p><p>工具调用的唯一标识，用于在后续 <code>tool_result</code> 中关联结果。</p><p><strong>name</strong> <code>string</code> <strong>（必选）</strong></p><p>被调用的工具名称。</p><p><strong>input</strong> <code>object</code> <strong>（必选）</strong></p><p>工具调用的入参，结构由 <code>tools</code> 中对应工具的 <code>input_schema</code> 决定。</p><p><strong>cache_control</strong> <code>object</code> （可选）</p><p>在该块上标记显式缓存断点（参见右侧"显式缓存"示例）。仅包含字段 <code>type</code>，取值固定为 <code>ephemeral</code>。工具调用内容本身会参与缓存前缀。</p></div></section><p><strong>工具结果信息</strong>（user 角色，工具执行结果回传给模型）</p><section class="collapse" id="accordion-属性-8"><p>属性</p><div><p><strong>type</strong> <code>string</code> <strong>（必选）</strong></p><p>固定为 <code>tool_result</code>。</p><p><strong>tool_use_id</strong> <code>string</code> <strong>（必选）</strong></p><p>对应 <code>tool_use</code> 信息中的 <code>id</code>。</p><p><strong>content</strong> <code>string</code> <strong>（必选）</strong></p><p>工具执行返回的内容。</p><p><strong>cache_control</strong> <code>object</code> （可选）</p><p>在该工具结果块上标记显式缓存断点（参见右侧"显式缓存"示例）。仅包含字段 <code>type</code>，取值固定为 <code>ephemeral</code>。</p></div></section></div></section></div></section><p><strong>stream</strong> <code>boolean</code> （可选）</p><p>是否启用流式输出，默认为 <code>false</code>。</p><p><strong>temperature</strong> <code>number</code> （可选）</p><p>控制生成文本的多样性，取值范围 [0, 2)。值越大，生成结果越随机。</p><div class="note note-note"><div class="note-icon-wrapper"></div><div class="note-content"><p><strong>说明</strong>该范围与 Anthropic 官方的 [0.0, 1.0] 不同，从 Anthropic 迁移时请确认该参数取值。</p></div></div><p><strong>top_p</strong> <code>number</code> （可选）</p><p>核采样的概率阈值，控制生成文本的多样性。</p><blockquote><p><code>temperature</code> 与 <code>top_p</code> 均可控制生成文本的多样性，建议只设置其中一个值。更多说明请参见<a href="/zh/model-studio/text-generation">概述</a>。</p></blockquote><p><strong>top_k</strong> <code>integer</code> （可选）</p><p>生成过程中采样候选集的大小。</p><p><strong>stop_sequences</strong> <code>array</code> （可选）</p><p>指定停止生成的文本序列。模型生成到该序列前会停止输出，且不包含该序列本身。</p><div class="note note-note"><div class="note-icon-wrapper"></div><div class="note-content"><p><strong>说明</strong>命中后，响应的 <code>stop_reason</code> 仍为 <code>end_turn</code>，响应不会回填命中的序列。</p></div></div><p><strong>thinking</strong> <code>object</code> （可选）</p><p>深度思考配置。开启后，模型会在生成回复前先进行推理，以提升回答准确度。开启后，响应会包含 <code>thinking</code> 类型的内容块。</p><p>未传入该参数时，是否进行思考由模型默认行为决定：qwen3.8-max、qwen3.8-flash、deepseek-v4 系列、glm 系列默认开启思考；kimi-k2.6、kimi-k2.5 默认关闭思考；kimi-k2.7-code、kimi-k2-thinking、MiniMax-M2.5、MiniMax-M2.1 仅支持思考模式（无法关闭）。各模型对思考模式的支持情况与默认开关，请参见<a href="/zh/model-studio/deep-thinking">深度思考</a>。</p><section class="collapse" id="accordion-属性-9"><p>属性</p><div><p><strong>type</strong> <code>string</code> <strong>（必选）</strong></p><p>可选值：<code>enabled</code>（开启思考模式）、<code>disabled</code>（关闭思考模式）。</p><p><strong>budget_tokens</strong> <code>integer</code> （可选，<strong>即将废弃</strong>）</p><blockquote><p>该参数即将废弃，并将在后续模型中逐步停止支持，新接入建议使用&nbsp;<code>effort</code>控制模型的思考强度。</p></blockquote><p>思考过程可使用的最大 Token 数，与 <code>max_tokens</code> 互不重叠：本参数限制思考，<code>max_tokens</code> 限制最终回复。预算越大，在复杂问题上的分析越充分。当 <code>type</code> 为 <code>enabled</code> 时生效。</p></div></section><p><strong>tools</strong> <code>array</code> （可选）</p><p>工具定义数组，用于 Function Call 场景。</p><section class="collapse" id="accordion-tools-数组元素"><p>tools 数组元素</p><div><p><strong>name</strong> <code>string</code> <strong>（必选）</strong></p><p>工具名称。</p><p><strong>description</strong> <code>string</code> （可选）</p><p>工具的功能描述。</p><p><strong>input_schema</strong> <code>object</code> <strong>（必选）</strong></p><p>工具输入参数的 JSON Schema 定义。</p></div></section><p><strong>tool_choice</strong> <code>object</code> （可选）</p><p>工具选择策略。支持以下值：</p><ul><li><code>{"type": "auto"}</code>：模型自行决定是否调用工具（默认）。</li><li><code>{"type": "any"}</code>：强制模型调用任意一个工具。</li><li><code>{"type": "none"}</code>：禁止模型调用工具。</li><li><code>{"type": "tool", "name": "tool_name"}</code>：强制模型调用指定工具。</li></ul><p><strong>output_config</strong> <code>object</code> （可选）</p><p>输出参数设置。</p><section class="collapse" id="accordion-属性-10"><p>属性</p><div><p><strong>effort</strong> <code>string</code> （可选）</p><p>控制模型的推理力度。</p><ul><li><p>glm-5.2、deepseek-v4-pro、deepseek-v4-flash（阿里云直供）（默认值为 <code>max</code>）：</p><p>可选值：</p><ul><li><code>high</code>：高力度推理</li><li><code>max</code>：最大力度推理</li></ul><p><code>low</code>和<code>medium</code>映射为<code>high</code>，<code>xhigh</code>映射为<code>max</code>。</p></li><li><p>qwen3.8-max/qwen3.8-flash（默认值为 <code>xhigh</code>）：</p><p>可选值：</p><ul><li><code>xhigh</code>：高力度推理</li><li><code>medium</code>：中力度推理</li><li><code>low</code>：低力度推理</li></ul><p><code>max</code>&nbsp;、<code>high</code>映射为 <code>xhigh</code>。</p></li></ul><p><strong>format</strong> <code>object</code> （可选）</p><p>结构化输出配置。开启后，模型将输出 JSON 字符串。不同模型的支持力度不同：</p><ul><li><strong>严格结构化输出</strong>：适用于 qwen3.8 系列、qwen3.7 系列、deepseek 系列、glm 系列模型。模型严格按照传入的 JSON Schema 进行强约束输出，确保字段类型与层级完全一致。</li><li><strong>普通结构化输出</strong>：适用于上述以外的其他模型。Schema 的具体字段约束默认不生效，API 会自动将其转换为普通 JSON 模式（仅保证输出为合法的 JSON 字符串）。触发普通 JSON 模式时，请求必须同时满足以下两点约束：1、显式传入 <code>output_config</code> 参数；2、<code>system</code> 或 <code>messages</code> 的内容中必须包含不区分大小写的 "JSON" 关键词。若提示词中未包含 "JSON" 关键词，API将抛出异常：<code>'messages' must contain the word 'json' in some form</code>。</li></ul><section class="collapse" id="accordion-属性-11"><p>属性</p><div><p><strong>type</strong> <code>string</code> <strong>（必选）</strong></p><p>取值固定为 <code>json_schema</code>。</p><p><strong>schema</strong> <code>object</code> <strong>（必选）</strong></p><p>JSON Schema 对象，遵循标准 JSON Schema 规范。需包含 <code>type</code>（数据类型）、<code>properties</code>（字段定义）、<code>required</code>（必填字段名数组）、<code>additionalProperties</code>（必须设为 <code>false</code>）等字段。</p></div></section></div></section></td><td><section data-tag="tabbed-content-box" outputclass="tabbed-content-box" id="sec-tabs-2" class="tabbed-content-box section"><section id="基础调用" class="section"><h4 id="基础调用-h4">基础调用</h4><div outputclass="tabbed-codeblock" data-tag="fig" id="fig-code-group" class="tabbed-codeblock-box"><div class="tab-box"></div><input id="fig-code-group-python-tab" type="radio" name="check-fig-code-group" checked=""><label for="fig-code-group-python-tab">Python</label><div class="codeblock-item"><pre data-tag="codeblock" id="code-code-group-python" outputclass="language-python" code-type="xCode" class="pre codeblock language-python"><code>import anthropic
import os

client = anthropic.Anthropic(
    api_key=os.getenv("DASHSCOPE_API_KEY"),
    base_url="https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/apps/anthropic",
)

message = client.messages.create(
    model="qwen3.8-max",
    max_tokens=1024,
    system="You are a helpful assistant",
    messages=[
        {
            "role": "user",
            "content": "你是谁？"
        }
    ],
    thinking={"type": "disabled"},
)

print(message.content[0].text)
</code></pre></div><input id="fig-code-group-typescript-tab" type="radio" name="check-fig-code-group"><label for="fig-code-group-typescript-tab">TypeScript</label><div class="codeblock-item"><pre data-tag="codeblock" id="code-code-group-typescript" outputclass="language-typescript" code-type="xCode" class="pre codeblock language-typescript"><code>import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({
  apiKey: process.env.DASHSCOPE_API_KEY,
  baseURL: "https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/apps/anthropic",
});

async function main() {
  const message = await anthropic.messages.create({
    model: "qwen3.8-max",
    max_tokens: 1024,
    system: "You are a helpful assistant",
    messages: [{
      role: "user",
      content: "你是谁？"
    }],
    thinking: { type: "disabled" },
  });

  console.log(message.content[0].text);
}

main().catch(console.error);
</code></pre></div><input id="fig-code-group-curl-tab" type="radio" name="check-fig-code-group"><label for="fig-code-group-curl-tab">curl</label><div class="codeblock-item"><pre data-tag="codeblock" id="code-code-group-curl" outputclass="language-bash" code-type="xCode" class="pre codeblock language-bash"><code>curl -X POST "https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/apps/anthropic/v1/messages" \
  -H "Content-Type: application/json" \
  -H "x-api-key: $DASHSCOPE_API_KEY" \
  -d '{
    "model": "qwen3.8-max",
    "max_tokens": 1024,
    "system": "You are a helpful assistant",
    "messages": [
        {
            "role": "user",
            "content": "你是谁？"
        }
    ],
    "thinking": {"type": "disabled"}
}'
</code></pre></div></div></section><section id="流式输出" class="section"><h4 id="流式输出-h4">流式输出</h4><div outputclass="tabbed-codeblock" data-tag="fig" id="fig-code-group-2" class="tabbed-codeblock-box"><div class="tab-box"></div><input id="fig-code-group-2-python-tab" type="radio" name="check-fig-code-group-2" checked=""><label for="fig-code-group-2-python-tab">Python</label><div class="codeblock-item"><pre data-tag="codeblock" id="code-code-group-2-python" outputclass="language-python" code-type="xCode" class="pre codeblock language-python"><code>import anthropic
import os

client = anthropic.Anthropic(
    api_key=os.getenv("DASHSCOPE_API_KEY"),
    base_url="https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/apps/anthropic",
)

stream = client.messages.create(
    model="qwen3.8-max",
    max_tokens=1024,
    stream=True,
    messages=[
        {
            "role": "user",
            "content": "请简单介绍一下人工智能。"
        }
    ],
    thinking={"type": "disabled"},
)

for chunk in stream:
    if chunk.type == "content_block_delta":
        if hasattr(chunk.delta, 'text'):
            print(chunk.delta.text, end="", flush=True)
</code></pre></div><input id="fig-code-group-2-typescript-tab" type="radio" name="check-fig-code-group-2"><label for="fig-code-group-2-typescript-tab">TypeScript</label><div class="codeblock-item"><pre data-tag="codeblock" id="code-code-group-2-typescript" outputclass="language-typescript" code-type="xCode" class="pre codeblock language-typescript"><code>import Anthropic from "@anthropic-ai/sdk";

async function main() {
  const anthropic = new Anthropic({
    apiKey: process.env.DASHSCOPE_API_KEY,
    baseURL: "https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/apps/anthropic",
  });

  const stream = await anthropic.messages.create({
    model: "qwen3.8-max",
    max_tokens: 1024,
    stream: true,
    messages: [{
      role: "user",
      content: "请简单介绍一下人工智能。"
    }],
    thinking: { type: "disabled" },
  });

  for await (const chunk of stream) {
    if (chunk.type === "content_block_delta" &amp;&amp; 'text' in chunk.delta) {
      process.stdout.write(chunk.delta.text);
    }
  }
}

main().catch(console.error);
</code></pre></div><input id="fig-code-group-2-curl-tab" type="radio" name="check-fig-code-group-2"><label for="fig-code-group-2-curl-tab">curl</label><div class="codeblock-item"><pre data-tag="codeblock" id="code-code-group-2-curl" outputclass="language-bash" code-type="xCode" class="pre codeblock language-bash"><code>curl -X POST "https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/apps/anthropic/v1/messages" \
  -H "Content-Type: application/json" \
  -H "x-api-key: $DASHSCOPE_API_KEY" \
  --no-buffer \
  -d '{
    "model": "qwen3.8-max",
    "max_tokens": 1024,
    "stream": true,
    "messages": [
        {
            "role": "user",
            "content": "请简单介绍一下人工智能。"
        }
    ],
    "thinking": {"type": "disabled"}
}'
</code></pre></div></div></section><section id="深度思考" class="section"><h4 id="深度思考-h4">深度思考</h4><div outputclass="tabbed-codeblock" data-tag="fig" id="fig-code-group-3" class="tabbed-codeblock-box"><div class="tab-box"></div><input id="fig-code-group-3-python-tab" type="radio" name="check-fig-code-group-3" checked=""><label for="fig-code-group-3-python-tab">Python</label><div class="codeblock-item"><pre data-tag="codeblock" id="code-code-group-3-python" outputclass="language-python" code-type="xCode" class="pre codeblock language-python"><code>import anthropic
import os

client = anthropic.Anthropic(
    api_key=os.getenv("DASHSCOPE_API_KEY"),
    base_url="https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/apps/anthropic",
)

stream = client.messages.create(
    model="qwen3.8-max",
    max_tokens=2048,
    stream=True,
    thinking={
        "type": "enabled",
        "budget_tokens": 1024
    },
    messages=[
        {
            "role": "user",
            "content": "分析一下量子计算的发展前景。"
        }
    ]
)

for chunk in stream:
    if chunk.type == "content_block_delta":
        if hasattr(chunk.delta, 'thinking'):
            print(chunk.delta.thinking, end="", flush=True)
        elif hasattr(chunk.delta, 'text'):
            print(chunk.delta.text, end="", flush=True)
</code></pre></div><input id="fig-code-group-3-typescript-tab" type="radio" name="check-fig-code-group-3"><label for="fig-code-group-3-typescript-tab">TypeScript</label><div class="codeblock-item"><pre data-tag="codeblock" id="code-code-group-3-typescript" outputclass="language-typescript" code-type="xCode" class="pre codeblock language-typescript"><code>import Anthropic from "@anthropic-ai/sdk";

async function main() {
  const anthropic = new Anthropic({
    apiKey: process.env.DASHSCOPE_API_KEY,
    baseURL: "https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/apps/anthropic",
  });

  const stream = await anthropic.messages.create({
    model: "qwen3.8-max",
    max_tokens: 2048,
    stream: true,
    thinking: { type: "enabled", budget_tokens: 1024 },
    messages: [{
      role: "user",
      content: "分析一下量子计算的发展前景。"
    }]
  });

  for await (const chunk of stream) {
    if (chunk.type === "content_block_delta") {
      if ('thinking' in chunk.delta) {
        process.stdout.write(chunk.delta.thinking);
      } else if ('text' in chunk.delta) {
        process.stdout.write(chunk.delta.text);
      }
    }
  }
}

main().catch(console.error);
</code></pre></div><input id="fig-code-group-3-curl-tab" type="radio" name="check-fig-code-group-3"><label for="fig-code-group-3-curl-tab">curl</label><div class="codeblock-item"><pre data-tag="codeblock" id="code-code-group-3-curl" outputclass="language-bash" code-type="xCode" class="pre codeblock language-bash"><code>curl -X POST "https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/apps/anthropic/v1/messages" \
  -H "Content-Type: application/json" \
  -H "x-api-key: $DASHSCOPE_API_KEY" \
  -d '{
    "model": "qwen3.8-max",
    "max_tokens": 2048,
    "stream": true,
    "thinking": {
        "type": "enabled",
        "budget_tokens": 1024
    },
    "messages": [
        {
            "role": "user",
            "content": "分析一下量子计算的发展前景。"
        }
    ]
}'
</code></pre></div></div></section><section id="图片理解" class="section"><h4 id="图片理解-h4">图片理解</h4><div outputclass="tabbed-codeblock" data-tag="fig" id="fig-code-group-4" class="tabbed-codeblock-box"><div class="tab-box"></div><input id="fig-code-group-4-python-tab" type="radio" name="check-fig-code-group-4" checked=""><label for="fig-code-group-4-python-tab">Python</label><div class="codeblock-item"><pre data-tag="codeblock" id="code-code-group-4-python" outputclass="language-python" code-type="xCode" class="pre codeblock language-python"><code>import anthropic
import os

client = anthropic.Anthropic(
    api_key=os.getenv("DASHSCOPE_API_KEY"),
    base_url="https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/apps/anthropic",
)

stream = client.messages.create(
    model="qwen3.8-max",
    max_tokens=1024,
    stream=True,
    messages=[
        {
            "role": "user",
            "content": [
                {
                    "type": "image",
                    "source": {
                        "type": "url",
                        "url": "https://help-static-aliyun-doc.aliyuncs.com/file-manage-files/zh-CN/20250414/mqqmiy/animal_01.jpg",
                    },
                },
                {
                    "type": "text",
                    "text": "描述这张图片的内容。"
                },
            ],
        }
    ],
    thinking={"type": "disabled"},
)

for chunk in stream:
    if chunk.type == "content_block_delta":
        if hasattr(chunk.delta, 'text'):
            print(chunk.delta.text, end="", flush=True)
</code></pre></div><input id="fig-code-group-4-typescript-tab" type="radio" name="check-fig-code-group-4"><label for="fig-code-group-4-typescript-tab">TypeScript</label><div class="codeblock-item"><pre data-tag="codeblock" id="code-code-group-4-typescript" outputclass="language-typescript" code-type="xCode" class="pre codeblock language-typescript"><code>import Anthropic from "@anthropic-ai/sdk";

async function main() {
  const anthropic = new Anthropic({
    apiKey: process.env.DASHSCOPE_API_KEY,
    baseURL: "https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/apps/anthropic",
  });

  const stream = await anthropic.messages.create({
    model: "qwen3.8-max",
    max_tokens: 1024,
    stream: true,
    messages: [{
      role: "user",
      content: [
        {
          type: "image",
          source: {
            type: "url",
            url: "https://help-static-aliyun-doc.aliyuncs.com/file-manage-files/zh-CN/20250414/mqqmiy/animal_01.jpg",
          },
        },
        { type: "text", text: "描述这张图片的内容。" },
      ],
    }],
    thinking: { type: "disabled" },
  });

  for await (const chunk of stream) {
    if (chunk.type === "content_block_delta" &amp;&amp; 'text' in chunk.delta) {
      process.stdout.write(chunk.delta.text);
    }
  }
}

main().catch(console.error);
</code></pre></div><input id="fig-code-group-4-curl-tab" type="radio" name="check-fig-code-group-4"><label for="fig-code-group-4-curl-tab">curl</label><div class="codeblock-item"><pre data-tag="codeblock" id="code-code-group-4-curl" outputclass="language-bash" code-type="xCode" class="pre codeblock language-bash"><code>curl -X POST "https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/apps/anthropic/v1/messages" \
  -H "Content-Type: application/json" \
  -H "x-api-key: $DASHSCOPE_API_KEY" \
  -d '{
    "model": "qwen3.8-max",
    "max_tokens": 1024,
    "stream": true,
    "messages": [
        {
            "role": "user",
            "content": [
                {
                    "type": "image",
                    "source": {
                        "type": "url",
                        "url": "https://help-static-aliyun-doc.aliyuncs.com/file-manage-files/zh-CN/20250414/mqqmiy/animal_01.jpg"
                    }
                },
                {
                    "type": "text",
                    "text": "描述这张图片的内容。"
                }
            ]
        }
    ],
    "thinking": {"type": "disabled"}
}'
</code></pre></div></div></section><section id="视频理解" class="section"><h4 id="视频理解-h4">视频理解</h4><div outputclass="tabbed-codeblock" data-tag="fig" id="fig-code-group-5" class="tabbed-codeblock-box"><div class="tab-box"></div><input id="fig-code-group-5-python-tab" type="radio" name="check-fig-code-group-5" checked=""><label for="fig-code-group-5-python-tab">Python</label><div class="codeblock-item"><pre data-tag="codeblock" id="code-code-group-5-python" outputclass="language-python" code-type="xCode" class="pre codeblock language-python"><code>import anthropic
import os

client = anthropic.Anthropic(
    api_key=os.getenv("DASHSCOPE_API_KEY"),
    base_url="https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/apps/anthropic",
)

stream = client.messages.create(
    model="qwen3.8-max",
    max_tokens=1024,
    stream=True,
    messages=[
        {
            "role": "user",
            "content": [
                {
                    "type": "video",
                    "source": {
                        "type": "url",
                        "url": "https://help-static-aliyun-doc.aliyuncs.com/file-manage-files/zh-CN/20251208/zpupby/3e81ef38-98f0-4d55-bbb6-259334ca18d0.mp4",
                    },
                },
                {
                    "type": "text",
                    "text": "描述这段视频的内容。"
                },
            ],
        }
    ],
    thinking={"type": "disabled"},
)

for chunk in stream:
    if chunk.type == "content_block_delta":
        if hasattr(chunk.delta, 'text'):
            print(chunk.delta.text, end="", flush=True)
</code></pre></div><input id="fig-code-group-5-typescript-tab" type="radio" name="check-fig-code-group-5"><label for="fig-code-group-5-typescript-tab">TypeScript</label><div class="codeblock-item"><pre data-tag="codeblock" id="code-code-group-5-typescript" outputclass="language-typescript" code-type="xCode" class="pre codeblock language-typescript"><code>import Anthropic from "@anthropic-ai/sdk";

async function main() {
  const anthropic = new Anthropic({
    apiKey: process.env.DASHSCOPE_API_KEY,
    baseURL: "https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/apps/anthropic",
  });

  const stream = await anthropic.messages.create({
    model: "qwen3.8-max",
    max_tokens: 1024,
    stream: true,
    messages: [{
      role: "user",
      content: [
        {
          type: "video",
          source: {
            type: "url",
            url: "https://help-static-aliyun-doc.aliyuncs.com/file-manage-files/zh-CN/20251208/zpupby/3e81ef38-98f0-4d55-bbb6-259334ca18d0.mp4",
          },
        },
        { type: "text", text: "描述这段视频的内容。" },
      ],
    }],
    thinking: { type: "disabled" },
  });

  for await (const chunk of stream) {
    if (chunk.type === "content_block_delta" &amp;&amp; 'text' in chunk.delta) {
      process.stdout.write(chunk.delta.text);
    }
  }
}

main().catch(console.error);
</code></pre></div><input id="fig-code-group-5-curl-tab" type="radio" name="check-fig-code-group-5"><label for="fig-code-group-5-curl-tab">curl</label><div class="codeblock-item"><pre data-tag="codeblock" id="code-code-group-5-curl" outputclass="language-bash" code-type="xCode" class="pre codeblock language-bash"><code>curl -X POST "https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/apps/anthropic/v1/messages" \
  -H "Content-Type: application/json" \
  -H "x-api-key: $DASHSCOPE_API_KEY" \
  -d '{
    "model": "qwen3.8-max",
    "max_tokens": 1024,
    "stream": true,
    "messages": [
        {
            "role": "user",
            "content": [
                {
                    "type": "video",
                    "source": {
                        "type": "url",
                        "url": "https://help-static-aliyun-doc.aliyuncs.com/file-manage-files/zh-CN/20251208/zpupby/3e81ef38-98f0-4d55-bbb6-259334ca18d0.mp4"
                    }
                },
                {
                    "type": "text",
                    "text": "描述这段视频的内容。"
                }
            ]
        }
    ],
    "thinking": {"type": "disabled"}
}'
</code></pre></div></div></section><section id="function-call" class="section"><h4 id="function-call-h4">Function Call</h4><div outputclass="tabbed-codeblock" data-tag="fig" id="fig-code-group-6" class="tabbed-codeblock-box"><div class="tab-box"></div><input id="fig-code-group-6-python-tab" type="radio" name="check-fig-code-group-6" checked=""><label for="fig-code-group-6-python-tab">Python</label><div class="codeblock-item"><pre data-tag="codeblock" id="code-code-group-6-python" outputclass="language-python" code-type="xCode" class="pre codeblock language-python"><code>import anthropic
import os

client = anthropic.Anthropic(
    api_key=os.getenv("DASHSCOPE_API_KEY"),
    base_url="https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/apps/anthropic",
)

tools = [
    {
        "name": "get_weather",
        "description": "获取指定城市的天气信息",
        "input_schema": {
            "type": "object",
            "properties": {
                "city": {
                    "type": "string",
                    "description": "城市名称"
                }
            },
            "required": ["city"]
        }
    }
]

message = client.messages.create(
    model="qwen3.8-max",
    max_tokens=1024,
    tools=tools,
    messages=[
        {
            "role": "user",
            "content": "杭州今天天气怎么样？"
        }
    ]
)

print(message.content)
</code></pre></div><input id="fig-code-group-6-typescript-tab" type="radio" name="check-fig-code-group-6"><label for="fig-code-group-6-typescript-tab">TypeScript</label><div class="codeblock-item"><pre data-tag="codeblock" id="code-code-group-6-typescript" outputclass="language-typescript" code-type="xCode" class="pre codeblock language-typescript"><code>import Anthropic from "@anthropic-ai/sdk";

async function main() {
  const anthropic = new Anthropic({
    apiKey: process.env.DASHSCOPE_API_KEY,
    baseURL: "https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/apps/anthropic",
  });

  const message = await anthropic.messages.create({
    model: "qwen3.8-max",
    max_tokens: 1024,
    tools: [
      {
        name: "get_weather",
        description: "获取指定城市的天气信息",
        input_schema: {
          type: "object",
          properties: {
            city: { type: "string", description: "城市名称" }
          },
          required: ["city"],
        },
      },
    ],
    messages: [{
      role: "user",
      content: "杭州今天天气怎么样？"
    }],
  });

  console.log(JSON.stringify(message.content, null, 2));
}

main().catch(console.error);
</code></pre></div><input id="fig-code-group-6-curl-tab" type="radio" name="check-fig-code-group-6"><label for="fig-code-group-6-curl-tab">curl</label><div class="codeblock-item"><pre data-tag="codeblock" id="code-code-group-6-curl" outputclass="language-bash" code-type="xCode" class="pre codeblock language-bash"><code>curl -X POST "https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/apps/anthropic/v1/messages" \
  -H "Content-Type: application/json" \
  -H "x-api-key: $DASHSCOPE_API_KEY" \
  -d '{
    "model": "qwen3.8-max",
    "max_tokens": 1024,
    "tools": [
        {
            "name": "get_weather",
            "description": "获取指定城市的天气信息",
            "input_schema": {
                "type": "object",
                "properties": {
                    "city": {
                        "type": "string",
                        "description": "城市名称"
                    }
                },
                "required": ["city"]
            }
        }
    ],
    "messages": [
        {
            "role": "user",
            "content": "杭州今天天气怎么样？"
        }
    ]
}'
</code></pre></div></div></section><section id="显式缓存" class="section"><h4 id="显式缓存-h4">显式缓存</h4><div outputclass="tabbed-codeblock" data-tag="fig" id="fig-code-group-7" class="tabbed-codeblock-box"><div class="tab-box"></div><input id="fig-code-group-7-python-tab" type="radio" name="check-fig-code-group-7" checked=""><label for="fig-code-group-7-python-tab">Python</label><div class="codeblock-item"><pre data-tag="codeblock" id="code-code-group-7-python" outputclass="language-python" code-type="xCode" class="pre codeblock language-python"><code>import anthropic
import os

client = anthropic.Anthropic(
    api_key=os.getenv("DASHSCOPE_API_KEY"),
    base_url="https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/apps/anthropic",
)

# 模拟代码仓库内容，需达到最小可缓存长度（1024 Token）
long_text_content = "&lt;Your Code Here&gt;" * 400

def get_completion(user_input):
    response = client.messages.create(
        # 选择支持显式缓存的模型
        model="qwen3.8-max",
        max_tokens=1024,
        system=[
            {
                "type": "text",
                "text": long_text_content,
                # 在 text 块上添加 cache_control 即标记缓存断点；也可放在 messages 数组的 content 块上
                "cache_control": {"type": "ephemeral"},
            }
        ],
        messages=[
            {"role": "user", "content": user_input},
        ],
    )
    return response

# 第一次请求：创建缓存
first = get_completion("这段代码的内容是什么")
print(f"创建缓存 Token：{first.usage.cache_creation_input_tokens}")
print(f"命中缓存 Token：{first.usage.cache_read_input_tokens}")
print("=" * 20)
# 第二次请求：长内容相同，仅修改提问 → 命中缓存
second = get_completion("这段代码可以怎么优化")
print(f"创建缓存 Token：{second.usage.cache_creation_input_tokens}")
print(f"命中缓存 Token：{second.usage.cache_read_input_tokens}")
</code></pre></div><input id="fig-code-group-7-typescript-tab" type="radio" name="check-fig-code-group-7"><label for="fig-code-group-7-typescript-tab">TypeScript</label><div class="codeblock-item"><pre data-tag="codeblock" id="code-code-group-7-typescript" outputclass="language-typescript" code-type="xCode" class="pre codeblock language-typescript"><code>import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({
  apiKey: process.env.DASHSCOPE_API_KEY,
  baseURL: "https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/apps/anthropic",
});

// 模拟代码仓库内容，需达到最小可缓存长度（1024 Token）
const longTextContent = "&lt;Your Code Here&gt;".repeat(400);

async function getCompletion(userInput) {
  return client.messages.create({
    // 选择支持显式缓存的模型
    model: "qwen3.8-max",
    max_tokens: 1024,
    system: [
      {
        type: "text",
        text: longTextContent,
        // 在 text 块上添加 cache_control 即标记缓存断点；也可放在 messages 数组的 content 块上
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [{ role: "user", content: userInput }],
  });
}

// 第一次请求：创建缓存
const first = await getCompletion("这段代码的内容是什么");
console.log(`创建缓存 Token：${first.usage.cache_creation_input_tokens}`);
console.log(`命中缓存 Token：${first.usage.cache_read_input_tokens}`);
console.log("=".repeat(20));
// 第二次请求：长内容相同，仅修改提问 → 命中缓存
const second = await getCompletion("这段代码可以怎么优化");
console.log(`创建缓存 Token：${second.usage.cache_creation_input_tokens}`);
console.log(`命中缓存 Token：${second.usage.cache_read_input_tokens}`);
</code></pre></div><input id="fig-code-group-7-curl-tab" type="radio" name="check-fig-code-group-7"><label for="fig-code-group-7-curl-tab">curl</label><div class="codeblock-item"><pre data-tag="codeblock" id="code-code-group-7-curl" outputclass="language-bash" code-type="xCode" class="pre codeblock language-bash"><code>curl -X POST "https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/apps/anthropic/v1/messages" \
  -H "Content-Type: application/json" \
  -H "x-api-key: $DASHSCOPE_API_KEY" \
  -d '{
    "model": "qwen3.8-max",
    "max_tokens": 1024,
    "system": [
      {
        "type": "text",
        "text": "&lt;请在此处放置长度 ≥ 1024 Token 的可缓存内容&gt;",
        "cache_control": {"type": "ephemeral"}
      }
    ],
    "messages": [
      {"role": "user", "content": "这段代码的内容是什么"}
    ]
}'
</code></pre></div></div></section><section id="结构化输出" class="section"><h4 id="结构化输出-h4">结构化输出</h4><div outputclass="tabbed-codeblock" data-tag="fig" id="fig-code-group-8" class="tabbed-codeblock-box"><div class="tab-box"></div><input id="fig-code-group-8-python-tab" type="radio" name="check-fig-code-group-8" checked=""><label for="fig-code-group-8-python-tab">Python</label><div class="codeblock-item"><pre data-tag="codeblock" id="code-code-group-8-python" outputclass="language-python" code-type="xCode" class="pre codeblock language-python"><code>import anthropic
import os

client = anthropic.Anthropic(
    api_key=os.getenv("DASHSCOPE_API_KEY"),
    base_url="https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/apps/anthropic",
)

message = client.messages.create(
    model="deepseek-v4-pro",
    max_tokens=1024,
    messages=[
        {
            "role": "user",
            "content": "提取以下邮件的关键信息：张三 (zhangsan@example.com) 对企业版方案感兴趣，希望预约下周二下午 2 点的演示。"
        }
    ],
    extra_body={
        "output_config": {
            "format": {
                "type": "json_schema",
                "schema": {
                    "type": "object",
                    "properties": {
                        "name": {"type": "string"},
                        "email": {"type": "string"},
                        "plan_interest": {"type": "string"},
                        "demo_requested": {"type": "boolean"}
                    },
                    "required": ["name", "email", "plan_interest", "demo_requested"],
                    "additionalProperties": False
                }
            }
        }
    },
)

# deepseek-v4-pro 模型会返回 thinking 块，需要找到 type='text' 的内容块
text_block = next(block for block in message.content if block.type == "text")
print(text_block.text)
</code></pre></div><input id="fig-code-group-8-typescript-tab" type="radio" name="check-fig-code-group-8"><label for="fig-code-group-8-typescript-tab">TypeScript</label><div class="codeblock-item"><pre data-tag="codeblock" id="code-code-group-8-typescript" outputclass="language-typescript" code-type="xCode" class="pre codeblock language-typescript"><code>import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({
  apiKey: process.env.DASHSCOPE_API_KEY,
  baseURL: "https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/apps/anthropic",
});

async function main() {
  // output_config 是百炼平台扩展参数，SDK 类型定义中不包含该字段，
  // 通过交叉类型扩展官方参数类型进行透传，避免不安全的类型断言
  type MessageCreateParamsWithOutputConfig =
    Anthropic.MessageCreateParamsNonStreaming &amp; {
      output_config: {
        format: {
          type: "json_schema";
          schema: Record&lt;string, unknown&gt;;
        };
      };
    };

  const params: MessageCreateParamsWithOutputConfig = {
    model: "deepseek-v4-pro",
    max_tokens: 1024,
    messages: [{
      role: "user",
      content: "提取以下邮件的关键信息：张三 (zhangsan@example.com) 对企业版方案感兴趣，希望预约下周二下午 2 点的演示。"
    }],
    output_config: {
      format: {
        type: "json_schema",
        schema: {
          type: "object",
          properties: {
            name: { type: "string" },
            email: { type: "string" },
            plan_interest: { type: "string" },
            demo_requested: { type: "boolean" }
          },
          required: ["name", "email", "plan_interest", "demo_requested"],
          additionalProperties: false
        }
      }
    }
  };
  const message = await anthropic.messages.create(params);

  // deepseek-v4-pro 模型会返回 thinking 块，需要找到 type='text' 的内容块
  const textBlock = message.content.find(
    (block): block is Anthropic.TextBlock =&gt; block.type === "text"
  );
  console.log(textBlock?.text);
}

main().catch(console.error);
</code></pre></div><input id="fig-code-group-8-curl-tab" type="radio" name="check-fig-code-group-8"><label for="fig-code-group-8-curl-tab">curl</label><div class="codeblock-item"><pre data-tag="codeblock" id="code-code-group-8-curl" outputclass="language-bash" code-type="xCode" class="pre codeblock language-bash"><code>curl -X POST "https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/apps/anthropic/v1/messages" \
  -H "Content-Type: application/json" \
  -H "x-api-key: $DASHSCOPE_API_KEY" \
  -d '{
    "model": "deepseek-v4-pro",
    "max_tokens": 1024,
    "messages": [
        {
            "role": "user",
            "content": "提取以下邮件的关键信息：张三 (zhangsan@example.com) 对企业版方案感兴趣，希望预约下周二下午 2 点的演示。"
        }
    ],
    "output_config": {
        "format": {
            "type": "json_schema",
            "schema": {
                "type": "object",
                "properties": {
                    "name": {"type": "string"},
                    "email": {"type": "string"},
                    "plan_interest": {"type": "string"},
                    "demo_requested": {"type": "boolean"}
                },
                "required": ["name", "email", "plan_interest", "demo_requested"],
                "additionalProperties": false
            }
        }
    }
}'
</code></pre></div></div></section></section></td></tr></tbody></table>

<table bordertype="no-border"><colgroup><col style="width:57%"><col style="width:43%"></colgroup><tbody><tr><td><h2>非流式响应<span id="ag1a2b3c4d5f0"></span></h2><p><strong>id</strong> <code>string</code></p><p>消息的唯一标识。</p><p><strong>type</strong> <code>string</code></p><p>固定为 <code>message</code>。</p><p><strong>role</strong> <code>string</code></p><p>固定为 <code>assistant</code>。</p><p><strong>model</strong> <code>string</code></p><p>使用的模型名称。</p><p><strong>content</strong> <code>array</code></p><p>内容数组。</p><section class="collapse" id="accordion-content-数组元素类型-2"><p>content 数组元素类型</p><div><strong>文本信息</strong><section class="collapse" id="accordion-属性-12"><p>属性</p><div><p><strong>type</strong> <code>string</code></p><p>固定为 <code>text</code>。</p><p><strong>text</strong> <code>string</code></p><p>模型生成的文本回复。</p></div></section><p><strong>思考信息</strong>（开启深度思考时返回）</p><section class="collapse" id="accordion-属性-13"><p>属性</p><div><p><strong>type</strong> <code>string</code></p><p>固定为 <code>thinking</code>。</p><p><strong>thinking</strong> <code>string</code></p><p>模型在生成最终回复前的思考过程。</p><p><strong>signature</strong> <code>string</code></p><p>当前固定为空字符串。</p></div></section><p><strong>工具调用信息</strong>（Function Call 场景）</p><section class="collapse" id="accordion-属性-14"><p>属性</p><div><p><strong>type</strong> <code>string</code></p><p>固定为 <code>tool_use</code>。</p><p><strong>id</strong> <code>string</code></p><p>工具调用的唯一标识，用于在后续 <code>tool_result</code> 中关联结果。</p><p><strong>name</strong> <code>string</code></p><p>被调用的工具名称。</p><p><strong>input</strong> <code>object</code></p><p>工具调用的入参。</p></div></section></div></section><p><strong>stop_reason</strong> <code>string</code></p><p>停止原因。可选值：<code>end_turn</code>（正常结束）、<code>max_tokens</code>（达到 Token 上限）、<code>tool_use</code>（工具调用）。</p><p><strong>stop_sequence</strong> <code>string</code></p><p>固定为 <code>null</code>。</p><p><strong>usage</strong> <code>object</code></p><p>Token 用量统计。</p><div class="note note-note"><div class="note-icon-wrapper"></div><div class="note-content"><p><strong>说明</strong>流式调用中，<code>message_start</code> 事件的 <code>usage</code> 仅包含 <code>input_tokens</code> 和 <code>output_tokens</code>；完整 4 个字段在 <code>message_delta</code> 事件中返回。</p></div></div><section class="collapse" id="accordion-属性-15"><p>属性</p><div><p><strong>input_tokens</strong> <code>integer</code></p><p>输入 Token 数量。</p><p><strong>output_tokens</strong> <code>integer</code></p><p>输出 Token 数量。</p><p><strong>cache_creation_input_tokens</strong> <code>integer</code></p><p>缓存创建消耗的输入 Token 数量。</p><p><strong>cache_read_input_tokens</strong> <code>integer</code></p><p>缓存读取消耗的输入 Token 数量。</p></div></section></td><td><strong>响应示例</strong><pre data-tag="codeblock" id="code-block" outputclass="language-json" code-type="xCode" class="pre codeblock language-json"><code>{
  "id": "msg_e2898f19-fc0e-4cb3-bd9b-5b7dc4ea3bc9",
  "type": "message",
  "role": "assistant",
  "model": "qwen3.8-max",
  "content": [
    {
      "type": "thinking",
      "thinking": "让我分析一下这个问题...",
      "signature": ""
    },
    {
      "type": "text",
      "text": "你好！我是通义千问..."
    }
  ],
  "stop_reason": "end_turn",
  "stop_sequence": null,
  "usage": {
    "input_tokens": 22,
    "output_tokens": 223,
    "cache_creation_input_tokens": 0,
    "cache_read_input_tokens": 0
  }
}
</code></pre></td></tr></tbody></table>

<table bordertype="no-border"><colgroup><col style="width:57%"><col style="width:43%"></colgroup><tbody><tr><td><h2>流式响应<span id="ah1a2b3c4d5e8"></span></h2><strong>message_start</strong><p>流的第一个事件，标记消息开始。</p><section class="collapse" id="accordion-属性-16"><p>属性</p><div><p><strong>type</strong> <code>string</code></p><p>固定为 <code>message_start</code>。</p><p><strong>message</strong> <code>object</code></p><p>初始消息对象，<code>content</code> 为空数组，<code>usage</code> 仅含 <code>input_tokens</code> 和 <code>output_tokens</code>。</p></div></section><strong>content_block_start</strong><p>每个内容块开始时发送，标记新内容块的索引和类型。</p><section class="collapse" id="accordion-属性-17"><p>属性</p><div><p><strong>type</strong> <code>string</code></p><p>固定为 <code>content_block_start</code>。</p><p><strong>index</strong> <code>integer</code></p><p>内容块索引，从 0 开始，对应该消息 <code>content</code> 数组中的位置。</p><p><strong>content_block</strong> <code>object</code></p><p>内容块的初始对象。<code>type</code> 取值为 <code>text</code>、<code>thinking</code> 或 <code>tool_use</code>。<code>tool_use</code> 类型在此事件中 <code>input</code> 为空对象，完整入参由后续 <code>content_block_delta</code> 增量拼接。</p></div></section><strong>content_block_delta</strong><p>内容块的增量更新事件。同一内容块会发送多个该事件。</p><section class="collapse" id="accordion-属性-18"><p>属性</p><div><p><strong>type</strong> <code>string</code></p><p>固定为 <code>content_block_delta</code>。</p><p><strong>index</strong> <code>integer</code></p><p>所属内容块索引。</p><p><strong>delta</strong> <code>object</code></p><p>增量对象，<code>type</code> 取值：</p><ul><li><code>text_delta</code>：文本增量，含 <code>text</code> 字段。</li><li><code>thinking_delta</code>：思考增量，含 <code>thinking</code> 字段。</li><li><code>signature_delta</code>：签名增量，含 <code>signature</code> 字段（当前固定为空字符串）。</li><li><code>input_json_delta</code>：工具调用入参增量，含 <code>partial_json</code> 字段。</li></ul></div></section><strong>content_block_stop</strong><p>内容块结束事件。</p><section class="collapse" id="accordion-属性-19"><p>属性</p><div><p><strong>type</strong> <code>string</code></p><p>固定为 <code>content_block_stop</code>。</p><p><strong>index</strong> <code>integer</code></p><p>结束的内容块索引。</p></div></section><strong>message_delta</strong><p>消息级更新事件，在所有内容块结束后发送，包含停止原因和完整的 Token 用量统计。</p><section class="collapse" id="accordion-属性-20"><p>属性</p><div><p><strong>type</strong> <code>string</code></p><p>固定为 <code>message_delta</code>。</p><p><strong>delta</strong> <code>object</code></p><p>包含 <code>stop_reason</code> 和 <code>stop_sequence</code>，取值参见上方非流式响应表格。</p><p><strong>usage</strong> <code>object</code></p><p>完整的 Token 用量统计，包含 <code>input_tokens</code>、<code>output_tokens</code>、<code>cache_creation_input_tokens</code>、<code>cache_read_input_tokens</code>。</p></div></section><strong>message_stop</strong><p>流的最后一个事件，标记消息结束。</p><section class="collapse" id="accordion-属性-21"><p>属性</p><div><p><strong>type</strong> <code>string</code></p><p>固定为 <code>message_stop</code>。</p><p>此外，流式响应还会定期发送 <strong>ping</strong> 事件（<code>{"type":"ping"}</code>）用于保持连接活跃，客户端可忽略。</p></div></section></td><td><strong>流式响应示例</strong><pre data-tag="codeblock" id="code-block-2" outputclass="language-json" code-type="xCode" class="pre codeblock language-json"><code>{"type":"message_start","message":{"id":"msg_xxx","type":"message","role":"assistant","model":"qwen3.8-max","content":[],"usage":{"input_tokens":15,"output_tokens":0}}}
{"type":"content_block_start","index":0,"content_block":{"type":"thinking","thinking":"","signature":""}}
{"type":"content_block_delta","index":0,"delta":{"type":"thinking_delta","thinking":"Here's a thinking process:\n\n1. **Analyze User Input:**\n   - **Topic:** 人工智能 (Artificial Intelligence / AI)\n   - **Request:** 请简单介绍一下人工智能。"}}
{"type":"content_block_delta","index":0,"delta":{"type":"signature_delta","signature":""}}
{"type":"content_block_stop","index":0}
{"type":"content_block_start","index":1,"content_block":{"type":"text","text":""}}
{"type":"content_block_delta","index":1,"delta":{"type":"text_delta","text":"人工智能（Artificial Intelligence，简称AI）是计算机科学的重要分支..."}}
{"type":"content_block_stop","index":1}
{"type":"message_delta","delta":{"stop_reason":"end_turn","stop_sequence":null},"usage":{"input_tokens":15,"output_tokens":1078,"cache_creation_input_tokens":0,"cache_read_input_tokens":0}}
{"type":"message_stop"}
</code></pre></td></tr></tbody></table>

## 常见问题

**在 Claude Desktop 或 Claude Code 中配置后，连接测试报错**`Model discovery — Gateway /v1/models returned HTTP 404`**，或请求地址出现**`/v1/v1/models`**，如何解决？**

Claude Desktop、Claude Code 等客户端的模型发现（model discovery）功能会在配置的 base URL 后自动追加 `/v1/models`。请按以下两点排查：

-   **base URL 不要以**`/v1/`**结尾**：应填写到 `/apps/anthropic` 为止（例如华北2（北京）填 `https://dashscope.aliyuncs.com/apps/anthropic`，其余地域的地址见上方“接入信息”）。若误填为 `.../apps/anthropic/v1/`，客户端追加 `/v1/models` 后会形成 `/v1/v1/models` 的重复路径，导致 HTTP 404。因此出现 404 时，请先检查实际请求地址是否出现 `/v1/v1/` 重复，若有则去掉 base URL 末尾的 `/v1/`。
-   **手动添加模型以跳过自动发现**：百炼 Anthropic 兼容端点仅提供 Messages 接口（`/v1/messages`），不提供模型列表接口（`/v1/models`），因此模型发现请求本身也会返回 404。请在客户端的 Models 中手动添加模型（例如 `qwen3.7-plus`）以跳过自动发现。
