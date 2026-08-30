通过 DashScope API 调用千问模型，查看输入输出参数说明及调用示例。

#### 华北2（北京）

HTTP 请求地址：

-   纯文本模型（如qwen-plus）：`POST https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/api/v1/services/aigc/text-generation/generation`
-   多模态模型（如qwen3.7-plus或qwen3-vl-plus）：`POST https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation`

SDK调用配置的`base_url`：

#### Python代码

```
dashscope.base_http_api_url = 'https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/api/v1'
```

#### Java代码

-   **方式一：**

```
import com.alibaba.dashscope.protocol.Protocol;
MultiModalConversation conv = new MultiModalConversation(Protocol.HTTP.getValue(), "https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/api/v1");
```

-   **方式二：**

```
import com.alibaba.dashscope.utils.Constants;
Constants.baseHttpApiUrl="https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/api/v1";
```

#### 新加坡

HTTP 请求地址：

-   纯文本模型（如qwen-plus）：`POST https://{WorkspaceId}.ap-southeast-1.maas.aliyuncs.com/api/v1/services/aigc/text-generation/generation`
-   多模态模型（如qwen3.7-plus或qwen3-vl-plus）`POST https://{WorkspaceId}.ap-southeast-1.maas.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation`

SDK调用配置的`base_url`：

#### Python代码

```
dashscope.base_http_api_url = 'https://{WorkspaceId}.ap-southeast-1.maas.aliyuncs.com/api/v1'
```

#### Java代码

-   **方式一：**

```
import com.alibaba.dashscope.protocol.Protocol;
MultiModalConversation conv = new MultiModalConversation(Protocol.HTTP.getValue(), "https://{WorkspaceId}.ap-southeast-1.maas.aliyuncs.com/api/v1");
```

-   **方式二：**

```
import com.alibaba.dashscope.utils.Constants;
Constants.baseHttpApiUrl="https://{WorkspaceId}.ap-southeast-1.maas.aliyuncs.com/api/v1";
```

#### 美国（弗吉尼亚）

HTTP 请求地址：

-   纯文本模型（如qwen-plus）：`POST https://{WorkspaceId}.us-east-1.maas.aliyuncs.com/api/v1/services/aigc/text-generation/generation`
-   多模态模型（如qwen3.7-plus或qwen3-vl-plus）：`POST https://{WorkspaceId}.us-east-1.maas.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation`

SDK调用配置的`base_url`：

#### Python代码

```
dashscope.base_http_api_url = 'https://{WorkspaceId}.us-east-1.maas.aliyuncs.com/api/v1'
```

#### Java代码

-   **方式一：**

```
import com.alibaba.dashscope.protocol.Protocol;
MultiModalConversation conv = new MultiModalConversation(Protocol.HTTP.getValue(), "https://{WorkspaceId}.us-east-1.maas.aliyuncs.com/api/v1");
```

-   **方式二：**

```
import com.alibaba.dashscope.utils.Constants;
Constants.baseHttpApiUrl="https://{WorkspaceId}.us-east-1.maas.aliyuncs.com/api/v1";
```

#### 德国（法兰克福）

HTTP 请求地址：

-   纯文本模型（如qwen-plus）：`POST https://{WorkspaceId}.eu-central-1.maas.aliyuncs.com/api/v1/services/aigc/text-generation/generation`
-   多模态模型（如qwen3.7-plus或qwen3-vl-plus）：`POST https://{WorkspaceId}.eu-central-1.maas.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation`

SDK调用配置的`base_url`：

#### Python代码

```
dashscope.base_http_api_url = 'https://{WorkspaceId}.eu-central-1.maas.aliyuncs.com/api/v1'
```

#### Java代码

-   **方式一：**

```
import com.alibaba.dashscope.protocol.Protocol;
MultiModalConversation conv = new MultiModalConversation(Protocol.HTTP.getValue(), "https://{WorkspaceId}.eu-central-1.maas.aliyuncs.com/api/v1");
```

-   **方式二：**

```
import com.alibaba.dashscope.utils.Constants;
Constants.baseHttpApiUrl="https://{WorkspaceId}.eu-central-1.maas.aliyuncs.com/api/v1";
```

#### 日本（东京）

HTTP 请求地址：

-   纯文本模型（如qwen-plus）：`POST https://{WorkspaceId}.ap-northeast-1.maas.aliyuncs.com/api/v1/services/aigc/text-generation/generation`
-   多模态模型（如qwen3.7-plus或qwen3-vl-plus）：`POST https://{WorkspaceId}.ap-northeast-1.maas.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation`

SDK调用配置的`base_url`：

#### Python代码

```
dashscope.base_http_api_url = 'https://{WorkspaceId}.ap-northeast-1.maas.aliyuncs.com/api/v1'
```

#### Java代码

-   **方式一：**

```
import com.alibaba.dashscope.protocol.Protocol;
MultiModalConversation conv = new MultiModalConversation(Protocol.HTTP.getValue(), "https://{WorkspaceId}.ap-northeast-1.maas.aliyuncs.com/api/v1");
```

-   **方式二：**

```
import com.alibaba.dashscope.utils.Constants;
Constants.baseHttpApiUrl="https://{WorkspaceId}.ap-northeast-1.maas.aliyuncs.com/api/v1";
```

调用时请将`{WorkspaceId}`替换为真实的[业务空间ID](/zh/model-studio/obtain-the-app-id-and-workspace-id#732535cfc959h)。

您需要已[获取与配置 API Key](/zh/model-studio/get-api-key)并[配置API Key到环境变量](/zh/model-studio/configure-api-key-through-environment-variables)。如果通过DashScope SDK进行调用，需要[安装DashScope SDK](/zh/model-studio/install-sdk)。

**重要**阿里云百炼为华北2（北京）、新加坡地域推出了业务空间专属域名，**能够为推理请求提供卓越的性能和更高的稳定性**，建议迁移至新域名：

-   华北2（北京）地域：从 `https://dashscope.aliyuncs.com` 迁移至 `https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com`
-   新加坡地域：从 `https://dashscope-intl.aliyuncs.com` 迁移至 `https://{WorkspaceId}.ap-southeast-1.maas.aliyuncs.com`

其中 `{WorkspaceId}` 为您的业务空间 ID，可在阿里云百炼控制台的**业务空间详情**页面查看。现有域名仍可正常使用。

<table bordertype="no-border"><colgroup><col style="width:56.99%"><col style="width:43.01%"></colgroup><tbody><tr><td><h2>请求体<span id="2a1c410015otp"></span></h2><p><strong>model</strong><code>string</code><strong>（必选）</strong></p><p>模型名称。</p><p>支持的模型：Qwen 大语言模型（商业版、开源版）、Qwen-VL、Qwen-Coder、千问Audio、数学模型、DeepSeek（阿里云直供、硅基流动直供）、Kimi（阿里云直供）、GLM（阿里云直供）、MiniMax（阿里云直供、稀宇科技直供）。</p><p><strong>具体模型名称和计费，请参见</strong><a href="/zh/model-studio/models">选择模型</a>。</p><p><strong>messages</strong><code>array</code><strong>（必选）</strong></p><p>传递给大模型的上下文，按对话顺序排列。</p><blockquote><p>通过HTTP调用时，请将<strong>messages</strong>放入 <strong>input</strong> 对象中。</p></blockquote><section class="collapse" id="accordion-消息类型"><p>消息类型</p><div><p>System Message<code>object</code>（可选）</p><p>系统消息，用于设定大模型的角色、语气、任务目标或约束条件等。一般放在<code>messages</code>数组的第一位。</p><blockquote><p>QwQ模型不建议设置 System Message，QVQ 模型设置 System Message不会生效。</p></blockquote><section class="collapse" id="accordion-属性"><p>属性</p><div><p><strong>content</strong><code>string</code><strong>（必选）</strong></p><p>消息内容。</p><p><strong>role</strong><code>string</code><strong>（必选）</strong></p><p>系统消息的角色，固定为 <code>system</code> 。</p></div></section><p>User Message<code>object</code><strong>（必选）</strong></p><p>用户消息，用于向模型传递问题、指令或上下文等。</p><section class="collapse" id="accordion-属性-2"><p>属性</p><div><p><strong>content</strong><code>string 或 array</code><strong>（必选）</strong></p><p>消息内容。若输入只有文本，则为 string 类型；若输入包含图像等多模态数据，或启用显式缓存，则为 array 类型。</p><section class="collapse" id="accordion-属性-3"><p>属性</p><div><p><strong>text</strong><code>string</code><strong>（必选）</strong></p><p>输入的文本。</p><p><strong>image</strong><code>string</code>（可选）</p><p>指定用于图片理解的图像文件，图像支持以下三种方式传入：</p><ul><li>公网 URL：公网可访问的图像链接</li><li>图片的 Base64 编码，格式为 <code>data:image/&lt;format&gt;;base64,&lt;data&gt;</code></li><li>本地文件：本地文件的绝对路径</li></ul><p>适用模型：<a href="/zh/model-studio/vision">Qwen-VL</a>、<a href="/zh/model-studio/visual-reasoning">QVQ</a></p><p>示例值：<code>{"image":"https://xxxx.jpeg"}</code></p><p><strong>video</strong><code>array 或 string</code>（可选）</p><p>使用<a href="/zh/model-studio/vision">Qwen-VL 模型</a>或<a href="/zh/model-studio/visual-reasoning">QVQ模型</a>传入的视频。</p><ul><li>若传入图像列表，则为<code>array</code>类型；</li><li>若传入视频文件，则为<code>string</code>类型*。*</li></ul><p>传入本地文件请参见<a href="/zh/model-studio/vision">本地文件（Qwen-VL）</a>或<a href="/zh/model-studio/visual-reasoning">本地文件（QVQ）</a>。</p><p>示例值：</p><ul><li>图像列表：<code>{"video":["https://xx1.jpg",...,"https://xxn.jpg"]}</code></li><li>视频文件：<code>{"video":"https://xxx.mp4"}</code></li></ul><p><strong>fps</strong><code>float</code>（可选）</p><p>每秒抽帧数。取值范围为 [0.1, 10]，默认值为2.0。</p><section class="collapse" id="accordion-功能说明"><p>功能说明</p><div><p>fps有两个功能：</p><ul><li><p>输入视频文件时，控制抽帧频率，每 f p s 1 ​秒抽取一帧。</p><blockquote><p>适用于<a href="/zh/model-studio/vision">Qwen-VL 模型</a>与<a href="/zh/model-studio/visual-reasoning">QVQ模型</a>。</p></blockquote></li><li><p>告知模型相邻帧之间的时间间隔，帮助其更好地理解视频的时间动态。同时适用于输入视频文件与图像列表时。该功能同时支持视频文件和图像列表输入，适用于事件时间定位或分段内容摘要等场景。</p><blockquote><p>支持Qwen3.7、Qwen3.6、Qwen3.5、<code>Qwen3-VL</code>、<code>Qwen2.5-VL</code>与QVQ模型。</p></blockquote></li></ul><p>较大的<code>fps</code>适合高速运动的场景（如体育赛事、动作电影等），较小的<code>fps</code>适合长视频或内容偏静态的场景。</p></div></section><section class="collapse" id="accordion-示例值"><p>示例值</p><div><ul><li>图像列表传入：<code>{"video":["https://xx1.jpg",...,"https://xxn.jpg"]，"fps":2}</code></li><li>视频文件传入：<code>{"video": "https://xx1.mp4"，"fps":2}</code></li></ul></div></section><p><strong>max_frames</strong><code>integer</code>（可选）</p><p>视频抽取帧数的上限。当按<code>fps</code>计算的帧数超过 <code>max_frames</code>时，系统将自动调整为：在<code>max_frames</code>内均匀抽帧，确保总帧数不超过限制。</p><section class="collapse" id="accordion-取值范围"><p>取值范围</p><div><ul><li>qwen3.7系列、qwen3.6系列、qwen3.5系列：最大值和默认值均为 8000。</li><li><code>qwen3-vl-plus</code>系列、<code>qwen3-vl-flash</code>系列、<code>qwen3-vl-235b-a22b-thinking</code>、<code>qwen3-vl-235b-a22b-instruct</code>：最大值和默认值均为 2000。</li><li><code>qwen-vl-max</code>、<code>qwen-vl-max-0813</code>、<code>qwen-vl-plus</code>、<code>qwen-vl-plus-0815``、qwen-vl-plus-0710</code>：最大值和默认值均为 512。</li></ul></div></section><section class="collapse" id="accordion-示例值-2"><p>示例值</p><div><p><code>{"type": "video_url","video_url": {"url":"https://xxxx.mp4"},"max_frame": 2000}</code></p></div></section><blockquote><p>使用 OpenAI 兼容API调用时，不支持自定义<code>max_frames</code>参数，API 将自动使用各模型对应的默认值。</p></blockquote><p><strong>min_pixels</strong><code>integer</code>（可选）</p><p>设定输入图像或视频帧的最小像素阈值。当输入图像或视频帧的像素小于<code>min_pixels</code>时，会将其进行放大，直到总像素高于<code>min_pixels</code>。</p><section class="collapse" id="accordion-取值范围-2"><p>取值范围</p><div><ul><li><strong>输入图像：</strong><ul><li><code>Qwen3.7、Qwen3.6、Qwen3.5</code>、<code>Qwen3-VL</code>：默认值和最小值均为：<code>65536</code></li><li><code>qwen-vl-max</code>、<code>qwen-vl-max-0813</code>、<code>qwen-vl-plus</code>、<code>qwen-vl-plus-0815``、qwen-vl-plus-0710</code>：默认值和最小值均为<code>4096</code></li><li>其他<code>qwen-vl-plus</code>模型、其他<code>qwen-vl-max</code>模型、<code>Qwen2.5-VL</code>开源系列及<code>QVQ</code>系列模型：默认值和最小值均为<code>3136</code></li></ul></li><li><strong>输入视频文件或图像列表：</strong><ul><li><code>Qwen3.7、Qwen3.6、Qwen3.5</code>、Qwen3-VL（包括商业版和开源版）、<code>qwen-vl-max</code>、<code>qwen-vl-max-0813</code>、<code>qwen-vl-plus</code>、<code>qwen-vl-plus-0815``、qwen-vl-plus-0710</code>：默认值为<code>65536</code>，最小值为<code>4096</code></li><li>其他<code>qwen-vl-plus</code>模型、其他<code>qwen-vl-max</code>模型、<code>Qwen2.5-VL</code>开源系列及<code>QVQ</code>系列模型：默认值为<code>50176</code>，最小值为<code>3136</code></li></ul></li></ul></div></section><section class="collapse" id="accordion-示例值-3"><p>示例值</p><div><ul><li>输入图像：<code>{"type": "image_url","image_url": {"url":"https://xxxx.jpg"},"min_pixels": 65536}</code></li><li>输入视频文件时：<code>{"type": "video_url","video_url": {"url":"https://xxxx.mp4"},"min_pixels": 65536}</code></li><li>输入图像列表时：<code>{"type": "video","video": ["https://xx1.jpg",...,"https://xxn.jpg"],"min_pixels": 65536}</code></li></ul></div></section><p><strong>max_pixels</strong><code>integer</code>（可选）</p><p>用于设定输入图像或视频帧的最大像素阈值。当输入图像或视频的像素在<code>[min_pixels, max_pixels]</code>区间内时，模型会按原图进行识别。当输入图像像素大于<code>max_pixels</code>时，会将图像进行缩小，直到总像素低于<code>max_pixels</code>。</p><section class="collapse" id="accordion-取值范围-3"><p>取值范围</p><div><ul><li><strong>输入图像：</strong><p><code>max_pixels</code> 的取值与是否开启<code>vl_high_resolution_images</code>参数有关。</p><ul><li><p>当<code>vl_high_resolution_images</code>为<code>False</code>时：</p><ul><li><code>Qwen3.7、Qwen3.6、Qwen3.5</code>、<code>Qwen3-VL</code>：默认值为<code>2621440</code>，最大值为：<code>16777216</code></li><li><code>qwen-vl-max</code>、<code>qwen-vl-max-0813</code>、<code>qwen-vl-plus</code>、<code>qwen-vl-plus-0815``、qwen-vl-plus-0710</code>：默认值为<code>1310720</code>，最大值为：<code>16777216</code></li><li>其他<code>qwen-vl-plus</code>模型、其他<code>qwen-vl-max</code>模型、<code>Qwen2.5-VL</code>开源系列及<code>QVQ</code>系列模型：默认值为<code>1003520</code> ，最大值为<code>12845056</code></li></ul></li><li><p>当<code>vl_high_resolution_images</code>为<code>True</code>时：</p><ul><li><code>Qwen3.7、Qwen3.6、Qwen3.5</code>、Qwen3-VL、<code>qwen-vl-max</code>、<code>qwen-vl-max-0813</code>、<code>qwen-vl-plus</code>、<code>qwen-vl-plus-0815``、qwen-vl-plus-0710</code>：<code>max_pixels</code>无效，输入图像的最大像素固定为<code>16777216</code></li><li>其他<code>qwen-vl-plus</code>模型、其他<code>qwen-vl-max</code>模型、<code>Qwen2.5-VL</code>开源系列及<code>QVQ</code>系列模型：<code>max_pixels</code>无效，输入图像的最大像素固定为<code>12845056</code></li></ul></li></ul></li><li><strong>输入视频文件或图像列表：</strong><ul><li><code>qwen3.7系列、qwen3.6系列、qwen3.5系列、qwen3-vl-plus</code>系列、<code>qwen3-vl-flash</code>系列、<code>qwen3-vl-235b-a22b-thinking</code>、<code>qwen3-vl-235b-a22b-instruct</code>：默认值为<code>655360</code>，最大值为<code>2048000</code></li><li>其他<code>Qwen3-VL</code>开源模型、<code>qwen-vl-max</code>、<code>qwen-vl-max-0813</code>、<code>qwen-vl-plus</code>、<code>qwen-vl-plus-0815``、qwen-vl-plus-0710</code>：默认值<code>655360</code>，最大值为<code>786432</code></li><li>其他<code>qwen-vl-plus</code>模型、其他<code>qwen-vl-max</code>模型、<code>Qwen2.5-VL</code>开源系列及<code>QVQ</code>系列模型：默认值为<code>501760</code>，最大值为<code>602112</code></li></ul></li></ul></div></section><section class="collapse" id="accordion-示例值-4"><p>示例值</p><div><ul><li>输入图像：<code>{"type": "image_url","image_url": {"url":"https://xxxx.jpg"},"max_pixels": 8388608}</code></li><li>输入视频文件时：<code>{"type": "video_url","video_url": {"url":"https://xxxx.mp4"},"max_pixels": 655360}</code></li><li>输入图像列表时：<code>{"type": "video","video": ["https://xx1.jpg",...,"https://xxn.jpg"],"max_pixels": 655360}</code></li></ul></div></section><p><strong>total_pixels</strong><code>integer</code>（可选）</p><p>用于限制从视频中抽取的所有帧的总像素（单帧图像像素 × 总帧数）。如果视频总像素超过此限制，系统将对视频帧进行缩放，但仍会确保单帧图像的像素值在<code>[min_pixels, max_pixels]</code>范围内。适用于 Qwen-VL、QVQ 模型。</p><p>对于抽帧数量较多的长视频，可适当降低此值以减少Token消耗和处理时间，但这可能会导致图像细节丢失。</p><section class="collapse" id="accordion-取值范围-4"><p>取值范围</p><div><ul><li>qwen3.7系列、qwen3.6系列、qwen3.5系列：默认值和最大值均为819200000，该值对应 <code>800000</code> 个图像 Token（每 32×32 像素对应 1 个图像 Token）。</li><li><code>qwen3-vl-plus</code>系列、<code>qwen3-vl-flash</code>系列、<code>qwen3-vl-235b-a22b-thinking</code>、<code>qwen3-vl-235b-a22b-instruct</code>：默认值和最大值均为134217728，该值对应 <code>131072</code> 个图像 Token（每 32×32 像素对应 1 个图像 Token）。</li><li>其他<code>Qwen3-VL</code>开源模型、<code>qwen-vl-max</code>、<code>qwen-vl-max-0813</code>、<code>qwen-vl-plus</code>、<code>qwen-vl-plus-0815``、qwen-vl-plus-0710</code>：默认值和最小值均为<code>67108864</code>，该值对应 <code>65536</code> 个图像 Token（每 32×32 像素对应 1 个图像 Token）。</li><li>其他<code>qwen-vl-plus</code>模型、其他<code>qwen-vl-max</code>模型、<code>Qwen2.5-VL</code>开源系列及<code>QVQ</code>系列模型：默认值和最小值均为<code>51380224</code>，该值对应 <code>65536</code> 个图像 Token（每 28×28 像素对应 1 个图像 Token）。</li></ul></div></section><section class="collapse" id="accordion-示例值-5"><p>示例值</p><div><ul><li>输入视频文件时：<code>{"type": "video_url","video_url": {"url":"https://xxxx.mp4"},"total_pixels": 134217728}</code></li><li>输入图像列表时：<code>{"type": "video","video": ["https://xx1.jpg",...,"https://xxn.jpg"],"total_pixels": 134217728}</code></li></ul></div></section><p><strong>audio</strong><code>string</code></p><blockquote><p>模型为音频理解时，是必选参数，如模型为qwen-audio-turbo等。</p></blockquote><p>使用音频理解功能时，传入的音频文件。</p><p>示例值：<code>{"audio":"https://xxx.mp3"}</code></p><p><strong>cache_control</strong><code>object</code><strong>（可选）</strong></p><p>仅支持<a href="/zh/model-studio/context-cache#825f201c5fy6o">显式缓存</a>的模型支持，用于开启显式缓存。</p><section class="collapse" id="accordion-属性-4"><p>属性</p><div><p><strong>type</strong> <code>string</code><strong>（必选）</strong></p><p>固定为<code>ephemeral</code>。</p></div></section></div></section><p><strong>role</strong><code>string</code><strong>（必选）</strong></p><p>用户消息的角色，固定为<code>user</code>。</p></div></section><p>Assistant Message <code>object</code>（可选）</p><p>模型对用户消息的回复。</p><section class="collapse" id="accordion-属性-5"><p>属性</p><div><p><strong>content</strong><code>string</code>（可选）</p><p>消息内容。仅当助手消息中指定<code>tool_calls</code>参数时非必选。</p><p><strong>role</strong><code>string</code><strong>（必选）</strong></p><p>固定为<code>assistant</code>。</p><p><strong>partial</strong><code>boolean</code>（可选）</p><p>是否开启前缀续写。相关文档与支持的模型：<a href="/zh/model-studio/partial-mode">前缀续写</a>。</p><p><strong>tool_calls</strong> <code>array</code>（可选）</p><p>发起 Function Calling 后，返回的工具与入参信息，包含一个或多个对象。由上一轮模型响应的<code>tool_calls</code>字段获得。</p><section class="collapse" id="accordion-属性-6"><p>属性</p><div><p><strong>id</strong> <code>string</code></p><p>工具响应的ID。</p><p><strong>type</strong> <code>string</code></p><p>工具类型，当前只支持设为<code>function</code>。</p><p><strong>function</strong> <code>object</code></p><p>工具与入参信息。</p><section class="collapse" id="accordion-属性-7"><p>属性</p><div><p><strong>name</strong> <code>string</code></p><p>工具名称。</p><p><strong>arguments</strong> <code>string</code></p><p>入参信息，为JSON格式字符串。</p></div></section><p><strong>index</strong> <code>integer</code></p><p>当前工具信息在<code>tool_calls</code>数组中的索引。</p></div></section></div></section><p>Tool Message<code>object</code>（可选）</p><p>工具的输出信息。</p><section class="collapse" id="accordion-属性-8"><p>属性</p><div><p><strong>content</strong><code>string</code><strong>（必选）</strong></p><p>工具函数的输出内容，必须为字符串格式。</p><p><strong>role</strong><code>string</code><strong>（必选）</strong></p><p>固定为<code>tool</code>。</p><p><strong>tool_call_id</strong><code>string</code><strong>（可选）</strong></p><p>发起 Function Calling 后返回的 id，可以通过<code>response.output.choices[0].message.tool_calls[$index]["id"]</code>获取，用于标记 Tool Message 对应的工具。</p></div></section></div></section><p><strong>temperature</strong><code>float</code>（可选）</p><p>采样温度，控制模型生成文本的多样性。</p><p>temperature越高，生成的文本更多样，反之，生成的文本更确定。</p><p>取值范围： [0, 2)</p><section class="collapse" id="accordion-temperature默认值"><p>temperature默认值</p><div><ul><li>qwen3.8-max/qwen3.8-flash（思考模式）：视觉理解0.6，文本输入1.0，0.6以下的temperature值会默认改为0.6</li><li>Qwen3.8（非思考模式）、Qwen3.7（非思考模式）、Qwen3.6（非思考模式）、Qwen3.5-Omni、Qwen3.5（非思考模式）、Qwen3（非思考模式）、Qwen3-Instruct系列、Qwen3-Coder系列、qwen-max系列、qwen-plus系列（非思考模式）、qwen-flash系列（非思考模式）、qwen-turbo系列（非思考模式）、qwen开源系列、qwen-coder系列、qwen-doc-turbo、Qwen3-VL（非思考）：0.7；</li><li>QVQ系列 : 0.5；</li><li>qwen-audio-turbo系列：0.00001；</li><li>qwen-vl系列、qwen2.5-omni-7b：0.01；</li><li>qwen-math系列：0；</li><li>Qwen3.7（思考模式）、Qwen3.6（思考模式）、Qwen3.5（思考模式）、Qwen3（思考模式）、Qwen3-Thinking、Qwen3-Omni-Captioner、QwQ 系列：0.6；</li><li>qwen3-max-preview（思考模式）、qwen-long系列： 1.0；</li><li>qwen-plus-character：0.92</li><li>qwen3-omni-flash系列：0.9</li><li>Qwen3-VL（思考模式）：0.8</li><li>DeepSeek系列（阿里云直供）：deepseek-v4-pro、deepseek-v4-flash、deepseek-v3.2（非思考模式）: 1.0；deepseek-v3.2（思考模式）、deepseek-v3.2-exp、deepseek-v3.1、deepseek-r1、deepseek-r1-0528、deepseek-r1-distill-qwen 蒸馏版: 0.6；deepseek-v3: 0.7；</li><li>DeepSeek系列（硅基流动直供）：siliconflow/deepseek-v3.2、siliconflow/deepseek-v3.1-terminus、siliconflow/deepseek-r1-0528、siliconflow/deepseek-v3-0324: 1.0；</li><li>DeepSeek系列（快手万擎直供）：vanchin/deepseek-v3.2-think（思考模式）: 0.6；vanchin/deepseek-v3.1-terminus: 0.7；vanchin/deepseek-v3.2-speciale、vanchin/deepseek-r1、vanchin/deepseek-v3、vanchin/deepseek-ocr: 1.0；</li><li>Kimi系列（阿里云直供）：kimi-k2.7-code、kimi-k2.6（思考模式）、kimi-k2.5（思考模式）、kimi-k2-thinking: 1.0；kimi-k2.6（非思考模式）、kimi-k2.5（非思考模式）、Moonshot-Kimi-K2-Instruct: 0.6；</li><li>Kimi系列（月之暗面直供）：kimi/kimi-k3、kimi/kimi-k2.7-code-highspeed、kimi/kimi-k2.7-code、kimi/kimi-k2.6（思考模式）、kimi/kimi-k2.5（思考模式）: 1.0；kimi/kimi-k2.6（非思考模式）、kimi/kimi-k2.5（非思考模式）: 0.6；</li><li>GLM系列（阿里云直供）：glm-5.1、glm-5、glm-4.7、glm-4.6: 1.0；glm-4.5、glm-4.5-air: 0.6；</li><li>GLM系列（智谱直供）：ZHIPU/GLM-5.1、ZHIPU/GLM-5: 0.6；</li><li>MiniMax系列（阿里云直供）：MiniMax-M2.5、MiniMax-M2.1: 1.0；</li><li>MiniMax系列（稀宇科技直供）：MiniMax/MiniMax-M3、MiniMax/MiniMax-M2.7、MiniMax/MiniMax-M2.5、MiniMax/MiniMax-M2.1: 1.0。</li><li>MiMo系列（小米直供）：mimo-v2.5-pro: 1.0，范围 [0, 1.5]。</li></ul></div></section><blockquote><p>通过HTTP调用时，请将 <strong>temperature</strong>放入 <strong>parameters</strong> 对象中。</p></blockquote><blockquote><p>不建议修改QVQ模型的默认 temperature 值。</p></blockquote><p><strong>top_p</strong><code>float</code>（可选）</p><p>核采样的概率阈值，控制模型生成文本的多样性。</p><p>top_p越高，生成的文本更多样。反之，生成的文本更确定。</p><p>取值范围：（0,1.0]。</p><section class="collapse" id="accordion-top-p默认值"><p>top_p默认值</p><div><p>Qwen3.8（非思考模式）、Qwen3.7（非思考模式）、Qwen3.6（非思考模式）、Qwen3.5-Omni、Qwen3.5（非思考模式）、Qwen3（非思考模式）、Qwen3-Instruct系列、Qwen3-Coder系列、qwen-max系列、qwen-plus系列（非思考模式）、qwen-flash系列（非思考模式）、qwen-turbo系列（非思考模式）、Qwen 2.5开源系列、qwen-coder系列、qwen-long、qwen-doc-turbo、Qwen3-VL（非思考）：0.8；</p><p>qwen-omni-turbo 系列：0.01；</p><p>qwen-vl-plus系列、qwen-vl-max、qwen2.5-omni-7b：0.001；</p><p>QVQ系列 : 0.5；</p><p>qwen3-max-preview（思考模式）、qwen-math系列、Qwen3-Omni-Flash系列：1.0；</p><p>Qwen3.8（思考模式）、Qwen3.7（思考模式）、Qwen3.6（思考模式）、Qwen3.5（思考模式）、Qwen3（思考模式）、Qwen3-VL（思考模式）、Qwen3-Thinking、QwQ 系列、Qwen3-Omni-Captioner、qwen-plus-character：0.95</p><p>DeepSeek系列（阿里云直供）：deepseek-v4-pro、deepseek-v4-flash、deepseek-v3.2、deepseek-v3.2-exp、deepseek-v3.1、deepseek-r1、deepseek-r1-0528、deepseek-r1-distill-qwen 蒸馏版: 0.95；deepseek-v3: 0.6；</p><p>DeepSeek系列（硅基流动直供）：siliconflow/deepseek-v3.2、siliconflow/deepseek-v3.1-terminus、siliconflow/deepseek-r1-0528、siliconflow/deepseek-v3-0324: 1.0；</p><p>DeepSeek系列（快手万擎直供）：vanchin/deepseek-v3.2-think、vanchin/deepseek-v3.1-terminus: 0.95；vanchin/deepseek-v3.2-speciale: 0.9；vanchin/deepseek-r1: 0.8；vanchin/deepseek-v3、vanchin/deepseek-ocr: 1.0；</p><p>Kimi系列（阿里云直供）：kimi-k2.7-code、kimi-k2.6、kimi-k2.5、kimi-k2-thinking: 0.95；Moonshot-Kimi-K2-Instruct: 1.0；</p><p>Kimi系列（月之暗面直供）：kimi/kimi-k3、kimi/kimi-k2.7-code-highspeed、kimi/kimi-k2.7-code、kimi/kimi-k2.6、kimi/kimi-k2.5: 0.95；</p><p>GLM系列（阿里云直供）：0.95；</p><p>GLM系列（智谱直供）：ZHIPU/GLM-5.1、ZHIPU/GLM-5: 0.95；</p><p>MiniMax系列（阿里云直供）：MiniMax-M2.5、MiniMax-M2.1: 0.95；</p><p>MiniMax系列（稀宇科技直供）：MiniMax/MiniMax-M3: 0.95；MiniMax/MiniMax-M2.7、MiniMax/MiniMax-M2.5、MiniMax/MiniMax-M2.1: 0.9。</p><p>MiMo系列（小米直供）：xiaomi/mimo-v2.5-pro: 0.95，范围 [0.01, 1.0]。</p></div></section><blockquote><p>Java SDK中为<strong>topP</strong>*。*通过HTTP调用时，请将 <strong>top_p</strong>放入 <strong>parameters</strong> 对象中。</p></blockquote><blockquote><p>不建议修改QVQ模型的默认 top_p 值。</p></blockquote><p><strong>top_k</strong><code>integer</code>（可选）</p><p>生成过程中采样候选集的大小。例如，取值为50时，仅将单次生成中得分最高的50个Token组成随机采样的候选集。取值越大，生成的随机性越高；取值越小，生成的确定性越高。取值为None或当top_k大于100时，表示不启用top_k策略，此时仅有top_p策略生效。</p><p>取值需要大于或等于0。</p><section class="collapse" id="accordion-top-k默认值"><p>top_k默认值</p><div><p>QVQ系列：10；</p><p>QwQ 系列：40；</p><p>qwen-math 系列、其余qwen-vl-plus系列之前的模型、qwen-audio-turbo系列、：1；</p><p>其余模型均为20；</p><p>GLM系列（阿里云直供）：20；</p><p>DeepSeek/Kimi/MiniMax系列均不支持top_k参数。</p></div></section><blockquote><p>Java SDK中为<strong>topK</strong>*。*通过HTTP调用时，请将 <strong>top_k</strong>放入 <strong>parameters</strong> 对象中。</p></blockquote><blockquote><p>不建议修改QVQ模型的默认 top_k 值。</p></blockquote><p><strong>enable_thinking</strong> <code>boolean</code> （可选）</p><p>使用混合思考模型时，是否开启思考模式，适用于Qwen3.7、Qwen3.6、Qwen3.5、Qwen3、Qwen3-VL模型，以及 DeepSeek-V4-Pro/V4-Flash 系列（阿里云直供）、DeepSeek-V3.2/V3.2-exp/V3.1 系列（阿里云直供、硅基流动直供）、Kimi-K2.6/K2.5 系列（阿里云直供）、GLM 系列。DeepSeek-V4 系列默认开启思考，可通过 <code>reasoning_effort</code> 参数调整推理力度。</p><p>可选值：</p><ul><li><p><code>true</code>：开启</p><blockquote><p>开启后，思考内容将通过<code>reasoning_content</code>字段返回。</p></blockquote></li><li><p><code>false</code>：不开启</p></li></ul><p>不同模型的默认值：<a href="/zh/model-studio/deep-thinking#78286fdc35hlw">支持的模型</a></p><blockquote><p>Java SDK 为enableThinking；通过HTTP调用时，请将 <strong>enable_thinking</strong> 放入 <strong>parameters</strong> 对象中。</p></blockquote><p><strong>preserve_thinking</strong> <code>boolean</code> （可选）默认值为 <code>false</code>（<strong>qwen3.8-max/qwen3.8-flash 默认值为</strong><code>true</code>）</p><p>是否将对话历史中 assistant 消息的 reasoning_content 拼接至模型输入。适用于需要模型参考历史思考过程的场景。</p><p>目前支持qwen3.8-max、qwen3.8-flash（默认开启）、qwen3.7-max、qwen3.7-max-2026-05-20以及后续快照、qwen3.6-max-preview、qwen3.7-plus、qwen3.7-plus-2026-05-26、qwen3.6-plus、qwen3.6-plus-2026-04-02、qwen3.7-flash、qwen3.7-flash-2026-07-15、qwen3.6-flash、qwen3.6-flash-2026-04-16、kimi-k2.6（阿里云百炼部署）、kimi-k2.7-code（阿里云百炼部署，默认开启）、kimi/kimi-k2.7-code-highspeed（月之暗面直供，默认开启）、kimi/kimi-k2.7-code（月之暗面直供，默认开启）。</p><blockquote><p><strong>重要：</strong>使用 qwen3.8-max/qwen3.8-flash 时，preserve_thinking 默认为 true，必须将历史对话中所有的 reasoning_content 完整回传。<strong>不支持将 reasoning_content 拼接到 content 字段中回传。</strong></p></blockquote><ul><li>若历史消息中不包含 reasoning_content，开启此参数不会报错，正常兼容。</li><li>开启后，历史对话中的 reasoning_content 会计入输入 Token 数量并计费。</li></ul><blockquote><p>通过HTTP调用时，请将 <strong>preserve_thinking</strong> 放入 <strong>parameters</strong> 对象中。暂不支持 Java SDK。</p></blockquote><p><strong>thinking_budget</strong> <code>integer</code> （可选）</p><p>思考过程的最大长度。适用于Qwen3.8、Qwen3.7、Qwen3.6、Qwen3.5、Qwen3-VL、Qwen3、GLM（阿里云直供）、Kimi（阿里云直供）系列模型，其中 kimi-k3 不支持该参数。相关文档：<a href="/zh/model-studio/deep-thinking#e7c0002fe4meu">限制思考长度</a>。</p><p>默认值为模型最大思维链长度，请参见：<a href="/zh/model-studio/models">选择模型</a></p><blockquote><p>Java SDK 为 thinkingBudget。通过HTTP调用时，请将 <strong>thinking_budget</strong> 放入 <strong>parameters</strong> 对象中。</p></blockquote><blockquote><p>默认值为模型最大思维链长度。</p></blockquote><p><strong>reasoning_effort</strong> <code>string</code> （可选）</p><p>控制模型的推理力度，不同模型支持的可选值和默认值不同。</p><p><strong>DeepSeek-V4、GLM 系列与 kimi/kimi-k3</strong>（默认值为 <code>high</code>）</p><p>可选值：</p><ul><li><code>high</code>：高力度推理</li><li><code>max</code>：最大力度推理</li></ul><p>low和medium映射为high，xhigh映射为max。</p><p>适用于glm-5.2、glm-5.1、glm-5、deepseek-v4-pro、deepseek-v4-flash（阿里云直供）（deepseek-v4-flash-0731 除外）、kimi/kimi-k3（月之暗面直供，仅支持 <code>max</code>）</p><p><strong>ZHIPU/GLM-5.3 与 kimi-k3（阿里云直供）模型：默认值为</strong><code>max</code></p><p>可选值：</p><ul><li><code>max</code>（默认）：深度推理</li><li><code>high</code>：增强推理</li><li><code>low</code>：轻度推理</li></ul><p>该模型始终开启思考，<code>enable_thinking</code> 仅支持 <code>true</code>，传入 <code>false</code> 会导致 API 请求失败。</p><p><strong>deepseek-v4-flash-0731 与 deepseek-v4-pro-0813 模型：默认值为</strong><code>high</code></p><p>可选值：</p><ul><li><code>max</code>：最大力度推理</li><li><code>high</code>（默认）：高力度推理</li><li><code>low</code>：低力度推理</li></ul><p>出于兼容性考虑，<code>medium</code> 映射为 high，<code>xhigh</code> 映射为 high。</p><p><strong>qwen3.8-max/qwen3.8-flash 模型：默认值为</strong><code>xhigh</code></p><p>可选值：</p><ul><li><code>xhigh</code>（默认）：高力度推理</li><li><code>medium</code>：中力度推理</li><li><code>low</code>：低力度推理</li></ul><p><code>max</code> 映射为 xhigh，<code>high</code> 映射为 xhigh，<code>minimal</code> 映射为 low，<code>none</code> 映射为 enable_thinking=False。</p><blockquote><p>设置上述可选值及映射值以外的值将会报错。</p></blockquote><p><strong>重要：</strong>qwen3.8-max/qwen3.8-flash 不支持 reasoning_effort 与 thinking_budget 同时设置，同时设置会报错。但两者支持互转：</p><ul><li>未设置 thinking_budget 时，reasoning_effort 档位自动映射 thinking_budget：<code>low</code> 对应 4096，<code>medium</code> 对应 16384，<code>xhigh</code> 对应 262144。</li><li>未设置 reasoning_effort 时，thinking_budget 自动映射回 reasoning_effort：0~4096 对应 <code>low</code>，4097~16384 对应 <code>medium</code>，16385~262144 对应 <code>xhigh</code>。</li><li>两者均未设置时，使用默认 thinking_budget（131072），默认 reasoning_effort（xhigh）。</li></ul><blockquote><p>通过HTTP调用时，请将 <strong>reasoning_effort</strong> 放入 <strong>parameters</strong> 对象中。</p></blockquote><p><strong>tool_stream</strong> <code>boolean</code> （可选）默认值为 <code>false</code></p><p>仅影响复杂工具参数的流式输出行为，仅在流式调用时生效。普通工具参数（所有参数类型均为string）只要开启流式调用即可流式输出，<code>tool_stream</code>对其无影响。复杂工具是指工具定义中某些参数类型为array或object。当前仅Qwen和GLM系列支持。</p><strong>Qwen系列支持列表：</strong><ul><li>qwen-max系列：qwen3.8-max系列、qwen3.7-max系列的文本模态</li><li>qwen-plus系列：qwen3.7-plus系列、qwen3.6-plus系列的文本模态，以及qwen3.5-plus系列的全模态</li><li>qwen-flash系列：qwen3.8-flash系列、qwen3.7-flash系列、qwen3.6-flash系列、qwen3.5-flash的全模态</li></ul><strong>Qwen系列使用参考：</strong><ul><li><code>tool_stream=false</code>：复杂工具参数会一次性输出，默认行为，复杂格式会更准确。</li><li><code>tool_stream=true</code>：复杂工具参数会流式输出，复杂格式没有超时风险。</li></ul><blockquote><p>复杂工具是指工具定义中某些参数类型为array或object。</p></blockquote><p><strong>GLM系列支持列表：</strong>glm-4.6、glm-4.7、glm-5、glm-5.1（阿里云直供）。</p><strong>GLM系列使用参考：</strong><ul><li><code>tool_stream=false</code>：工具参数会一次性输出，默认行为，复杂格式会更准确。</li><li><code>tool_stream=true</code>：工具参数会流式输出，复杂格式没有超时风险。</li></ul><blockquote><p>通过HTTP调用时，请将 <strong>tool_stream</strong> 放入 <strong>parameters</strong> 对象中。</p></blockquote><p><strong>enable_code_interpreter</strong> <code>boolean</code> （可选）默认值为 <code>false</code></p><p>是否开启代码解释器功能。相关文档：<a href="/zh/model-studio/qwen-code-interpreter">代码解释器</a></p><p>可选值：</p><ul><li><code>true</code>：开启</li><li><code>false</code>：不开启</li></ul><blockquote><p>不支持 Java SDK。通过HTTP调用时，请将 <strong>enable_code_interpreter</strong> 放入 <strong>parameters</strong> 对象中。</p></blockquote><p><strong>clear_thinking</strong><code>boolean</code>（可选）默认值为false</p><p>用于控制多轮对话中是否将历史轮次的 <code>reasoning_content</code>（思考过程）作为上下文输入给模型。仅 GLM 系列glm-5.2、glm-5.1、glm-5、glm-4.7模型支持。</p><ul><li><code>true</code>：开启。忽略历史轮次的 <code>reasoning_content</code>，仅使用可见文本、工具调用与结果等非推理内容作为上下文输入，可降低上下文长度与成本。</li><li><code>false</code>（默认）：不开启。保留历史轮次的 <code>reasoning_content</code> 并随上下文一同提供给模型。若希望启用 Preserved Thinking，必须在 messages 中完整、未修改、按原顺序透传历史 <code>reasoning_content</code>，缺失、裁剪、改写或重排会导致效果下降或无法生效。</li></ul><p><strong>repetition_penalty</strong><code>float</code>（可选）</p><p>模型生成时连续序列中的重复度。提高repetition_penalty时可以降低模型生成的重复度，1.0表示不做惩罚。没有严格的取值范围，只要大于0即可。</p><section class="collapse" id="accordion-repetition-penalty默认值"><p>repetition_penalty默认值</p><div><ul><li>qwen-max、qwen-math系列、qwen-vl-max系列、qwen-audio-turbo系列、QVQ系列、QwQ系列、Qwen3-VL： 1.0；</li><li>qwen-coder系列：1.1；</li><li>qwen-vl-plus：1.2；</li><li>其余模型为1.05。</li><li>DeepSeek系列（阿里云直供）：deepseek-v3.2-exp/v3.1:1.0；</li><li>GLM系列（阿里云直供）：1.0；</li></ul></div></section><blockquote><p>Java SDK中为<strong>repetitionPenalty</strong>*。*通过HTTP调用时，请将 <strong>repetition_penalty</strong>放入 <strong>parameters</strong> 对象中。</p></blockquote><blockquote><p>使用qwen-vl-plus_2025-01-25模型进行文字提取时，建议设置repetition_penalty为1.0。</p></blockquote><blockquote><p>不建议修改QVQ模型的默认 repetition_penalty 值。</p></blockquote><p><strong>presence_penalty</strong><code>float</code>（可选）</p><p>控制模型生成文本时的内容重复度。</p><p>取值范围：[-2.0, 2.0]。正值降低重复度，负值增加重复度。</p><p>在创意写作或头脑风暴等需要多样性、趣味性或创造力的场景中，建议调高该值；在技术文档或正式文本等强调一致性与术语准确性的场景中，建议调低该值。</p><section class="collapse" id="accordion-presence-penalty默认值"><p>presence_penalty默认值</p><div><p>Qwen3.8（非思考模式）、Qwen3.7（非思考模式）、Qwen3.6（非思考模式）、Qwen3.5-Omni、Qwen3.5（非思考模式）、qwen3-max-preview（思考模式）、Qwen3（非思考模式）、Qwen3-Instruct系列/1.7b/4b（思考模式）、QVQ系列、qwen-max、qwen2.5-vl系列、qwen-vl-max系列、qwen-vl-plus、Qwen3-VL（非思考）：1.5；</p><p>qwen3-8b/14b/32b/30b-a3b/235b-a22b（思考模式）、qwen-plus/qwen-plus-latest/2025-04-28（思考模式）、qwen-turbo/qwen-turbo/2025-04-28（思考模式）：0.5；</p><p>其余均为0.0。</p><p>DeepSeek系列（阿里云直供）：deepseek-r1、deepseek-r1-0528、deepseek-r1-distill-qwen 蒸馏版: 1；</p><p>Kimi系列（阿里云直供）：kimi-k2.7-code、kimi-k2.6、kimi-k2.5: 0.0；</p><p>Kimi系列（月之暗面直供）：0.0；</p><p>MiniMax系列（阿里云直供）：MiniMax-M2.5、MiniMax-M2.1: 0.0；</p><p>其余DeepSeek/Kimi/GLM/MiniMax模型无默认值。</p></div></section><section class="collapse" id="accordion-原理介绍"><p>原理介绍</p><div><p>如果参数值是正数，模型将对目前文本中已存在的Token施加一个惩罚值（惩罚值与文本出现的次数无关），减少这些Token重复出现的几率，从而减少内容重复度，增加用词多样性。</p></div></section><section class="collapse" id="accordion-示例"><p>示例</p><div><p>提示词：把这句话翻译成中文“This movie is good. The plot is good, the acting is good, the music is good, and overall, the whole movie is just good. It is really good, in fact. The plot is so good, and the acting is so good, and the music is so good.”</p><p>参数值为2.0：这部电影很好。剧情很棒，演技棒，音乐也非常好听，总的来说，整部电影都好得不得了。实际上它真的很优秀。剧情非常精彩，演技出色，音乐也是那么的动听。</p><p>参数值为0.0：这部电影很好。剧情好，演技好，音乐也好，总的来说，整部电影都很好。事实上，它真的很棒。剧情非常好，演技也非常出色，音乐也同样优秀。</p><p>参数值为-2.0：这部电影很好。情节很好，演技很好，音乐也很好，总的来说，整部电影都很好。实际上，它真的很棒。情节非常好，演技也非常好，音乐也非常好。</p></div></section><blockquote><p>使用qwen-vl-plus模型进行文字提取时，建议设置presence_penalty为1.5。</p></blockquote><blockquote><p>不建议修改QVQ模型的默认presence_penalty值。</p></blockquote><blockquote><p>Java SDK不支持设置该参数*。*通过HTTP调用时，请将 <strong>presence_penalty</strong>放入 <strong>parameters</strong> 对象中。</p></blockquote><p><strong>vl_high_resolution_images</strong><code>boolean</code>（可选）默认值为<code>false</code></p><p>是否将输入图像的像素上限提升至 16384 Token 对应的像素值。相关文档：<a href="/zh/model-studio/vision">处理高分辨率图像</a>。</p><ul><li><p><code>vl_high_resolution_images：true</code>，使用固定分辨率策略，忽略 <code>max_pixels</code> 设置，超过此分辨率时会将图像总像素缩小至此上限内。</p><section class="collapse" id="accordion-点击查看各模型像素上限"><p>点击查看各模型像素上限</p><div><p><code>vl_high_resolution_images</code>为<code>True</code>时，不同模型像素上限不同：</p><ul><li>Qwen3.7系列、<code>Qwen3.6</code>系列、<code>Qwen3.5</code>系列、<code>Qwen3-VL系列</code>、<code>qwen-vl-max</code>、<code>qwen-vl-max-0813</code>、<code>qwen-vl-plus</code>、<code>qwen-vl-plus-0815``、qwen-vl-plus-0710</code>模型：<code>16777216</code>（每<code>Token</code>对应<code>32*32</code>像素，即<code>16384*32*32</code>）</li><li><code>QVQ系列</code>、其他<code>Qwen2.5-VL系列</code>模型：<code>12845056</code>（每<code>Token</code>对应<code>28*28</code>像素，即 <code>16384*28*28</code>）</li></ul></div></section></li><li><p><code>vl_high_resolution_images</code>为<code>false</code>，像素上限由 <code>max_pixels</code> 决定，输入图像的像素超过<code>max_pixels</code>会将图像缩小至<code>max_pixels</code>内。各模型的默认像素上限即<code>max_pixels</code>的默认值。</p></li></ul><blockquote><p>Java SDK 为 <strong>vlHighResolutionImages</strong>（需要的最低版本为2.20.8<strong>）</strong>*。*通过HTTP调用时，请将 <strong>vl_high_resolution_images</strong>放入 <strong>parameters</strong> 对象中。</p></blockquote><p><strong>vl_enable_image_hw_output</strong><code>boolean</code>（可选）默认值为 <code>false</code></p><p>是否返回图像缩放后的尺寸。模型会对输入的图像进行缩放处理，配置为 True 时会返回图像缩放后的高度和宽度，开启流式输出时，该信息在最后一个数据块（chunk）中返回。支持<a href="/zh/model-studio/vision">Qwen-VL模型</a>。</p><blockquote><p>Java SDK中为 <strong>vlEnableImageHwOutput</strong>，Java SDK最低版本为2.20.8*。*通过HTTP调用时，请将 <strong>vl_enable_image_hw_output</strong>放入 <strong>parameters</strong> 对象中。</p></blockquote><p><strong>max_tokens</strong><code>integer</code>（可选，<strong>即将废弃</strong>）</p><blockquote><p>该参数即将废弃，新接入请使用 <code>max_completion_tokens</code>。</p></blockquote><p>该参数的含义随模型不同，具体如下：</p><ul><li>deepseek-v4-pro、deepseek-v4-pro-0813、deepseek-v4-flash、deepseek-v4-flash-0731：模型回答与思维链内容之和的最大 Token 数。模型输出超过此值时生成将提前停止，返回的 <code>finish_reason</code> 为 <code>length</code>。</li><li>glm-5.2：不传入 <code>thinking_budget</code> 参数时，<code>max_tokens</code> 为模型回答与思维链内容之和的最大 Token 数，模型输出超过此值时生成将提前停止，返回的 <code>finish_reason</code> 为 <code>length</code>；传入 <code>thinking_budget</code> 参数时，<code>max_tokens</code> 仅为模型回答的最大 Token 数，思维链部分的 Token 数由 <code>thinking_budget</code> 单独控制。</li><li>其他模型：模型回答的最大 Token 数。若生成内容超过此值，生成将提前停止，返回的 <code>finish_reason</code> 为 <code>length</code>。</li></ul><p>默认值与最大值均为模型的最大输出长度。</p><blockquote><p>Java SDK中为<strong>maxTokens</strong>（模型为千问VL/Audio时，Java SDK中为<strong>maxLength，</strong>在 2.18.4 版本之后支持也设置为 maxTokens）*。*通过HTTP调用时，请将 <strong>max_tokens</strong>放入 <strong>parameters</strong> 对象中。</p></blockquote><p><strong>max_completion_tokens</strong><code>integer</code>（可选）</p><p>模型输出的最大长度，包含思维链和模型回答。模型输出超过此值时生成将提前停止，返回的 <code>finish_reason</code> 为 <code>length</code>。</p><p>默认值与最大值均为模型的最大输出长度。</p><p>与 <code>max_tokens</code> 的区别：<code>max_completion_tokens</code> 限制模型完整输出（思维链 + 回答），而 <code>max_tokens</code> 仅限制回答部分。思考类模型推荐使用 <code>max_completion_tokens</code>。</p><p>支持以下模型：</p><ul><li>千问 Max：Qwen3.7-Max 及之后的模型</li><li>千问 Plus：Qwen3.5-Plus 及之后的模型</li><li>千问 Flash：Qwen3.5-Flash 及之后的模型</li><li>Kimi：kimi-k2.5 及其之后推出的Kimi模型</li><li>GLM：glm-5 及其之后推出的GLM系列模型</li><li>MiniMax：MiniMax-M2.5 及之后推出的MiniMax模型</li><li>DeepSeek：deepseek-v3、deepseek-r1、deepseek-r1-0528、deepseek-v3.1、deepseek-v3.2、deepseek-v3.2-exp、deepseek-v4-pro、deepseek-v4-flash 及之后推出的DeepSeek模型</li></ul><blockquote><p>以上模型均不包含三方直供模型。</p></blockquote><blockquote><p>实际输出 Token 数与设置的 <code>max_completion_tokens</code> 值之间最多可能存在 10 个 Token 的误差。</p></blockquote><blockquote><p>Java SDK 暂不支持该参数。通过 HTTP 调用时，请将 <strong>max_completion_tokens</strong>放入 <strong>parameters</strong> 对象中。</p></blockquote><p><strong>seed</strong><code>integer</code>（可选）</p><p>随机数种子。用于确保在相同输入和参数下生成结果可复现。若调用时传入相同的 <code>seed</code> 且其他参数不变，模型将尽可能返回相同结果。</p><p>取值范围：<code>[0,2 31 −1]</code>。</p><section class="collapse" id="accordion-seed默认值"><p>seed默认值</p><div><p>qwen-vl-max、qvq-max系列：3407；</p><p>qwen-vl-max-2024-02-01、qwen-vl-plus：无默认值；</p><p>其余模型均为1234。</p></div></section><blockquote><p>通过HTTP调用时，请将 <strong>seed</strong>放入 <strong>parameters</strong> 对象中。</p></blockquote><p><strong>stream</strong><code>boolean</code>（可选）默认值为<code>false</code></p><p>是否流式输出回复。参数值：</p><ul><li>false：模型生成完所有内容后一次性返回结果。</li><li>true：边生成边输出，即每生成一部分内容就立即输出一个片段（chunk）。</li></ul><blockquote><p>该参数仅支持Python SDK。通过Java SDK实现流式输出请通过<code>streamCall</code>接口调用；通过HTTP实现流式输出请在Header中指定<code>X-DashScope-SSE</code>为<code>enable</code>。</p></blockquote><blockquote><p>Qwen3商业版（思考模式）、Qwen3开源版、QwQ、QVQ只支持流式输出。</p></blockquote><p><strong>incremental_output</strong><code>boolean</code>（可选）默认为<code>false</code>（Qwen3-Max、Qwen3-VL、<a href="/zh/model-studio/models">Qwen3 开源版</a>、<a href="/zh/model-studio/deep-thinking">QwQ</a> 、<a href="/zh/model-studio/visual-reasoning">QVQ</a>模型默认值为 <code>true</code>）</p><p>在流式输出模式下是否开启增量输出。推荐您优先设置为<code>true</code>。</p><p>参数值：</p><ul><li>false：每次输出为当前已经生成的整个序列，最后一次输出为生成的完整结果。</li></ul><pre data-tag="codeblock" id="code-block-16" code-type="xCode" class="pre codeblock"><code>I
I like
I like apple
I like apple.
</code></pre><ul><li>true（推荐）：增量输出，即后续输出内容不包含已输出的内容。您需要实时地逐个读取这些片段以获得完整的结果。</li></ul><pre data-tag="codeblock" id="code-block-17" code-type="xCode" class="pre codeblock"><code>I
like
apple
.
</code></pre><blockquote><p>Java SDK中为<strong>incrementalOutput</strong>*。*通过HTTP调用时，请将 <strong>incremental_output</strong>放入 <strong>parameters</strong> 对象中。</p></blockquote><blockquote><p>QwQ 模型与思考模式下的 Qwen3 模型只支持设置为 <code>true</code>。由于 Qwen3 商业版模型默认值为<code>false</code>，您需要在思考模式下手动设置为 <code>true</code>。</p></blockquote><blockquote><p>Qwen3 开源版模型不支持设置为 <code>false</code>。</p></blockquote><p><strong>response_format</strong><code>object</code> （可选） 默认值为<code>{"type": "text"}</code></p><p>返回内容的格式。可选值：</p><ul><li><code>{"type": "text"}</code>：输出文字回复；</li><li><code>{"type": "json_object"}</code>：输出标准格式的JSON字符串。</li></ul><blockquote><p>相关文档：<a href="/zh/model-studio/qwen-structured-output">结构化输出</a>。</p></blockquote><blockquote><p>支持的模型参见<a href="/zh/model-studio/qwen-structured-output#7a8e438e89xeq">支持的模型</a>。</p></blockquote><blockquote><p>若指定为<code>{"type": "json_object"}</code>，需在提示词中明确指示模型输出JSON，如：“请按照json格式输出”，否则会报错。</p></blockquote><blockquote><p>Java SDK中为responseFormat*。*通过HTTP调用时，请将 <strong>response_format</strong>放入 <strong>parameters</strong> 对象中。</p></blockquote><section class="collapse" id="accordion-属性-9"><p>属性</p><div><p><strong>type</strong><code>string</code><strong>（必选）</strong></p><p>返回内容的格式。可选值：</p><ul><li><code>text</code>：输出文字回复；</li><li><code>json_object</code>：输出标准格式的JSON字符串；</li></ul></div></section><p><strong>result_format</strong><code>string</code>（可选）默认为<code>text</code>（Qwen3-Max、Qwen3-VL、<a href="/zh/model-studio/deep-thinking">QwQ</a> 模型、Qwen3 开源模型（除了qwen3-next-80b-a3b-instruct）与 Qwen-Long 模型默认值为 message）</p><p>返回数据的格式。推荐您优先设置为<code>message</code>，可以更方便地进行<a href="/zh/model-studio/multi-round-conversation">多轮对话</a>。</p><blockquote><p>平台后续将统一调整默认值为<code>message</code>。</p></blockquote><blockquote><p>Java SDK中为<strong>resultFormat</strong>*。*通过HTTP调用时，请将 <strong>result_format</strong>放入 <strong>parameters</strong> 对象中。</p></blockquote><blockquote><p>模型为千问VL/QVQ/Audio时，设置<code>text</code>不生效。</p></blockquote><blockquote><p>Qwen3-Max、Qwen3-VL、思考模式下的 Qwen3 模型只能设置为<code>message</code>，由于 Qwen3 商业版模型默认值为<code>text</code>，您需要将其设置为<code>message</code>。</p></blockquote><blockquote><p>如果您使用 Java SDK 调用Qwen3 开源模型，并且传入了 <code>text</code>，依然会以 <code>message</code>格式进行返回。</p></blockquote><p><strong>logprobs</strong> <code>boolean</code> （可选）默认值为 <code>false</code></p><p>是否返回输出 Token 的对数概率，可选值：</p><ul><li><p><code>true</code></p><p>返回</p></li><li><p><code>false</code></p><p>不返回</p></li></ul><p>支持以下模型：</p><ul><li>qwen-plus系列的快照模型（不包含稳定版模型）</li><li>qwen-turbo 系列的快照模型（不包含稳定版模型）</li><li>qwen3-vl-plus系列（包含稳定版模型）</li><li>qwen3-vl-flash系列（包含稳定版模型）</li><li>Qwen3 开源模型</li></ul><blockquote><p>通过HTTP调用时，请将 <strong>logprobs</strong>放入 <strong>parameters</strong> 对象中。</p></blockquote><p><strong>top_logprobs</strong> <code>integer</code> （可选）默认值为0</p><p>指定在每一步生成时，返回模型最大概率的候选 Token 个数。</p><p>取值范围：[0,5]</p><p>仅当 <code>logprobs</code> 为 <code>true</code> 时生效。</p><blockquote><p>Java SDK中为<strong>topLogprobs</strong>*。*通过HTTP调用时，请将 <strong>top_logprobs</strong>放入 <strong>parameters</strong> 对象中。</p></blockquote><p><strong>n</strong><code>integer</code>（可选） 默认值为1</p><p>生成响应的个数，取值范围是<code>1-4</code>。对于需要生成多个响应的场景（如创意写作、广告文案等），可以设置较大的 n 值。</p><blockquote><p>当前仅支持 <a href="/zh/model-studio/deep-thinking">Qwen3（非思考模式）</a>、qwen-plus-character 模型，且在传入 tools 参数时固定为1。</p></blockquote><blockquote><p>设置较大的 n 值不会增加输入 Token 消耗，会增加输出 Token 的消耗。</p></blockquote><blockquote><p>通过HTTP调用时，请将 <strong>n</strong>放入 <strong>parameters</strong> 对象中。</p></blockquote><p><strong>stop</strong><code>string 或 array</code>（可选）</p><p>用于指定停止词。当模型生成的文本中出现 <code>stop</code> 指定的字符串或 <code>token_id</code> 时，生成将立即终止。</p><p>可传入敏感词以控制模型的输出。</p><blockquote><p>stop为数组时，不可将<code>token_id</code>和字符串同时作为元素输入，比如不可以指定为<code>["你好",104307]</code>。</p></blockquote><blockquote><p>通过HTTP调用时，请将 <strong>stop</strong>放入 <strong>parameters</strong> 对象中。</p></blockquote><p><strong>tools</strong><code>array</code>（可选）</p><p>包含一个或多个工具对象的数组，供模型在 Function Calling 中调用。相关文档：<a href="/zh/model-studio/qwen-function-calling">Function Calling</a></p><p>使用 <code>tools</code> 时，必须将<code>result_format</code>设为<code>message</code>。</p><p>发起 Function Calling，或提交工具执行结果时，都必须设置<code>tools</code>参数。</p><section class="collapse" id="accordion-属性-10"><p>属性</p><div><p><strong>type</strong><code>string</code><strong>（必选）</strong></p><p>工具类型，当前仅支持<code>function</code>。</p><p><strong>function</strong><code>object</code><strong>（必选）</strong></p><section class="collapse" id="accordion-属性-11"><p>属性</p><div><p><strong>name</strong><code>string</code><strong>（必选）</strong></p><p>工具函数的名称，必须是字母、数字，可以包含下划线和短划线，最大长度为64。</p><p><strong>description</strong><code>string</code><strong>（必选）</strong></p><p>工具函数的描述，供模型选择何时以及如何调用工具函数。</p><p><strong>parameters</strong><code>object</code>（可选）默认值为 <code>{}</code></p><p>工具的参数描述，需要是一个合法的JSON Schema。JSON Schema的描述可以见<a href="https://json-schema.org/understanding-json-schema">链接</a>。若<code>parameters</code>参数为空，表示该工具没有入参（如时间查询工具）。</p><blockquote><p>为提高工具调用的准确性，建议传入&nbsp;<code>parameters</code>。</p></blockquote></div></section></div></section><blockquote><p>通过HTTP调用时，请将 <strong>tools</strong>放入 <strong>parameters</strong> 对象中。暂时不支持qwen-vl与qwen-audio系列模型。</p></blockquote><p><strong>tool_choice</strong><code>string 或 object</code>（可选）默认值为 <code>auto</code></p><p>工具选择策略。若需对某类问题强制指定工具调用方式（例如始终使用某工具或禁用所有工具），可设置此参数。</p><ul><li><p><code>auto</code></p><p>大模型自主选择工具策略；</p></li><li><p><code>none</code></p><p>若在特定请求中希望临时禁用工具调用，可设定<code>tool_choice</code>参数为<code>none</code>；</p></li><li><p><code>{"type": "function", "function": {"name": "the_function_to_call"}}</code></p><p>若希望强制调用某个工具，可设定<code>tool_choice</code>参数为<code>{"type": "function", "function": {"name": "the_function_to_call"}}</code>，其中<code>the_function_to_call</code>是指定的工具函数名称。</p><blockquote><p>思考模式的模型不支持强制调用某个工具。</p></blockquote></li></ul><blockquote><p>Java SDK中为<strong>toolChoice</strong>*。*通过HTTP调用时，请将 <strong>tool_choice</strong>放入 <strong>parameters</strong> 对象中。</p></blockquote><p><strong>parallel_tool_calls</strong> <code>boolean</code> （可选）默认值为 <code>false</code></p><p>是否开启并行工具调用。</p><p>可选值：</p><ul><li><code>true</code>：开启</li><li><code>false</code>：不开启。</li></ul><p>并行工具调用详情请参见：<a href="/zh/model-studio/qwen-function-calling#cb6b5c484bt4x">并行工具调用</a>。</p><blockquote><p>Java SDK中为<strong>parallelToolCalls</strong>*。*通过HTTP调用时，请将 <strong>parallel_tool_calls</strong>放入 <strong>parameters</strong> 对象中。</p></blockquote><p><strong>enable_search</strong><code>boolean</code>（可选）默认值为<code>false</code></p><p>模型在生成文本时是否使用互联网搜索结果进行参考。取值如下：</p><ul><li><p>true：启用互联网搜索，模型会将搜索结果作为文本生成过程中的参考信息，但模型会基于其内部逻辑判断是否使用互联网搜索结果。</p><blockquote><p>若开启后未联网搜索，可优化提示词，或设置<code>search_options</code>中的<code>forced_search</code>参数开启强制搜索。</p></blockquote></li><li><p>false：关闭互联网搜索。</p></li></ul><p>计费信息请参见<a href="/zh/model-studio/web-search#92ce83df3a599">计费说明</a>。</p><blockquote><p>Java SDK中为<strong>enableSearch</strong>*。*通过HTTP调用时，请将 <strong>enable_search</strong>放入 <strong>parameters</strong> 对象中。</p></blockquote><blockquote><p>启用互联网搜索功能可能会增加 Token 的消耗。</p></blockquote><p><strong>search_options</strong><code>object</code>（可选）</p><p>联网搜索的策略。仅当<code>enable_search</code>为<code>true</code>时生效。详情参见<a href="/zh/model-studio/web-search">联网搜索</a>。</p><blockquote><p>通过HTTP调用时，请将 <strong>search_options</strong>放入 <strong>parameters</strong> 对象中。Java SDK中为<strong>searchOptions</strong>。</p></blockquote><section class="collapse" id="accordion-属性-12"><p>属性</p><div><p><strong>enable_source</strong><code>boolean</code>（可选）默认值为<code>false</code></p><p>在返回结果中是否展示搜索到的信息。参数值：</p><ul><li>true：展示；</li><li>false：不展示。</li></ul><p><strong>enable_citation</strong> <code>boolean</code>（可选）默认值为<code>false</code></p><p>是否开启[1]或[ref_1]样式的角标标注功能。在<code>enable_source</code>为<code>true</code>时生效。参数值：</p><ul><li>true：开启；</li><li>false：不开启。</li></ul><p><strong>citation_format</strong> <code>string</code>（可选）默认值为<code>"[&lt;number&gt;]"</code></p><p>角标样式。在<code>enable_citation</code>为<code>true</code>时生效。参数值：</p><ul><li>[&lt;number&gt;]：角标形式为<code>[1]</code>；</li><li>[ref_&lt;number&gt;]：角标形式为<code>[ref_1]</code>。</li></ul><p><strong>forced_search</strong> <code>boolean</code>（可选）默认值为<code>false</code></p><p>是否强制开启搜索。参数值：</p><ul><li>true：强制开启；</li><li>false：不强制开启。</li></ul><p><strong>search_strategy</strong> <code>string</code>（可选）默认值为<code>turbo</code></p><p>搜索互联网信息的策略。</p><p>可选值：</p><ul><li><p><code>turbo</code> （默认）: 兼顾响应速度与搜索效果，适用于大多数场景。</p></li><li><p><code>max</code>: 采用更全面的搜索策略，可调用多源搜索引擎，以获取更详尽的搜索结果，但响应时间可能更长。</p></li><li><p><code>agent</code>：可多次调用联网搜索工具与大模型，实现多轮信息检索与内容整合。</p><blockquote><p>该策略仅适用于qwen3.8-max、qwen3.7-max、qwen3.7-max-2026-05-20、qwen3.5-plus、qwen3.5-plus-2026-02-15、qwen3.5-flash、qwen3.5-flash-2026-02-23、qwen3-max与 qwen3-max-2026-01-23 的思考模式（仅支持流式）、qwen3-max-2026-01-23的非思考模式、qwen3-max-2025-09-23。</p></blockquote><blockquote><p>启用该策略时，仅支持<strong>返回搜索来源</strong>（<code>enable_source: true</code>），其他联网搜索功能不可用。</p></blockquote></li><li><p><code>agent_max</code>：在<code>agent</code>策略基础上支持网页抓取，参见：<a href="/zh/model-studio/web-extractor">网页抓取</a>。</p><blockquote><p>该策略仅适用于qwen3.8-max、qwen3.7-max、qwen3.7-max-2026-05-20、qwen3-max、qwen3-max-2026-01-23的思考模式。</p></blockquote><blockquote><p>启用该策略时，仅支持<strong>返回搜索来源</strong>（<code>enable_source: true</code>），其他联网搜索功能不可用。</p></blockquote></li></ul><p><strong>enable_search_extension</strong> <code>boolean</code>（可选）默认值为<code>false</code></p><p>是否开启特定领域增强。参数值：</p><ul><li><p><code>true</code></p><p>开启。</p></li><li><p><code>false</code>（默认值）</p><p>不开启。</p></li></ul><p><strong>prepend_search_result</strong> <code>boolean</code>（可选）默认值为<code>false</code></p><p>在流式输出且<code>enable_source</code>为<code>true</code>时，可通过<code>prepend_search_result</code>配置<strong>第一个返回的数据包</strong>是否只包含搜索来源信息。可选值：</p><ul><li><p><code>true</code></p><p>只包含搜索来源信息。</p></li><li><p><code>false</code>（默认值）</p><p>包含搜索来源信息与大模型回复信息。</p></li></ul><blockquote><p>暂不支持 DashScope Java SDK。</p></blockquote></div></section><p><strong>X-DashScope-DataInspection</strong><code>string</code> （可选）</p><p>在千问 API 的内容安全能力基础上，是否进一步识别输入输出内容的违规信息。取值如下：</p><ul><li><code>'{"input":"cip","output":"cip"}'</code>：进一步识别；</li><li>不设置该参数：不进一步识别。</li></ul><p>通过 HTTP 调用时请放入请求头：<code>-H "X-DashScope-DataInspection: {\"input\": \"cip\", \"output\": \"cip\"}"</code>；</p><p>通过 Python SDK 调用时请通过<code>headers</code>配置：<code>headers={'X-DashScope-DataInspection': '{"input":"cip","output":"cip"}'}</code>。</p><p>详细使用方法请参见<a href="/zh/model-studio/content-security">输⼊输出 AI 安全护栏</a>。</p><blockquote><p>不支持通过 Java SDK 设置。</p></blockquote><blockquote><p>不适用于Qwen-Audio 系列模型。</p></blockquote><p><strong>skill</strong><code>array</code>（可选）</p><p>技能参数，用于启用特定生成技能（如PPT生成）。仅<code>qwen-doc-turbo</code>模型支持。详细用法请参见<a href="/zh/model-studio/data-mining-qwen-doc#f6a7b8c9d0pp1">生成PPT</a>。</p><blockquote><p>通过HTTP调用时，请将 <strong>skill</strong>放入 <strong>parameters</strong> 对象中。</p></blockquote><blockquote><p>使用 <strong>skill 时，stream</strong> 必须设置为 <strong>true</strong>。</p></blockquote><section class="collapse" id="accordion-属性-13"><p>属性</p><div><p><strong>type</strong><code>string</code><strong>（必选）</strong></p><p>技能类型。当前支持：</p><ul><li><code>ppt</code>：PPT生成。</li></ul><p><strong>mode</strong><code>string</code> （可选）</p><p>PPT生成模式。可选值：</p><ul><li><code>general</code> （默认值）：模板模式，需配合<code>template_id</code> 使用，生成HTML格式的PPT。</li><li><code>creative</code> ：创意模式，无需模板，生成图版PPT（每页为图片）。</li></ul><p><strong>template_id</strong><code>string</code>（可选）</p><p>PPT模板ID。与<code>mode</code>为<code>general</code>或未设置<code>mode</code>时配合使用。可选值：</p><ul><li><code>news_01</code>：新闻模板</li><li><code>summary_01</code>：总结模板</li><li><code>internet_01</code>：互联网模板</li><li><code>thesis_01</code>：论文模板</li></ul></div></section></td><td><section data-tag="tabbed-content-box" outputclass="tabbed-content-box" id="sec-tabs-7" class="tabbed-content-box section"><section id="文本输入" class="section"><h4 id="文本输入-h4">文本输入</h4><section data-tag="tabbed-content-box" outputclass="tabbed-content-box" id="sec-tabs-8" class="tabbed-content-box section"><section id="python" class="section"><h4 id="python-h4">Python</h4><pre data-tag="codeblock" id="code-block-18" outputclass="language-python" code-type="xCode" class="pre codeblock language-python"><code>import os
import dashscope
dashscope.base_http_api_url = "https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/api/v1"

messages = [
    {'role': 'system', 'content': [{'text': 'You are a helpful assistant.'}]},
    {'role': 'user', 'content': [{'text': '你是谁？'}]}
]
response = dashscope.MultiModalConversation.call(
    # 若没有配置环境变量，请用百炼API Key将下行替换为：api_key="sk-xxx"
    api_key=os.getenv('DASHSCOPE_API_KEY'),
    model="qwen3.8-max", # 此处以qwen3.8-max为例，可按需更换模型名称。模型列表：https://help.aliyun.com/zh/model-studio/getting-started/models
    messages=messages,
    )
print(response)
</code></pre></section><section id="java" class="section"><h4 id="java-h4">Java</h4><pre data-tag="codeblock" id="code-block-19" outputclass="language-java" code-type="xCode" class="pre codeblock language-java"><code>// 建议dashscope SDK的版本 &gt;= 2.12.0
import java.util.Arrays;
import java.lang.System;
import com.alibaba.dashscope.aigc.multimodalconversation.MultiModalConversation;
import com.alibaba.dashscope.aigc.multimodalconversation.MultiModalConversationParam;
import com.alibaba.dashscope.aigc.multimodalconversation.MultiModalConversationResult;
import com.alibaba.dashscope.common.MultiModalMessage;
import java.util.Collections;
import com.alibaba.dashscope.common.Role;
import com.alibaba.dashscope.exception.ApiException;
import com.alibaba.dashscope.exception.InputRequiredException;
import com.alibaba.dashscope.exception.NoApiKeyException;
import com.alibaba.dashscope.utils.JsonUtils;
import com.alibaba.dashscope.utils.Constants;

public class Main {
    static {Constants.baseHttpApiUrl="https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/api/v1";}
    public static MultiModalConversationResult callWithMessage() throws ApiException, NoApiKeyException, InputRequiredException {
        MultiModalConversation conv = new MultiModalConversation();
        MultiModalMessage systemMsg = MultiModalMessage.builder()
                .role(Role.SYSTEM.getValue())
                .content(Arrays.asList(Collections.singletonMap("text", "You are a helpful assistant.")))
                .build();
        MultiModalMessage userMsg = MultiModalMessage.builder()
                .role(Role.USER.getValue())
                .content(Arrays.asList(Collections.singletonMap("text", "你是谁？")))
                .build();
        MultiModalConversationParam param = MultiModalConversationParam.builder()
                // 若没有配置环境变量，请用百炼API Key将下行替换为：.apiKey("sk-xxx")
                .apiKey(System.getenv("DASHSCOPE_API_KEY"))
                // 此处以qwen3.8-max为例，可按需更换模型名称。模型列表：https://help.aliyun.com/zh/model-studio/getting-started/models
                .model("qwen3.8-max")
                .messages(Arrays.asList(systemMsg, userMsg))
                .build();
        return conv.call(param);
    }
    public static void main(String[] args) {
        try {
            MultiModalConversationResult result = callWithMessage();
            System.out.println(JsonUtils.toJson(result));
        } catch (ApiException | NoApiKeyException | InputRequiredException e) {
            // 使用日志框架记录异常信息
            System.err.println("An error occurred while calling the generation service: " + e.getMessage());
        }
        System.exit(0);
    }
}
</code></pre></section><section id="php-http" class="section"><h4 id="php-http-h4">PHP（HTTP）</h4><pre data-tag="codeblock" id="code-block-20" outputclass="language-php" code-type="xCode" class="pre codeblock language-php"><code>&lt;?php

$url = "https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation";
$apiKey = getenv('DASHSCOPE_API_KEY');

$data = [
    // 此处以qwen3.8-max为例，可按需更换模型名称。模型列表：https://help.aliyun.com/zh/model-studio/getting-started/models
    "model" =&gt; "qwen3.8-max",
    "input" =&gt; [
        "messages" =&gt; [
            [
                "role" =&gt; "system",
                "content" =&gt; [["text" =&gt; "You are a helpful assistant."]]
            ],
            [
                "role" =&gt; "user",
                "content" =&gt; [["text" =&gt; "你是谁？"]]
            ]
        ]
    ],
    "parameters" =&gt; [
        "result_format" =&gt; "message"
    ]
];

$jsonData = json_encode($data);

$ch = curl_init($url);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_POST, true);
curl_setopt($ch, CURLOPT_POSTFIELDS, $jsonData);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_HTTPHEADER, [
    "Authorization: Bearer $apiKey",
    "Content-Type: application/json"
]);

$response = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);

if ($httpCode == 200) {
    echo "Response: " . $response;
} else {
    echo "Error: " . $httpCode . " - " . $response;
}

curl_close($ch);
?&gt;
</code></pre></section><section id="node-js-http" class="section"><h4 id="node-js-http-h4">Node.js（HTTP）</h4><p>DashScope 未提供 Node.js 环境的 SDK。如需通过 OpenAI Node.js SDK调用，请参考本文的<a href="/zh/model-studio/qwen-api-reference">OpenAI</a>章节。</p><pre data-tag="codeblock" id="code-block-21" outputclass="language-javascript" code-type="xCode" class="pre codeblock language-javascript"><code>import fetch from 'node-fetch';

const apiKey = process.env.DASHSCOPE_API_KEY;

const data = {
    model: "qwen3.8-max", // 此处以qwen3.8-max为例，可按需更换模型名称。模型列表：https://help.aliyun.com/zh/model-studio/getting-started/models
    input: {
        messages: [
            {
                role: "system",
                content: [{ text: "You are a helpful assistant." }]
            },
            {
                role: "user",
                content: [{ text: "你是谁？" }]
            }
        ]
    },
    parameters: {
        result_format: "message"
    }
};

fetch('https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation', {
    method: 'POST',
    headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
    },
    body: JSON.stringify(data)
})
.then(response =&gt; response.json())
.then(data =&gt; {
    console.log(JSON.stringify(data));
})
.catch(error =&gt; {
    console.error('Error:', error);
});
</code></pre></section><section id="c-http" class="section"><h4 id="c-http-h4">C#（HTTP）</h4><pre data-tag="codeblock" id="code-block-22" outputclass="language-csharp" code-type="xCode" class="pre codeblock language-csharp"><code>using System.Net.Http.Headers;
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
        string url = "https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation";
        // 此处以qwen3.8-max为例，可按需更换模型名称。模型列表：https://help.aliyun.com/zh/model-studio/getting-started/models
        string jsonContent = @"{
            ""model"": ""qwen3.8-max"",
            ""input"": {
                ""messages"": [
                    {
                        ""role"": ""system"",
                        ""content"": [{""text"": ""You are a helpful assistant.""}]
                    },
                    {
                        ""role"": ""user"",
                        ""content"": [{""text"": ""你是谁？""}]
                    }
                ]
            },
            ""parameters"": {
                ""result_format"": ""message""
            }
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
</code></pre></section><section id="go-http" class="section"><h4 id="go-http-h4">Go（HTTP）</h4><p>DashScope 未提供 Go 的 SDK。如需通过 OpenAI Go SDK调用，请参考本文的<a href="/zh/model-studio/qwen-api-reference">OpenAI-Go</a>章节。</p><pre data-tag="codeblock" id="code-block-23" outputclass="language-go" code-type="xCode" class="pre codeblock language-go"><code>package main

import (
    "bytes"
    "encoding/json"
    "fmt"
    "io"
    "log"
    "net/http"
    "os"
)

type ContentItem struct {
    Text string `json:"text"`
}

type Message struct {
    Role    string        `json:"role"`
    Content []ContentItem `json:"content"`
}

type Input struct {
    Messages []Message `json:"messages"`
}

type Parameters struct {
    ResultFormat string `json:"result_format"`
}

type RequestBody struct {
    Model      string     `json:"model"`
    Input      Input      `json:"input"`
    Parameters Parameters `json:"parameters"`
}

func main() {
    // 创建 HTTP 客户端
    client := &amp;http.Client{}

    // 构建请求体
    requestBody := RequestBody{
        // 此处以qwen3.8-max为例，可按需更换模型名称。模型列表：https://help.aliyun.com/zh/model-studio/getting-started/models
        Model: "qwen3.8-max",
        Input: Input{
            Messages: []Message{
                {
                    Role:    "system",
                    Content: []ContentItem{{Text: "You are a helpful assistant."}},
                },
                {
                    Role:    "user",
                    Content: []ContentItem{{Text: "你是谁？"}},
                },
            },
        },
        Parameters: Parameters{
            ResultFormat: "message",
        },
    }

    jsonData, err := json.Marshal(requestBody)
    if err != nil {
        log.Fatal(err)
    }

    // 创建 POST 请求
    req, err := http.NewRequest("POST", "https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation", bytes.NewBuffer(jsonData))
    if err != nil {
        log.Fatal(err)
    }

    // 设置请求头
    // 若没有配置环境变量，请用百炼API Key将下行替换为：apiKey := "sk-xxx"
    apiKey := os.Getenv("DASHSCOPE_API_KEY")
    req.Header.Set("Authorization", "Bearer "+apiKey)
    req.Header.Set("Content-Type", "application/json")

    // 发送请求
    resp, err := client.Do(req)
    if err != nil {
        log.Fatal(err)
    }
    defer resp.Body.Close()

    // 读取响应体
    bodyText, err := io.ReadAll(resp.Body)
    if err != nil {
        log.Fatal(err)
    }

    // 打印响应内容
    fmt.Printf("%s\n", bodyText)
}
</code></pre></section><section id="curl" class="section"><h4 id="curl-h4">curl</h4><pre data-tag="codeblock" id="code-block-24" outputclass="language-bash" code-type="xCode" class="pre codeblock language-bash"><code>curl --location "https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation" \
--header "Authorization: Bearer $DASHSCOPE_API_KEY" \
--header "Content-Type: application/json" \
--data '{
    "model": "qwen3.8-max",
    "input":{
        "messages":[
            {
                "role": "system",
                "content": [{"text": "You are a helpful assistant."}]
            },
            {
                "role": "user",
                "content": [{"text": "你是谁？"}]
            }
        ]
    },
    "parameters": {
        "result_format": "message"
    }
}'
</code></pre></section></section></section><section id="流式输出" class="section"><h4 id="流式输出-h4">流式输出</h4><blockquote><p>相关文档：<a href="/zh/model-studio/stream">流式输出</a>。</p></blockquote><section data-tag="tabbed-content-box" outputclass="tabbed-content-box" id="sec-tabs-9" class="tabbed-content-box section"><section id="文本生成模型" class="section"><h4 id="文本生成模型-h4">文本生成模型</h4><div outputclass="tabbed-codeblock" data-tag="fig" id="fig-code-group" class="tabbed-codeblock-box"><div class="tab-box"></div><input id="fig-code-group-python-tab" type="radio" name="check-fig-code-group" checked=""><label for="fig-code-group-python-tab">Python</label><div class="codeblock-item"><pre data-tag="codeblock" id="code-code-group-python" outputclass="language-python" code-type="xCode" class="pre codeblock language-python"><code>import os
import dashscope
dashscope.base_http_api_url = "https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/api/v1"

messages = [
    {'role':'system','content':'you are a helpful assistant'},
    {'role': 'user','content': '你是谁？'}
]
responses = dashscope.Generation.call(
    # 若没有配置环境变量，请用百炼API Key将下行替换为：api_key="sk-xxx"
    api_key=os.getenv('DASHSCOPE_API_KEY'),
    model="qwen-plus", # 此处以qwen-plus为例，可按需更换为其它文本生成模型
    messages=messages,
    result_format="message",
    stream=True,
    incremental_output=True
    )
for response in responses:
    print(response.output.choices[0].message.content, end="")
</code></pre></div><input id="fig-code-group-java-tab" type="radio" name="check-fig-code-group"><label for="fig-code-group-java-tab">Java</label><div class="codeblock-item"><pre data-tag="codeblock" id="code-code-group-java" outputclass="language-java" code-type="xCode" class="pre codeblock language-java"><code>import java.util.Arrays;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import com.alibaba.dashscope.aigc.generation.Generation;
import com.alibaba.dashscope.aigc.generation.GenerationParam;
import com.alibaba.dashscope.aigc.generation.GenerationResult;
import com.alibaba.dashscope.common.Message;
import com.alibaba.dashscope.common.Role;
import com.alibaba.dashscope.exception.ApiException;
import com.alibaba.dashscope.exception.InputRequiredException;
import com.alibaba.dashscope.exception.NoApiKeyException;
import com.alibaba.dashscope.utils.JsonUtils;
import io.reactivex.Flowable;
import java.lang.System;
import com.alibaba.dashscope.utils.Constants;

public class Main {
    static {Constants.baseHttpApiUrl="https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/api/v1";}
    private static final Logger logger = LoggerFactory.getLogger(Main.class);
    private static void handleGenerationResult(GenerationResult message) {
        System.out.println(JsonUtils.toJson(message));
    }
    public static void streamCallWithMessage(Generation gen, Message userMsg)
            throws NoApiKeyException, ApiException, InputRequiredException {
        GenerationParam param = buildGenerationParam(userMsg);
        Flowable&lt;GenerationResult&gt; result = gen.streamCall(param);
        result.blockingForEach(message -&gt; handleGenerationResult(message));
    }
    private static GenerationParam buildGenerationParam(Message userMsg) {
        return GenerationParam.builder()
                // 若没有配置环境变量，请用百炼API Key将下行替换为：.apiKey("sk-xxx")
                .apiKey(System.getenv("DASHSCOPE_API_KEY"))
                // 此处以qwen-plus为例，可按需更换为其它文本生成模型
                .model("qwen-plus")
                .messages(Arrays.asList(userMsg))
                .resultFormat(GenerationParam.ResultFormat.MESSAGE)
                .incrementalOutput(true)
                .build();
    }
    public static void main(String[] args) {
        try {
            Generation gen = new Generation();
            Message userMsg = Message.builder().role(Role.USER.getValue()).content("你是谁？").build();
            streamCallWithMessage(gen, userMsg);
        } catch (ApiException | NoApiKeyException | InputRequiredException  e) {
            logger.error("An exception occurred: {}", e.getMessage());
        }
        System.exit(0);
    }
}
</code></pre></div><input id="fig-code-group-curl-tab" type="radio" name="check-fig-code-group"><label for="fig-code-group-curl-tab">curl</label><div class="codeblock-item"><pre data-tag="codeblock" id="code-code-group-curl" outputclass="language-bash" code-type="xCode" class="pre codeblock language-bash"><code>curl --location "https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/api/v1/services/aigc/text-generation/generation" \
--header "Authorization: Bearer $DASHSCOPE_API_KEY" \
--header "Content-Type: application/json" \
--header "X-DashScope-SSE: enable" \
--data '{
    "model": "qwen-plus",
    "input":{
        "messages":[
            {
                "role": "system",
                "content": "You are a helpful assistant."
            },
            {
                "role": "user",
                "content": "你是谁？"
            }
        ]
    },
    "parameters": {
        "result_format": "message",
        "incremental_output":true
    }
}'
</code></pre></div></div></section><section id="多模态模型" class="section"><h4 id="多模态模型-h4">多模态模型</h4><div outputclass="tabbed-codeblock" data-tag="fig" id="fig-code-group-2" class="tabbed-codeblock-box"><div class="tab-box"></div><input id="fig-code-group-2-python-tab" type="radio" name="check-fig-code-group-2" checked=""><label for="fig-code-group-2-python-tab">Python</label><div class="codeblock-item"><pre data-tag="codeblock" id="code-code-group-2-python" outputclass="language-python" code-type="xCode" class="pre codeblock language-python"><code>import os
from dashscope import MultiModalConversation
import dashscope

# 若使用新加坡地域的模型，请取消下列注释
# dashscope.base_http_api_url = "https://{WorkspaceId}.ap-southeast-1.maas.aliyuncs.com/api/v1"

messages = [
    {
        "role": "user",
        "content": [
            {"image": "https://help-static-aliyun-doc.aliyuncs.com/file-manage-files/zh-CN/20241022/emyrja/dog_and_girl.jpeg"},
            {"text": "图中描绘的是什么景象?"}
        ]
    }
]

responses = MultiModalConversation.call(
    # 若没有配置环境变量，请用百炼API Key将下行替换为：api_key="sk-xxx"
    # 新加坡和北京地域的API Key不同。获取API Key：https://help.aliyun.com/zh/model-studio/get-api-key
    api_key=os.getenv("DASHSCOPE_API_KEY"),
    model='qwen3-vl-plus',  # 可按需更换为其它多模态模型，并修改相应的 messages
    messages=messages,
    stream=True,
    incremental_output=True
    )

full_content = ""
print("流式输出内容为：")
for response in responses:
    if response.output.choices[0].message.content:
        print(response.output.choices[0].message.content[0]['text'])
        full_content += response.output.choices[0].message.content[0]['text']
print(f"完整内容为：{full_content}")
</code></pre></div><input id="fig-code-group-2-java-tab" type="radio" name="check-fig-code-group-2"><label for="fig-code-group-2-java-tab">Java</label><div class="codeblock-item"><pre data-tag="codeblock" id="code-code-group-2-java" outputclass="language-java" code-type="xCode" class="pre codeblock language-java"><code>
import java.util.Arrays;
import java.util.Collections;

import com.alibaba.dashscope.aigc.multimodalconversation.MultiModalConversation;
import com.alibaba.dashscope.aigc.multimodalconversation.MultiModalConversationParam;
import com.alibaba.dashscope.aigc.multimodalconversation.MultiModalConversationResult;
import com.alibaba.dashscope.common.MultiModalMessage;
import com.alibaba.dashscope.common.Role;
import com.alibaba.dashscope.exception.ApiException;
import com.alibaba.dashscope.exception.NoApiKeyException;
import com.alibaba.dashscope.exception.UploadFileException;
import io.reactivex.Flowable;
import com.alibaba.dashscope.utils.Constants;

public class Main {

    // 若使用新加坡地域的模型，请取消下列注释
    //  static {Constants.baseHttpApiUrl="https://{WorkspaceId}.ap-southeast-1.maas.aliyuncs.com/api/v1";}

    public static void streamCall()
            throws ApiException, NoApiKeyException, UploadFileException {
        MultiModalConversation conv = new MultiModalConversation();
        MultiModalMessage userMessage = MultiModalMessage.builder().role(Role.USER.getValue())
                .content(Arrays.asList(Collections.singletonMap("image", "https://help-static-aliyun-doc.aliyuncs.com/file-manage-files/zh-CN/20241022/emyrja/dog_and_girl.jpeg"),
                        Collections.singletonMap("text", "图中描绘的是什么景象？"))).build();
        MultiModalConversationParam param = MultiModalConversationParam.builder()
                // 若没有配置环境变量，请用百炼API Key将下行替换为：.apiKey("sk-xxx")
                // 新加坡和北京地域的API Key不同。获取API Key：https://help.aliyun.com/zh/model-studio/get-api-key
                .apiKey(System.getenv("DASHSCOPE_API_KEY"))
                .model("qwen3-vl-plus")  // 可按需更换为其它多模态模型，并修改相应的 messages
                .messages(Arrays.asList(userMessage))
                .incrementalOutput(true)
                .build();
        Flowable&lt;MultiModalConversationResult&gt; result = conv.streamCall(param);
        result.blockingForEach(item -&gt; {
            try {
                var content = item.getOutput().getChoices().get(0).getMessage().getContent();
                    // 判断content是否存在且不为空
                if (content != null &amp;&amp;  !content.isEmpty()) {
                    System.out.println(content.get(0).get("text"));
                    }
            } catch (Exception e) {
                System.out.println(e.getMessage());
            }
        });
    }

    public static void main(String[] args) {
        try {
            streamCall();
        } catch (ApiException | NoApiKeyException | UploadFileException e) {
            System.out.println(e.getMessage());
        }
        System.exit(0);
    }
}
</code></pre></div><input id="fig-code-group-2-curl-tab" type="radio" name="check-fig-code-group-2"><label for="fig-code-group-2-curl-tab">curl</label><div class="codeblock-item"><pre data-tag="codeblock" id="code-code-group-2-curl" outputclass="language-bash" code-type="xCode" class="pre codeblock language-bash"><code># ======= 重要提示 =======
# 新加坡和北京地域的API Key不同。获取API Key：https://help.aliyun.com/zh/model-studio/get-api-key
# 以下为北京地域url，若使用新加坡地域的模型，需将url替换为：https://{WorkspaceId}.ap-southeast-1.maas.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation
# === 执行时请删除该注释 ===

curl -X POST https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation \
-H "Authorization: Bearer $DASHSCOPE_API_KEY" \
-H 'Content-Type: application/json' \
-H 'X-DashScope-SSE: enable' \
-d '{
    "model": "qwen3-vl-plus",
    "input":{
        "messages":[
            {
                "role": "user",
                "content": [
                    {"image": "https://help-static-aliyun-doc.aliyuncs.com/file-manage-files/zh-CN/20241022/emyrja/dog_and_girl.jpeg"},
                    {"text": "图中描绘的是什么景象？"}
                ]
            }
        ]
    },
    "parameters": {
        "incremental_output": true
    }
}'
</code></pre></div></div></section></section></section><section id="图像输入" class="section"><h4 id="图像输入-h4">图像输入</h4><blockquote><p>关于大模型分析图像的更多用法，请参见<a href="/zh/model-studio/vision">图像与视频理解</a>。</p></blockquote><div outputclass="tabbed-codeblock" data-tag="fig" id="fig-code-group-3" class="tabbed-codeblock-box"><div class="tab-box"></div><input id="fig-code-group-3-python-tab" type="radio" name="check-fig-code-group-3" checked=""><label for="fig-code-group-3-python-tab">Python</label><div class="codeblock-item"><pre data-tag="codeblock" id="code-code-group-3-python" outputclass="language-python" code-type="xCode" class="pre codeblock language-python"><code>import os
import dashscope
dashscope.base_http_api_url = "https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/api/v1"

messages = [
    {
        "role": "user",
        "content": [
            {"image": "https://dashscope.oss-cn-beijing.aliyuncs.com/images/dog_and_girl.jpeg"},
            {"image": "https://dashscope.oss-cn-beijing.aliyuncs.com/images/tiger.png"},
            {"image": "https://dashscope.oss-cn-beijing.aliyuncs.com/images/rabbit.png"},
            {"text": "这些是什么?"}
        ]
    }
]
response = dashscope.MultiModalConversation.call(
    # 若没有配置环境变量，请用百炼API Key将下行替换为：api_key="sk-xxx"
    api_key=os.getenv('DASHSCOPE_API_KEY'),
    model='qwen-vl-max', # 此处以qwen-vl-max为例，可按需更换模型名称。模型列表：https://help.aliyun.com/zh/model-studio/getting-started/models
    messages=messages
    )
print(response)
</code></pre></div><input id="fig-code-group-3-java-tab" type="radio" name="check-fig-code-group-3"><label for="fig-code-group-3-java-tab">Java</label><div class="codeblock-item"><pre data-tag="codeblock" id="code-code-group-3-java" outputclass="language-java" code-type="xCode" class="pre codeblock language-java"><code>// Copyright (c) Alibaba, Inc. and its affiliates.

import java.util.Arrays;
import java.util.Collections;
import com.alibaba.dashscope.aigc.multimodalconversation.MultiModalConversation;
import com.alibaba.dashscope.aigc.multimodalconversation.MultiModalConversationParam;
import com.alibaba.dashscope.aigc.multimodalconversation.MultiModalConversationResult;
import com.alibaba.dashscope.common.MultiModalMessage;
import com.alibaba.dashscope.common.Role;
import com.alibaba.dashscope.exception.ApiException;
import com.alibaba.dashscope.exception.NoApiKeyException;
import com.alibaba.dashscope.exception.UploadFileException;
import com.alibaba.dashscope.utils.JsonUtils;
import com.alibaba.dashscope.utils.Constants;
public class Main {
    static {Constants.baseHttpApiUrl="https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/api/v1";}
    public static void simpleMultiModalConversationCall()
            throws ApiException, NoApiKeyException, UploadFileException {
        MultiModalConversation conv = new MultiModalConversation();
        MultiModalMessage userMessage = MultiModalMessage.builder().role(Role.USER.getValue())
                .content(Arrays.asList(
                        Collections.singletonMap("image", "https://dashscope.oss-cn-beijing.aliyuncs.com/images/dog_and_girl.jpeg"),
                        Collections.singletonMap("image", "https://dashscope.oss-cn-beijing.aliyuncs.com/images/tiger.png"),
                        Collections.singletonMap("image", "https://dashscope.oss-cn-beijing.aliyuncs.com/images/rabbit.png"),
                        Collections.singletonMap("text", "这些是什么?"))).build();
        MultiModalConversationParam param = MultiModalConversationParam.builder()
                // 若没有配置环境变量，请用百炼API Key将下行替换为：.apiKey("sk-xxx")
                .apiKey(System.getenv("DASHSCOPE_API_KEY"))
                // 此处以qwen-vl-plus为例，可按需更换模型名称。模型列表：https://help.aliyun.com/zh/model-studio/getting-started/models
                .model("qwen-vl-plus")
                .message(userMessage)
                .build();
        MultiModalConversationResult result = conv.call(param);
        System.out.println(JsonUtils.toJson(result));
    }

    public static void main(String[] args) {
        try {
            simpleMultiModalConversationCall();
        } catch (ApiException | NoApiKeyException | UploadFileException e) {
            System.out.println(e.getMessage());
        }
        System.exit(0);
    }
}
</code></pre></div><input id="fig-code-group-3-curl-tab" type="radio" name="check-fig-code-group-3"><label for="fig-code-group-3-curl-tab">curl</label><div class="codeblock-item"><pre data-tag="codeblock" id="code-code-group-3-curl" outputclass="language-bash" code-type="xCode" class="pre codeblock language-bash"><code>curl --location 'https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation' \
--header "Authorization: Bearer $DASHSCOPE_API_KEY" \
--header 'Content-Type: application/json' \
--data '{
    "model": "qwen-vl-plus",
    "input":{
        "messages":[
            {
                "role": "user",
                "content": [
                    {"image": "https://dashscope.oss-cn-beijing.aliyuncs.com/images/dog_and_girl.jpeg"},
                    {"image": "https://dashscope.oss-cn-beijing.aliyuncs.com/images/tiger.png"},
                    {"image": "https://dashscope.oss-cn-beijing.aliyuncs.com/images/rabbit.png"},
                    {"text": "这些是什么?"}
                ]
            }
        ]
    }
}'
</code></pre></div></div></section><section id="视频输入" class="section"><h4 id="视频输入-h4">视频输入</h4><blockquote><p>以下为传入视频帧的示例代码，关于更多用法（如传入视频文件），请参见<a href="/zh/model-studio/vision#80dbf6ca8fh6s">视觉理解</a>。</p></blockquote><div outputclass="tabbed-codeblock" data-tag="fig" id="fig-code-group-4" class="tabbed-codeblock-box"><div class="tab-box"></div><input id="fig-code-group-4-python-tab" type="radio" name="check-fig-code-group-4" checked=""><label for="fig-code-group-4-python-tab">Python</label><div class="codeblock-item"><pre data-tag="codeblock" id="code-code-group-4-python" outputclass="language-python" code-type="xCode" class="pre codeblock language-python"><code>from http import HTTPStatus
import os
# dashscope版本需要不低于1.20.10
import dashscope
dashscope.base_http_api_url = "https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/api/v1"

messages = [{"role": "user",
             "content": [
                 {"video":["https://img.alicdn.com/imgextra/i3/O1CN01K3SgGo1eqmlUgeE9b_!!6000000003923-0-tps-3840-2160.jpg",
                           "https://img.alicdn.com/imgextra/i4/O1CN01BjZvwg1Y23CF5qIRB_!!6000000003000-0-tps-3840-2160.jpg",
                           "https://img.alicdn.com/imgextra/i4/O1CN01Ib0clU27vTgBdbVLQ_!!6000000007859-0-tps-3840-2160.jpg",
                           "https://img.alicdn.com/imgextra/i1/O1CN01aygPLW1s3EXCdSN4X_!!6000000005710-0-tps-3840-2160.jpg"]},
                 {"text": "描述这个视频的具体过程"}]}]
response = dashscope.MultiModalConversation.call(
    # 若没有配置环境变量，请用百炼API Key将下行替换为：api_key="sk-xxx"
    api_key=os.getenv("DASHSCOPE_API_KEY"),
    model='qwen-vl-max',  # 此处以qwen-vl-max为例，可按需更换模型名称。模型列表：https://help.aliyun.com/zh/model-studio/getting-started/models
    messages=messages
)
if response.status_code == HTTPStatus.OK:
    print(response)
else:
    print(response.code)
    print(response.message)
</code></pre></div><input id="fig-code-group-4-java-tab" type="radio" name="check-fig-code-group-4"><label for="fig-code-group-4-java-tab">Java</label><div class="codeblock-item"><pre data-tag="codeblock" id="code-code-group-4-java" outputclass="language-java" code-type="xCode" class="pre codeblock language-java"><code>// DashScope SDK版本需要不低于2.16.7
import java.util.Arrays;
import java.util.Collections;
import com.alibaba.dashscope.aigc.multimodalconversation.MultiModalConversation;
import com.alibaba.dashscope.aigc.multimodalconversation.MultiModalConversationParam;
import com.alibaba.dashscope.aigc.multimodalconversation.MultiModalConversationResult;
import com.alibaba.dashscope.common.MultiModalMessage;
import com.alibaba.dashscope.common.Role;
import com.alibaba.dashscope.exception.ApiException;
import com.alibaba.dashscope.exception.NoApiKeyException;
import com.alibaba.dashscope.exception.UploadFileException;
import com.alibaba.dashscope.utils.JsonUtils;
import com.alibaba.dashscope.utils.Constants;
public class Main {
    static {Constants.baseHttpApiUrl="https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/api/v1";}
    // 此处以qwen-vl-max为例，可按需更换模型名称。模型列表：https://help.aliyun.com/zh/model-studio/getting-started/models
    private static final String MODEL_NAME = "qwen-vl-max";
    public static void videoImageListSample() throws ApiException, NoApiKeyException, UploadFileException {
        MultiModalConversation conv = new MultiModalConversation();
        MultiModalMessage systemMessage = MultiModalMessage.builder()
                .role(Role.SYSTEM.getValue())
                .content(Arrays.asList(Collections.singletonMap("text", "You are a helpful assistant.")))
                .build();
        MultiModalMessage userMessage = MultiModalMessage.builder()
                .role(Role.USER.getValue())
                .content(Arrays.asList(Collections.singletonMap("video", Arrays.asList("https://img.alicdn.com/imgextra/i3/O1CN01K3SgGo1eqmlUgeE9b_!!6000000003923-0-tps-3840-2160.jpg",
                                "https://img.alicdn.com/imgextra/i4/O1CN01BjZvwg1Y23CF5qIRB_!!6000000003000-0-tps-3840-2160.jpg",
                                "https://img.alicdn.com/imgextra/i4/O1CN01Ib0clU27vTgBdbVLQ_!!6000000007859-0-tps-3840-2160.jpg",
                                "https://img.alicdn.com/imgextra/i1/O1CN01aygPLW1s3EXCdSN4X_!!6000000005710-0-tps-3840-2160.jpg")),
                        Collections.singletonMap("text", "描述这个视频的具体过程")))
                .build();
        MultiModalConversationParam param = MultiModalConversationParam.builder()
                .model(MODEL_NAME).message(systemMessage)
                .message(userMessage).build();
        MultiModalConversationResult result = conv.call(param);
        System.out.print(JsonUtils.toJson(result));
    }
    public static void main(String[] args) {
        try {
            videoImageListSample();
        } catch (ApiException | NoApiKeyException | UploadFileException e) {
            System.out.println(e.getMessage());
        }
        System.exit(0);
    }
}
</code></pre></div><input id="fig-code-group-4-curl-tab" type="radio" name="check-fig-code-group-4"><label for="fig-code-group-4-curl-tab">curl</label><div class="codeblock-item"><pre data-tag="codeblock" id="code-code-group-4-curl" outputclass="language-bash" code-type="xCode" class="pre codeblock language-bash"><code>curl -X POST https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation \
-H "Authorization: Bearer $DASHSCOPE_API_KEY" \
-H 'Content-Type: application/json' \
-d '{
  "model": "qwen-vl-max",
  "input": {
    "messages": [
      {
        "role": "user",
        "content": [
          {
            "video": [
              "https://img.alicdn.com/imgextra/i3/O1CN01K3SgGo1eqmlUgeE9b_!!6000000003923-0-tps-3840-2160.jpg",
              "https://img.alicdn.com/imgextra/i4/O1CN01BjZvwg1Y23CF5qIRB_!!6000000003000-0-tps-3840-2160.jpg",
              "https://img.alicdn.com/imgextra/i4/O1CN01Ib0clU27vTgBdbVLQ_!!6000000007859-0-tps-3840-2160.jpg",
              "https://img.alicdn.com/imgextra/i1/O1CN01aygPLW1s3EXCdSN4X_!!6000000005710-0-tps-3840-2160.jpg"
            ]
          },
          {
            "text": "描述这个视频的具体过程"
          }
        ]
      }
    ]
  }
}'
</code></pre></div></div></section><section id="音频输入" class="section"><h4 id="音频输入-h4">音频输入</h4><section data-tag="tabbed-content-box" outputclass="tabbed-content-box" id="sec-tabs-10" class="tabbed-content-box section"><section id="音频理解" class="section"><h4 id="音频理解-h4">音频理解</h4><blockquote><p>关于大模型分析音频的更多用法，请参见<a href="/zh/model-studio/audio-language-model">音频理解-Qwen-Audio</a>。</p></blockquote><div outputclass="tabbed-codeblock" data-tag="fig" id="fig-code-group-5" class="tabbed-codeblock-box"><div class="tab-box"></div><input id="fig-code-group-5-python-tab" type="radio" name="check-fig-code-group-5" checked=""><label for="fig-code-group-5-python-tab">Python</label><div class="codeblock-item"><pre data-tag="codeblock" id="code-code-group-5-python" outputclass="language-python" code-type="xCode" class="pre codeblock language-python"><code>import os
import dashscope
dashscope.base_http_api_url = "https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/api/v1"

messages = [
    {
        "role": "user",
        "content": [
            {"audio": "https://dashscope.oss-cn-beijing.aliyuncs.com/audios/welcome.mp3"},
            {"text": "这段音频在说什么?"}
        ]
    }
]
response = dashscope.MultiModalConversation.call(
    # 若没有配置环境变量，请用百炼API Key将下行替换为：api_key="sk-xxx"
    api_key=os.getenv('DASHSCOPE_API_KEY'),
    model='qwen-audio-turbo', # 此处以qwen-audio-turbo为例，可按需更换模型名称。模型列表：https://help.aliyun.com/zh/model-studio/getting-started/models
    messages=messages
    )
print(response)
</code></pre></div><input id="fig-code-group-5-java-tab" type="radio" name="check-fig-code-group-5"><label for="fig-code-group-5-java-tab">Java</label><div class="codeblock-item"><pre data-tag="codeblock" id="code-code-group-5-java" outputclass="language-java" code-type="xCode" class="pre codeblock language-java"><code>import java.util.Arrays;
import java.util.Collections;
import java.lang.System;
import com.alibaba.dashscope.aigc.multimodalconversation.MultiModalConversation;
import com.alibaba.dashscope.aigc.multimodalconversation.MultiModalConversationParam;
import com.alibaba.dashscope.aigc.multimodalconversation.MultiModalConversationResult;
import com.alibaba.dashscope.common.MultiModalMessage;
import com.alibaba.dashscope.common.Role;
import com.alibaba.dashscope.exception.ApiException;
import com.alibaba.dashscope.exception.NoApiKeyException;
import com.alibaba.dashscope.exception.UploadFileException;
import com.alibaba.dashscope.utils.JsonUtils;
import com.alibaba.dashscope.utils.Constants;
public class Main {
    static {Constants.baseHttpApiUrl="https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/api/v1";}
    public static void simpleMultiModalConversationCall()
            throws ApiException, NoApiKeyException, UploadFileException {
        MultiModalConversation conv = new MultiModalConversation();
        MultiModalMessage userMessage = MultiModalMessage.builder().role(Role.USER.getValue())
                .content(Arrays.asList(Collections.singletonMap("audio", "https://dashscope.oss-cn-beijing.aliyuncs.com/audios/welcome.mp3"),
                        Collections.singletonMap("text", "这段音频在说什么?"))).build();
        MultiModalConversationParam param = MultiModalConversationParam.builder()
                // 若没有配置环境变量，请用百炼API Key将下行替换为：.apiKey("sk-xxx")
                .apiKey(System.getenv("DASHSCOPE_API_KEY"))
                // 此处以qwen-audio-turbo为例，可按需更换模型名称。模型列表：https://help.aliyun.com/zh/model-studio/getting-started/models
                .model("qwen-audio-turbo")
                .message(userMessage)
                .build();
        MultiModalConversationResult result = conv.call(param);
        System.out.println(JsonUtils.toJson(result));
    }

    public static void main(String[] args) {
        try {
            simpleMultiModalConversationCall();
        } catch (ApiException | NoApiKeyException | UploadFileException e) {
            System.out.println(e.getMessage());
        }
        System.exit(0);
    }
}
</code></pre></div><input id="fig-code-group-5-curl-tab" type="radio" name="check-fig-code-group-5"><label for="fig-code-group-5-curl-tab">curl</label><div class="codeblock-item"><pre data-tag="codeblock" id="code-code-group-5-curl" outputclass="language-bash" code-type="xCode" class="pre codeblock language-bash"><code>curl --location 'https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation' \
--header "Authorization: Bearer $DASHSCOPE_API_KEY" \
--header 'Content-Type: application/json' \
--data '{
    "model": "qwen-audio-turbo",
    "input":{
        "messages":[
            {
                "role": "system",
                "content": [
                    {"text": "You are a helpful assistant."}
                ]
            },
            {
                "role": "user",
                "content": [
                    {"audio": "https://dashscope.oss-cn-beijing.aliyuncs.com/audios/welcome.mp3"},
                    {"text": "这段音频在说什么?"}
                ]
            }
        ]
    }
}'
</code></pre></div></div></section></section></section><section id="联网搜索" class="section"><h4 id="联网搜索-h4">联网搜索</h4><div outputclass="tabbed-codeblock" data-tag="fig" id="fig-code-group-6" class="tabbed-codeblock-box"><div class="tab-box"></div><input id="fig-code-group-6-python-tab" type="radio" name="check-fig-code-group-6" checked=""><label for="fig-code-group-6-python-tab">Python</label><div class="codeblock-item"><pre data-tag="codeblock" id="code-code-group-6-python" outputclass="language-python" code-type="xCode" class="pre codeblock language-python"><code>import os
import dashscope
dashscope.base_http_api_url = "https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/api/v1"

messages = [
    {'role': 'system', 'content': [{'text': 'You are a helpful assistant.'}]},
    {'role': 'user', 'content': [{'text': '杭州明天天气是什么？'}]}
    ]
response = dashscope.MultiModalConversation.call(
    # 若没有配置环境变量，请用百炼API Key将下行替换为：api_key="sk-xxx"
    api_key=os.getenv('DASHSCOPE_API_KEY'),
    model="qwen3.8-max", # 此处以qwen3.8-max为例，可按需更换模型名称。模型列表：https://help.aliyun.com/zh/model-studio/getting-started/models
    messages=messages,
    enable_search=True,
    )
print(response)
</code></pre></div><input id="fig-code-group-6-java-tab" type="radio" name="check-fig-code-group-6"><label for="fig-code-group-6-java-tab">Java</label><div class="codeblock-item"><pre data-tag="codeblock" id="code-code-group-6-java" outputclass="language-java" code-type="xCode" class="pre codeblock language-java"><code>// 建议dashscope SDK的版本 &gt;= 2.12.0
import java.util.Arrays;
import java.lang.System;
import com.alibaba.dashscope.aigc.multimodalconversation.MultiModalConversation;
import com.alibaba.dashscope.aigc.multimodalconversation.MultiModalConversationParam;
import com.alibaba.dashscope.aigc.multimodalconversation.MultiModalConversationResult;
import com.alibaba.dashscope.common.MultiModalMessage;
import java.util.Collections;
import com.alibaba.dashscope.common.Role;
import com.alibaba.dashscope.exception.ApiException;
import com.alibaba.dashscope.exception.InputRequiredException;
import com.alibaba.dashscope.exception.NoApiKeyException;
import com.alibaba.dashscope.utils.JsonUtils;
import com.alibaba.dashscope.utils.Constants;

public class Main {
    static {Constants.baseHttpApiUrl="https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/api/v1";}
    public static MultiModalConversationResult callWithMessage() throws ApiException, NoApiKeyException, InputRequiredException {
        MultiModalConversation conv = new MultiModalConversation();
        MultiModalMessage systemMsg = MultiModalMessage.builder()
                .role(Role.SYSTEM.getValue())
                .content(Arrays.asList(Collections.singletonMap("text", "You are a helpful assistant.")))
                .build();
        MultiModalMessage userMsg = MultiModalMessage.builder()
                .role(Role.USER.getValue())
                .content(Arrays.asList(Collections.singletonMap("text", "明天杭州什么天气？")))
                .build();
        MultiModalConversationParam param = MultiModalConversationParam.builder()
                // 若没有配置环境变量，请用百炼API Key将下行替换为：.apiKey("sk-xxx")
                .apiKey(System.getenv("DASHSCOPE_API_KEY"))
                // 此处以qwen3.8-max为例，可按需更换模型名称。模型列表：https://help.aliyun.com/zh/model-studio/getting-started/models
                .model("qwen3.8-max")
                .messages(Arrays.asList(systemMsg, userMsg))
                .enableSearch(true)
                .build();
        return conv.call(param);
    }
    public static void main(String[] args) {
        try {
            MultiModalConversationResult result = callWithMessage();
            System.out.println(JsonUtils.toJson(result));
        } catch (ApiException | NoApiKeyException | InputRequiredException e) {
            // 使用日志框架记录异常信息
            System.err.println("An error occurred while calling the generation service: " + e.getMessage());
        }
        System.exit(0);
    }
}
</code></pre></div><input id="fig-code-group-6-curl-tab" type="radio" name="check-fig-code-group-6"><label for="fig-code-group-6-curl-tab">curl</label><div class="codeblock-item"><pre data-tag="codeblock" id="code-code-group-6-curl" outputclass="language-bash" code-type="xCode" class="pre codeblock language-bash"><code>curl -X POST https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation \
-H "Authorization: Bearer $DASHSCOPE_API_KEY" \
-H "Content-Type: application/json" \
-d '{
    "model": "qwen3.8-max",
    "input":{
        "messages":[
            {
                "role": "system",
                "content": [{"text": "You are a helpful assistant."}]
            },
            {
                "role": "user",
                "content": [{"text": "明天杭州天气如何？"}]
            }
        ]
    },
    "parameters": {
        "enable_search": true,
        "result_format": "message"
    }
}'
</code></pre></div></div></section><section id="工具调用" class="section"><h4 id="工具调用-h4">工具调用</h4><blockquote><p>完整的Function Calling 流程代码请参见<a href="/zh/model-studio/qwen-function-calling">Function Calling</a>。</p></blockquote><div outputclass="tabbed-codeblock" data-tag="fig" id="fig-code-group-7" class="tabbed-codeblock-box"><div class="tab-box"></div><input id="fig-code-group-7-python-tab" type="radio" name="check-fig-code-group-7" checked=""><label for="fig-code-group-7-python-tab">Python</label><div class="codeblock-item"><pre data-tag="codeblock" id="code-code-group-7-python" outputclass="language-python" code-type="xCode" class="pre codeblock language-python"><code>import os
import dashscope
dashscope.base_http_api_url = "https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/api/v1"

tools = [
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
                    "location": {
                        "type": "string",
                        "description": "城市或县区，比如北京市、杭州市、余杭区等。"
                    }
                }
            },
            "required": [
                "location"
            ]
        }
    }
]
messages = [{"role": "user", "content": [{"text": "杭州天气怎么样"}]}]
response = dashscope.MultiModalConversation.call(
    # 若没有配置环境变量，请用百炼API Key将下行替换为：api_key="sk-xxx"
    api_key=os.getenv('DASHSCOPE_API_KEY'),
    model='qwen3.8-max',  # 此处以qwen3.8-max为例，可按需更换模型名称。模型列表：https://help.aliyun.com/zh/model-studio/getting-started/models
    messages=messages,
    tools=tools,
)
print(response)
</code></pre></div><input id="fig-code-group-7-java-tab" type="radio" name="check-fig-code-group-7"><label for="fig-code-group-7-java-tab">Java</label><div class="codeblock-item"><pre data-tag="codeblock" id="code-code-group-7-java" outputclass="language-java" code-type="xCode" class="pre codeblock language-java"><code>import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import com.alibaba.dashscope.aigc.conversation.ConversationParam.ResultFormat;
import com.alibaba.dashscope.aigc.multimodalconversation.MultiModalConversation;
import com.alibaba.dashscope.aigc.multimodalconversation.MultiModalConversationParam;
import com.alibaba.dashscope.aigc.multimodalconversation.MultiModalConversationResult;
import com.alibaba.dashscope.common.MultiModalMessage;
import java.util.Collections;
import com.alibaba.dashscope.common.Role;
import com.alibaba.dashscope.exception.ApiException;
import com.alibaba.dashscope.exception.InputRequiredException;
import com.alibaba.dashscope.exception.NoApiKeyException;
import com.alibaba.dashscope.tools.FunctionDefinition;
import com.alibaba.dashscope.tools.ToolFunction;
import com.alibaba.dashscope.utils.JsonUtils;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.github.victools.jsonschema.generator.Option;
import com.github.victools.jsonschema.generator.OptionPreset;
import com.github.victools.jsonschema.generator.SchemaGenerator;
import com.github.victools.jsonschema.generator.SchemaGeneratorConfig;
import com.github.victools.jsonschema.generator.SchemaGeneratorConfigBuilder;
import com.github.victools.jsonschema.generator.SchemaVersion;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import com.alibaba.dashscope.utils.Constants;

public class Main {
    static {Constants.baseHttpApiUrl="https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/api/v1";}
    public class GetWeatherTool {
        private String location;
        public GetWeatherTool(String location) {
            this.location = location;
        }
        public String call() {
            return location+"今天是晴天";
        }
    }
    public class GetTimeTool {
        public GetTimeTool() {
        }
        public String call() {
            LocalDateTime now = LocalDateTime.now();
            DateTimeFormatter formatter = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
            String currentTime = "当前时间：" + now.format(formatter) + "。";
            return currentTime;
        }
    }
    public static void SelectTool()
            throws NoApiKeyException, ApiException, InputRequiredException {
        SchemaGeneratorConfigBuilder configBuilder =
                new SchemaGeneratorConfigBuilder(SchemaVersion.DRAFT_2020_12, OptionPreset.PLAIN_JSON);
        SchemaGeneratorConfig config = configBuilder.with(Option.EXTRA_OPEN_API_FORMAT_VALUES)
                .without(Option.FLATTENED_ENUMS_FROM_TOSTRING).build();
        SchemaGenerator generator = new SchemaGenerator(config);
        ObjectNode jsonSchema_weather = generator.generateSchema(GetWeatherTool.class);
        ObjectNode jsonSchema_time = generator.generateSchema(GetTimeTool.class);
        FunctionDefinition fdWeather = FunctionDefinition.builder().name("get_current_weather").description("获取指定地区的天气")
                .parameters(JsonUtils.parseString(jsonSchema_weather.toString()).getAsJsonObject()).build();
        FunctionDefinition fdTime = FunctionDefinition.builder().name("get_current_time").description("获取当前时刻的时间")
                .parameters(JsonUtils.parseString(jsonSchema_time.toString()).getAsJsonObject()).build();
        MultiModalMessage systemMsg = MultiModalMessage.builder().role(Role.SYSTEM.getValue())
                .content(Arrays.asList(Collections.singletonMap("text", "You are a helpful assistant. When asked a question, use tools wherever possible.")))
                .build();
        MultiModalMessage userMsg = MultiModalMessage.builder().role(Role.USER.getValue()).content(Arrays.asList(Collections.singletonMap("text", "杭州天气"))).build();
        List&lt;MultiModalMessage&gt; messages = new ArrayList&lt;&gt;();
        messages.addAll(Arrays.asList(systemMsg, userMsg));
        MultiModalConversationParam param = MultiModalConversationParam.builder()
                // 若没有配置环境变量，请用百炼API Key将下行替换为：.apiKey("sk-xxx")
                .apiKey(System.getenv("DASHSCOPE_API_KEY"))
                // 此处以qwen3.8-max为例，可按需更换模型名称。模型列表：https://help.aliyun.com/zh/model-studio/getting-started/models
                .model("qwen3.8-max")
                .messages(messages)
                .tools(Arrays.asList(
                        ToolFunction.builder().function(fdWeather).build(),
                        ToolFunction.builder().function(fdTime).build()))
                .build();
        MultiModalConversation conv = new MultiModalConversation();
        MultiModalConversationResult result = conv.call(param);
        System.out.println(JsonUtils.toJson(result));
    }
    public static void main(String[] args) {
        try {
            SelectTool();
        } catch (ApiException | NoApiKeyException | InputRequiredException e) {
            System.out.println(String.format("Exception %s", e.getMessage()));
        }
        System.exit(0);
    }
}
</code></pre></div><input id="fig-code-group-7-curl-tab" type="radio" name="check-fig-code-group-7"><label for="fig-code-group-7-curl-tab">curl</label><div class="codeblock-item"><pre data-tag="codeblock" id="code-code-group-7-curl" outputclass="language-bash" code-type="xCode" class="pre codeblock language-bash"><code>curl --location "https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation" \
--header "Authorization: Bearer $DASHSCOPE_API_KEY" \
--header "Content-Type: application/json" \
--data '{
    "model": "qwen3.8-max",
    "input": {
        "messages": [{
            "role": "user",
            "content": [{"text": "杭州天气怎么样"}]
        }]
    },
    "parameters": {
        "result_format": "message",
        "tools": [{
            "type": "function",
            "function": {
                "name": "get_current_time",
                "description": "当你想知道现在的时间时非常有用。",
                "parameters": {}
            }
        },{
            "type": "function",
            "function": {
                "name": "get_current_weather",
                "description": "当你想查询指定城市的天气时非常有用。",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "location": {
                            "type": "string",
                            "description": "城市或县区，比如北京市、杭州市、余杭区等。"
                        }
                    }
                },
                "required": ["location"]
            }
        }]
    }
}'
</code></pre></div></div></section><section id="异步调用" class="section"><h4 id="异步调用-h4">异步调用</h4><pre data-tag="codeblock" id="code-block-25" outputclass="language-python" code-type="xCode" class="pre codeblock language-python"><code># 您的Dashscope Python SDK版本需要不低于 1.19.0。
import asyncio
import platform
import os
from dashscope.aigc.multimodal_conversation import AioMultiModalConversation

async def main():
    response = await AioMultiModalConversation.call(
        # 若没有配置环境变量，请用百炼API Key将下行替换为：api_key="sk-xxx"
        api_key=os.getenv('DASHSCOPE_API_KEY'),
        model="qwen3.8-max",  # 此处以qwen3.8-max为例，可按需更换模型名称。模型列表：https://help.aliyun.com/zh/model-studio/getting-started/models
        messages=[{"role": "user", "content": [{"text": "你是谁"}]}],
    )
    print(response)

if platform.system() == "Windows":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
asyncio.run(main())
</code></pre></section><section id="文档理解" class="section"><h4 id="文档理解-h4">文档理解</h4><section data-tag="tabbed-content-box" outputclass="tabbed-content-box" id="sec-tabs-11" class="tabbed-content-box section"><section id="python-2" class="section"><h4 id="python-2-h4">Python</h4><pre data-tag="codeblock" id="code-block-26" outputclass="language-python" code-type="xCode" class="pre codeblock language-python"><code>import os
import dashscope
dashscope.base_http_api_url = "https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/api/v1"

messages = [
        {'role': 'system', 'content': 'you are a helpful assisstant'},
        # 请将 '{FILE_ID}'替换为您实际对话场景所使用的 fileid
        {'role':'system','content':f'fileid://{FILE_ID}'},
        {'role': 'user', 'content': '这篇文章讲了什么'}]
response = dashscope.Generation.call(
    # 若没有配置环境变量，请用百炼API Key将下行替换为：api_key="sk-xxx"
    api_key=os.getenv('DASHSCOPE_API_KEY'),
    model="qwen-long",
    messages=messages,
    result_format="message",
)
print(response)
</code></pre></section><section id="java-2" class="section"><h4 id="java-2-h4">Java</h4><pre data-tag="codeblock" id="code-block-27" outputclass="language-java" code-type="xCode" class="pre codeblock language-java"><code>import java.util.Arrays;
import com.alibaba.dashscope.aigc.generation.Generation;
import com.alibaba.dashscope.aigc.generation.GenerationParam;
import com.alibaba.dashscope.aigc.generation.GenerationResult;
import com.alibaba.dashscope.common.Message;
import com.alibaba.dashscope.common.Role;
import com.alibaba.dashscope.exception.ApiException;
import com.alibaba.dashscope.exception.InputRequiredException;
import com.alibaba.dashscope.exception.NoApiKeyException;
import com.alibaba.dashscope.utils.JsonUtils;
import com.alibaba.dashscope.utils.Constants;

public class Main {
    static {Constants.baseHttpApiUrl="https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/api/v1";}

    public static GenerationResult callWithFile() throws ApiException, NoApiKeyException, InputRequiredException {
        Generation gen = new Generation();

        Message systemMsg = Message.builder()
                .role(Role.SYSTEM.getValue())
                .content("you are a helpful assistant")
                .build();

        Message fileSystemMsg = Message.builder()
                .role(Role.SYSTEM.getValue())
                // 请将 '{FILE_ID}'替换为您实际对话场景所使用的 file-id
                .content("fileid://{FILE_ID}")
                .build();

        Message userMsg = Message.builder()
                .role(Role.USER.getValue())
                .content("这篇文章讲了什么")
                .build();

        GenerationParam param = GenerationParam.builder()
                // 若没有配置环境变量，请用百炼API Key将下行替换为：.apiKey("sk-xxx")
                .apiKey(System.getenv("DASHSCOPE_API_KEY"))
                .model("qwen-long")
                .messages(Arrays.asList(systemMsg, fileSystemMsg, userMsg))
                .resultFormat(GenerationParam.ResultFormat.MESSAGE)
                .build();

        return gen.call(param);
    }

    public static void main(String[] args) {
        try {
            GenerationResult result = callWithFile();
            System.out.println(JsonUtils.toJson(result));
        } catch (ApiException | NoApiKeyException | InputRequiredException e) {
            System.err.println("调用 DashScope API 出错: " + e.getMessage());
            e.printStackTrace();
        }
    }
}
</code></pre></section><section id="curl-2" class="section"><h4 id="curl-2-h4">curl</h4><blockquote><p>请将 {FILE_ID}替换为您实际对话场景所使用的 file-id</p></blockquote><pre data-tag="codeblock" id="code-block-28" outputclass="language-bash" code-type="xCode" class="pre codeblock language-bash"><code>curl --location "https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/api/v1/services/aigc/text-generation/generation" \
--header "Authorization: Bearer $DASHSCOPE_API_KEY" \
--header "Content-Type: application/json" \
--data '{
    "model": "qwen-long",
    "input":{
        "messages":[
            {
                "role": "system",
                "content": "You are a helpful assistant."
            },
            {
                "role": "system",
                "content": "fileid://{FILE_ID}"
            },
            {
                "role": "user",
                "content": "这篇文章讲了什么？"
            }
        ]
    },
    "parameters": {
        "result_format": "message"
    }
}'
</code></pre></section></section></section><section id="ppt生成" class="section"><h4 id="ppt生成-h4">PPT生成</h4><blockquote><p>PPT生成功能仅<code>qwen-doc-turbo</code>模型支持。详细用法请参见<a href="/zh/model-studio/data-mining-qwen-doc#f6a7b8c9d0pp1">生成PPT</a>。</p></blockquote><div outputclass="tabbed-codeblock" data-tag="fig" id="fig-code-group-8" class="tabbed-codeblock-box"><div class="tab-box"></div><input id="fig-code-group-8-python-tab" type="radio" name="check-fig-code-group-8" checked=""><label for="fig-code-group-8-python-tab">Python</label><div class="codeblock-item"><pre data-tag="codeblock" id="code-code-group-8-python" outputclass="language-python" code-type="xCode" class="pre codeblock language-python"><code>import os
import dashscope
dashscope.base_http_api_url = "https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/api/v1"

response = dashscope.Generation.call(
    api_key=os.getenv('DASHSCOPE_API_KEY'),
    model='qwen-doc-turbo',
    messages=[
        {"role": "system", "content": "you are a helpful assistant."},
        {"role": "system", "content": "您的文档内容"},
        {"role": "user", "content": "生成一个10到20页的ppt"}
    ],
    result_format="message",
    skill=[{"type": "ppt", "mode": "general", "template_id": "news_01"}]
)
try:
    if response.status_code == 200:
        print(response.output.choices[0].message.content)
    else:
        print(f"请求失败，状态码: {response.status_code}")
        print(f"错误信息: {response.message}")
        print("请参考文档：https://help.aliyun.com/zh/model-studio/developer-reference/error-code")
except Exception as e:
    print(f"发生错误: {e}")
    print("请参考文档：https://help.aliyun.com/zh/model-studio/developer-reference/error-code")
</code></pre></div><input id="fig-code-group-8-curl-tab" type="radio" name="check-fig-code-group-8"><label for="fig-code-group-8-curl-tab">curl</label><div class="codeblock-item"><pre data-tag="codeblock" id="code-code-group-8-curl" outputclass="language-bash" code-type="xCode" class="pre codeblock language-bash"><code>curl --location 'https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/api/v1/services/aigc/text-generation/generation' \
--header 'Content-Type: application/json' \
--header 'Authorization: Bearer $DASHSCOPE_API_KEY' \
--header 'X-DashScope-SSE: enable' \
--data '{
    "model": "qwen-doc-turbo",
    "input": {
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
        ]
    },
    "parameters": {
        "skill": [
            {
                "type": "ppt",
                "mode": "general",
                "template_id": "news_01"
            }
        ]
    }
}'
</code></pre></div></div></section></section></td></tr></tbody></table>

<table bordertype="no-border"><colgroup><col style="width:56.84%"><col style="width:43.16%"></colgroup><tbody><tr><td><h2>chat响应对象（流式与非流式输出格式一致）<span id="0e1c44902ea1e"></span></h2><p><strong>status_code</strong><code>string</code></p><p>本次请求的状态码。200 表示请求成功，否则表示请求失败。</p><blockquote><p>Java SDK不会返回该参数。调用失败会抛出异常，异常信息为<strong>status_code</strong>和<strong>message</strong>的内容。</p></blockquote><p><strong>request_id</strong><code>string</code></p><p>本次调用的唯一标识符。</p><blockquote><p>Java SDK返回参数为<strong>requestId。</strong></p></blockquote><p><strong>code</strong><code>string</code></p><p>错误码，调用成功时为空值。</p><blockquote><p>只有Python SDK返回该参数。</p></blockquote><p><strong>output</strong><code>object</code></p><p>调用结果信息。</p><section class="collapse" id="accordion-属性-14"><p>属性</p><div><p><strong>text</strong><code>string</code></p><p>模型生成的回复。当设置输入参数<strong>result_format</strong>为<strong>text</strong>时将回复内容返回到该字段。</p><p><strong>finish_reason</strong><code>string</code></p><p>当设置输入参数<strong>result_format</strong>为<strong>text</strong>时该参数不为空。</p><p>有四种情况：</p><ul><li>正在生成时为null；</li><li>因模型输出自然结束，或触发输入参数中的stop条件而结束时为stop；</li><li>因生成长度过长而结束为length；</li><li>因发生工具调用为tool_calls。</li></ul><p><strong>choices</strong><code>array</code></p><p>模型的输出信息。当result_format为message时返回choices参数。</p><section class="collapse" id="accordion-属性-15"><p>属性</p><div><p><strong>finish_reason</strong><code>string</code></p><p>有四种情况：</p><ul><li>正在生成时为null；</li><li>因模型输出自然结束，或触发输入参数中的stop条件而结束时为stop；</li><li>因生成长度过长而结束为length；</li><li>因发生工具调用为tool_calls。</li></ul><p><strong>message</strong><code>object</code></p><p>模型输出的消息对象。</p><section class="collapse" id="accordion-属性-16"><p>属性</p><div><p><strong>role</strong><code>string</code></p><p>输出消息的角色，固定为assistant。</p><p><strong>content</strong><code>string或array</code></p><p>输出消息的内容。当使用qwen-vl或qwen-audio系列模型时为<code>array</code>，其余情况为<code>string</code>。</p><blockquote><p>如果发起Function Calling，则该值为空。</p></blockquote><section class="collapse" id="accordion-属性-17"><p>属性</p><div><p><strong>text</strong><code>string</code></p><p>当使用qwen-vl或qwen-audio系列模型时，输出消息的内容。</p><p><strong>image_hw</strong><code>array</code></p><p>当Qwen-VL系列模型启用 vl_enable_image_hw_output 参数时，有两种情况：</p><ul><li>图像输入：返回图像的高度和高度（数值单位：像素）</li><li>视频输入：返回空数组</li></ul></div></section><p><strong>reasoning_content</strong> <code>string</code></p><p>模型的深度思考内容。</p><p><strong>tool_calls</strong><code>array</code></p><p>若模型需要调用工具，则会生成tool_calls参数。</p><section class="collapse" id="accordion-属性-18"><p>属性</p><div><p><strong>function</strong><code>object</code></p><p>调用工具的名称，以及输入参数。</p><section class="collapse" id="accordion-属性-19"><p>属性</p><div><p><strong>name</strong><code>string</code></p><p>调用工具的名称</p><p><strong>arguments</strong><code>string</code></p><p>需要输入到工具中的参数，为JSON字符串。</p><blockquote><p>由于大模型响应有一定随机性，输出的JSON字符串并不总满足于您的函数，建议您在将参数输入函数前进行参数的有效性校验。</p></blockquote></div></section><p><strong>index</strong> <code>integer</code></p><p>当前<strong>tool_calls</strong>对象在tool_calls数组中的索引。</p><p><strong>id</strong> <code>string</code></p><p>本次工具响应的ID。</p><p><strong>type</strong> <code>string</code></p><p>工具类型，固定为<code>function</code>。</p></div></section></div></section><p><strong>logprobs</strong><code>object</code></p><p>当前 choices 对象的概率信息。</p><section class="collapse" id="accordion-属性-20"><p>属性</p><div><p><strong>content</strong> <code>array</code></p><p>带有对数概率信息的 Token 数组。</p><section class="collapse" id="accordion-属性-21"><p>属性</p><div><p><strong>token</strong> <code>string</code></p><p>当前 Token。</p><p><strong>bytes</strong> <code>array</code></p><p>当前 Token 的 UTF‑8 原始字节列表，用于精确还原输出内容，在处理表情符号、中文字符时有帮助。</p><p><strong>logprob</strong> <code>float</code></p><p>当前 Token 的对数概率。返回值为 null 表示概率值极低。</p><p><strong>top_logprobs</strong> <code>array</code></p><p>当前 Token 位置最可能的若干个 Token 及其对数概率，元素个数与入参的<code>top_logprobs</code>保持一致。</p><section class="collapse" id="accordion-属性-22"><p>属性</p><div><p><strong>token</strong> <code>string</code></p><p>当前 Token。</p><p><strong>bytes</strong> <code>array</code></p><p>当前 Token 的 UTF‑8 原始字节列表，用于精确还原输出内容，在处理表情符号、中文字符时有帮助。</p><p><strong>logprob</strong> <code>float</code></p><p>当前 Token 的对数概率。返回值为 null 表示概率值极低。</p></div></section></div></section></div></section></div></section><p><strong>search_info</strong><code>object</code></p><p>联网搜索到的信息，在设置<code>search_options</code>参数后会返回该参数。</p><section class="collapse" id="accordion-属性-23"><p>属性</p><div><p><strong>search_results</strong><code>array</code></p><p>联网搜索到的结果。</p><section class="collapse" id="accordion-属性-24"><p>属性</p><div><p><strong>site_name</strong><code>string</code></p><p>搜索结果来源的网站名称。</p><p><strong>icon</strong><code>string</code></p><p>来源网站的图标URL，如果没有图标则为空字符串。</p><p><strong>index</strong><code>integer</code></p><p>搜索结果的序号，表示该搜索结果在<code>search_results</code>中的索引。</p><p><strong>title</strong><code>string</code></p><p>搜索结果的标题。</p><p><strong>url</strong><code>string</code></p><p>搜索结果的链接地址。</p></div></section><p><strong>extra_tool_info</strong><code>array</code></p><p>开启<code>enable_search_extension</code>参数后返回的领域增强信息。</p><section class="collapse" id="accordion-属性-25"><p>属性</p><div><p><strong>result</strong><code>string</code></p><p>领域增强工具输出信息。</p><p><strong>tool</strong><code>string</code></p><p>领域增强使用的工具。</p></div></section></div></section></div></section><p><strong>usage</strong><code>map</code></p><p>本次chat请求使用的Token信息。</p><section class="collapse" id="accordion-属性-26"><p>属性</p><div><p><strong>input_tokens</strong> <code>integer</code></p><p>用户输入内容转换成Token后的长度。<a href="/zh/model-studio/text-generation#e710782c79xqy">补充说明</a></p><p><strong>output_tokens</strong> <code>integer</code></p><p>模型输出内容转换成Token后的长度。</p><p><strong>input_tokens_details</strong> <code>object</code>（可选）</p><p>输入内容转换成 Token 后的长度详情。</p><section class="collapse" id="accordion-属性-27"><p>属性</p><div><p><strong>text_tokens</strong> <code>integer</code>（可选）</p><p>输入的文本转换为 Token 后的长度。</p><p><strong>image_tokens</strong> <code>integer</code>（可选）</p><p>输入的图像转换为Token后的长度。</p><p><strong>video_tokens</strong> <code>integer</code>（可选）</p><p>输入的视频文件或图像列表转换为Token后的长度。</p></div></section><p><strong>total_tokens</strong> <code>integer</code></p><p>当输入为纯文本时返回该字段，为<strong>input_tokens</strong>与<strong>output_tokens</strong>之和<strong>。</strong></p><p><strong>image_tokens</strong> <code>integer</code></p><p>输入内容包含<code>image</code>时返回该字段。为用户输入图片内容转换成Token后的长度。</p><p><strong>video_tokens</strong> <code>integer</code></p><p>输入内容包含<code>video</code>时返回该字段。为用户输入视频内容转换成Token后的长度。</p><p><strong>audio_tokens</strong> <code>integer</code></p><p>输入内容包含<code>audio</code>时返回该字段。为用户输入音频内容转换成Token后的长度。</p><p><strong>output_tokens_details</strong> <code>object</code>（可选）</p><p>输出内容转换成 Token 后的长度详情。部分模型返回该字段。</p><section class="collapse" id="accordion-属性-28"><p>属性</p><div><p><strong>text_tokens</strong> <code>integer</code>（可选）</p><p>输出的文本转换为Token后的长度。</p><p><strong>reasoning_tokens</strong> <code>integer</code>（可选）</p><p>思考过程转换为Token后的长度。仅推理模型返回该字段。</p><p><strong>audio_tokens</strong> <code>integer</code>（可选）</p><p>输出的音频转换为 Token 后的长度。仅音频输出模型返回该字段。</p></div></section><p><strong>prompt_tokens_details</strong> <code>object</code></p><p>输入 Token 的细粒度分类。</p><section class="collapse" id="accordion-属性-29"><p>属性</p><div><p><strong>cached_tokens</strong> <code>integer</code></p><p>命中 Cache 的 Token 数。Context Cache 详情请参见<a href="/zh/model-studio/context-cache">上下文缓存</a>。</p><p><strong>cache_creation</strong> <code>object</code></p><p><a href="/zh/model-studio/context-cache#825f201c5fy6o">显式缓存</a>创建信息。</p><section class="collapse" id="accordion-属性-30"><p>属性</p><div><p><strong>ephemeral_5m_input_tokens</strong> <code>integer</code></p><p>用于创建5分钟有效期显式缓存的 Token 长度。</p></div></section><p><strong>cache_creation_input_tokens</strong> <code>integer</code></p><p>用于创建显式缓存的 Token 长度。</p><p><strong>cache_type</strong> <code>string</code></p><p>使用<a href="/zh/model-studio/context-cache#825f201c5fy6o">显式缓存</a>时，参数值为<code>ephemeral</code>，否则该参数不存在。</p></div></section></div></section></td><td><pre data-tag="codeblock" id="code-block-29" outputclass="language-json" code-type="xCode" class="pre codeblock language-json"><code>{
  "status_code": 200,
  "request_id": "902fee3b-f7f0-9a8c-96a1-6b4ea25af114",
  "code": "",
  "message": "",
  "output": {
    "text": null,
    "finish_reason": null,
    "choices": [
      {
        "finish_reason": "stop",
        "message": {
          "role": "assistant",
          "content": "我是阿里云开发的一款超大规模语言模型，我叫千问。"
        }
      }
    ]
  },
  "usage": {
    "input_tokens": 22,
    "output_tokens": 17,
    "total_tokens": 39
  }
}
</code></pre></td></tr></tbody></table>

## 错误码

如果模型调用失败并返回报错信息，请参见[错误码](/zh/model-studio/error-code)进行解决。
