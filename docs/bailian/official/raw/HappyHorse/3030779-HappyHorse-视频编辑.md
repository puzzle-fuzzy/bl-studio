HappyHorse 视频编辑模型支持输入视频与参考图，结合文本指令完成风格变换、局部替换等编辑任务。

## 适用范围

为确保调用成功，请务必保证**模型、Endpoint URL 和 API Key 均属于同一地域**。跨地域调用将会失败。

-   [**选择模型**](https://bailian.console.aliyun.com/cn-beijing?tab=model#/model-market/all)：确认模型所属的地域。
-   **选择 URL**：选择对应的地域 Endpoint URL，支持HTTP URL。
-   **配置 API Key**：选择地域并[获取API Key](/zh/model-studio/get-api-key)，再[配置API Key到环境变量](/zh/model-studio/configure-api-key-through-environment-variables)。

**说明**本文的示例代码适用于**华北2（北京）地域**。

**重要**阿里云百炼为华北2（北京）、新加坡地域推出了业务空间专属域名，**能够为推理请求提供卓越的性能和更高的稳定性**，建议迁移至新域名：

-   华北2（北京）地域：从 `https://dashscope.aliyuncs.com` 迁移至 `https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com`
-   新加坡地域：从 `https://dashscope-intl.aliyuncs.com` 迁移至 `https://{WorkspaceId}.ap-southeast-1.maas.aliyuncs.com`

其中 `{WorkspaceId}` 为您的业务空间 ID，可在阿里云百炼控制台的**业务空间详情**页面查看。现有域名仍可正常使用。

## HTTP调用

由于视频编辑任务耗时较长（通常为1-5分钟），API采用异步调用。整个流程包含 **"创建任务 -> 轮询获取"** 两个核心步骤，具体如下：

### 步骤1：创建任务获取任务ID

#### 华北2（北京）

`POST https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/api/v1/services/aigc/video-generation/video-synthesis`

#### 新加坡

`POST https://{WorkspaceId}.ap-southeast-1.maas.aliyuncs.com/api/v1/services/aigc/video-generation/video-synthesis`

#### 美国（弗吉尼亚）

`POST https://dashscope-us.aliyuncs.com/api/v1/services/aigc/video-generation/video-synthesis`

#### 德国（法兰克福）

`POST https://{WorkspaceId}.eu-central-1.maas.aliyuncs.com/api/v1/services/aigc/video-generation/video-synthesis`

#### 日本（东京）

`POST https://{WorkspaceId}.ap-northeast-1.maas.aliyuncs.com/api/v1/services/aigc/video-generation/video-synthesis`

调用时请将`{WorkspaceId}`替换为真实的[业务空间ID](/zh/model-studio/obtain-the-app-id-and-workspace-id#732535cfc959h)。

**说明**

-   创建成功后，使用接口返回的 `task_id` 查询结果，task\_id 有效期为 24 小时。**请勿重复创建任务**，轮询获取即可。
-   新手指引请参见[Postman](/zh/model-studio/first-call-to-image-and-video-api)。

<table bordertype="no-border"><colgroup><col style="width:53.88%"><col style="width:46.12%"></colgroup><tbody><tr><td><h4>请求参数<span id="hve123a0h4reqp"></span></h4><h5>请求头（Headers）<span id="hve144a0h5hdr1"></span></h5><p><strong>Content-Type</strong><code>string</code><strong>（必选）</strong></p><p>请求内容类型。此参数必须设置为<code>application/json</code>。</p><p><strong>Authorization</strong><code>string</code><strong>（必选）</strong></p><p>请求身份认证。接口使用阿里云百炼API Key进行身份认证。示例值：Bearer sk-xxxx。</p><p><strong>X-DashScope-Async</strong><code>string</code><strong>（必选）</strong></p><p>异步处理配置参数。HTTP请求只支持异步，<strong>必须设置为</strong><code>enable</code>。</p><div class="note note-important"><div class="note-icon-wrapper"></div><div class="note-content"><p><strong>重要</strong>缺少此请求头将报错：“current user api does not support synchronous calls”。</p></div></div><h5>请求体（Request Body）<span id="hve156a0h5body"></span></h5><p><strong>model</strong> <code>string</code> <strong>（必选）</strong></p><p>模型名称。</p><p>固定值：happyhorse-1.0-video-edit。</p><p><strong>input</strong> <code>object</code> <strong>（必选）</strong></p><p>输入的基本信息，包括待编辑的视频、参考图片和提示词。</p><section class="collapse expanded" id="accordion-属性"><p>属性</p><div><p><strong>prompt</strong> <code>string</code> <strong>（必选）</strong></p><p>文本提示词。用来描述对视频的编辑意图，如风格转换、局部替换等。</p><p>支持任何语言输入，长度不超过5000个非中文字符或2500个中文字符，超过部分会自动截断。</p><p><strong>media</strong> <code>array</code> <strong>（必选）</strong></p><p>媒体素材列表，用于指定待编辑的视频和参考图像。</p><p>数组必须包含<strong>1个</strong> <code>video</code> 类型元素；可选包含0~5个 <code>reference_image</code> 类型元素。</p><section class="collapse expanded" id="accordion-元素属性"><p>元素属性</p><div><p><strong>type</strong> <code>string</code> <strong>（必选）</strong></p><p>媒体素材类型。可选值为：</p><ul><li><code>video</code>：必传。待编辑的视频。</li><li><code>reference_image</code>：可选。参考图像。</li></ul><p>素材限制：</p><ul><li>视频数量：有且仅有1个。</li><li>参考图像数量：0～5张。</li></ul><p><strong>url</strong> <code>string</code> <strong>（必选）</strong></p><p>媒体素材的URL地址。</p><section class="collapse expanded" id="accordion-传入视频-type-video"><p>传入视频（type=video）</p><div><p>待编辑的视频URL，必须为公网可访问的URL。</p><ul><li>支持 HTTP 和 HTTPS 协议。</li><li>示例值：<a href="https://xxx/xxx.mp4"></a><a href="https://xxx/xxx.mp4">https://xxx/xxx.mp4</a>。</li></ul><p>视频限制：</p><ul><li>格式：MP4、MOV（建议H.264编码）。</li><li>时长：3~60秒。</li><li>分辨率：长边不超过4096像素，短边不小于360像素。</li><li>宽高比：1:2.5~2.5:1。</li><li>文件大小：不超过100MB。</li><li>帧率：8-60fps（若输入可变帧率视频，需保证帧率变化均在此范围内）。</li></ul><div class="note note-note"><div class="note-icon-wrapper"></div><div class="note-content"><p><strong>说明</strong><strong>输出视频时长：3~15秒</strong>。</p><ul><li>当输入视频不超过 15 秒时，输出视频时长与输入视频保持一致。</li><li>当输入视频超过 15 秒时，系统会从头开始自动截取前 15 秒作为有效片段，因此最长输出为 15 秒。</li></ul></div></div></div></section><section class="collapse expanded" id="accordion-传入图像-type-reference-image"><p>传入图像（type=reference_image）</p><div><p>参考图像的URL或 Base64 编码数据。</p><p>图像限制：</p><ul><li>格式：JPEG、JPG、PNG、WEBP。</li><li>分辨率：宽高尺寸不小于300像素。</li><li>宽高比：1:2.5~2.5:1。</li><li>文件大小：不超过20MB。</li></ul><p>支持输入的格式：</p><ol><li><p>公网URL：</p><ul><li>支持 HTTP 或 HTTPS 协议。</li><li>示例值：<a href="https://xxx/xxx.png"></a><a href="https://xxx/xxx.png">https://xxx/xxx.png</a>。</li></ul></li><li><p>Base64 编码图像后的字符串：</p><ul><li><p>数据格式：<code>data:{MIME_type};base64,{base64_data}</code>。</p></li><li><p>示例值：data:image/png;base64,GDU7MtCZzEbTbmRZ......（示例已截断，仅做演示）。</p><section class="collapse expanded" id="accordion-base64编码数据格式"><p>Base64编码数据格式</p><div><p>格式：&nbsp;<code>data:{MIME_type};base64,{base64_data}</code>&nbsp;。</p><ul><li>{base64_data}：图像文件经过 Base64 编码后的字符串。</li><li>{MIME_type}：图像的媒体类型，需与文件格式对应。</li></ul><table><colgroup><col style="width:50%"><col style="width:50%"></colgroup><tbody><tr><td><p>图像格式</p></td><td><p>MIME Type</p></td></tr><tr><td><p>JPEG</p></td><td><p>image/jpeg</p></td></tr><tr><td><p>JPG</p></td><td><p>image/jpeg</p></td></tr><tr><td><p>PNG</p></td><td><p>image/png</p></td></tr><tr><td><p>WEBP</p></td><td><p>image/webp</p></td></tr></tbody></table></div></section></li></ul></li></ol></div></section></div></section></div></section><p><strong>parameters</strong> <code>object</code> （可选）</p><p>视频编辑参数。如设置视频分辨率等。</p><section class="collapse expanded" id="accordion-属性-2"><p>属性</p><div><p><strong>resolution</strong> <code>string</code> （可选）</p><p>生成视频的分辨率档位。</p><p>可选值：</p><ul><li><code>1080P</code>：默认值。</li><li><code>720P</code></li></ul><p><strong>watermark</strong> <code>boolean</code> （可选）</p><p>是否在生成的视频上添加水印标识。水印位于视频右下角，文案固定为“Happy Horse”。</p><ul><li><code>true</code>：默认值，添加水印。</li><li><code>false</code>：不添加水印。</li></ul><p><strong>audio_setting</strong> <code>string</code> （可选）</p><p>声音控制。</p><ul><li><code>auto</code>：默认值，由模型自行控制。</li><li><code>origin</code>：保留输入视频的原始声音。</li></ul><p><strong>seed</strong><code>integer</code>（可选）</p><p>随机数种子，取值范围为<code>[0, 2147483647]</code>。</p><p>未指定时，系统自动生成随机种子。若需提升生成结果的可复现性，建议固定seed值。</p><p>请注意，由于模型生成具有概率性，即使使用相同 seed，也不能保证每次生成结果完全一致。</p></div></section></td><td><section data-tag="tabbed-content-box" outputclass="tabbed-content-box" id="sec-tabs-2" class="tabbed-content-box section"><section id="视频编辑-指令-参考图" class="section"><h4 id="视频编辑-指令-参考图-h4">视频编辑（指令+参考图）</h4><pre data-tag="codeblock" id="code-block" outputclass="language-bash" code-type="xCode" class="pre codeblock language-bash"><code># 以下为华北2（北京）地域的URL。请将 {WorkspaceId} 替换为您的百炼业务空间ID，各地域的URL不同。
curl --location 'https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/api/v1/services/aigc/video-generation/video-synthesis' \
    -H 'X-DashScope-Async: enable' \
    -H "Authorization: Bearer $DASHSCOPE_API_KEY" \
    -H 'Content-Type: application/json' \
    -d '{
    "model": "happyhorse-1.0-video-edit",
    "input": {
        "prompt": "让视频中的马头人身角色穿上图片中的条纹毛衣",
        "media": [
            {
                "type": "video",
                "url": "https://help-static-aliyun-doc.aliyuncs.com/file-manage-files/zh-CN/20260409/dozxak/Wan_Video_Edit_33_1.mp4"
            },
            {
                "type": "reference_image",
                "url": "https://help-static-aliyun-doc.aliyuncs.com/file-manage-files/zh-CN/20260415/hynnff/wan-video-edit-clothes.webp"
            }
        ]
    },
    "parameters": {
        "resolution": "720P"
    }
}'
</code></pre></section></section></td></tr></tbody></table>

<table bordertype="no-border"><colgroup><col style="width:53.54%"><col style="width:46.46%"></colgroup><tbody><tr><td><h4>响应参数<span id="hve379a0h4rsp1"></span></h4><p><strong>output</strong> <code>object</code></p><p>任务输出信息。</p><section class="collapse expanded" id="accordion-属性-3"><p>属性</p><div><p><strong>task_id</strong> <code>string</code></p><p>任务ID。查询有效期24小时。</p><p><strong>task_status</strong> <code>string</code></p><p>任务状态。</p><section class="collapse expanded" id="accordion-枚举值"><p>枚举值</p><div><ul><li>PENDING：任务排队中</li><li>RUNNING：任务处理中</li><li>SUCCEEDED：任务执行成功</li><li>FAILED：任务执行失败</li><li>CANCELED：任务已取消</li><li>UNKNOWN：任务不存在或状态未知</li></ul></div></section></div></section><p><strong>request_id</strong><code>string</code></p><p>请求唯一标识。可用于请求明细溯源和问题排查。</p><p><strong>code</strong><code>string</code></p><p>请求失败的错误码。请求成功时不会返回此参数，详情请参见<a href="/zh/model-studio/error-code">错误码</a>。</p><p><strong>message</strong><code>string</code></p><p>请求失败的详细信息。请求成功时不会返回此参数，详情请参见<a href="/zh/model-studio/error-code">错误码</a>。</p></td><td><section data-tag="tabbed-content-box" outputclass="tabbed-content-box" id="sec-tabs-3" class="tabbed-content-box section"><section id="成功响应" class="section"><h4 id="成功响应-h4">成功响应</h4><p>请保存 task_id，用于查询任务状态与结果。</p><pre data-tag="codeblock" id="code-block-2" outputclass="language-json" code-type="xCode" class="pre codeblock language-json"><code>{
    "output": {
        "task_status": "PENDING",
        "task_id": "0385dc79-5ff8-4d82-bcb6-xxxxxx"
    },
    "request_id": "4909100c-7b5a-9f92-bfe5-xxxxxx"
}
</code></pre></section><section id="异常响应" class="section"><h4 id="异常响应-h4">异常响应</h4><p>创建任务失败，请参见<a href="/zh/model-studio/error-code">错误码</a>进行解决。</p><pre data-tag="codeblock" id="code-block-3" outputclass="language-json" code-type="xCode" class="pre codeblock language-json"><code>{
    "code": "InvalidApiKey",
    "message": "No API-key provided.",
    "request_id": "7438d53d-6eb8-4596-8835-xxxxxx"
}
</code></pre></section></section></td></tr></tbody></table>

### 步骤2：根据任务ID查询结果

#### 华北2（北京）

`GET https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/api/v1/tasks/{task_id}`

#### 新加坡

`GET https://{WorkspaceId}.ap-southeast-1.maas.aliyuncs.com/api/v1/tasks/{task_id}`

#### 美国（弗吉尼亚）

`GET https://dashscope-us.aliyuncs.com/api/v1/tasks/{task_id}`

#### 德国（法兰克福）

`GET https://{WorkspaceId}.eu-central-1.maas.aliyuncs.com/api/v1/tasks/{task_id}`

#### 日本（东京）

`GET https://{WorkspaceId}.ap-northeast-1.maas.aliyuncs.com/api/v1/tasks/{task_id}`

**说明**

-   **轮询建议**：视频编辑过程约需数分钟，建议采用**轮询**机制，并设置合理的查询间隔（如 15 秒）来获取结果。
-   **任务状态流转**：PENDING（排队中）→ RUNNING（处理中）→ SUCCEEDED（成功）/ FAILED（失败）。
-   **task\_id 有效期**：**24小时**，超时后将无法查询结果，接口将返回任务状态为`UNKNOWN`。
-   **RPS 限制**：查询接口默认RPS为20。如需更高频查询或事件通知，建议[配置异步任务回调](/zh/model-studio/async-task-api)。
-   **更多操作**：如需批量查询、取消任务等操作，请参见[管理异步任务](/zh/model-studio/manage-asynchronous-tasks)。

<table bordertype="no-border"><colgroup><col style="width:53.88%"><col style="width:46.12%"></colgroup><tbody><tr><td><h4>请求参数<span id="hve434a0h4qr01"></span></h4><h5>请求头（Headers）<span id="hve444a0h5qr01"></span></h5><p><strong>Authorization</strong><code>string</code><strong>（必选）</strong></p><p>请求身份认证。接口使用阿里云百炼API Key进行身份认证。示例值：Bearer sk-xxxx。</p><h5>URL路径参数（Path parameters）<span id="hve450a0h5qr02"></span></h5><p><strong>task_id</strong> <code>string</code><strong>（必选）</strong></p><p>任务ID。</p></td><td><section data-tag="tabbed-content-box" outputclass="tabbed-content-box" id="sec-tabs-5" class="tabbed-content-box section"><section id="查询任务结果" class="section"><h4 id="查询任务结果-h4">查询任务结果</h4><p>将<code>{task_id}</code>完整替换为上一步接口返回的<code>task_id</code>的值。<code>task_id</code>查询有效期为24小时，并请将<code>{WorkspaceId}</code>替换为真实的<a href="/zh/model-studio/obtain-the-app-id-and-workspace-id#732535cfc959h">业务空间ID</a>。</p><pre data-tag="codeblock" id="code-block-4" outputclass="language-bash" code-type="xCode" class="pre codeblock language-bash"><code>curl -X GET https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/api/v1/tasks/{task_id} \
--header "Authorization: Bearer $DASHSCOPE_API_KEY"
</code></pre></section></section></td></tr></tbody></table>

<table bordertype="no-border"><colgroup><col style="width:53.88%"><col style="width:46.12%"></colgroup><tbody><tr><td><h4>响应参数<span id="hve464a0h4qrs1"></span></h4><p><strong>output</strong><code>object</code></p><p>任务输出信息。</p><section class="collapse expanded" id="accordion-属性-4"><p>属性</p><div><p><strong>task_id</strong> <code>string</code></p><p>任务ID。查询有效期24小时。</p><p><strong>task_status</strong> <code>string</code></p><p>任务状态。</p><section class="collapse expanded" id="accordion-枚举值-2"><p>枚举值</p><div><ul><li>PENDING：任务排队中</li><li>RUNNING：任务处理中</li><li>SUCCEEDED：任务执行成功</li><li>FAILED：任务执行失败</li><li>CANCELED：任务已取消</li><li>UNKNOWN：任务不存在或状态未知</li></ul></div></section><strong>轮询过程中的状态流转：</strong><ul><li>PENDING（排队中） → RUNNING（处理中）→ SUCCEEDED（成功）/ FAILED（失败）。</li><li>初次查询状态通常为 PENDING（排队中）或 RUNNING（处理中）。</li><li>当状态变为 SUCCEEDED 时，响应中将包含生成的视频URL。</li><li>若状态为 FAILED，请检查错误信息并重试。</li><li>若状态为 CANCELED，表示任务已取消，如需继续请重新提交任务。</li><li>若状态为 UNKNOWN，表示任务不存在或状态未知，可能在 task_id 不存在或超过 24 小时有效期后出现。</li></ul><p><strong>submit_time</strong> <code>string</code></p><p>任务提交时间。格式为&nbsp;YYYY-MM-DD HH:mm:ss.SSS。</p><p><strong>scheduled_time</strong> <code>string</code></p><p>任务执行时间。格式为&nbsp;YYYY-MM-DD HH:mm:ss.SSS。</p><p><strong>end_time</strong> <code>string</code></p><p>任务完成时间。格式为&nbsp;YYYY-MM-DD HH:mm:ss.SSS。</p><p><strong>video_url</strong><code>string</code></p><p>视频URL。仅在&nbsp;task_status&nbsp;为&nbsp;SUCCEEDED&nbsp;时返回。</p><p>链接有效期24小时，可通过此URL下载视频。视频格式为MP4（H.264 编码）。</p><p><strong>orig_prompt</strong>&nbsp;<code>string</code></p><p>原始输入的prompt，对应请求参数<code>prompt</code>。</p><p><strong>code</strong><code>string</code></p><p>请求失败的错误码。请求成功时不会返回此参数，详情请参见<a href="/zh/model-studio/error-code">错误码</a>。</p><p><strong>message</strong><code>string</code></p><p>请求失败的详细信息。请求成功时不会返回此参数，详情请参见<a href="/zh/model-studio/error-code">错误码</a>。</p></div></section><p><strong>usage</strong> <code>object</code></p><p>输出信息统计。只对成功的结果计数。</p><section class="collapse expanded" id="accordion-属性-5"><p>属性</p><div><p><strong>duration</strong> <code>float</code></p><p>生成视频的总视频时长，用于计费。</p><p><strong>SR</strong> <code>integer</code></p><p>生成视频的分辨率档位。</p><p><strong>output_video_duration</strong> <code>float</code></p><p>输出视频的时长，单位秒。</p><p><strong>input_video_duration</strong> <code>float</code></p><p>输入视频的时长，单位秒。</p><p><strong>video_count</strong> <code>integer</code></p><p>生成视频的数量。固定为1。</p></div></section><p><strong>request_id</strong><code>string</code></p><p>请求唯一标识。可用于请求明细溯源和问题排查。</p></td><td><section data-tag="tabbed-content-box" outputclass="tabbed-content-box" id="sec-tabs-6" class="tabbed-content-box section"><section id="任务执行成功" class="section"><h4 id="任务执行成功-h4">任务执行成功</h4><p>视频URL仅保留24小时，超时后会被自动清除，请及时保存生成的视频。</p><pre data-tag="codeblock" id="code-block-5" outputclass="language-json" code-type="xCode" class="pre codeblock language-json"><code>{
    "request_id": "c11018a8-3f83-9591-a636-xxxxxx",
    "output": {
        "task_id": "051c7b40-b2c5-4341-aee4-xxxxxx",
        "task_status": "SUCCEEDED",
        "submit_time": "2026-04-26 14:13:14.373",
        "scheduled_time": "2026-04-26 14:13:14.419",
        "end_time": "2026-04-26 14:14:13.679",
        "orig_prompt": "让视频中的马头人身角色穿上图片中的条纹毛衣",
        "video_url": "https://dashscope-result.oss-cn-beijing.aliyuncs.com/xxxx.mp4"
    },
    "usage": {
        "duration": 13.24,
        "input_video_duration": 6.62,
        "output_video_duration": 6.62,
        "video_count": 1,
        "SR": 720
    }
}
</code></pre></section><section id="任务执行失败" class="section"><h4 id="任务执行失败-h4">任务执行失败</h4><p>若任务执行失败，task_status将置为 FAILED，并提供错误码和信息。请参见<a href="/zh/model-studio/error-code">错误码</a>进行解决。</p><pre data-tag="codeblock" id="code-block-6" outputclass="language-json" code-type="xCode" class="pre codeblock language-json"><code>{
    "request_id": "e5d70b02-ebd3-98ce-9fe8-759d7d7b107d",
    "output": {
        "task_id": "86ecf553-d340-4e21-af6e-a0c6a421c010",
        "task_status": "FAILED",
        "code": "InvalidParameter",
        "message": "The resolution is not valid xxxxxx"
    }
}
</code></pre></section><section id="任务查询过期" class="section"><h4 id="任务查询过期-h4">任务查询过期</h4><p>task_id查询有效期为 24 小时，超时后将无法查询，返回以下报错信息。</p><pre data-tag="codeblock" id="code-block-7" outputclass="language-json" code-type="xCode" class="pre codeblock language-json"><code>{
    "request_id": "a4de7c32-7057-9f82-8581-xxxxxx",
    "output": {
        "task_id": "502a00b1-19d9-4839-a82f-xxxxxx",
        "task_status": "UNKNOWN"
    }
}
</code></pre></section></section></td></tr></tbody></table>

## 错误码

如果模型调用失败并返回报错信息，请参见[错误码](/zh/model-studio/error-code)进行解决。
