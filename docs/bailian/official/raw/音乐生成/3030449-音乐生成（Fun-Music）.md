本文介绍音乐生成 Fun-Music 模型的 API 参数详情。

**用户指南**：关于模型介绍和选型建议请参见[音乐生成](/zh/model-studio/fun-music)。

**重要**该模型目前处于邀测阶段，您需要前往[模型广场](https://bailian.console.aliyun.com/cn-beijing/?tab=model#/model-market/detail/fun-music-v1)申请开通后方可使用。该模型服务仅在华北2（北京）地域下可用。

## 前提条件

已获取 API Key。获取方式请参见[获取 API Key](/zh/model-studio/get-api-key)。

## 服务端点

POST `https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/api/v1/services/audio/music/generation`，调用时请将`WorkspaceId`替换为真实的[Workspace ID](/zh/model-studio/obtain-the-app-id-and-workspace-id#732535cfc959h)。

通信协议：HTTPS。流式输出支持 SSE（Server-Sent Events）。

**重要**阿里云百炼为华北2（北京）、新加坡地域推出了业务空间专属域名，**能够为推理请求提供卓越的性能和更高的稳定性**，建议迁移至新域名：

-   华北2（北京）地域：从 `https://dashscope.aliyuncs.com` 迁移至 `https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com`
-   新加坡地域：从 `https://dashscope-intl.aliyuncs.com` 迁移至 `https://{WorkspaceId}.ap-southeast-1.maas.aliyuncs.com`

其中 `{WorkspaceId}` 为您的业务空间 ID，可在阿里云百炼控制台的**业务空间详情**页面查看。现有域名仍可正常使用。

## 请求头

| 
**参数名**

 | 

**类型**

 | 

**必填**

 | 

**说明**

 |
| --- | --- | --- | --- |
| 

Authorization

 | 

string

 | 

是

 | 

`Bearer {api-key}`，请替换为您的 API Key

 |
| 

Content-Type

 | 

string

 | 

是

 | 

`application/json`

 |
| 

X-DashScope-SSE

 | 

string

 | 

否

 | 

设为 `enable` 启用 SSE 流式输出

 |

<table bordertype="no-border"><colgroup><col style="width:47.89%"><col style="width:52.11%"></colgroup><tbody><tr><td><h2>请求体<span id="g5b8c1d3f4a7d"></span></h2><p><strong>model</strong><code>string</code><strong>（必选）</strong></p><p>模型名称。可选值：</p><ul><li><code>fun-music-v1</code></li><li><code>fun-music-preview</code></li></ul><p><strong>input</strong><code>object</code><strong>（必选）</strong></p><p>输入参数对象<strong>。</strong></p><section class="collapse expanded" id="accordion-属性"><p>属性</p><div><p><strong>prompt</strong><code>string</code><strong>（条件必选）</strong></p><p>提示词内容，模型将根据提示词自动创作并生成音乐。</p><ul><li><code>fun-music-v1</code>：与 <code>lyrics</code> 二选一，至少传入其中之一。</li><li><code>fun-music-preview</code>：必选。</li></ul><p>字符限制：</p><ul><li>非流式模式：1~2000 字符</li><li>流式模式：5~1000 个中文汉字或英文单词</li></ul><div class="note note-note"><div class="note-icon-wrapper"></div><div class="note-content"><p><strong>说明</strong>当同时传入 <code>prompt</code> 和 <code>lyrics</code> 时，仅 <code>lyrics</code> 生效，<code>prompt</code> 将被忽略。</p></div></div><p><strong>lyrics</strong><code>string</code><strong>（条件必选）</strong></p><p>歌词内容。</p><ul><li><code>fun-music-v1</code>：与 <code>prompt</code> 二选一，至少传入其中之一。</li><li><code>fun-music-preview</code>：可选。</li></ul><p>字符限制：</p><ul><li>非流式模式：中文 5~350 字符，英文 5~2000 字符</li><li>流式模式：中文 300~350 字，英文 200~250 词</li></ul><div class="note note-note"><div class="note-icon-wrapper"></div><div class="note-content"><p><strong>说明</strong>当同时传入 <code>lyrics</code> 和 <code>prompt</code> 时，仅 <code>lyrics</code> 生效，<code>prompt</code> 将被忽略。</p></div></div><p><strong>is_instrumental</strong><code>boolean</code>（可选） 默认值为 <code>false</code></p><p>是否生成纯音乐。设为 <code>true</code> 时生成纯音乐（无人声演唱），设为 <code>false</code> 时生成歌曲。</p><div class="note note-note"><div class="note-icon-wrapper"></div><div class="note-content"><p><strong>说明</strong>当 <code>is_instrumental</code> 为 <code>true</code> 时，<code>lyrics</code> 和 <code>gender</code> 参数无效。</p></div></div><p><strong>gender</strong><code>string</code>（可选） 默认值为 <code>female</code></p><p>演唱声音的性别。仅 <code>fun-music-v1</code> 模型支持该参数。可选值：</p><ul><li><code>male</code>：男声</li><li><code>female</code>：女声</li></ul><p><strong>format</strong><code>string</code>（可选） 默认值为 <code>mp3</code></p><p>音频编码格式。可选值：</p><ul><li><code>mp3</code>：适合网络传输和存储</li><li><code>wav</code>：适合后期处理和高质量播放</li></ul><p><strong>enable_aigc_watermark</strong><code>boolean</code>（可选） 默认值为 <code>false</code></p><p>AIGC 水印开关。开启后，会在生成的音频末尾追加表示“AI”的摩尔斯电码音频信号（·— ··），用于标识该音频为 AI 生成内容。开启水印会增加音频时长。</p></div></section></td><td><div outputclass="tabbed-codeblock" data-tag="fig" id="fig-code-group" class="tabbed-codeblock-box"><div class="tab-box"></div><input id="fig-code-group-非流式输出-tab" type="radio" name="check-fig-code-group" checked=""><label for="fig-code-group-非流式输出-tab">非流式输出</label><div class="codeblock-item"><pre data-tag="codeblock" id="code-code-group-非流式输出" outputclass="language-bash" code-type="xCode" class="pre codeblock language-bash"><code>curl -X POST 'https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/api/v1/services/audio/music/generation' \
-H "Authorization: Bearer $DASHSCOPE_API_KEY" \
-H "Content-Type: application/json" \
-d '{
    "model": "fun-music-v1",
    "input": {
        "prompt": "夏日清新民谣，木吉他与口琴伴奏，轻快节奏，适合旅行Vlog背景音乐",
        "gender": "female"
    }
}'
</code></pre></div><input id="fig-code-group-流式输出-tab" type="radio" name="check-fig-code-group"><label for="fig-code-group-流式输出-tab">流式输出</label><div class="codeblock-item"><pre data-tag="codeblock" id="code-code-group-流式输出" outputclass="language-bash" code-type="xCode" class="pre codeblock language-bash"><code>curl -X POST 'https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/api/v1/services/audio/music/generation' \
-H "Authorization: Bearer $DASHSCOPE_API_KEY" \
-H "Content-Type: application/json" \
-H "X-DashScope-SSE: enable" \
-d '{
    "model": "fun-music-v1",
    "input": {
        "prompt": "节奏感强的电子舞曲，合成器音效，充满能量，适合健身运动场景",
        "gender": "male"
    }
}'
</code></pre></div></div></td></tr></tbody></table>

<table bordertype="no-border"><colgroup><col style="width:47.82%"><col style="width:52.18%"></colgroup><tbody><tr><td><h2>返回对象<span id="r1d4e6f8b9c3r"></span></h2><p><strong>request_id</strong> <code>string</code></p><p>请求 ID，用于问题排查和日志追踪。</p><p><strong>output</strong><code>object</code></p><p>模型的输出。</p><section class="collapse expanded" id="accordion-属性-2"><p>属性</p><div><p><strong>audio</strong> <code>object</code></p><p>模型输出的音频信息。</p><section class="collapse expanded" id="accordion-属性-3"><p>属性</p><div><p><strong>data</strong> <code>string</code></p><p>流式输出时的 Base64 音频数据片段。非流式输出时为空字符串。</p><p><strong>url</strong> <code>string</code></p><p>完整音频文件的 OSS URL，有效期 24 小时。非流式模式下直接返回；流式模式下仅在最终消息中出现。</p><p><strong>id</strong> <code>string</code></p><p>音频文件 ID。</p><p><strong>expires_at</strong> <code>integer</code></p><p>音频 URL 过期时间戳（Unix timestamp）。</p></div></section><p><strong>extra_info</strong> <code>object</code></p><p>额外信息。包含以下字段：</p><section class="collapse expanded" id="accordion-属性-4"><p>属性</p><div><p><strong>channels</strong> <code>integer</code></p><p>音频声道数（如：2 表示立体声）。</p><p><strong>sample_rate</strong> <code>string</code></p><p>音频采样率（如："48000"）。</p><p><strong>lyrics</strong> <code>string</code></p><p>歌词内容。</p></div></section><p><strong>finish_reason</strong> <code>string</code></p><p>结束原因：</p><ul><li><code>null</code>：正在生成中</li><li><code>stop</code>：生成自然结束</li></ul></div></section><p><strong>usage</strong> <code>object</code></p><p>本次请求的计费信息。</p><section class="collapse expanded" id="accordion-属性-5"><p>属性</p><div><p><strong>duration</strong> <code>integer</code></p><p>音乐时长（秒），用于计费。</p></div></section></td><td><div outputclass="tabbed-codeblock" data-tag="fig" id="fig-code-group-2" class="tabbed-codeblock-box"><div class="tab-box"></div><input id="fig-code-group-2-非流式输出-tab" type="radio" name="check-fig-code-group-2" checked=""><label for="fig-code-group-2-非流式输出-tab">非流式输出</label><div class="codeblock-item"><pre data-tag="codeblock" id="code-code-group-2-非流式输出" outputclass="language-json" code-type="xCode" class="pre codeblock language-json"><code>{
    "output": {
        "audio": {
            "data": "",
            "expires_at": 1774936147,
            "id": "audio_46c51288-7ed6-95cc-a119-xxxxxxxxxxxx",
            "url": "http://dashscope-result-bj.oss-cn-beijing.aliyuncs.com/pre/fun-music/20260330/xxxxxxxx/a8db24cc-d35f-961b-af81-a9e8d8b01f67.mp3?xxx"
        },
        "extra_info": {
            "channels": 2,
            "lyrics": "[verse]\n清晨的阳光穿过窗帘,\n咖啡的香气弥漫房间.\n翻开昨天未读完的书,\n时光就这样悄悄流转.\n\n[chorus]\n慢慢来不着急,\n生活本该如此惬意.\n把烦恼都丢进风里,\n拥抱每一个晴天雨季.",
            "sample_rate": 48000
        },
        "finish_reason": "stop"
    },
    "usage": {
        "duration": 200
    },
    "request_id": "46c51288-7ed6-95cc-a119-xxxxxxxxxxxx"
}
</code></pre></div><input id="fig-code-group-2-流式输出-中间消息-tab" type="radio" name="check-fig-code-group-2"><label for="fig-code-group-2-流式输出-中间消息-tab">流式输出（中间消息）</label><div class="codeblock-item"><pre data-tag="codeblock" id="code-code-group-2-流式输出-中间消息" outputclass="language-json" code-type="xCode" class="pre codeblock language-json"><code>{
    "output": {
        "audio": {
            "data": "base64 音频数据",
            "expires_at": 1774937185,
            "id": "audio_a8db24cc-d35f-961b-af81-xxxxxxxxxxxx"
        },
        "finish_reason": "null"
    },
    "request_id": "a8db24cc-d35f-961b-af81-xxxxxxxxxxxx"
}
</code></pre></div><input id="fig-code-group-2-流式输出-最终消息-tab" type="radio" name="check-fig-code-group-2"><label for="fig-code-group-2-流式输出-最终消息-tab">流式输出（最终消息）</label><div class="codeblock-item"><pre data-tag="codeblock" id="code-code-group-2-流式输出-最终消息" outputclass="language-json" code-type="xCode" class="pre codeblock language-json"><code>{
    "output": {
        "audio": {
            "expires_at": 1774937185,
            "id": "audio_a8db24cc-d35f-961b-af81-xxxxxxxxxxxx",
            "data": "",
            "url": "http://dashscope-result-bj.oss-cn-beijing.aliyuncs.com/pre/fun-music/20260330/xxxxxxxx/a8db24cc-d35f-961b-af81-a9e8d8b01f67.mp3?xxx"
        },
        "extra_info": {
            "channels": 2,
            "sample_rate": "48000",
            "lyrics": "[verse]\n清晨的阳光穿过窗帘,\n咖啡的香气弥漫房间.\n翻开昨天未读完的书,\n时光就这样悄悄流转.\n\n[chorus]\n慢慢来不着急,\n生活本该如此惬意.\n把烦恼都丢进风里,\n拥抱每一个晴天雨季.",
        },
        "finish_reason": "stop"
    },
    "usage": {
        "duration": 200
    },
    "request_id": "a8db24cc-d35f-961b-af81-xxxxxxxxxxxx"
}
</code></pre></div></div></td></tr></tbody></table>
