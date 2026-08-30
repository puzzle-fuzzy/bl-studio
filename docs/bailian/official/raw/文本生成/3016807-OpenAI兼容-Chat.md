通过兼容 OpenAI 格式的 Chat API 调用模型，查看输入输出参数说明及调用示例。

#### 华北2（北京）

SDK 调用配置的`base_url`：`https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/compatible-mode/v1`

HTTP 请求地址：`POST https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/compatible-mode/v1/chat/completions`

#### 新加坡

SDK 调用配置的`base_url`：`https://{WorkspaceId}.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1`

HTTP 请求地址：`POST https://{WorkspaceId}.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1/chat/completions`

#### 美国（弗吉尼亚）

SDK 调用配置的`base_url`：`https://{WorkspaceId}.us-east-1.maas.aliyuncs.com/compatible-mode/v1`

HTTP 请求地址：`POST https://{WorkspaceId}.us-east-1.maas.aliyuncs.com/compatible-mode/v1/chat/completions`

#### 德国（法兰克福）

SDK 调用配置的`base_url`：`https://{WorkspaceId}.eu-central-1.maas.aliyuncs.com/compatible-mode/v1`

HTTP 请求地址：`POST https://{WorkspaceId}.eu-central-1.maas.aliyuncs.com/compatible-mode/v1/chat/completions`

#### 日本（东京）

SDK 调用配置的`base_url`：`https://{WorkspaceId}.ap-northeast-1.maas.aliyuncs.com/compatible-mode/v1`

HTTP 请求地址：`POST https://{WorkspaceId}.ap-northeast-1.maas.aliyuncs.com/compatible-mode/v1/chat/completions`

调用时请将`{WorkspaceId}`替换为真实的[业务空间ID](/zh/model-studio/obtain-the-app-id-and-workspace-id#732535cfc959h)。

您需要先[获取与配置 API Key](/zh/model-studio/get-api-key)。若通过OpenAI SDK进行调用，需要[安装SDK](/zh/model-studio/install-sdk)。

**重要**阿里云百炼为华北2（北京）、新加坡地域推出了业务空间专属域名，**能够为推理请求提供卓越的性能和更高的稳定性**，建议迁移至新域名：

-   华北2（北京）地域：从 `https://dashscope.aliyuncs.com` 迁移至 `https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com`
-   新加坡地域：从 `https://dashscope-intl.aliyuncs.com` 迁移至 `https://{WorkspaceId}.ap-southeast-1.maas.aliyuncs.com`

其中 `{WorkspaceId}` 为您的业务空间 ID，可在阿里云百炼控制台的**业务空间详情**页面查看。现有域名仍可正常使用。

<table bordertype="no-border"><colgroup><col style="width:50%"><col style="width:50%"></colgroup><tbody><tr><td><h2>请求体<span id="afcd41d2b57zf"></span></h2><p><strong>model</strong><code>string</code><strong>（必选）</strong></p><p>模型名称。</p><p>支持的模型：Qwen 大语言模型（商业版、开源版）、Qwen-VL、Qwen-Coder、Qwen-Omni、Qwen-Math、DeepSeek（阿里云直供、硅基流动直供、快手万擎直供）、Kimi（阿里云直供、月之暗面直供）、GLM（阿里云直供）、MiniMax（阿里云直供、稀宇科技直供）。</p><blockquote><p>三方直供模型仅在中国站的华北2（北京）地域可用，调用前需先在百炼控制台开通对应服务（以 SiliconFlow DeepSeek 为例：搜索 deepseek → 找到 SiliconFlow DeepSeek 模型卡片 → 单击立即开通 → 确认授权）。</p></blockquote><blockquote><p>Qwen-Audio不支持OpenAI兼容协议，仅支持DashScope协议。</p></blockquote><p><strong>具体模型名称和计费，请参见</strong><a href="https://bailian.console.aliyun.com/?tab=model#/model-market">百炼控制台</a>。</p><p><strong>messages</strong><code>array</code><strong>（必选）</strong></p><p>传递给大模型的上下文，按对话顺序排列。</p><section class="collapse expanded" id="accordion-消息类型"><p>消息类型</p><div><p>System Message<code>object</code>（可选）</p><p>系统消息，用于设定大模型的角色、语气、任务目标或约束条件等。一般放在<code>messages</code>数组的第一位。</p><blockquote><p>QwQ 模型不建议设置 System Message，QVQ 模型设置 System Message不会生效。</p></blockquote><section class="collapse" id="accordion-属性"><p>属性</p><div><p><strong>content</strong><code>string</code><strong>（必选）</strong></p><p>系统指令，用于明确模型的角色、行为规范、回答风格和任务约束等。</p><p><strong>role</strong><code>string</code><strong>（必选）</strong></p><p>系统消息的角色，固定为 <code>system</code> 。</p></div></section><p>User Message<code>object</code><strong>（必选）</strong></p><p>用户消息，用于向模型传递问题、指令或上下文等。</p><section class="collapse" id="accordion-属性-2"><p>属性</p><div><p><strong>content</strong><code>string 或 array</code><strong>（必选）</strong></p><p>消息内容。若输入只有文本，则为 string 类型；若输入包含图像等多模态数据，或启用显式缓存，则为 array 类型。</p><section class="collapse" id="accordion-使用多模态模型或启用显式缓存时的属性"><p>使用多模态模型或启用显式缓存时的属性</p><div><p><strong>type</strong><code>string</code><strong>（必选）</strong></p><p>可选值：</p><ul><li><p><code>text</code></p><p>输入文本时需设为<code>text</code>。</p></li><li><p><code>image_url</code></p><p>输入图片时需设为<code>image_url</code>。</p></li><li><p><code>input_audio</code></p><p>输入音频时需设为<code>input_audio</code>。</p></li><li><p><code>video</code></p><p>输入图片列表形式的视频时需设为<code>video</code>。</p></li><li><p><code>video_url</code></p><p>输入视频文件时需设为<code>video_url</code>。</p><blockquote><p>Qwen-VL仅部分模型可输入视频文件，详情参见<a href="/zh/model-studio/vision#80dbf6ca8fh6s">视频理解（Qwen-VL）</a>；QVQ与Qwen-Omni 模型支持直接传入视频文件。</p></blockquote></li></ul><p><strong>text</strong><code>string</code></p><p>输入的文本。当<code>type</code>为<code>text</code>时，是必选参数。</p><p><strong>image_url</strong><code>object</code></p><p>输入的图片信息。当<code>type</code>为<code>image_url</code>时是必选参数。</p><section class="collapse" id="accordion-属性-3"><p>属性</p><div><p><strong>url</strong> <code>string</code><strong>（必选）</strong></p><p>图片的 URL或 Base64 Data URL。传入本地文件请参考<a href="/zh/model-studio/vision">图像与视频理解</a>。</p></div></section><p><strong>input_audio</strong><code>object</code></p><p>输入的音频信息。当<code>type</code>为<code>input_audio</code>时是必选参数。</p><section class="collapse" id="accordion-属性-4"><p>属性</p><div><p><strong>data</strong> <code>string</code><strong>（必选）</strong></p><p>音频的 URL 或Base64 Data URL。传入本地文件请参见：<a href="/zh/model-studio/qwen-omni#c516d1e824x03">输入 Base64 编码的本地文件</a>。</p><p><strong>format</strong><code>string</code><strong>（必选）</strong></p><p>输入音频的格式，如<code>mp3</code>、<code>wav</code>等。</p></div></section><p><strong>video</strong><code>array</code></p><p>输入的<strong>图片列表形式的视频信息</strong>。当<code>type</code>为<code>video</code>时是必选参数。使用方法请参见：<a href="/zh/model-studio/vision#80dbf6ca8fh6s">视频理解（Qwen-VL）</a>、<a href="/zh/model-studio/visual-reasoning">视频理解（QVQ）</a>或<a href="/zh/model-studio/qwen-omni">视频理解（Qwen-Omni）</a>。</p><p>示例值：</p><pre data-tag="codeblock" id="code-block" outputclass="language-json" code-type="xCode" class="pre codeblock language-json"><code>[
    "https://help-static-aliyun-doc.aliyuncs.com/file-manage-files/zh-CN/20241108/xzsgiz/football1.jpg",
    "https://help-static-aliyun-doc.aliyuncs.com/file-manage-files/zh-CN/20241108/tdescd/football2.jpg",
    "https://help-static-aliyun-doc.aliyuncs.com/file-manage-files/zh-CN/20241108/zefdja/football3.jpg",
    "https://help-static-aliyun-doc.aliyuncs.com/file-manage-files/zh-CN/20241108/aedbqh/football4.jpg"
]
</code></pre><p><strong>video_url</strong><code>object</code></p><p>输入的视频文件信息。当<code>type</code>为<code>video_url</code>时是必选参数。</p><p>Qwen-VL 只可理解视频文件的视觉信息，Qwen-Omni 可理解视频文件中的视觉与音频信息。</p><section class="collapse" id="accordion-属性-5"><p>属性</p><div><p><strong>url</strong> <code>string</code><strong>（必选）</strong></p><p>视频文件的公网 URL 或 Base64 Data URL。输入本地视频文件请参见<a href="/zh/model-studio/qwen-omni#c516d1e824x03">输入 Base64 编码的本地文件</a>。</p></div></section><p><strong>fps</strong><code>float</code>（可选）</p><p>每秒抽帧数。取值范围为 [0.1, 10]，默认值为2.0。</p><blockquote><p>MiniMax/MiniMax-M3 的 fps 取值范围为 [0.2, 5]，默认值为 1。</p></blockquote><section class="collapse" id="accordion-功能说明"><p>功能说明</p><div><p>fps有两个功能：</p><ul><li><p>输入视频文件时，控制抽帧频率，每 f p s 1 ​ 秒抽取一帧。</p><blockquote><p>适用于 <a href="/zh/model-studio/vision">Qwen-VL</a>、<a href="/zh/model-studio/minimax-api-by-minimax">MiniMax/MiniMax-M3</a> 与<a href="/zh/model-studio/visual-reasoning">QVQ 模型</a>。</p></blockquote></li><li><p>告知模型相邻帧之间的时间间隔，帮助其更好地理解视频的时间动态。同时适用于输入视频文件与图像列表时。该功能同时支持视频文件和图像列表输入，适用于事件时间定位或分段内容摘要等场景。</p><blockquote><p>支持Qwen3.7、Qwen3.6、Qwen3.5、<code>Qwen3-VL</code>、<code>Qwen2.5-VL</code>、Qwen3.5-Omni与QVQ模型。</p></blockquote></li></ul><p>较大的<code>fps</code>适合高速运动的场景（如体育赛事、动作电影等），较小的<code>fps</code>适合长视频或内容偏静态的场景。</p></div></section><section class="collapse" id="accordion-示例值"><p>示例值</p><div><ul><li>图像列表传入：<code>{"video":["https://xx1.jpg",...,"https://xxn.jpg"]，"fps":2}</code></li><li>视频文件传入：<code>{"video": "https://xx1.mp4"，"fps":2}</code></li></ul></div></section><p><strong>min_pixels</strong><code>integer</code>（可选）</p><p>设定输入图像或视频帧的最小像素阈值。当输入图像或视频帧的像素小于<code>min_pixels</code>时，会将其进行放大，直到总像素高于<code>min_pixels</code>。适用于 Qwen-VL、QVQ 模型。</p><section class="collapse" id="accordion-取值范围"><p>取值范围</p><div><ul><li><strong>输入图像：</strong><ul><li>Qwen3.8、Qwen3.7、Qwen3.6、Qwen3.5、Qwen3-VL：默认值和最小值均为：<code>65536</code></li><li>Qwen3.5-Omni ：默认值和最小值均为： <code>24576</code></li><li><code>qwen-vl-max</code>、<code>qwen-vl-max-0813</code>、<code>qwen-vl-plus</code>、<code>qwen-vl-plus-0815``、qwen-vl-plus-0710</code>：默认值和最小值均为<code>4096</code></li><li>其他<code>qwen-vl-plus</code>模型、其他<code>qwen-vl-max</code>模型、<code>Qwen2.5-VL</code>开源系列及<code>QVQ</code>系列模型：默认值和最小值均为<code>3136</code></li></ul></li><li><strong>输入视频文件或图像列表：</strong><ul><li>Qwen3.8、Qwen3.7、Qwen3.6、Qwen3.5、<code>Qwen3.5-Omni</code>、Qwen3-VL（包括商业版和开源版）、<code>qwen-vl-max</code>、<code>qwen-vl-max-0813</code>、<code>qwen-vl-plus</code>、<code>qwen-vl-plus-0815``、qwen-vl-plus-0710</code>：默认值为<code>65536</code>，最小值为<code>4096</code></li><li>其他<code>qwen-vl-plus</code>模型、其他<code>qwen-vl-max</code>模型、<code>Qwen2.5-VL</code>开源系列及<code>QVQ</code>系列模型：默认值为<code>50176</code>，最小值为<code>3136</code></li></ul></li></ul></div></section><section class="collapse" id="accordion-示例值-2"><p>示例值</p><div><ul><li>输入图像：<code>{"type": "image_url","image_url": {"url":"https://xxxx.jpg"},"min_pixels": 65536}</code></li><li>输入视频文件时：<code>{"type": "video_url","video_url": {"url":"https://xxxx.mp4"},"min_pixels": 65536}</code></li><li>输入图像列表时：<code>{"type": "video","video": ["https://xx1.jpg",...,"https://xxn.jpg"],"min_pixels": 65536}</code></li></ul></div></section><p><strong>max_pixels</strong><code>integer</code>（可选）</p><p>用于设定输入图像或视频帧的最大像素阈值。当输入图像或视频的像素在<code>[min_pixels, max_pixels]</code>区间内时，模型会按原图进行识别。当输入图像像素大于<code>max_pixels</code>时，会将图像进行缩小，直到总像素低于<code>max_pixels</code>。适用于 Qwen-VL、QVQ 模型。</p><section class="collapse" id="accordion-取值范围-2"><p>取值范围</p><div><ul><li><strong>输入图像：</strong><p><code>max_pixels</code> 的取值与是否开启<code>vl_high_resolution_images</code>参数有关。</p><ul><li><p>当<code>vl_high_resolution_images</code>为<code>False</code>时：</p><ul><li>Qwen3.8、Qwen3.7、 Qwen3.6 、 Qwen3.5 、 Qwen3-VL ：默认值为 <code>2621440</code> ，最大值为： <code>16777216</code></li><li>Qwen3.5-Omni ：默认值为 <code>1310720</code> ，最大值为： <code>16777216</code></li><li><code>qwen-vl-max</code> 、 <code>qwen-vl-max-0813</code> 、 <code>qwen-vl-plus</code> 、 <code>qwen-vl-plus-0815``、qwen-vl-plus-0710</code> ：默认值为 <code>1310720</code> ，最大值为： <code>16777216</code></li><li>其他 <code>qwen-vl-plus</code> 模型、其他 <code>qwen-vl-max</code> 模型、 <code>Qwen2.5-VL</code> 开源系列及 <code>QVQ</code> 系列模型：默认值为 <code>1003520</code> ，最大值为 <code>12845056</code></li></ul></li><li><p>当<code>vl_high_resolution_images</code>为<code>True</code>时：</p><ul><li>Qwen3.8、Qwen3.7、 Qwen3.6 、 Qwen3.5-Omni 、 Qwen3.5 、 Qwen3-VL 、 <code>qwen-vl-max</code> 、 <code>qwen-vl-max-0813</code> 、 <code>qwen-vl-plus</code> 、 <code>qwen-vl-plus-0815``、qwen-vl-plus-0710</code> ： <code>max_pixels</code> 无效，输入图像的最大像素固定为 <code>16777216</code></li><li>其他 <code>qwen-vl-plus</code> 模型、其他 <code>qwen-vl-max</code> 模型、 <code>Qwen2.5-VL</code> 开源系列及 <code>QVQ</code> 系列模型： <code>max_pixels</code> 无效，输入图像的最大像素固定为 <code>12845056</code></li></ul></li></ul></li><li><strong>输入视频文件或图像列表：</strong><ul><li>Qwen3.8、Qwen3.7、Qwen3.6、Qwen3.5、Qwen3.5-Omni、Qwen3-VL闭源系列、<code>qwen3-vl-235b-a22b-thinking</code>、<code>qwen3-vl-235b-a22b-instruct</code>：默认值为<code>655360</code>，最大值为<code>2048000</code></li><li>其他<code>Qwen3-VL</code>开源模型、<code>qwen-vl-max</code>、<code>qwen-vl-max-0813</code>、<code>qwen-vl-plus</code>、<code>qwen-vl-plus-0815``、qwen-vl-plus-0710</code>：默认值<code>655360</code>，最大值为<code>786432</code></li><li>其他<code>qwen-vl-plus</code>模型、其他<code>qwen-vl-max</code>模型、<code>Qwen2.5-VL</code>开源系列及<code>QVQ</code>系列模型：默认值为<code>501760</code>，最大值为<code>602112</code></li></ul></li></ul></div></section><section class="collapse" id="accordion-示例值-3"><p>示例值</p><div><ul><li>输入图像：<code>{"type": "image_url","image_url": {"url":"https://xxxx.jpg"},"max_pixels": 8388608}</code></li><li>输入视频文件时：<code>{"type": "video_url","video_url": {"url":"https://xxxx.mp4"},"max_pixels": 655360}</code></li><li>输入图像列表时：<code>{"type": "video","video": ["https://xx1.jpg",...,"https://xxn.jpg"],"max_pixels": 655360}</code></li></ul></div></section><p><strong>total_pixels</strong><code>integer</code>（可选）</p><p>用于限制从视频中抽取的所有帧的总像素（单帧图像像素 × 总帧数）。如果视频总像素超过此限制，系统将对视频帧进行缩放，但仍会确保单帧图像的像素值在<code>[min_pixels, max_pixels]</code>范围内。适用于 Qwen-VL、QVQ 模型。</p><p>对于抽帧数量较多的长视频，可适当降低此值以减少Token消耗和处理时间，但这可能会导致图像细节丢失。</p><section class="collapse" id="accordion-取值范围-3"><p>取值范围</p><div><ul><li>Qwen3.8、Qwen3.7、Qwen3.6、Qwen3.5系列 ：默认值和最大值均为 <code>819200000</code> ，该值对应 <code>800000</code> 个图像 Token（每 32×32 像素对应 1 个图像 Token）。</li><li>Qwen3-VL闭源系列 、 <code>qwen3-vl-235b-a22b-thinking</code> 、 <code>qwen3-vl-235b-a22b-instruct</code> ：默认值和最大值均为 <code>134217728</code> ，该值对应 <code>131072</code> 个图像 Token（每 32×32 像素对应 1 个图像 Token）。</li><li><code>Qwen3.5-Omni</code> ：默认值和最小值均为 <code>184549376</code> ，该值对应 <code>180224</code> 个图像 Token（每 32×32 像素对应 1 个图像 Token）。</li><li>其他<code>Qwen3-VL</code>开源模型、<code>qwen-vl-max</code>、<code>qwen-vl-max-0813</code>、<code>qwen-vl-plus</code>、<code>qwen-vl-plus-0815``、qwen-vl-plus-0710</code>：默认值和最小值均为<code>67108864</code>，该值对应 <code>65536</code> 个图像 Token（每 32×32 像素对应 1 个图像 Token）。</li><li>其他<code>qwen-vl-plus</code>模型、其他<code>qwen-vl-max</code>模型、<code>Qwen2.5-VL</code>开源系列及<code>QVQ</code>系列模型：默认值和最小值均为<code>51380224</code>，该值对应 <code>65536</code> 个图像 Token（每 28×28 像素对应 1 个图像 Token）。</li></ul></div></section><section class="collapse" id="accordion-示例值-4"><p>示例值</p><div><ul><li>输入视频文件时：<code>{"type": "video_url","video_url": {"url":"https://xxxx.mp4"},"total_pixels": 134217728}</code></li><li>输入图像列表时：<code>{"type": "video","video": ["https://xx1.jpg",...,"https://xxn.jpg"],"total_pixels": 134217728}</code></li></ul></div></section><p><strong>cache_control</strong><code>object</code>（可选）</p><p>用于开启显式缓存。相关文档：<a href="/zh/model-studio/context-cache#825f201c5fy6o">显式缓存</a>。</p><section class="collapse" id="accordion-属性-6"><p>属性</p><div><p><strong>type</strong> <code>string</code><strong>（必选）</strong></p><p>仅支持设定为<code>ephemeral</code>。</p></div></section></div></section><p><strong>role</strong><code>string</code><strong>（必选）</strong></p><p>用户消息的角色，固定为<code>user</code>。</p></div></section><p>Assistant Message <code>object</code>（可选）</p><p>模型的回复。通常用于在多轮对话中作为上下文回传给模型。</p><section class="collapse" id="accordion-属性-7"><p>属性</p><div><p><strong>content</strong><code>string</code>（可选）</p><p>模型回复的文本内容。包含<code>tool_calls</code>时，<code>content</code>可以为空；否则<code>content</code>为必选。</p><p><strong>role</strong><code>string</code><strong>（必选）</strong></p><p>助手消息的角色，固定为<code>assistant</code>。</p><p><strong>partial</strong><code>boolean</code>（可选）默认值为<code>false</code></p><p>是否开启前缀续写。</p><p>可选值：</p><ul><li>true：开启；</li><li>false：不开启。</li></ul><p>支持的模型参见<a href="/zh/model-studio/partial-mode">前缀续写</a>。</p><p><strong>tool_calls</strong> <code>array</code>（可选）</p><p>发起 Function Calling 后，返回的工具与入参信息，包含一个或多个对象。由上一轮模型响应的<code>tool_calls</code>字段获得。</p><section class="collapse" id="accordion-属性-8"><p>属性</p><div><p><strong>id</strong> <code>string</code><strong>（必选）</strong></p><p>工具响应的ID。</p><p><strong>type</strong> <code>string</code><strong>（必选）</strong></p><p>工具类型，当前只支持设为<code>function</code>。</p><p><strong>function</strong> <code>object</code><strong>（必选）</strong></p><p>工具与入参信息。</p><section class="collapse" id="accordion-属性-9"><p>属性</p><div><p><strong>name</strong> <code>string</code><strong>（必选）</strong></p><p>工具名称。</p><p><strong>arguments</strong> <code>string</code><strong>（必选）</strong></p><p>入参信息，为JSON格式字符串。</p></div></section><p><strong>index</strong> <code>integer</code><strong>（必选）</strong></p><p>当前工具信息在<code>tool_calls</code>数组中的索引。</p></div></section></div></section><p>Tool Message <code>object</code>（可选）</p><p>工具的输出信息。</p><section class="collapse" id="accordion-属性-10"><p>属性</p><div><p><strong>content</strong><code>string</code><strong>（必选）</strong></p><p>工具函数的输出内容，必须为字符串。若工具返回结构化数据（如JSON），需将其序列化为字符串。</p><p><strong>role</strong><code>string</code><strong>（必选）</strong></p><p>固定为<code>tool</code>。</p><p><strong>tool_call_id</strong><code>string</code><strong>（必选）</strong></p><p>发起 Function Calling 后返回的 id，通过completion.choices[0].message.tool_calls[$index].id获取，用于标记 Tool Message 对应的工具。</p></div></section></div></section><p><strong>stream</strong><code>boolean</code>（可选） 默认值为 <code>false</code></p><p>是否以流式输出方式回复。相关文档：<a href="/zh/model-studio/stream">流式输出</a></p><p>可选值：</p><ul><li><code>false</code>：模型生成全部内容后一次性返回；</li><li><code>true</code>：边生成边输出，每生成一部分内容即返回一个数据块（chunk）。需实时逐个读取这些块以拼接完整回复。</li></ul><p>推荐设置为<code>true</code>，可提升阅读体验并降低超时风险。</p><div class="note note-note"><div class="note-icon-wrapper"></div><div class="note-content"><p><strong>说明</strong>非流式调用的最大超时时间不少于300秒，实际时长因部署区域与选用模型存在差异。若超时未完成，服务将中断请求并返回已生成的内容（而非报错）。建议输出较长的场景务必使用流式调用。详情请参见<a href="/zh/model-studio/text-generation#11241147efwpm">文本生成模型概述</a>中的超时说明。</p></div></div><p><strong>stream_options</strong><code>object</code>（可选）</p><p>流式输出的配置项，仅在 <code>stream</code> 为 <code>true</code> 时生效。</p><section class="collapse expanded" id="accordion-属性-11"><p>属性</p><div><p><strong>include_usage</strong><code>boolean</code>（可选）默认值为<code>false</code></p><p>是否在响应的<strong>最后一个数据块</strong>包含Token消耗信息。</p><p>可选值：</p><ul><li><code>true</code>：包含；</li><li><code>false</code>：不包含。</li></ul><blockquote><p>流式输出时，Token 消耗信息仅可出现在响应的最后一个数据块。</p></blockquote></div></section><p><strong>modalities</strong><code>array</code>（可选）默认值为<code>["text"]</code></p><p>输出数据的模态，仅适用于 Qwen-Omni 模型。相关文档：<a href="/zh/model-studio/qwen-omni">非实时（Qwen-Omni）</a></p><p>可选值：</p><ul><li><code>["text","audio"]</code>：输出文本与音频；</li><li><code>["text"]</code>：仅输出文本。</li></ul><p><strong>audio</strong><code>object</code>（可选）</p><p>输出音频的音色与格式，仅适用于 Qwen-Omni 模型，且<code>modalities</code>参数需为<code>["text","audio"]</code>。相关文档：<a href="/zh/model-studio/qwen-omni">非实时（Qwen-Omni）</a></p><section class="collapse" id="accordion-属性-12"><p>属性</p><div><p><strong>voice</strong><code>string</code> <strong>（必选）</strong></p><p>输出音频的音色。请参见<a href="/zh/model-studio/qwen-omni">非实时（Qwen-Omni）</a>。</p><p><strong>format</strong><code>string</code> <strong>（必选）</strong></p><p>输出音频的格式，仅支持设定为<code>wav</code>。</p></div></section><p><strong>temperature</strong><code>float</code>（可选）</p><p>采样温度，控制模型生成文本的多样性。</p><p>temperature越高，生成的文本更多样，反之，生成的文本更确定。</p><p>取值范围： [0, 2)</p><p>temperature与top_p均可以控制生成文本的多样性，建议只设置其中一个值。更多说明，请参见<a href="/zh/model-studio/text-generation">概述</a>。</p><section class="collapse" id="accordion-temperature默认值"><p>temperature默认值</p><div><ul><li>qwen3.8-max/qwen3.8-flash（思考模式）：视觉理解0.6，文本输入1.0，0.6以下的temperature值会默认改为0.6</li><li>Qwen3.8（非思考模式）、Qwen3.7（非思考模式）、Qwen3.6（非思考模式）、Qwen3.5-Omni、Qwen3.5（非思考模式）、Qwen3（非思考模式）、Qwen3-Instruct系列、Qwen3-Coder系列、qwen-max系列、qwen-plus系列（非思考模式）、qwen-flash系列（非思考模式）、qwen-turbo系列（非思考模式）、qwen开源系列、qwen-coder系列、qwen-doc-turbo、Qwen3-VL（非思考）：0.7；</li><li>QVQ系列 : 0.5；</li><li>qwen-audio-turbo系列：0.00001；</li><li>qwen-vl系列、qwen2.5-omni-7b：0.01；</li><li>qwen-math系列：0；</li><li>Qwen3.7（思考模式）、Qwen3.6（思考模式）、Qwen3.5（思考模式）、Qwen3（思考模式）、Qwen3-Thinking、Qwen3-Omni-Captioner、QwQ 系列：0.6；</li><li>qwen3-max-preview（思考模式）、qwen-long系列： 1.0；</li><li>qwen-plus-character：0.92</li><li>qwen3-omni-flash系列：0.9</li><li>Qwen3-VL（思考模式）：0.8</li><li>DeepSeek系列（阿里云直供）：deepseek-v4-pro、deepseek-v4-flash、deepseek-v3.2（非思考模式）: 1.0；deepseek-v3.2（思考模式）、deepseek-v3.2-exp、deepseek-v3.1、deepseek-r1、deepseek-r1-0528、deepseek-r1-distill-qwen 蒸馏版: 0.6；deepseek-v3: 0.7；</li><li>DeepSeek系列（硅基流动直供）：siliconflow/deepseek-v3.2、siliconflow/deepseek-v3.1-terminus、siliconflow/deepseek-r1-0528、siliconflow/deepseek-v3-0324: 1.0；</li><li>DeepSeek系列（快手万擎直供）：vanchin/deepseek-v3.2-think（思考模式）: 0.6；vanchin/deepseek-v3.1-terminus: 0.7；vanchin/deepseek-v3.2-speciale、vanchin/deepseek-r1、vanchin/deepseek-v3、vanchin/deepseek-ocr: 1.0；</li><li>Kimi系列（阿里云直供）：kimi-k2.7-code、kimi-k2.6（思考模式）、kimi-k2.5（思考模式）、kimi-k2-thinking: 1.0；kimi-k2.6（非思考模式）、kimi-k2.5（非思考模式）、Moonshot-Kimi-K2-Instruct: 0.6；</li><li>Kimi系列（月之暗面直供）：kimi/kimi-k3、kimi/kimi-k2.7-code-highspeed、kimi/kimi-k2.7-code、kimi/kimi-k2.6（思考模式）、kimi/kimi-k2.5（思考模式）: 1.0；kimi/kimi-k2.6（非思考模式）、kimi/kimi-k2.5（非思考模式）: 0.6；</li><li>GLM系列（阿里云直供）：glm-5.1、glm-5、glm-4.7、glm-4.6: 1.0；glm-4.5、glm-4.5-air: 0.6；</li><li>GLM系列（智谱直供）：ZHIPU/GLM-5.1、ZHIPU/GLM-5: 0.6；</li><li>MiniMax系列（阿里云直供）：MiniMax-M2.5、MiniMax-M2.1: 1.0；</li><li>MiniMax系列（稀宇科技直供）：MiniMax/MiniMax-M3、MiniMax/MiniMax-M2.7、MiniMax/MiniMax-M2.5、MiniMax/MiniMax-M2.1: 1.0。</li><li>MiMo系列（小米直供）：mimo-v2.5-pro: 1.0，范围 [0, 1.5]。</li></ul></div></section><blockquote><p>不建议修改QVQ模型的默认temperature值 。</p></blockquote><p><strong>top_p</strong><code>float</code>（可选）</p><p>核采样的概率阈值，控制模型生成文本的多样性。</p><p>top_p越高，生成的文本更多样。反之，生成的文本更确定。</p><p>取值范围：（0,1.0]</p><p>temperature与top_p均可以控制生成文本的多样性，建议只设置其中一个值。更多说明，请参见<a href="/zh/model-studio/text-generation">概述</a>。</p><section class="collapse" id="accordion-top-p默认值"><p>top_p默认值</p><div><p>Qwen3.8（非思考模式）、Qwen3.7（非思考模式）、Qwen3.6（非思考模式）、Qwen3.5-Omni、Qwen3.5（非思考模式）、Qwen3（非思考模式）、Qwen3-Instruct系列、Qwen3-Coder系列、qwen-max系列、qwen-plus系列（非思考模式）、qwen-flash系列（非思考模式）、qwen-turbo系列（非思考模式）、Qwen 2.5开源系列、qwen-coder系列、qwen-long、qwen-doc-turbo、Qwen3-VL（非思考）：0.8；</p><p>qwen-omni-turbo 系列：0.01；</p><p>qwen-vl-plus系列、qwen-vl-max、qwen2.5-omni-7b：0.001；</p><p>QVQ系列 : 0.5；</p><p>qwen3-max-preview（思考模式）、qwen-math系列、Qwen3-Omni-Flash系列：1.0；</p><p>Qwen3.8（思考模式）、Qwen3.7（思考模式）、Qwen3.6（思考模式）、Qwen3.5（思考模式）、Qwen3（思考模式）、Qwen3-VL（思考模式）、Qwen3-Thinking、QwQ 系列、Qwen3-Omni-Captioner、qwen-plus-character：0.95</p><p>DeepSeek系列（阿里云直供）：deepseek-v4-pro、deepseek-v4-flash、deepseek-v3.2、deepseek-v3.2-exp、deepseek-v3.1、deepseek-r1、deepseek-r1-0528、deepseek-r1-distill-qwen 蒸馏版: 0.95；deepseek-v3: 0.6；</p><p>DeepSeek系列（硅基流动直供）：siliconflow/deepseek-v3.2、siliconflow/deepseek-v3.1-terminus、siliconflow/deepseek-r1-0528、siliconflow/deepseek-v3-0324: 1.0；</p><p>DeepSeek系列（快手万擎直供）：vanchin/deepseek-v3.2-think、vanchin/deepseek-v3.1-terminus: 0.95；vanchin/deepseek-v3.2-speciale: 0.9；vanchin/deepseek-r1: 0.8；vanchin/deepseek-v3、vanchin/deepseek-ocr: 1.0；</p><p>Kimi系列（阿里云直供）：kimi-k2.7-code、kimi-k2.6、kimi-k2.5、kimi-k2-thinking: 0.95；Moonshot-Kimi-K2-Instruct: 1.0；</p><p>Kimi系列（月之暗面直供）：kimi/kimi-k3、kimi/kimi-k2.7-code-highspeed、kimi/kimi-k2.7-code、kimi/kimi-k2.6、kimi/kimi-k2.5: 0.95；</p><p>GLM系列（阿里云直供）：0.95；</p><p>GLM系列（智谱直供）：ZHIPU/GLM-5.1、ZHIPU/GLM-5: 0.95；</p><p>MiniMax系列（阿里云直供）：MiniMax-M2.5、MiniMax-M2.1: 0.95；</p><p>MiniMax系列（稀宇科技直供）：MiniMax/MiniMax-M3: 0.95；MiniMax/MiniMax-M2.7、MiniMax/MiniMax-M2.5、MiniMax/MiniMax-M2.1: 0.9。</p><p>MiMo系列（小米直供）：xiaomi/mimo-v2.5-pro: 0.95，范围 [0.01, 1.0]。</p></div></section><blockquote><p>不建议修改QVQ模型的默认 top_p 值。</p></blockquote><p><strong>top_k</strong><code>integer</code> （可选）</p><p>指定生成过程中用于采样的候选 Token 数量。值越大，输出越随机；值越小，输出越确定。若设为&nbsp;<code>null</code>&nbsp;或大于 100，则禁用&nbsp;<code>top_k</code>&nbsp;策略，仅&nbsp;<code>top_p</code>&nbsp;策略生效。取值必须为大于或等于 0 的整数。</p><section class="collapse" id="accordion-top-k默认值"><p>top_k默认值</p><div><p>QVQ系列：10；</p><p>QwQ 系列：40；</p><p>qwen-math 系列、其余qwen-vl-plus系列之前的模型、qwen-audio-turbo系列、qwen2.5-omni-7b：1；</p><p>Qwen3-Omni-Flash系列：50；</p><p>其余模型均为20。</p><p>GLM系列（阿里云直供）：20；</p><p>DeepSeek/Kimi/MiniMax系列均不支持top_k参数。</p></div></section><blockquote><p>该参数非OpenAI标准参数。通过 Python SDK调用时，请放入 <strong>extra_body</strong> 对象中。配置方式为：extra_body={"top_k":xxx}。</p></blockquote><blockquote><p>不建议修改QVQ模型的默认 top_k 值。</p></blockquote><p><strong>repetition_penalty</strong><code>float</code> （可选）</p><p>模型生成时连续序列中的重复度。提高repetition_penalty时可以降低模型生成的重复度，1.0表示不做惩罚。没有严格的取值范围，只要大于0即可。</p><section class="collapse" id="accordion-repetition-penalty默认值"><p>repetition_penalty默认值</p><div><ul><li>Qwen3.8、qwen-max、qwen-math系列、qwen-vl-max系列、qwen-audio-turbo系列、QVQ系列、QwQ系列、Qwen3-VL： 1.0；</li><li>qwen-coder系列、qwen2-1.5b-instruct、qwen2-0.5b-instruct、qwen2.5-omni-7b：1.1；</li><li>qwen-vl-plus：1.2；</li><li>其余模型为1.05。</li><li>DeepSeek系列（阿里云直供）：deepseek-v3.2-exp:1.0、deepseek-v3.1:1.0；</li><li>GLM系列（阿里云直供）：1.0；</li><li>Kimi系列（月之暗面直供）：0.0。</li></ul></div></section><blockquote><p>该参数非OpenAI标准参数。通过 Python SDK调用时，请放入 <strong>extra_body</strong> 对象中。配置方式为：extra_body={"repetition_penalty":xxx}。</p></blockquote><blockquote><p>使用qwen-vl-plus_2025-01-25模型进行文字提取时，建议设置repetition_penalty为1.0。</p></blockquote><blockquote><p>不建议修改QVQ模型的默认 repetition_penalty 值。</p></blockquote><p><strong>presence_penalty</strong> <code>float</code>（可选）</p><p>控制模型生成文本时的内容重复度。</p><p>取值范围：[-2.0, 2.0]。正值降低重复度，负值增加重复度。</p><p>在创意写作或头脑风暴等需要多样性、趣味性或创造力的场景中，建议调高该值；在技术文档或正式文本等强调一致性与术语准确性的场景中，建议调低该值。</p><section class="collapse" id="accordion-presence-penalty默认值"><p>presence_penalty默认值</p><div><p>Qwen3.8（非思考模式）、Qwen3.7（非思考模式）、Qwen3.6（非思考模式）、Qwen3.5-Omni、Qwen3.5（非思考模式）、qwen3-max-preview（思考模式）、Qwen3（非思考模式）、Qwen3-Instruct系列/1.7b/4b（思考模式）、QVQ系列、qwen-max、qwen2.5-vl系列、qwen-vl-max系列、qwen-vl-plus、Qwen3-VL（非思考）：1.5；</p><p>qwen3-8b/14b/32b/30b-a3b/235b-a22b（思考模式）、qwen-plus/qwen-plus-latest/2025-04-28（思考模式）、qwen-turbo/qwen-turbo/2025-04-28（思考模式）：0.5；</p><p>其余均为0.0。</p><p>DeepSeek系列（阿里云直供）：deepseek-r1、deepseek-r1-0528、deepseek-r1-distill-qwen 蒸馏版: 1；</p><p>Kimi系列（阿里云直供）：kimi-k2.7-code、kimi-k2.6、kimi-k2.5: 0.0；</p><p>Kimi系列（月之暗面直供）：0.0；</p><p>MiniMax系列（阿里云直供）：MiniMax-M2.5、MiniMax-M2.1: 0.0；</p><p>其余DeepSeek/Kimi/GLM/MiniMax模型无默认值。</p></div></section><section class="collapse" id="accordion-原理介绍"><p>原理介绍</p><div><p>如果参数值是正数，模型将对目前文本中已存在的Token施加一个惩罚值（惩罚值与文本出现的次数无关），减少这些Token重复出现的几率，从而减少内容重复度，增加用词多样性。</p></div></section><section class="collapse" id="accordion-示例"><p>示例</p><div><p>提示词：把这句话翻译成中文“This movie is good. The plot is good, the acting is good, the music is good, and overall, the whole movie is just good. It is really good, in fact. The plot is so good, and the acting is so good, and the music is so good.”</p><p>参数值为2.0：这部电影很好。剧情很棒，演技棒，音乐也非常好听，总的来说，整部电影都好得不得了。实际上它真的很优秀。剧情非常精彩，演技出色，音乐也是那么的动听。</p><p>参数值为0.0：这部电影很好。剧情好，演技好，音乐也好，总的来说，整部电影都很好。事实上，它真的很棒。剧情非常好，演技也非常出色，音乐也同样优秀。</p><p>参数值为-2.0：这部电影很好。情节很好，演技很好，音乐也很好，总的来说，整部电影都很好。实际上，它真的很棒。情节非常好，演技也非常好，音乐也非常好。</p></div></section><blockquote><p>使用qwen-vl-plus模型进行文字提取时，建议设置presence_penalty为1.5。</p></blockquote><blockquote><p>不建议修改QVQ模型的默认presence_penalty值。</p></blockquote><p><strong>response_format</strong><code>object</code> （可选） 默认值为<code>{"type": "text"}</code></p><p>返回内容的格式。可选值：</p><ul><li><code>{"type": "text"}</code>：输出文字回复；</li><li><code>{"type": "json_object"}</code>：输出标准格式的JSON字符串。</li></ul><blockquote><p>相关文档：<a href="/zh/model-studio/qwen-structured-output">结构化输出</a>。</p></blockquote><blockquote><p>若指定为<code>{"type": "json_object"}</code>，需在提示词中明确指示模型输出JSON，如：“请按照json格式输出”，否则会报错。</p></blockquote><blockquote><p>支持的模型参见<a href="/zh/model-studio/qwen-structured-output">结构化输出</a>。</p></blockquote><section class="collapse" id="accordion-属性-13"><p>属性</p><div><p><strong>type</strong><code>string</code><strong>（必选）</strong></p><p>返回内容的格式。可选值：</p><ul><li><code>text</code>：输出文字回复；</li><li><code>json_object</code>：输出标准格式的JSON字符串；</li></ul></div></section><p><strong>max_tokens</strong><code>integer</code> （可选， <strong>即将废弃</strong> ）</p><blockquote><p>该参数即将废弃，新接入请使用 <code>max_completion_tokens</code>。</p></blockquote><p>该参数的含义随模型不同，具体如下：</p><ul><li>deepseek-v4-pro、deepseek-v4-pro-0813、deepseek-v4-flash、deepseek-v4-flash-0731：模型回答与思维链内容之和的最大 Token 数。模型输出超过此值时生成将提前停止，返回的 <code>finish_reason</code> 为 <code>length</code>。</li><li>glm-5.2：不传入 <code>thinking_budget</code> 参数时，<code>max_tokens</code> 为模型回答与思维链内容之和的最大 Token 数，模型输出超过此值时生成将提前停止，返回的 <code>finish_reason</code> 为 <code>length</code>；传入 <code>thinking_budget</code> 参数时，<code>max_tokens</code> 仅为模型回答的最大 Token 数，思维链部分的 Token 数由 <code>thinking_budget</code> 单独控制。</li><li>其他模型：模型回答的最大 Token 数。若生成内容超过此值，生成将提前停止，返回的 <code>finish_reason</code> 为 <code>length</code>。</li></ul><p>默认值与最大值均为模型的最大输出长度。</p><p><strong>max_completion_tokens</strong><code>integer</code>（可选）</p><p>模型输出的最大长度，包含思维链和模型回答。模型输出超过此值时生成将提前停止，返回的 <code>finish_reason</code> 为 <code>length</code>。</p><p>默认值与最大值均为模型的最大输出长度。</p><p>与 <code>max_tokens</code> 的区别：<code>max_completion_tokens</code> 限制模型完整输出（思维链 + 回答），而 <code>max_tokens</code> 仅限制回答部分。思考类模型推荐使用 <code>max_completion_tokens</code>。</p><p>支持以下模型：</p><ul><li>千问 Max：Qwen3.7-Max 及之后的模型</li><li>千问 Plus：Qwen3.5-Plus 及之后的模型</li><li>千问 Flash：Qwen3.5-Flash 及之后的模型</li><li>Kimi：kimi-k2.5 及其之后推出的Kimi模型</li><li>GLM：glm-5 及其之后推出的GLM系列模型</li><li>MiniMax：MiniMax-M2.5 及之后推出的MiniMax模型</li><li>DeepSeek：deepseek-v3、deepseek-r1、deepseek-r1-0528、deepseek-v3.1、deepseek-v3.2、deepseek-v3.2-exp、deepseek-v4-pro、deepseek-v4-flash 及之后推出的DeepSeek模型</li></ul><blockquote><p>以上模型均不包含三方直供模型。</p></blockquote><blockquote><p>实际输出 Token 数与设置的 <code>max_completion_tokens</code> 值之间最多可能存在 10 个 Token 的误差。</p></blockquote><p><strong>vl_high_resolution_images</strong><code>boolean</code>（可选）默认值为<code>false</code></p><p>是否将输入图像的像素上限提升至 16384 Token 对应的像素值。相关文档：<a href="/zh/model-studio/vision">处理高分辨率图像</a>。</p><ul><li><p><code>vl_high_resolution_images：true</code>，使用固定分辨率策略，忽略 <code>max_pixels</code> 设置，超过此分辨率时会将图像总像素缩小至此上限内。</p><section class="collapse" id="accordion-点击查看各模型像素上限"><p>点击查看各模型像素上限</p><div><p><code>vl_high_resolution_images</code>为<code>True</code>时，不同模型像素上限不同：</p><ul><li>Qwen3.7系列、<code>Qwen3.6</code>系列、<code>Qwen3.5</code>系列、<code>Qwen3-VL系列</code>、<code>qwen-vl-max</code>、<code>qwen-vl-max-0813</code>、<code>qwen-vl-plus</code>、<code>qwen-vl-plus-0815``、qwen-vl-plus-0710</code>模型：<code>16777216</code>（每<code>Token</code>对应<code>32*32</code>像素，即<code>16384*32*32</code>）</li><li><code>QVQ系列</code>、其他<code>Qwen2.5-VL系列</code>模型：<code>12845056</code>（每<code>Token</code>对应<code>28*28</code>像素，即 <code>16384*28*28</code>）</li></ul></div></section></li><li><p><code>vl_high_resolution_images</code>为<code>false</code>，像素上限由 <code>max_pixels</code> 决定，输入图像的像素超过<code>max_pixels</code>会将图像缩小至<code>max_pixels</code>内。各模型的默认像素上限即<code>max_pixels</code>的默认值。</p></li></ul><blockquote><p>该参数非OpenAI标准参数。通过 Python SDK调用时，请放入 <strong>extra_body</strong> 对象中。配置方式为：extra_body={"vl_high_resolution_images":xxx}。</p></blockquote><p><strong>n</strong><code>integer</code>（可选） 默认值为1</p><p>生成响应的数量，取值范围是<code>1-4</code>。适用于需生成多个候选响应的场景，例如创意写作或广告文案。</p><blockquote><p>仅支持 <a href="/zh/model-studio/deep-thinking">Qwen3（非思考模式）</a>、qwen-plus-character 模型。</p></blockquote><blockquote><p>若传入&nbsp;<code>tools</code>&nbsp;参数，&nbsp;请将<code>n</code>&nbsp;设为&nbsp;1。</p></blockquote><blockquote><p>增大 n 会增加输出 Token 的消耗，但不增加输入 Token 消耗。</p></blockquote><p><strong>enable_thinking</strong> <code>boolean</code> （可选）</p><p>使用混合思考（回复前既可思考也可不思考）模型时，是否开启思考模式。适用于 Qwen3.7、Qwen3.6、Qwen3.5、Qwen3、Qwen3-Omni-Flash、Qwen3-VL模型，以及 DeepSeek-V4-Pro/V4-Flash 系列（阿里云直供）、DeepSeek-V3.2/V3.2-exp/V3.1 系列（阿里云直供、硅基流动直供、快手万擎直供）、Kimi-K2.7-code（仅思考模型）、Kimi-K2.6/K2.5 系列（阿里云直供、月之暗面直供）、GLM 系列。DeepSeek-V4 系列默认开启思考，可通过 <code>reasoning_effort</code> 参数调整推理力度。</p><p>可选值：</p><ul><li><p><code>true</code>：开启</p><blockquote><p>开启后，思考内容将通过<code>reasoning_content</code>字段返回。</p></blockquote></li><li><p><code>false</code>：不开启</p></li></ul><p>不同模型的默认值：<a href="/zh/model-studio/deep-thinking#78286fdc35hlw">支持的模型</a></p><blockquote><p>该参数非OpenAI标准参数。通过 Python SDK调用时，请放入 <strong>extra_body</strong> 对象中。配置方式为：<code>extra_body={"enable_thinking": xxx}</code>。</p></blockquote><blockquote><p>若不使用 OpenAI SDK，而是通过 HTTP（如 curl）方式直接调用，则无需 <code>extra_body</code>，直接将 <code>enable_thinking</code> 与 <code>model</code>、<code>messages</code> 等参数一样放在请求体（<code>body</code>）的顶层即可，例如 <code>"enable_thinking": true</code>。</p></blockquote><blockquote><p>稀宇科技直供的MiniMax/MiniMax-M3 不使用此参数，请使用 <code>thinking</code> 参数。</p></blockquote><p><strong>thinking</strong> <code>object</code> （可选）默认值为 <code>{"type":"adaptive"}</code></p><p>控制稀宇科技直供的MiniMax/MiniMax-M3 的思考模式。</p><p><code>thinking.type</code> 可选值：</p><ul><li><code>adaptive</code>：自适应（默认），模型自主判断是否需要思考。</li><li><code>disabled</code>：关闭思考，直接回答。</li></ul><blockquote><p>该参数非OpenAI标准参数。通过 Python SDK调用时，请放入 <strong>extra_body</strong> 对象中。配置方式为：<code>extra_body={"thinking": {"type": "adaptive"}}</code>。</p></blockquote><p><strong>preserve_thinking</strong> <code>boolean</code> （可选）默认值为 <code>false</code></p><p>是否将对话历史中 assistant 消息的 reasoning_content 拼接至模型输入。适用于需要模型参考历史思考过程的场景。</p><p>目前支持qwen3.8-max、qwen3.8-flash（默认开启）、qwen3.7-max、qwen3.7-max-2026-05-20以及后续快照、qwen3.6-max-preview、qwen3.7-plus、qwen3.7-plus-2026-05-26、qwen3.6-plus、qwen3.6-plus-2026-04-02、qwen3.7-flash、qwen3.7-flash-2026-07-15、qwen3.6-flash、qwen3.6-flash-2026-04-16、kimi-k2.6（阿里云百炼部署）、kimi-k2.7-code（阿里云百炼部署，默认开启）、kimi/kimi-k2.7-code-highspeed（月之暗面直供，默认开启）、kimi/kimi-k2.7-code（月之暗面直供，默认开启）。</p><blockquote><p><strong>重要：</strong>使用 qwen3.8-max/qwen3.8-flash 时，preserve_thinking 默认为 true，必须将历史对话中所有的 reasoning_content 完整回传。<strong>不支持将 reasoning_content 拼接到 content 字段中回传。</strong></p></blockquote><ul><li>若历史消息中不包含 reasoning_content，开启此参数不会报错，正常兼容。</li><li>开启后，历史对话中的 reasoning_content 会计入输入 Token 数量并计费。</li></ul><blockquote><p>该参数非OpenAI标准参数。通过 Python SDK调用时，请放入 <strong>extra_body</strong> 对象中。配置方式为：<code>extra_body={"preserve_thinking": True}</code>。</p></blockquote><p><strong>thinking_budget</strong> <code>integer</code> （可选）</p><p>思考过程的最大 Token 数。适用于Qwen3.8、Qwen3.7、Qwen3.6、Qwen3.5、Qwen3-VL、Qwen3、GLM（阿里云直供）、Kimi（阿里云直供）系列模型，其中 kimi-k3 不支持该参数。相关文档：<a href="/zh/model-studio/deep-thinking#e7c0002fe4meu">限制思考长度</a>。</p><p>默认值为模型最大思维链长度，请参见：模型列表</p><blockquote><p>该参数非OpenAI标准参数。通过 Python SDK调用时，请放入 <strong>extra_body</strong> 对象中。配置方式为：<code>extra_body={"thinking_budget": xxx}</code>。</p></blockquote><p><strong>reasoning_effort</strong> <code>string</code> （可选）</p><p>控制模型的推理力度，不同模型支持的可选值和默认值不同。</p><p><strong>DeepSeek-V4、GLM 系列与 kimi/kimi-k3</strong>（默认值为 <code>high</code>）</p><p>可选值：</p><ul><li><code>high</code>：高力度推理</li><li><code>max</code>：最大力度推理</li></ul><p>low和medium映射为high，xhigh映射为max。</p><p>适用于glm-5.2、glm-5.1、glm-5、deepseek-v4-pro、deepseek-v4-flash（阿里云直供）（deepseek-v4-flash-0731 除外）、kimi/kimi-k3（月之暗面直供，仅支持 <code>max</code>）</p><p><strong>ZHIPU/GLM-5.3 与 kimi-k3（阿里云直供）模型：默认值为</strong><code>max</code></p><p>可选值：</p><ul><li><code>max</code>（默认）：深度推理</li><li><code>high</code>：增强推理</li><li><code>low</code>：轻度推理</li></ul><p>该模型始终开启思考，<code>enable_thinking</code> 仅支持 <code>true</code>，传入 <code>false</code> 会导致 API 请求失败。</p><p><strong>deepseek-v4-flash-0731 与 deepseek-v4-pro-0813 模型：默认值为</strong><code>high</code></p><p>可选值：</p><ul><li><code>max</code>：最大力度推理</li><li><code>high</code>（默认）：高力度推理</li><li><code>low</code>：低力度推理</li></ul><p>出于兼容性考虑，<code>medium</code> 映射为 high，<code>xhigh</code> 映射为 high。</p><p><strong>qwen3.8-max/qwen3.8-flash 模型：默认值为</strong><code>xhigh</code></p><p>可选值：</p><ul><li><code>xhigh</code>（默认）：高力度推理</li><li><code>medium</code>：中力度推理</li><li><code>low</code>：低力度推理</li></ul><p><code>max</code> 映射为 xhigh，<code>high</code> 映射为 xhigh，<code>minimal</code> 映射为 low，<code>none</code> 映射为 enable_thinking=False。</p><blockquote><p>设置上述可选值及映射值以外的值将会报错。</p></blockquote><p><strong>重要：</strong>qwen3.8-max/qwen3.8-flash 不支持 reasoning_effort 与 thinking_budget 同时设置，同时设置会报错。但两者支持互转：</p><ul><li>未设置 thinking_budget 时，reasoning_effort 档位自动映射 thinking_budget：<code>low</code> 对应 4096，<code>medium</code> 对应 16384，<code>xhigh</code> 对应 262144。</li><li>未设置 reasoning_effort 时，thinking_budget 自动映射回 reasoning_effort：0~4096 对应 <code>low</code>，4097~16384 对应 <code>medium</code>，16385~262144 对应 <code>xhigh</code>。</li><li>两者均未设置时，使用默认 thinking_budget（131072），默认 reasoning_effort（xhigh）。</li></ul><blockquote><p>该参数非OpenAI标准参数。通过 Python SDK调用时，请放入 <strong>extra_body</strong> 对象中。配置方式为：<code>extra_body={"reasoning_effort": "high"}</code>。</p></blockquote><p><strong>tool_stream</strong> <code>boolean</code> （可选）默认值为 <code>false</code></p><p>仅在<code>stream=true</code>时生效。当前仅Qwen和GLM系列支持。</p><strong>Qwen系列支持列表：</strong><ul><li>qwen-max系列：qwen3.8-max系列、qwen3.7-max系列的文本模态</li><li>qwen-plus系列：qwen3.7-plus系列、qwen3.6-plus系列的文本模态，以及qwen3.5-plus系列的全模态</li><li>qwen-flash系列：qwen3.8-flash系列、qwen3.7-flash系列、qwen3.6-flash系列、qwen3.5-flash系列的全模态</li></ul><strong>Qwen系列使用参考：</strong><p>tool_stream仅影响复杂工具参数的情况。普通工具参数只要开启<code>stream=true</code>就会流式输出。复杂工具是指工具定义中某些参数类型为array或object。</p><ul><li><code>tool_stream=false</code>：复杂工具参数会一次性输出，默认行为，复杂格式会更准确。</li><li><code>tool_stream=true</code>：复杂工具参数会流式输出，复杂格式没有超时风险。</li></ul><p><strong>GLM系列支持列表：</strong>glm-4.6、glm-4.7、glm-5、glm-5.1（阿里云直供）。</p><strong>GLM系列使用参考：</strong><ul><li><code>tool_stream=false</code>：工具参数会一次性输出，默认行为，复杂格式会更准确。</li><li><code>tool_stream=true</code>：工具参数会流式输出，复杂格式没有超时风险。</li></ul><blockquote><p>该参数非OpenAI标准参数。通过 Python SDK调用时，请放入 <strong>extra_body</strong> 对象中。配置方式为：<code>extra_body={"tool_stream": true}</code>。</p></blockquote><p><strong>enable_code_interpreter</strong> <code>boolean</code> （可选）默认值为 <code>false</code></p><p>是否开启代码解释器功能。相关文档：<a href="/zh/model-studio/qwen-code-interpreter">代码解释器</a></p><p>可选值：</p><ul><li><code>true</code>：开启</li><li><code>false</code>：不开启</li></ul><blockquote><p>该参数非OpenAI标准参数。通过 Python SDK调用时，请放入 <strong>extra_body</strong> 对象中。配置方式为：<code>extra_body={"enable_code_interpreter": xxx}</code>。</p></blockquote><p><strong>seed</strong><code>integer</code>（可选）</p><p>随机数种子。用于确保在相同输入和参数下生成结果可复现。若调用时传入相同的 <code>seed</code> 且其他参数不变，模型将尽可能返回相同结果。</p><p>取值范围：<code>[0,2 31 −1]</code>。</p><section class="collapse" id="accordion-seed默认值"><p>seed默认值</p><div><p>qwen-vl-max、qvq-max系列：3407；</p><p>qwen-vl-max-2024-02-01、qwen-vl-plus：无默认值；</p><p>其余模型均为1234。</p></div></section><p><strong>logprobs</strong> <code>boolean</code> （可选）默认值为 <code>false</code></p><p>是否返回输出 Token 的对数概率，可选值：</p><ul><li><p><code>true</code></p><p>返回</p></li><li><p><code>false</code></p><p>不返回</p></li></ul><blockquote><p>思考阶段生成的内容（<code>reasoning_content</code>）不会返回对数概率。</p></blockquote><section class="collapse" id="accordion-支持的模型"><p>支持的模型</p><div><ul><li>qwen-plus系列的快照模型（不包含稳定版模型）</li><li>qwen-turbo 系列的快照模型（不包含稳定版模型）</li><li>qwen3-vl-plus系列模型（包含稳定版模型）</li><li>qwen3-vl-flash系列模型（包含稳定版模型）</li><li>Qwen3 开源模型</li></ul></div></section><p><strong>top_logprobs</strong> <code>integer</code> （可选）默认值为0</p><p>指定在每一步生成时，返回模型最大概率的候选 Token 个数。</p><p>取值范围：[0,5]</p><p>仅当 <code>logprobs</code> 为 <code>true</code> 时生效。</p><p><strong>stop</strong><code>string 或 array</code>（可选）</p><p>用于指定停止词。当模型生成的文本中出现 <code>stop</code> 指定的字符串或 <code>token_id</code> 时，生成将立即终止。</p><p>可传入敏感词以控制模型的输出。</p><blockquote><p>stop为数组时，不可将<code>token_id</code>和字符串同时作为元素输入，比如不可以指定为<code>["你好",104307]</code>。</p></blockquote><p><strong>tools</strong><code>array</code>（可选）</p><p>包含一个或多个工具对象的数组，供模型在 Function Calling 中调用。相关文档：<a href="/zh/model-studio/qwen-function-calling">Function Calling</a></p><p>设置 tools 且模型判断需要调用工具时，响应会通过 tool_calls 返回工具信息。</p><section class="collapse" id="accordion-属性-14"><p>属性</p><div><p><strong>type</strong><code>string</code><strong>（必选）</strong></p><p>工具类型，当前仅支持设为<code>function</code>。</p><p><strong>function</strong><code>object</code><strong>（必选）</strong></p><section class="collapse" id="accordion-属性-15"><p>属性</p><div><p><strong>name</strong><code>string</code><strong>（必选）</strong></p><p>工具名称。仅允许字母、数字、下划线（<code>_</code>）和短划线（<code>-</code>），最长 64 个 Token。</p><p><strong>description</strong><code>string</code><strong>（必选）</strong></p><p>工具描述信息，帮助模型判断何时以及如何调用该工具。</p><p><strong>parameters</strong><code>object</code>（可选）默认值为 <code>{}</code></p><p>工具的参数描述，需要是一个合法的JSON Schema。JSON Schema的描述可以见<a href="https://json-schema.org/understanding-json-schema">链接</a>。若<code>parameters</code>参数为空，表示该工具没有入参（如时间查询工具）。</p><blockquote><p>为提高工具调用的准确性，建议传入&nbsp;<code>parameters</code>。</p></blockquote></div></section></div></section><p><strong>tool_choice</strong> <code>string 或 object</code>（可选）默认值为 <code>auto</code></p><p>工具选择策略。若需对某类问题强制指定工具调用方式（例如始终使用某工具或禁用所有工具），可设置此参数。</p><p>可选值：</p><ul><li><p><code>auto</code></p><p>大模型自主选择工具策略。</p></li><li><p><code>none</code></p><p>若不希望进行工具调用，可设定<code>tool_choice</code>参数为<code>none</code>；</p></li><li><p><code>{"type": "function", "function": {"name": "the_function_to_call"}}</code></p><p>若希望强制调用某个工具，可设定<code>tool_choice</code>参数为<code>{"type": "function", "function": {"name": "the_function_to_call"}}</code>，其中<code>the_function_to_call</code>是指定的工具函数名称。</p><blockquote><p>思考模式的模型不支持强制调用某个工具。</p></blockquote></li></ul><p><strong>parallel_tool_calls</strong> <code>boolean</code> （可选）默认值为 <code>false</code></p><p>是否开启并行工具调用。相关文档：<a href="/zh/model-studio/qwen-function-calling#cb6b5c484bt4x">并行工具调用</a></p><p>可选值：</p><ul><li><code>true</code>：开启</li><li><code>false</code>：不开启</li></ul><p><strong>enable_search</strong> <code>boolean</code>（可选）默认值为 <code>false</code></p><p>是否开启联网搜索。相关文档：<a href="/zh/model-studio/web-search">联网搜索</a></p><p>可选值：</p><ul><li><p><code>true</code>：开启；</p><blockquote><p>若开启后未联网搜索，可优化提示词，或设置<code>search_options</code>中的<code>forced_search</code>参数开启强制搜索。</p></blockquote></li><li><p><code>false</code>：不开启。</p></li></ul><blockquote><p>启用互联网搜索功能可能会增加 Token 的消耗。</p></blockquote><blockquote><p>该参数非OpenAI标准参数。通过 Python SDK调用时，请放入 <strong>extra_body</strong> 对象中。配置方式为：<code>extra_body={"enable_search": True}</code>。</p></blockquote><p><strong>search_options</strong><code>object</code>（可选）</p><p>联网搜索的策略。相关文档：<a href="/zh/model-studio/web-search">联网搜索</a></p><section class="collapse" id="accordion-属性-16"><p>属性</p><div><p><strong>forced_search</strong> <code>boolean</code>（可选）默认值为<code>false</code></p><p>是否强制开启联网搜索，仅当<code>enable_search</code>为<code>true</code>时生效。</p><p>可选值：</p><ul><li>true：强制开启；</li><li>false：不强制开启，由模型判断是否联网搜索。</li></ul><p><strong>search_strategy</strong> <code>string</code>（可选）默认值为<code>turbo</code></p><p>搜索量级策略，仅当<code>enable_search</code>为<code>true</code>时生效。</p><p>可选值：</p><ul><li><p><code>turbo</code> （默认）: 兼顾响应速度与搜索效果，适用于大多数场景。</p></li><li><p><code>max</code>: 采用更全面的搜索策略，可调用多源搜索引擎，以获取更详尽的搜索结果，但响应时间可能更长。</p></li><li><p><code>agent</code>：可多次调用联网搜索工具与大模型，实现多轮信息检索与内容整合。</p><blockquote><p>该策略仅适用于 qwen3.5-plus、qwen3.5-plus-2026-02-15、qwen3.5-flash、qwen3.5-flash-2026-02-23、qwen3-max、qwen3-max-2026-01-23、qwen3-max-2025-09-23、qwen3.5-omni-plus、qwen3.5-omni-plus-2026-03-15、qwen3.5-omni-flash、qwen3.5-omni-flash-2026-03-15。</p></blockquote></li><li><p><code>agent_max</code>：在<code>agent</code>策略基础上支持网页抓取，参见：<a href="/zh/model-studio/web-extractor">网页抓取</a>。</p><blockquote><p>该策略仅适用于 qwen3-max、qwen3-max-2026-01-23的思考模式。</p></blockquote></li></ul><p><strong>enable_search_extension</strong> <code>boolean</code>（可选）默认值为<code>false</code></p><p>是否开启垂域搜索，仅当<code>enable_search</code>为<code>true</code>时生效。</p><p>可选值：</p><ul><li><code>true</code>：开启。</li><li><code>false</code>：不开启。</li></ul></div></section><blockquote><p>该参数非OpenAI标准参数。通过 Python SDK调用时，请放入 <strong>extra_body</strong> 对象中。配置方式为：<code>extra_body={"search_options": xxx}</code>。</p></blockquote><p><strong>X-DashScope-DataInspection</strong><code>string</code> （可选）</p><p>在千问 API 的内容安全能力基础上，是否进一步识别输入输出内容的违规信息。取值如下：</p><ul><li><code>'{"input":"cip","output":"cip"}'</code>：进一步识别；</li><li>不设置该参数：不进一步识别。</li></ul><p>通过 HTTP 调用时请放入请求头：<code>-H "X-DashScope-DataInspection: {\"input\": \"cip\", \"output\": \"cip\"}"</code>；</p><p>通过 Python SDK 调用时请通过<code>extra_headers</code>配置：<code>extra_headers={'X-DashScope-DataInspection': '{"input":"cip","output":"cip"}'}</code>。</p><p>详细使用方法请参见<a href="/zh/model-studio/content-security">输⼊输出 AI 安全护栏</a>。</p><blockquote><p>不支持通过 Node.js SDK设置。</p></blockquote><p><strong>skill</strong><code>array</code>（可选）</p><p>技能参数，用于启用特定生成技能（如PPT生成）。仅<code>qwen-doc-turbo</code>模型支持。详细用法请参见<a href="/zh/model-studio/data-mining-qwen-doc#f6a7b8c9d0pp1">生成PPT</a>。</p><blockquote><p>该参数非OpenAI标准参数。通过 Python SDK调用时，请放入 <strong>extra_body</strong> 对象中。配置方式为：<code>extra_body={"skill": [...]}</code>。</p></blockquote><blockquote><p>使用 <strong>skill 时，stream</strong> 必须设置为 <strong>true</strong>。</p></blockquote><section class="collapse" id="accordion-属性-17"><p>属性</p><div><p><strong>type</strong><code>string</code><strong>（必选）</strong></p><p>技能类型。当前支持：</p><ul><li><code>ppt</code>：PPT生成。</li></ul><p><strong>mode</strong><code>string</code> （可选）</p><p>PPT生成模式。可选值：</p><ul><li><code>general</code> （默认值）：模板模式，需配合<code>template_id</code> 使用，生成HTML格式的PPT。</li><li><code>creative</code> ：创意模式，无需模板，生成图版PPT（每页为图片）。</li></ul><p><strong>template_id</strong><code>string</code>（可选）</p><p>PPT模板ID。与<code>mode</code>为<code>general</code>或未设置<code>mode</code>时配合使用。可选值：</p><ul><li><code>news_01</code>：新闻模板</li><li><code>summary_01</code>：总结模板</li><li><code>internet_01</code>：互联网模板</li><li><code>thesis_01</code>：论文模板</li></ul></div></section><p><strong>clear_thinking</strong><code>boolean</code>（可选）默认值为false</p><p>用于控制多轮对话中是否将历史轮次的 <code>reasoning_content</code>（思考过程）作为上下文输入给模型。仅 GLM 系列glm-5.2、glm-5.1、glm-5、glm-4.7模型支持。</p><blockquote><p>该参数非OpenAI标准参数。通过 Python SDK调用时，请放入 <strong>extra_body</strong> 对象中。配置方式为：<code>extra_body={"enable_thinking": True,"clear_thinking": True}</code>。</p></blockquote><ul><li><code>true</code>：忽略历史轮次的 <code>reasoning_content</code>，仅使用可见文本、工具调用与结果等非推理内容作为上下文输入，可降低上下文长度与成本。</li><li><code>false</code>（默认）：保留历史轮次的 <code>reasoning_content</code> 并随上下文一同提供给模型。若希望启用 Preserved Thinking，必须在 messages 中完整、未修改、按原顺序透传历史 <code>reasoning_content</code>，缺失、裁剪、改写或重排会导致效果下降或无法生效。</li></ul></td><td><section data-tag="tabbed-content-box" outputclass="tabbed-content-box" id="sec-tabs-2" class="tabbed-content-box section"><section id="文本输入" class="section"><h4 id="文本输入-h4">文本输入</h4><div outputclass="tabbed-codeblock" data-tag="fig" id="fig-code-group" class="tabbed-codeblock-box"><div class="tab-box"></div><input id="fig-code-group-python-tab" type="radio" name="check-fig-code-group" checked=""><label for="fig-code-group-python-tab">Python</label><div class="codeblock-item"><pre data-tag="codeblock" id="code-code-group-python" outputclass="language-python" code-type="xCode" class="pre codeblock language-python"><code>import os
from openai import OpenAI

client = OpenAI(
    # 若没有配置环境变量，请用百炼API Key将下行替换为：api_key="sk-xxx"
    api_key=os.getenv("DASHSCOPE_API_KEY"),
    base_url="https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/compatible-mode/v1",
)

completion = client.chat.completions.create(
    # 模型列表：https://help.aliyun.com/zh/model-studio/getting-started/models
    model="qwen3.8-max",
    messages=[
        {"role": "system", "content": "You are a helpful assistant."},
        {"role": "user", "content": "你是谁？"},
    ]
)
print(completion.model_dump_json())
</code></pre></div><input id="fig-code-group-java-tab" type="radio" name="check-fig-code-group"><label for="fig-code-group-java-tab">Java</label><div class="codeblock-item"><pre data-tag="codeblock" id="code-code-group-java" outputclass="language-java" code-type="xCode" class="pre codeblock language-java"><code>// 该代码 OpenAI SDK 版本为 2.6.0
import com.openai.client.OpenAIClient;
import com.openai.client.okhttp.OpenAIOkHttpClient;
import com.openai.models.chat.completions.ChatCompletion;
import com.openai.models.chat.completions.ChatCompletionCreateParams;

public class Main {
    public static void main(String[] args) {
        OpenAIClient client = OpenAIOkHttpClient.builder()
                .apiKey(System.getenv("DASHSCOPE_API_KEY"))
                .baseUrl("https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/compatible-mode/v1")
                .build();

        ChatCompletionCreateParams params = ChatCompletionCreateParams.builder()
                .addUserMessage("你是谁")
                .model("qwen3.8-max")
                .build();

        try {
            ChatCompletion chatCompletion = client.chat().completions().create(params);
            System.out.println(chatCompletion);
        } catch (Exception e) {
            System.err.println("Error occurred: " + e.getMessage());
            e.printStackTrace();
        }
    }
}
</code></pre></div><input id="fig-code-group-node-js-tab" type="radio" name="check-fig-code-group"><label for="fig-code-group-node-js-tab">Node.js</label><div class="codeblock-item"><pre data-tag="codeblock" id="code-code-group-node-js" outputclass="language-javascript" code-type="xCode" class="pre codeblock language-javascript"><code>import OpenAI from "openai";

const openai = new OpenAI(
    {
        // 若没有配置环境变量，请用百炼API Key将下行替换为：apiKey: "sk-xxx",
        apiKey: process.env.DASHSCOPE_API_KEY,
        baseURL: "https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/compatible-mode/v1"
    }
);

async function main() {
    const completion = await openai.chat.completions.create({
        model: "qwen3.8-max",  //此处以qwen3.8-max为例，可按需更换模型名称。模型列表：https://help.aliyun.com/zh/model-studio/getting-started/models
        messages: [
            { role: "system", content: "You are a helpful assistant." },
            { role: "user", content: "你是谁？" }
        ],
    });
    console.log(JSON.stringify(completion))
}

main();
</code></pre></div><input id="fig-code-group-go-tab" type="radio" name="check-fig-code-group"><label for="fig-code-group-go-tab">Go</label><div class="codeblock-item"><pre data-tag="codeblock" id="code-code-group-go" outputclass="language-go" code-type="xCode" class="pre codeblock language-go"><code>package main

import (
    "context"
    "os"

    "github.com/openai/openai-go"
    "github.com/openai/openai-go/option"
)

func main() {
    client := openai.NewClient(
        option.WithAPIKey(os.Getenv("DASHSCOPE_API_KEY")),
        option.WithBaseURL("https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/compatible-mode/v1"),
    )
    chatCompletion, err := client.Chat.Completions.New(
        context.TODO(), openai.ChatCompletionNewParams{
            Messages: []openai.ChatCompletionMessageParamUnion{
                openai.UserMessage("你是谁"),
            },
            Model: "qwen3.8-max",
        },
    )

    if err != nil {
        panic(err.Error())
    }

    println(chatCompletion.Choices[0].Message.Content)
}
</code></pre></div><input id="fig-code-group-c-http-tab" type="radio" name="check-fig-code-group"><label for="fig-code-group-c-http-tab">C#（HTTP）</label><div class="codeblock-item"><pre data-tag="codeblock" id="code-code-group-c-http" outputclass="language-csharp" code-type="xCode" class="pre codeblock language-csharp"><code>using System.Net.Http.Headers;
using System.Text;

class Program
{
    private static readonly HttpClient httpClient = new HttpClient();

    static async Task Main(string[] args)
    {
        // 若没有配置环境变量，请用百炼API Key将下行替换为：string? apiKey = "sk-xxx";
        string? apiKey = Environment.GetEnvironmentVariable("DASHSCOPE_API_KEY");

        if (string.IsNullOrEmpty(apiKey))
        {
            Console.WriteLine("API Key 未设置。请确保环境变量 'DASHSCOPE_API_KEY' 已设置。");
            return;
        }

        // 设置请求 URL 和内容
        string url = "https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/compatible-mode/v1/chat/completions";
        // 此处以qwen3.8-max为例，可按需更换模型名称。模型列表：https://help.aliyun.com/zh/model-studio/getting-started/models
        string jsonContent = @"{
            ""model"": ""qwen3.8-max"",
            ""messages"": [
                {
                    ""role"": ""system"",
                    ""content"": ""You are a helpful assistant.""
                },
                {
                    ""role"": ""user"",
                    ""content"": ""你是谁？""
                }
            ]
        }";

        // 发送请求并获取响应
        string result = await SendPostRequestAsync(url, jsonContent, apiKey);

        // 输出结果
        Console.WriteLine(result);
    }

    private static async Task&lt;string&gt; SendPostRequestAsync(string url, string jsonContent, string apiKey)
    {
        using (var content = new StringContent(jsonContent, Encoding.UTF8, "application/json"))
        {
            // 设置请求头
            httpClient.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", apiKey);
            httpClient.DefaultRequestHeaders.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));

            // 发送请求并获取响应
            HttpResponseMessage response = await httpClient.PostAsync(url, content);

            // 处理响应
            if (response.IsSuccessStatusCode)
            {
                return await response.Content.ReadAsStringAsync();
            }
            else
            {
                return $"请求失败: {response.StatusCode}";
            }
        }
    }
}
</code></pre></div><input id="fig-code-group-php-http-tab" type="radio" name="check-fig-code-group"><label for="fig-code-group-php-http-tab">PHP（HTTP）</label><div class="codeblock-item"><pre data-tag="codeblock" id="code-code-group-php-http" outputclass="language-php" code-type="xCode" class="pre codeblock language-php"><code>&lt;?php
// 设置请求的URL
$url = 'https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/compatible-mode/v1/chat/completions';
// 若没有配置环境变量，请用百炼API Key将下行替换为：$apiKey = "sk-xxx";
$apiKey = getenv('DASHSCOPE_API_KEY');
// 设置请求头
$headers = [
    'Authorization: Bearer '.$apiKey,
    'Content-Type: application/json'
];
// 设置请求体
$data = [
    // 此处以qwen3.8-max为例，可按需更换模型名称。模型列表：https://help.aliyun.com/zh/model-studio/getting-started/models
    "model" =&gt; "qwen3.8-max",
    "messages" =&gt; [
        [
            "role" =&gt; "system",
            "content" =&gt; "You are a helpful assistant."
        ],
        [
            "role" =&gt; "user",
            "content" =&gt; "你是谁？"
        ]
    ]
];
// 初始化cURL会话
$ch = curl_init();
// 设置cURL选项
curl_setopt($ch, CURLOPT_URL, $url);
curl_setopt($ch, CURLOPT_POST, true);
curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($data));
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
// 执行cURL会话
$response = curl_exec($ch);
// 检查是否有错误发生
if (curl_errno($ch)) {
    echo 'Curl error: ' . curl_error($ch);
}
// 关闭cURL资源
curl_close($ch);
// 输出响应结果
echo $response;
?&gt;
</code></pre></div><input id="fig-code-group-curl-tab" type="radio" name="check-fig-code-group"><label for="fig-code-group-curl-tab">curl</label><div class="codeblock-item"><pre data-tag="codeblock" id="code-code-group-curl" outputclass="language-bash" code-type="xCode" class="pre codeblock language-bash"><code>curl -X POST https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/compatible-mode/v1/chat/completions \
-H "Authorization: Bearer $DASHSCOPE_API_KEY" \
-H "Content-Type: application/json" \
-d '{
    "model": "qwen3.8-max",
    "messages": [
        {
            "role": "system",
            "content": "You are a helpful assistant."
        },
        {
            "role": "user",
            "content": "你是谁？"
        }
    ]
}'
</code></pre></div></div></section><section id="流式输出" class="section"><h4 id="流式输出-h4">流式输出</h4><blockquote><p>相关文档：<a href="/zh/model-studio/stream">流式输出</a>。</p></blockquote><div outputclass="tabbed-codeblock" data-tag="fig" id="fig-code-group-2" class="tabbed-codeblock-box"><div class="tab-box"></div><input id="fig-code-group-2-python-tab" type="radio" name="check-fig-code-group-2" checked=""><label for="fig-code-group-2-python-tab">Python</label><div class="codeblock-item"><pre data-tag="codeblock" id="code-code-group-2-python" outputclass="language-python" code-type="xCode" class="pre codeblock language-python"><code>import os
from openai import OpenAI

client = OpenAI(
    # 若没有配置环境变量，请用百炼API Key将下行替换为：api_key="sk-xxx"
    api_key=os.getenv("DASHSCOPE_API_KEY"),
    base_url="https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/compatible-mode/v1",
)
completion = client.chat.completions.create(
    model="qwen3.8-max",  # 此处以qwen3.8-max为例，可按需更换模型名称。模型列表：https://help.aliyun.com/zh/model-studio/getting-started/models
    messages=[{'role': 'system', 'content': 'You are a helpful assistant.'},
                {'role': 'user', 'content': '你是谁？'}],
    stream=True,
    stream_options={"include_usage": True}
    )
for chunk in completion:
    print(chunk.model_dump_json())
</code></pre></div><input id="fig-code-group-2-node-js-tab" type="radio" name="check-fig-code-group-2"><label for="fig-code-group-2-node-js-tab">Node.js</label><div class="codeblock-item"><pre data-tag="codeblock" id="code-code-group-2-node-js" outputclass="language-javascript" code-type="xCode" class="pre codeblock language-javascript"><code>import OpenAI from "openai";

const openai = new OpenAI(
    {
        // 若没有配置环境变量，请用百炼API Key将下行替换为：apiKey: "sk-xxx",
        apiKey: process.env.DASHSCOPE_API_KEY,
        baseURL: "https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/compatible-mode/v1"
    }
);

async function main() {
    const completion = await openai.chat.completions.create({
        model: "qwen3.8-max", // 此处以qwen3.8-max为例，可按需更换模型名称。模型列表：https://help.aliyun.com/zh/model-studio/getting-started/models
        messages: [
            {"role": "system", "content": "You are a helpful assistant."},
            {"role": "user", "content": "你是谁？"}
        ],
        stream: true,
        stream_options: {include_usage: true}
    });
    for await (const chunk of completion) {
        console.log(JSON.stringify(chunk));
    }
}

main();
</code></pre></div><input id="fig-code-group-2-curl-tab" type="radio" name="check-fig-code-group-2"><label for="fig-code-group-2-curl-tab">curl</label><div class="codeblock-item"><pre data-tag="codeblock" id="code-code-group-2-curl" outputclass="language-bash" code-type="xCode" class="pre codeblock language-bash"><code>curl --location "https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/compatible-mode/v1/chat/completions" \
--header "Authorization: Bearer $DASHSCOPE_API_KEY" \
--header "Content-Type: application/json" \
--data '{
    "model": "qwen3.8-max",
    "messages": [
        {
            "role": "system",
            "content": "You are a helpful assistant."
        },
        {
            "role": "user",
            "content": "你是谁？"
        }
    ],
    "stream":true,
    "stream_options": {
        "include_usage": true
    }
}'
</code></pre></div></div></section><section id="图像输入" class="section"><h4 id="图像输入-h4">图像输入</h4><blockquote><p>相关文档：<a href="/zh/model-studio/vision">图像与视频理解</a>。</p></blockquote><div outputclass="tabbed-codeblock" data-tag="fig" id="fig-code-group-3" class="tabbed-codeblock-box"><div class="tab-box"></div><input id="fig-code-group-3-python-tab" type="radio" name="check-fig-code-group-3" checked=""><label for="fig-code-group-3-python-tab">Python</label><div class="codeblock-item"><pre data-tag="codeblock" id="code-code-group-3-python" outputclass="language-python" code-type="xCode" class="pre codeblock language-python"><code>import os
from openai import OpenAI

client = OpenAI(
    # 若没有配置环境变量，请用百炼API Key将下行替换为：api_key="sk-xxx"
    api_key=os.getenv("DASHSCOPE_API_KEY"),
    base_url="https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/compatible-mode/v1",
)
completion = client.chat.completions.create(
    model="qwen-vl-plus",  # 此处以qwen-vl-plus为例，可按需更换模型名称。模型列表：https://help.aliyun.com/zh/model-studio/getting-started/models
    messages=[{"role": "user","content": [
            {"type": "image_url",
             "image_url": {"url": "https://dashscope.oss-cn-beijing.aliyuncs.com/images/dog_and_girl.jpeg"}},
            {"type": "text", "text": "这是什么"},
            ]}]
    )
print(completion.model_dump_json())
</code></pre></div><input id="fig-code-group-3-node-js-tab" type="radio" name="check-fig-code-group-3"><label for="fig-code-group-3-node-js-tab">Node.js</label><div class="codeblock-item"><pre data-tag="codeblock" id="code-code-group-3-node-js" outputclass="language-javascript" code-type="xCode" class="pre codeblock language-javascript"><code>import OpenAI from "openai";

const openai = new OpenAI(
    {
        // 若没有配置环境变量，请用百炼API Key将下行替换为：apiKey: "sk-xxx",
        apiKey: process.env.DASHSCOPE_API_KEY,
        baseURL: "https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/compatible-mode/v1"
    }
);

async function main() {
    const response = await openai.chat.completions.create({
        model: "qwen-vl-max", // 此处以qwen-vl-max为例，可按需更换模型名称。模型列表：https://help.aliyun.com/zh/model-studio/getting-started/models
        messages: [{role: "user",content: [
            { type: "image_url",image_url: {"url": "https://dashscope.oss-cn-beijing.aliyuncs.com/images/dog_and_girl.jpeg"}},
            { type: "text", text: "这是什么？" },
        ]}]
    });
    console.log(JSON.stringify(response));
}

main();
</code></pre></div><input id="fig-code-group-3-curl-tab" type="radio" name="check-fig-code-group-3"><label for="fig-code-group-3-curl-tab">curl</label><div class="codeblock-item"><pre data-tag="codeblock" id="code-code-group-3-curl" outputclass="language-bash" code-type="xCode" class="pre codeblock language-bash"><code>curl -X POST https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/compatible-mode/v1/chat/completions \
-H "Authorization: Bearer $DASHSCOPE_API_KEY" \
-H 'Content-Type: application/json' \
-d '{
  "model": "qwen-vl-plus",
  "messages": [{
      "role": "user",
      "content": [
       {"type": "image_url","image_url": {"url": "https://dashscope.oss-cn-beijing.aliyuncs.com/images/dog_and_girl.jpeg"}},
       {"type": "text","text": "这是什么"}
       ]}]
}'
</code></pre></div></div></section><section id="视频输入" class="section"><h4 id="视频输入-h4">视频输入</h4><blockquote><p>以下示例展示了如何将图片列表作为视频输入。如需使用视频文件等其他方式，请参阅“<a href="/zh/model-studio/vision#80dbf6ca8fh6s">视觉理解</a>。</p></blockquote><div outputclass="tabbed-codeblock" data-tag="fig" id="fig-code-group-4" class="tabbed-codeblock-box"><div class="tab-box"></div><input id="fig-code-group-4-python-tab" type="radio" name="check-fig-code-group-4" checked=""><label for="fig-code-group-4-python-tab">Python</label><div class="codeblock-item"><pre data-tag="codeblock" id="code-code-group-4-python" outputclass="language-python" code-type="xCode" class="pre codeblock language-python"><code>import os
from openai import OpenAI

client = OpenAI(
    # 若没有配置环境变量，请用百炼API Key将下行替换为：api_key="sk-xxx"
    api_key=os.getenv("DASHSCOPE_API_KEY"),
    base_url="https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/compatible-mode/v1",
)
completion = client.chat.completions.create(
    # 此处以qwen-vl-max为例，可按需更换模型名称。模型列表：https://help.aliyun.com/zh/model-studio/getting-started/models
    model="qwen-vl-max",
    messages=[{
        "role": "user",
        "content": [
            {
                "type": "video",
                "video": [
                    "https://img.alicdn.com/imgextra/i3/O1CN01K3SgGo1eqmlUgeE9b_!!6000000003923-0-tps-3840-2160.jpg",
                    "https://img.alicdn.com/imgextra/i4/O1CN01BjZvwg1Y23CF5qIRB_!!6000000003000-0-tps-3840-2160.jpg",
                    "https://img.alicdn.com/imgextra/i4/O1CN01Ib0clU27vTgBdbVLQ_!!6000000007859-0-tps-3840-2160.jpg",
                    "https://img.alicdn.com/imgextra/i1/O1CN01aygPLW1s3EXCdSN4X_!!6000000005710-0-tps-3840-2160.jpg"]
            },
            {
                "type": "text",
                "text": "描述这个视频的具体过程"
            }]}]
)
print(completion.model_dump_json())
</code></pre></div><input id="fig-code-group-4-node-js-tab" type="radio" name="check-fig-code-group-4"><label for="fig-code-group-4-node-js-tab">Node.js</label><div class="codeblock-item"><pre data-tag="codeblock" id="code-code-group-4-node-js" outputclass="language-javascript" code-type="xCode" class="pre codeblock language-javascript"><code>// 确保之前在 package.json 中指定了 "type": "module"
import OpenAI from "openai";

const openai = new OpenAI({
    // 若没有配置环境变量，请用百炼API Key将下行替换为：apiKey: "sk-xxx",
    apiKey: process.env.DASHSCOPE_API_KEY,
    baseURL: "https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/compatible-mode/v1"
});

async function main() {
    const response = await openai.chat.completions.create({
        // 此处以qwen-vl-max为例，可按需更换模型名称。模型列表：https://help.aliyun.com/zh/model-studio/getting-started/models
        model: "qwen-vl-max",
        messages: [{
            role: "user",
            content: [
                {
                    type: "video",
                    video: [
                        "https://img.alicdn.com/imgextra/i3/O1CN01K3SgGo1eqmlUgeE9b_!!6000000003923-0-tps-3840-2160.jpg",
                        "https://img.alicdn.com/imgextra/i4/O1CN01BjZvwg1Y23CF5qIRB_!!6000000003000-0-tps-3840-2160.jpg",
                        "https://img.alicdn.com/imgextra/i4/O1CN01Ib0clU27vTgBdbVLQ_!!6000000007859-0-tps-3840-2160.jpg",
                        "https://img.alicdn.com/imgextra/i1/O1CN01aygPLW1s3EXCdSN4X_!!6000000005710-0-tps-3840-2160.jpg"
                    ]
                },
                {
                    type: "text",
                    text: "描述这个视频的具体过程"
                }
        ]}]
    });
    console.log(JSON.stringify(response));
}

main();
</code></pre></div><input id="fig-code-group-4-curl-tab" type="radio" name="check-fig-code-group-4"><label for="fig-code-group-4-curl-tab">curl</label><div class="codeblock-item"><pre data-tag="codeblock" id="code-code-group-4-curl" outputclass="language-bash" code-type="xCode" class="pre codeblock language-bash"><code>curl -X POST https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/compatible-mode/v1/chat/completions \
-H "Authorization: Bearer $DASHSCOPE_API_KEY" \
-H 'Content-Type: application/json' \
-d '{
    "model": "qwen-vl-max",
    "messages": [
        {
            "role": "user",
            "content": [
                {
                    "type": "video",
                    "video": [
                        "https://img.alicdn.com/imgextra/i3/O1CN01K3SgGo1eqmlUgeE9b_!!6000000003923-0-tps-3840-2160.jpg",
                        "https://img.alicdn.com/imgextra/i4/O1CN01BjZvwg1Y23CF5qIRB_!!6000000003000-0-tps-3840-2160.jpg",
                        "https://img.alicdn.com/imgextra/i4/O1CN01Ib0clU27vTgBdbVLQ_!!6000000007859-0-tps-3840-2160.jpg",
                        "https://img.alicdn.com/imgextra/i1/O1CN01aygPLW1s3EXCdSN4X_!!6000000005710-0-tps-3840-2160.jpg"
                    ]
                },
                {
                    "type": "text",
                    "text": "描述这个视频的具体过程"
                }
            ]
        }
    ]
}'
</code></pre></div></div></section><section id="工具调用" class="section"><h4 id="工具调用-h4">工具调用</h4><blockquote><p>相关文档：<a href="/zh/model-studio/qwen-function-calling">Function Calling</a></p></blockquote><div class="note note-note"><div class="note-icon-wrapper"></div><div class="note-content"><p><strong>说明</strong><strong>模型知识时效性</strong>：大模型基于训练数据生成回复，其知识存在截止时间，无法自动感知当前真实日期。询问当前日期时，模型返回的是训练数据截止时间之前的旧日期，这不是参数配置错误。</p><p>获取当前准确时间的方式：</p><ol><li><strong>Function Calling</strong>：定义 <code>get_current_time</code> 工具，由模型通过函数调用获取实时时间，见下方工具调用示例。</li><li><strong>系统提示词注入</strong>：在系统消息（system role）中注入当前日期，每次调用需动态传入。</li><li><strong>联网搜索</strong>：<code>enable_search</code> 可获取实时资讯，但无法直接获取当前时间。</li></ol></div></div><div outputclass="tabbed-codeblock" data-tag="fig" id="fig-code-group-5" class="tabbed-codeblock-box"><div class="tab-box"></div><input id="fig-code-group-5-python-tab" type="radio" name="check-fig-code-group-5" checked=""><label for="fig-code-group-5-python-tab">Python</label><div class="codeblock-item"><pre data-tag="codeblock" id="code-code-group-5-python" outputclass="language-python" code-type="xCode" class="pre codeblock language-python"><code>import os
from openai import OpenAI

client = OpenAI(
    # 若没有配置环境变量，请用百炼API Key将下行替换为：api_key="sk-xxx"
    api_key=os.getenv("DASHSCOPE_API_KEY"),
    base_url="https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/compatible-mode/v1",  # 填写DashScope SDK的base_url
)

tools = [
    # 工具1 获取当前时刻的时间
    {
        "type": "function",
        "function": {
            "name": "get_current_time",
            "description": "当你想知道现在的时间时非常有用。",
            "parameters": {}  # 因为获取当前时间无需输入参数，因此parameters为空字典
        }
    },
    # 工具2 获取指定城市的天气
    {
        "type": "function",
        "function": {
            "name": "get_current_weather",
            "description": "当你想查询指定城市的天气时非常有用。",
            "parameters": {
                "type": "object",
                "properties": {
                    # 查询天气时需要提供位置，因此参数设置为location
                    "location": {
                        "type": "string",
                        "description": "城市或县区，比如北京市、杭州市、余杭区等。"
                    }
                },
                "required": ["location"]
            }
        }
    }
]
messages = [{"role": "user", "content": "杭州天气怎么样"}]
completion = client.chat.completions.create(
    model="qwen3.8-max",  # 此处以qwen3.8-max为例，可按需更换模型名称。模型列表：https://help.aliyun.com/zh/model-studio/getting-started/models
    messages=messages,
    tools=tools
)

print(completion.model_dump_json())
</code></pre></div><input id="fig-code-group-5-node-js-tab" type="radio" name="check-fig-code-group-5"><label for="fig-code-group-5-node-js-tab">Node.js</label><div class="codeblock-item"><pre data-tag="codeblock" id="code-code-group-5-node-js" outputclass="language-javascript" code-type="xCode" class="pre codeblock language-javascript"><code>import OpenAI from "openai";

const openai = new OpenAI(
    {
        // 若没有配置环境变量，请用百炼API Key将下行替换为：apiKey: "sk-xxx",
        apiKey: process.env.DASHSCOPE_API_KEY,
        baseURL: "https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/compatible-mode/v1"
    }
);

const messages = [{"role": "user", "content": "杭州天气怎么样"}];
const tools = [
// 工具1 获取当前时刻的时间
{
    "type": "function",
    "function": {
        "name": "get_current_time",
        "description": "当你想知道现在的时间时非常有用。",
        // 因为获取当前时间无需输入参数，因此parameters为空
        "parameters": {}
    }
},
// 工具2 获取指定城市的天气
{
    "type": "function",
    "function": {
        "name": "get_current_weather",
        "description": "当你想查询指定城市的天气时非常有用。",
        "parameters": {
            "type": "object",
            "properties": {
                // 查询天气时需要提供位置，因此参数设置为location
                "location": {
                    "type": "string",
                    "description": "城市或县区，比如北京市、杭州市、余杭区等。"
                }
            },
            "required": ["location"]
        }
    }
}
];

async function main() {
    const response = await openai.chat.completions.create({
        model: "qwen3.8-max", // 此处以qwen3.8-max为例，可按需更换模型名称。模型列表：https://help.aliyun.com/zh/model-studio/getting-started/models
        messages: messages,
        tools: tools,
    });
    console.log(JSON.stringify(response));
}

main();
</code></pre></div><input id="fig-code-group-5-curl-tab" type="radio" name="check-fig-code-group-5"><label for="fig-code-group-5-curl-tab">curl</label><div class="codeblock-item"><pre data-tag="codeblock" id="code-code-group-5-curl" outputclass="language-bash" code-type="xCode" class="pre codeblock language-bash"><code>curl -X POST https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/compatible-mode/v1/chat/completions \
-H "Authorization: Bearer $DASHSCOPE_API_KEY" \
-H "Content-Type: application/json" \
-d '{
    "model": "qwen3.8-max",
    "messages": [
        {
            "role": "system",
            "content": "You are a helpful assistant."
        },
        {
            "role": "user",
            "content": "杭州天气怎么样"
        }
    ],
    "tools": [
    {
        "type": "function",
        "function": {
            "name": "get_current_time",
            "description": "当你想知道现在的时间时非常有用。",
            "parameters": {}
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_current_weather",
            "description": "当你想查询指定城市的天气时非常有用。",
            "parameters": {
                "type": "object",
                "properties": {
                    "location":{
                        "type": "string",
                        "description": "城市或县区，比如北京市、杭州市、余杭区等。"
                    }
                },
                "required": ["location"]
            }
        }
    }
  ]
}'
</code></pre></div></div></section><section id="联网搜索" class="section"><h4 id="联网搜索-h4">联网搜索</h4><div outputclass="tabbed-codeblock" data-tag="fig" id="fig-code-group-6" class="tabbed-codeblock-box"><div class="tab-box"></div><input id="fig-code-group-6-python-tab" type="radio" name="check-fig-code-group-6" checked=""><label for="fig-code-group-6-python-tab">Python</label><div class="codeblock-item"><pre data-tag="codeblock" id="code-code-group-6-python" outputclass="language-python" code-type="xCode" class="pre codeblock language-python"><code>import os
from openai import OpenAI

client = OpenAI(
    # 若没有配置环境变量，请用百炼API Key将下行替换为：api_key="sk-xxx"
    api_key=os.getenv("DASHSCOPE_API_KEY"),
    base_url="https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/compatible-mode/v1",
)
completion = client.chat.completions.create(
    model="qwen3.8-max",  # 此处以qwen3.8-max为例，可按需更换模型名称。模型列表：https://help.aliyun.com/zh/model-studio/getting-started/models
    messages=[
        {'role': 'system', 'content': 'You are a helpful assistant.'},
        {'role': 'user', 'content': '中国队在巴黎奥运会获得了多少枚金牌'}],
    extra_body={
        "enable_search": True
    }
    )
print(completion.model_dump_json())
</code></pre></div><input id="fig-code-group-6-node-js-tab" type="radio" name="check-fig-code-group-6"><label for="fig-code-group-6-node-js-tab">Node.js</label><div class="codeblock-item"><pre data-tag="codeblock" id="code-code-group-6-node-js" outputclass="language-javascript" code-type="xCode" class="pre codeblock language-javascript"><code>import OpenAI from "openai";

const openai = new OpenAI(
    {
        // 若没有配置环境变量，请用百炼API Key将下行替换为：apiKey: "sk-xxx",
        apiKey: process.env.DASHSCOPE_API_KEY,
        baseURL: "https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/compatible-mode/v1"
    }
);
async function main() {
    const completion = await openai.chat.completions.create({
        model: "qwen3.8-max", //此处以qwen3.8-max为例，可按需更换模型名称。模型列表：https://help.aliyun.com/zh/model-studio/getting-started/models
        messages: [
            { role: "system", content: "You are a helpful assistant." },
            { role: "user", content: "中国队在巴黎奥运会获得了多少枚金牌" }
        ],
        enable_search:true
    });
    console.log(JSON.stringify(completion))
}

main();
</code></pre></div><input id="fig-code-group-6-curl-tab" type="radio" name="check-fig-code-group-6"><label for="fig-code-group-6-curl-tab">curl</label><div class="codeblock-item"><pre data-tag="codeblock" id="code-code-group-6-curl" outputclass="language-bash" code-type="xCode" class="pre codeblock language-bash"><code>curl -X POST https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/compatible-mode/v1/chat/completions \
-H "Authorization: Bearer $DASHSCOPE_API_KEY" \
-H "Content-Type: application/json" \
-d '{
    "model": "qwen3.8-max",
    "messages": [
        {
            "role": "system",
            "content": "You are a helpful assistant."
        },
        {
            "role": "user",
            "content": "中国队在巴黎奥运会获得了多少枚金牌"
        }
    ],
    "enable_search": true
}'
</code></pre></div></div></section><section id="异步调用" class="section"><h4 id="异步调用-h4">异步调用</h4><pre data-tag="codeblock" id="code-block-2" outputclass="language-python" code-type="xCode" class="pre codeblock language-python"><code>import os
import asyncio
from openai import AsyncOpenAI
import platform

client = AsyncOpenAI(
    # 若没有配置环境变量，请用百炼API Key将下行替换为：api_key="sk-xxx"
    api_key=os.getenv("DASHSCOPE_API_KEY"),
    base_url="https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/compatible-mode/v1",
)

async def main():
    response = await client.chat.completions.create(
        messages=[{"role": "user", "content": "你是谁"}],
        model="qwen3.8-max",  # 此处以qwen3.8-max为例，可按需更换模型名称。模型列表：https://help.aliyun.com/zh/model-studio/getting-started/models
    )
    print(response.model_dump_json())

if platform.system() == "Windows":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
asyncio.run(main())
</code></pre></section><section id="文档理解" class="section"><h4 id="文档理解-h4">文档理解</h4><blockquote><p>当前仅qwen-long模型支持对文档进行分析，详细用法请参见<a href="/zh/model-studio/long-context-qwen-long">长上下文（Qwen-Long）</a>。</p></blockquote><div outputclass="tabbed-codeblock" data-tag="fig" id="fig-code-group-7" class="tabbed-codeblock-box"><div class="tab-box"></div><input id="fig-code-group-7-python-tab" type="radio" name="check-fig-code-group-7" checked=""><label for="fig-code-group-7-python-tab">Python</label><div class="codeblock-item"><pre data-tag="codeblock" id="code-code-group-7-python" outputclass="language-python" code-type="xCode" class="pre codeblock language-python"><code>import os
from pathlib import Path
from openai import OpenAI

client = OpenAI(
    # 若没有配置环境变量，请用百炼API Key将下行替换为：api_key="sk-xxx"
    api_key=os.getenv("DASHSCOPE_API_KEY"),
    base_url="https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/compatible-mode/v1",
)
file_object = client.files.create(file=Path("百炼系列手机产品介绍.docx"), purpose="file-extract")
completion = client.chat.completions.create(
    model="qwen-long",  # 模型列表：https://help.aliyun.com/zh/model-studio/getting-started/models
    messages=[
        {'role': 'system', 'content': f'fileid://{file_object.id}'},
        {'role': 'user', 'content': '这篇文章讲了什么？'}
    ]
)
print(completion.model_dump_json())
</code></pre></div><input id="fig-code-group-7-java-tab" type="radio" name="check-fig-code-group-7"><label for="fig-code-group-7-java-tab">Java</label><div class="codeblock-item"><pre data-tag="codeblock" id="code-code-group-7-java" outputclass="language-java" code-type="xCode" class="pre codeblock language-java"><code>// 建议OpenAI SDK的版本 &gt;= 0.32.0
import com.openai.client.OpenAIClient;
import com.openai.client.okhttp.OpenAIOkHttpClient;
import com.openai.models.chat.completions.ChatCompletion;
import com.openai.models.chat.completions.ChatCompletionCreateParams;
import com.openai.models.files.FileCreateParams;
import com.openai.models.files.FileObject;
import com.openai.models.files.FilePurpose;

import java.nio.file.Path;
import java.nio.file.Paths;

public class Main {
    public static void main(String[] args) {
        // 创建客户端，使用环境变量中的API密钥
        OpenAIClient client = OpenAIOkHttpClient.builder()
                .apiKey(System.getenv("DASHSCOPE_API_KEY"))
                .baseUrl("https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/compatible-mode/v1")
                .build();

        // 设置文件路径
        Path filePath = Paths.get("百炼系列手机产品介绍.docx");
        // 创建文件上传参数
        FileCreateParams fileParams = FileCreateParams.builder()
                .file(filePath)
                .purpose(FilePurpose.of("file-extract"))
                .build();

        // 上传文件
        FileObject fileObject = client.files().create(fileParams);
        String fileId = fileObject.id();

        // 创建聊天请求
        ChatCompletionCreateParams chatParams = ChatCompletionCreateParams.builder()
                .addSystemMessage("fileid://" + fileId)
                .addUserMessage("这篇文章讲了什么？")
                .model("qwen-long")
                .build();

        // 发送请求并获取响应
        ChatCompletion chatCompletion = client.chat().completions().create(chatParams);

        // 打印响应结果
        System.out.println(chatCompletion);
    }
}
</code></pre></div><input id="fig-code-group-7-node-js-tab" type="radio" name="check-fig-code-group-7"><label for="fig-code-group-7-node-js-tab">Node.js</label><div class="codeblock-item"><pre data-tag="codeblock" id="code-code-group-7-node-js" outputclass="language-javascript" code-type="xCode" class="pre codeblock language-javascript"><code>import fs from "fs";
import OpenAI from "openai";

const openai = new OpenAI(
    {
        // 若没有配置环境变量，请用百炼API Key将下行替换为：apiKey: "sk-xxx",
        apiKey: process.env.DASHSCOPE_API_KEY,
        baseURL: "https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/compatible-mode/v1"
    }
);

async function getFileID() {
    const fileObject = await openai.files.create({
        file: fs.createReadStream("百炼系列手机产品介绍.docx"),
        purpose: "file-extract"
    });
    return fileObject.id;
}

async function main() {
    const fileID = await getFileID();
    const completion = await openai.chat.completions.create({
        model: "qwen-long",  //模型列表：https://help.aliyun.com/zh/model-studio/getting-started/models
        messages: [
            { role: "system", content: `fileid://${fileID}`},
            { role: "user", content: "这篇文章讲了什么？" }
        ],
    });
    console.log(JSON.stringify(completion))
}

main();
</code></pre></div><input id="fig-code-group-7-curl-tab" type="radio" name="check-fig-code-group-7"><label for="fig-code-group-7-curl-tab">curl</label><div class="codeblock-item"><pre data-tag="codeblock" id="code-code-group-7-curl" outputclass="language-bash" code-type="xCode" class="pre codeblock language-bash"><code>curl --location 'https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/compatible-mode/v1/chat/completions' \
--header "Authorization: Bearer $DASHSCOPE_API_KEY" \
--header "Content-Type: application/json" \
--data '{
    "model": "qwen-long",
    "messages": [
        {"role": "system","content": "You are a helpful assistant."},
        {"role": "system","content": "fileid://file-fe-xxx"},
        {"role": "user","content": "这篇文章讲了什么？"}
    ],
    "stream": true,
    "stream_options": {
        "include_usage": true
    }
}'
</code></pre></div></div></section><section id="ppt生成" class="section"><h4 id="ppt生成-h4">PPT生成</h4><blockquote><p>当前仅<code>qwen-doc-turbo</code>模型支持PPT生成。详细用法请参见<a href="/zh/model-studio/data-mining-qwen-doc#f6a7b8c9d0pp1">生成PPT</a>。</p></blockquote><div outputclass="tabbed-codeblock" data-tag="fig" id="fig-code-group-8" class="tabbed-codeblock-box"><div class="tab-box"></div><input id="fig-code-group-8-python-tab" type="radio" name="check-fig-code-group-8" checked=""><label for="fig-code-group-8-python-tab">Python</label><div class="codeblock-item"><pre data-tag="codeblock" id="code-code-group-8-python" outputclass="language-python" code-type="xCode" class="pre codeblock language-python"><code>import os
from openai import OpenAI

client = OpenAI(
    api_key=os.getenv("DASHSCOPE_API_KEY"),
    base_url="https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/compatible-mode/v1",
)

completion = client.chat.completions.create(
    model="qwen-doc-turbo",
    messages=[
        {"role": "system", "content": "you are a helpful assistant."},
        {"role": "system", "content": "您的文档内容"},
        {"role": "user", "content": "生成一个10到20页的ppt"}
    ],
    extra_body={"skill": [{"type": "ppt", "mode": "general", "template_id": "news_01"}]},
    stream=True,
    stream_options={"include_usage": True}
)

for chunk in completion:
    if chunk.choices and chunk.choices[0].delta.content:
        print(chunk.choices[0].delta.content, end='', flush=True)
</code></pre></div><input id="fig-code-group-8-node-js-tab" type="radio" name="check-fig-code-group-8"><label for="fig-code-group-8-node-js-tab">Node.js</label><div class="codeblock-item"><pre data-tag="codeblock" id="code-code-group-8-node-js" outputclass="language-javascript" code-type="xCode" class="pre codeblock language-javascript"><code>import OpenAI from "openai";

const openai = new OpenAI(
    {
        apiKey: process.env.DASHSCOPE_API_KEY,
        baseURL: "https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/compatible-mode/v1"
    }
);

async function main() {
    const completion = await openai.chat.completions.create({
        model: "qwen-doc-turbo",
        messages: [
            {"role": "system", "content": "you are a helpful assistant."},
            {"role": "system", "content": "您的文档内容"},
            {"role": "user", "content": "生成一个10到20页的ppt"}
        ],
        skill: [{"type": "ppt", "mode": "general", "template_id": "news_01"}],
        stream: true,
        stream_options: {"include_usage": true}
    });
    for await (const chunk of completion) {
        if (chunk.choices?.length &gt; 0 &amp;&amp; chunk.choices[0].delta.content) {
            process.stdout.write(chunk.choices[0].delta.content);
        }
    }
}

main();
</code></pre></div><input id="fig-code-group-8-curl-tab" type="radio" name="check-fig-code-group-8"><label for="fig-code-group-8-curl-tab">curl</label><div class="codeblock-item"><pre data-tag="codeblock" id="code-code-group-8-curl" outputclass="language-bash" code-type="xCode" class="pre codeblock language-bash"><code>curl --location 'https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/compatible-mode/v1/chat/completions' \
--header "Authorization: Bearer $DASHSCOPE_API_KEY" \
--header "Content-Type: application/json" \
--data '{
    "model": "qwen-doc-turbo",
    "messages": [
        {
            "role": "system",
            "content": "you are a helpful assistant."
        },
        {
            "role": "system",
            "content": "您的文档内容"
        },
        {
            "role": "user",
            "content": "生成一个10到20页的ppt"
        }
    ],
    "skill": [
        {
            "type": "ppt",
            "mode": "general",
            "template_id": "news_01"
        }
    ],
    "stream": true,
    "stream_options": {
        "include_usage": true
    }
}'
</code></pre></div></div></section></section></td></tr></tbody></table>

<table bordertype="no-border"><colgroup><col style="width:57.4%"><col style="width:42.6%"></colgroup><tbody><tr><td><h2>chat响应对象（非流式输出）<span id="cd3063363egdc"></span></h2><p><strong>id</strong><code>string</code></p><p>本次调用的唯一标识符。</p><p><strong>choices</strong><code>array</code></p><p>模型生成内容的数组。</p><section class="collapse" id="accordion-属性-18"><p>属性</p><div><p><strong>finish_reason</strong><code>string</code></p><p>模型停止生成的原因。</p><p>有三种情况：</p><ul><li>触发输入参数中的<code>stop</code>参数，或自然停止输出时为<code>stop</code>；</li><li>生成长度过长而结束为<code>length</code>；</li><li>需要调用工具而结束为<code>tool_calls</code>。</li></ul><p><strong>index</strong><code>integer</code></p><p>当前对象在<code>choices</code>数组中的索引。</p><p><strong>logprobs</strong><code>object</code></p><p>模型输出的 Token 概率信息。</p><section class="collapse" id="accordion-属性-19"><p>属性</p><div><p><strong>content</strong> <code>array</code></p><p>包含每个 Token 及其对数概率的数组。</p><section class="collapse" id="accordion-属性-20"><p>属性</p><div><p><strong>token</strong> <code>string</code></p><p>当前 Token 的文本。</p><p><strong>bytes</strong> <code>array</code></p><p>当前 Token 的 UTF‑8 原始字节列表，用于精确还原输出内容（例如表情符号或中文字符）。</p><p><strong>logprob</strong> <code>float</code></p><p>当前 Token 的对数概率。返回值为 <code>null</code> 表示概率值极低。</p><p><strong>top_logprobs</strong> <code>array</code></p><p>当前 Token 位置最可能的若干候选 Token，数量与请求参数<code>top_logprobs</code>保持一致。每个元素包含：</p><section class="collapse" id="accordion-属性-21"><p>属性</p><div><p><strong>token</strong> <code>string</code></p><p>候选 Token 文本。</p><p><strong>bytes</strong> <code>array</code></p><p>当前 Token 的 UTF‑8 原始字节列表，用于精确还原输出内容（例如表情符号或中文字符）。</p><p><strong>logprob</strong> <code>float</code></p><p>该候选 Token 的对数概率。返回值为 null 表示概率值极低。</p></div></section></div></section></div></section><p><strong>message</strong><code>object</code></p><p>模型输出的消息。</p><section class="collapse" id="accordion-属性-22"><p>属性</p><div><p><strong>content</strong> <code>string</code></p><p>模型的回复内容。</p><p><strong>reasoning_content</strong> <code>string</code></p><p>模型的思维链内容。</p><p><strong>refusal</strong> <code>string</code></p><p>该参数当前固定为<code>null</code>。</p><p><strong>role</strong> <code>string</code></p><p>消息的角色，固定为<code>assistant</code>。</p><p><strong>audio</strong> <code>object</code></p><p>该参数当前固定为<code>null</code>。</p><p><strong>function_call</strong>（即将废弃）<code>object</code></p><p>该值固定为<code>null</code>，请参考<code>tool_calls</code>参数。</p><p><strong>tool_calls</strong> <code>array</code></p><p>在发起 Function Calling后，模型生成的工具与入参信息。</p><section class="collapse" id="accordion-属性-23"><p>属性</p><div><p><strong>id</strong> <code>string</code></p><p>本次工具响应的唯一标识符。</p><p><strong>type</strong> <code>string</code></p><p>工具类型，当前只支持<code>function</code>。</p><p><strong>function</strong> <code>object</code></p><p>工具信息。</p><section class="collapse" id="accordion-属性-24"><p>属性</p><div><p><strong>name</strong> <code>string</code></p><p>工具名称。</p><p><strong>arguments</strong> <code>string</code></p><p>入参信息，为JSON格式字符串。</p><blockquote><p>由于大模型响应有一定随机性，输出的入参信息可能不符合函数签名。请在调用前校验参数有效性</p></blockquote></div></section><p><strong>index</strong> <code>integer</code></p><p>当前工具在<code>tool_calls</code>数组中的索引。</p></div></section></div></section></div></section><p><strong>created</strong><code>integer</code></p><p>请求创建时的 Unix 时间戳（秒）。</p><p><strong>model</strong><code>string</code></p><p>本次请求使用的模型。</p><p><strong>object</strong> <code>string</code></p><p>始终为<code>chat.completion</code>。</p><p><strong>service_tier</strong> <code>string</code></p><p>该参数当前固定为<code>null</code>。</p><p><strong>system_fingerprint</strong><code>string</code></p><p>该参数当前固定为<code>null</code>。</p><p><strong>usage</strong> <code>object</code></p><p>本次请求的 Token 消耗信息。</p><section class="collapse" id="accordion-属性-25"><p>属性</p><div><p><strong>completion_tokens</strong> <code>integer</code></p><p>模型输出的 Token 数。</p><p><strong>prompt_tokens</strong> <code>integer</code></p><p>输入的 Token 数。<a href="/zh/model-studio/text-generation#e710782c79xqy">补充说明</a></p><p><strong>total_tokens</strong> <code>integer</code></p><p>消耗的总 Token 数，为<code>prompt_tokens</code>与<code>completion_tokens</code>的总和。</p><p><strong>completion_tokens_details</strong> <code>object</code>（可选）</p><p>输出 Token 的细粒度分类。部分模型返回该字段。</p><section class="collapse" id="accordion-属性-26"><p>属性</p><div><p><strong>audio_tokens</strong> <code>integer</code>（可选）</p><p>输出的音频 Token 数。</p><p><strong>reasoning_tokens</strong> <code>integer</code>（可选）</p><p>思考过程 Token 数。</p><p><strong>text_tokens</strong> <code>integer</code>（可选）</p><p>输出文本的 Token 数。</p></div></section><p><strong>prompt_tokens_details</strong> <code>object</code></p><p>输入 Token 的细粒度分类。</p><section class="collapse" id="accordion-属性-27"><p>属性</p><div><p><strong>audio_tokens</strong> <code>integer</code></p><p>该参数当前固定为<code>null</code>。</p><p><strong>cached_tokens</strong> <code>integer</code></p><p>命中 Cache 的 Token 数。Context Cache 详情请参见<a href="/zh/model-studio/context-cache">上下文缓存</a>。</p><p><strong>text_tokens</strong> <code>integer</code></p><p>输入的文本 Token 数。</p><p><strong>image_tokens</strong> <code>integer</code></p><p>输入的图像 Token 数。</p><p><strong>video_tokens</strong> <code>integer</code></p><p>输入的视频文件或者图像列表 Token 数。</p><p><strong>cache_creation</strong> <code>object</code></p><p><a href="/zh/model-studio/context-cache#825f201c5fy6o">显式缓存</a>创建信息。</p><section class="collapse" id="accordion-属性-28"><p>属性</p><div><p><strong>ephemeral_5m_input_tokens</strong> <code>integer</code></p><p>创建显式缓存的 Token 数。</p></div></section><p><strong>cache_creation_input_tokens</strong> <code>integer</code></p><p>创建显式缓存的 Token 数。</p><p><strong>cache_type</strong> <code>string</code></p><p>使用<a href="/zh/model-studio/context-cache#825f201c5fy6o">显式缓存</a>时，参数值为<code>ephemeral</code>，否则该参数不存在。</p></div></section></div></section></td><td><pre data-tag="codeblock" id="code-block-3" outputclass="language-json" code-type="xCode" class="pre codeblock language-json"><code>{
    "choices": [
        {
            "message": {
                "role": "assistant",
                "content": "我是阿里云开发的一款超大规模语言模型，我叫千问。"
            },
            "finish_reason": "stop",
            "index": 0,
            "logprobs": null
        }
    ],
    "object": "chat.completion",
    "usage": {
        "prompt_tokens": 3019,
        "completion_tokens": 104,
        "total_tokens": 3123,
        "prompt_tokens_details": {
            "cached_tokens": 2048
        }
    },
    "created": 1735120033,
    "system_fingerprint": null,
    "model": "qwen3.8-max",
    "id": "chatcmpl-6ada9ed2-7f33-9de2-8bb0-78bd4035025a"
}
</code></pre></td></tr></tbody></table>

<table bordertype="no-border"><colgroup><col style="width:57.14%"><col style="width:42.86%"></colgroup><tbody><tr><td><h2>chat响应chunk对象（流式输出）<span id="e98e6b7aa5nb2"></span></h2><p><strong>id</strong><code>string</code></p><p>本次调用的唯一标识符。每个chunk对象有相同的 id。</p><p><strong>choices</strong><code>array</code></p><p>模型生成内容的数组，可包含一个或多个对象。若设置<code>include_usage</code>参数为<code>true</code>，则<code>choices</code>在最后一个chunk中为空数组。</p><section class="collapse" id="accordion-属性-29"><p>属性</p><div><p><strong>delta</strong> <code>object</code></p><p>请求的增量对象。</p><section class="collapse" id="accordion-属性-30"><p>属性</p><div><p><strong>content</strong> <code>string</code></p><p>增量消息内容。</p><p><strong>reasoning_content</strong> <code>string</code></p><p>增量思维链内容。</p><p><strong>function_call</strong> <code>object</code></p><p>该值默认为<code>null</code>，请参考<code>tool_calls</code>参数。</p><p><strong>audio</strong><code>object</code></p><p>使用 <a href="/zh/model-studio/qwen-omni">Qwen-Omni</a> 模型时生成的回复。</p><section class="collapse" id="accordion-属性-31"><p>属性</p><div><p><strong>data</strong> <code>string</code></p><p>增量的 Base64 音频编码数据。</p><p><strong>expires_at</strong> <code>integer</code></p><p>创建请求时的时间戳。</p></div></section><p><strong>refusal</strong> <code>object</code></p><p>该参数当前固定为<code>null</code>。</p><p><strong>role</strong> <code>string</code></p><p>增量消息对象的角色，只在第一个chunk中有值。</p><p><strong>tool_calls</strong> <code>array</code></p><p>在发起 Function Calling后，模型生成的工具与入参信息。</p><section class="collapse" id="accordion-属性-32"><p>属性</p><div><p><strong>index</strong> <code>integer</code></p><p>当前工具在<code>tool_calls</code>数组中的索引。</p><p><strong>id</strong> <code>string</code></p><p>本次工具响应的唯一标识符。</p><p><strong>function</strong> <code>object</code></p><p>被调用的工具信息。</p><section class="collapse" id="accordion-属性-33"><p>属性</p><div><p><strong>arguments</strong> <code>string</code></p><p>增量的入参信息，所有chunk的<code>arguments</code>拼接后为完整的入参。</p><blockquote><p>由于大模型响应有一定随机性，输出的入参信息可能不符合函数签名。请在调用前校验参数有效性。</p></blockquote><p><strong>name</strong> <code>string</code></p><p>工具名称，只在第一个chunk中有值。</p></div></section><p><strong>type</strong> <code>string</code></p><p>工具类型，当前只支持<code>function</code>。</p></div></section></div></section><p><strong>finish_reason</strong> <code>string</code></p><p>模型停止生成的原因。有四种情况：</p><ul><li>因触发输入参数中的<code>stop</code>参数，或自然停止输出时为<code>stop</code>；</li><li>生成未结束时为<code>null</code>；</li><li>生成长度过长而结束为<code>length</code>；</li><li>需要调用工具而结束为<code>tool_calls</code>。</li></ul><p><strong>index</strong> <code>integer</code></p><p>当前响应在<code>choices</code>数组中的索引。当输入参数 n 大于1时，需根据本参数进行不同响应对应的完整内容的拼接。</p><p><strong>logprobs</strong><code>object</code></p><p>当前对象的概率信息。</p><section class="collapse" id="accordion-属性-34"><p>属性</p><div><p><strong>content</strong> <code>array</code></p><p>带有对数概率信息的 Token 数组。</p><section class="collapse" id="accordion-属性-35"><p>属性</p><div><p><strong>token</strong> <code>string</code></p><p>当前 Token。</p><p><strong>bytes</strong> <code>array</code></p><p>当前 Token 的 UTF‑8 原始字节列表，用于精确还原输出内容，在处理表情符号、中文字符时有帮助。</p><p><strong>logprob</strong> <code>float</code></p><p>当前 Token 的对数概率。返回值为 null 表示概率值极低。</p><p><strong>top_logprobs</strong> <code>array</code></p><p>当前 Token 位置最可能的若干个 Token 及其对数概率，元素个数与入参的<code>top_logprobs</code>保持一致。</p><section class="collapse" id="accordion-属性-36"><p>属性</p><div><p><strong>token</strong> <code>string</code></p><p>当前 Token。</p><p><strong>bytes</strong> <code>array</code></p><p>当前 Token 的 UTF‑8 原始字节列表，用于精确还原输出内容，在处理表情符号、中文字符时有帮助。</p><p><strong>logprob</strong> <code>float</code></p><p>当前 Token 的对数概率。返回值为 null 表示概率值极低。</p></div></section></div></section></div></section></div></section><p><strong>created</strong><code>integer</code></p><p>本次请求被创建时的时间戳。每个chunk有相同的时间戳。</p><p><strong>model</strong><code>string</code></p><p>本次请求使用的模型。</p><p><strong>object</strong> <code>string</code></p><p>始终为<code>chat.completion.chunk</code>。</p><p><strong>service_tier</strong> <code>string</code></p><p>该参数当前固定为<code>null</code>。</p><p><strong>system_fingerprint</strong><code>string</code></p><p>该参数当前固定为<code>null</code>。</p><p><strong>usage</strong> <code>object</code></p><p>本次请求消耗的Token。只在<code>include_usage</code>为<code>true</code>时，在最后一个chunk显示。</p><section class="collapse" id="accordion-属性-37"><p>属性</p><div><p><strong>completion_tokens</strong> <code>integer</code></p><p>模型输出的 Token 数。</p><p><strong>prompt_tokens</strong> <code>integer</code></p><p>输入 Token 数。</p><p><strong>total_tokens</strong> <code>integer</code></p><p>总 Token 数，为<code>prompt_tokens</code>与<code>completion_tokens</code>的总和。</p><p><strong>completion_tokens_details</strong> <code>object</code>（可选）</p><p>输出 Token 的详细信息。部分模型返回该字段。</p><section class="collapse" id="accordion-属性-38"><p>属性</p><div><p><strong>audio_tokens</strong><code>integer</code>（可选）</p><p>输出的音频 Token 数。</p><p><strong>reasoning_tokens</strong> <code>integer</code>（可选）</p><p>思考过程 Token 数。</p><p><strong>text_tokens</strong><code>integer</code>（可选）</p><p>输出文本 Token 数。</p></div></section><p><strong>prompt_tokens_details</strong> <code>object</code></p><p>输入 Token的细粒度分类。</p><section class="collapse" id="accordion-属性-39"><p>属性</p><div><p><strong>audio_tokens</strong> <code>integer</code></p><p>输入音频的 Token 数。</p><blockquote><p>视频文件中的音频 Token 数通过本参数返回。</p></blockquote><p><strong>text_tokens</strong> <code>integer</code></p><p>输入文本的 Token 数。</p><p><strong>video_tokens</strong> <code>integer</code></p><p>输入视频（图片列表形式或视频文件）的 Token 数。</p><p><strong>image_tokens</strong> <code>integer</code></p><p>输入图片的 Token 数。</p><p><strong>cached_tokens</strong> <code>integer</code></p><p>命中缓存的 Token 数。Context Cache 详情请参见<a href="/zh/model-studio/context-cache">上下文缓存</a>。</p><p><strong>cache_creation</strong> <code>object</code></p><p><a href="/zh/model-studio/context-cache#825f201c5fy6o">显式缓存</a>创建信息。</p><section class="collapse" id="accordion-属性-40"><p>属性</p><div><p><strong>ephemeral_5m_input_tokens</strong> <code>integer</code></p><p>创建显式缓存的 Token 数。</p></div></section><p><strong>cache_creation_input_tokens</strong> <code>integer</code></p><p>创建显式缓存的 Token 数。</p><p><strong>cache_type</strong> <code>string</code></p><p>缓存类型，固定为<code>ephemeral</code>。</p></div></section></div></section></td><td><pre data-tag="codeblock" id="code-block-4" outputclass="language-json" code-type="xCode" class="pre codeblock language-json"><code>{"id":"chatcmpl-e30f5ae7-3063-93c4-90fe-beb5f900bd57","choices":[{"delta":{"content":"","function_call":null,"refusal":null,"role":"assistant","tool_calls":null},"finish_reason":null,"index":0,"logprobs":null}],"created":1735113344,"model":"qwen3.8-max","object":"chat.completion.chunk","service_tier":null,"system_fingerprint":null,"usage":null}
{"id":"chatcmpl-e30f5ae7-3063-93c4-90fe-beb5f900bd57","choices":[{"delta":{"content":"我是","function_call":null,"refusal":null,"role":null,"tool_calls":null},"finish_reason":null,"index":0,"logprobs":null}],"created":1735113344,"model":"qwen3.8-max","object":"chat.completion.chunk","service_tier":null,"system_fingerprint":null,"usage":null}
{"id":"chatcmpl-e30f5ae7-3063-93c4-90fe-beb5f900bd57","choices":[{"delta":{"content":"来自","function_call":null,"refusal":null,"role":null,"tool_calls":null},"finish_reason":null,"index":0,"logprobs":null}],"created":1735113344,"model":"qwen3.8-max","object":"chat.completion.chunk","service_tier":null,"system_fingerprint":null,"usage":null}
{"id":"chatcmpl-e30f5ae7-3063-93c4-90fe-beb5f900bd57","choices":[{"delta":{"content":"阿里","function_call":null,"refusal":null,"role":null,"tool_calls":null},"finish_reason":null,"index":0,"logprobs":null}],"created":1735113344,"model":"qwen3.8-max","object":"chat.completion.chunk","service_tier":null,"system_fingerprint":null,"usage":null}
{"id":"chatcmpl-e30f5ae7-3063-93c4-90fe-beb5f900bd57","choices":[{"delta":{"content":"云的超大规模","function_call":null,"refusal":null,"role":null,"tool_calls":null},"finish_reason":null,"index":0,"logprobs":null}],"created":1735113344,"model":"qwen3.8-max","object":"chat.completion.chunk","service_tier":null,"system_fingerprint":null,"usage":null}
{"id":"chatcmpl-e30f5ae7-3063-93c4-90fe-beb5f900bd57","choices":[{"delta":{"content":"语言模型，我","function_call":null,"refusal":null,"role":null,"tool_calls":null},"finish_reason":null,"index":0,"logprobs":null}],"created":1735113344,"model":"qwen3.8-max","object":"chat.completion.chunk","service_tier":null,"system_fingerprint":null,"usage":null}
{"id":"chatcmpl-e30f5ae7-3063-93c4-90fe-beb5f900bd57","choices":[{"delta":{"content":"叫千问千","function_call":null,"refusal":null,"role":null,"tool_calls":null},"finish_reason":null,"index":0,"logprobs":null}],"created":1735113344,"model":"qwen3.8-max","object":"chat.completion.chunk","service_tier":null,"system_fingerprint":null,"usage":null}
{"id":"chatcmpl-e30f5ae7-3063-93c4-90fe-beb5f900bd57","choices":[{"delta":{"content":"问。","function_call":null,"refusal":null,"role":null,"tool_calls":null},"finish_reason":null,"index":0,"logprobs":null}],"created":1735113344,"model":"qwen3.8-max","object":"chat.completion.chunk","service_tier":null,"system_fingerprint":null,"usage":null}
{"id":"chatcmpl-e30f5ae7-3063-93c4-90fe-beb5f900bd57","choices":[{"delta":{"content":"","function_call":null,"refusal":null,"role":null,"tool_calls":null},"finish_reason":"stop","index":0,"logprobs":null}],"created":1735113344,"model":"qwen3.8-max","object":"chat.completion.chunk","service_tier":null,"system_fingerprint":null,"usage":null}
{"id":"chatcmpl-e30f5ae7-3063-93c4-90fe-beb5f900bd57","choices":[],"created":1735113344,"model":"qwen3.8-max","object":"chat.completion.chunk","service_tier":null,"system_fingerprint":null,"usage":{"completion_tokens":17,"prompt_tokens":22,"total_tokens":39,"completion_tokens_details":null,"prompt_tokens_details":{"audio_tokens":null,"cached_tokens":0}}}
</code></pre></td></tr></tbody></table>

## 错误码

如果模型调用失败并返回报错信息，请参见[错误码](/zh/model-studio/error-code)进行解决。
