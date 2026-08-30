本文介绍Qwen-Audio-3.0-ASR-Flash/Fun-ASR-Flash非实时语音识别HTTP API的参数和接口细节。

**用户指南：**[非实时语音识别](/zh/model-studio/non-realtime-speech-recognition-user-guide)。关于支持的音频格式、文件大小限制、时长限制等输入要求，请参见[音频规格](/zh/model-studio/asr-model#asr_audio_spec02)。

**重要**该功能不支持SDK调用。

## 接口地址

#### 华北2（北京）

`POST https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation`

调用时请将`{WorkspaceId}`替换为真实的[Workspace ID](/zh/model-studio/obtain-the-app-id-and-workspace-id#732535cfc959h)。

#### 新加坡

`POST https://{WorkspaceId}.ap-southeast-1.maas.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation`

调用时请将`{WorkspaceId}`替换为真实的[Workspace ID](/zh/model-studio/obtain-the-app-id-and-workspace-id#732535cfc959h)。

**重要**阿里云百炼为华北2（北京）、新加坡地域推出了业务空间专属域名，能够为推理请求提供卓越的性能和更高的稳定性，建议迁移至新域名：

-   华北2（北京）地域：从 `dashscope.aliyuncs.com` 迁移至 `{WorkspaceId}.cn-beijing.maas.aliyuncs.com`
-   新加坡地域：从 `dashscope-intl.aliyuncs.com` 迁移至 `{WorkspaceId}.ap-southeast-1.maas.aliyuncs.com`

`{WorkspaceId}`需要替换为真实的[Workspace ID](/zh/model-studio/obtain-the-app-id-and-workspace-id#732535cfc959h)。现有域名仍可正常使用。

## 请求头

| 
**参数**

 | 

**类型**

 | 

**是否必选**

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

鉴权令牌，格式为`Bearer <your_api_key>`，使用时将"`<your_api_key>`"替换为实际的API Key。

 |
| 

Content-Type

 | 

string

 | 

是

 | 

请求参数的媒体类型，固定为`application/json`。

 |
| 

X-DashScope-SSE

 | 

string

 | 

是

 | 

用于控制是否以SSE流式方式返回结果。设置为`enable`时开启SSE流式返回模式。仅当音频时长不少于1分钟时，服务端才会分多次返回中间识别结果和最终结果；设置为`disable`或不传该参数则仅返回最终结果。

 |

<table bordertype="no-border"><colgroup><col style="width:56.98%"><col style="width:43.02%"></colgroup><tbody><tr><td><h2>请求参数<span id="h-fl-rq"></span></h2><p><strong>model</strong><code>string</code><strong>（必选）</strong></p><p>指定模型名。支持Qwen-Audio-3.0-ASR-Flash和Fun-ASR-Flash系列模型，详情请参见<a href="/zh/model-studio/non-realtime-speech-recognition-user-guide#4a43cc1bb7kxg">支持的模型与地域</a>。</p><p><strong>input</strong><code>object</code><strong>（必选）</strong></p><p>输入信息。</p><section class="collapse expanded" id="accordion-属性"><p>属性</p><div><p><strong>messages</strong><code>array(object)</code><strong>（必选）</strong></p><p>消息列表。包含当前待识别的音频，以及可选的对话上下文（用于提升识别效果）。</p><div class="note note-important"><div class="note-icon-wrapper"></div><div class="note-content"><p><strong>重要</strong>上下文功能用于提升专有词汇的识别准确率，使用方法详见<a href="/zh/model-studio/improve-asr-accuracy#ctx_enhance_h2">上下文增强</a>。</p><p><strong>约束</strong>：上下文消息（<code>input_text</code> 和 <code>text</code> 类型）各最多 5 条，超出时保留最近的 5 条。每轮上下文文本总长度（<code>user</code> 和 <code>assistant</code> 的 <code>text</code> 字段长度之和）不超过 400 个字符（按字符数计算，每个字符计为 1），超出部分从末尾截断。</p></div></div><div class="note note-important"><div class="note-icon-wrapper"></div><div class="note-content"><p><strong>重要</strong>携带上下文时，<code>messages</code> 中的消息顺序有要求：上下文消息必须按对话轮次排列，每轮中 <code>user</code>（<code>input_text</code> 类型）必须在对应的 <code>assistant</code>（<code>text</code> 类型）之前；包含 <code>input_audio</code> 的 <code>user</code> 消息必须放在 <code>messages</code> 数组的最后。</p></div></div><section class="collapse expanded" id="accordion-属性-2"><p>属性</p><div><p><strong>role</strong><code>string</code><strong>（必选）</strong></p><p>消息角色。取值范围：</p><ul><li><code>user</code>（必选）：用户消息。type为<code>input_audio</code>时表示当前待识别的音频；type为<code>input_text</code>时表示前几轮的识别结果或领域相关的词表（可选，上下文）。</li><li><code>assistant</code>（可选，上下文）：前几轮大语言模型的回复内容。</li></ul><p><strong>content</strong><code>array(object)</code><strong>（必选）</strong></p><p>消息内容列表。</p><section class="collapse expanded" id="accordion-属性-3"><p>属性</p><div><p><strong>type</strong><code>string</code><strong>（必选）</strong></p><p>内容类型。每个请求至少需要一条<code>input_audio</code>类型的消息。取值范围：</p><ul><li><code>input_audio</code>（必选）：当前待识别的音频输入（role为user），需同时传入<code>input_audio</code>对象。</li><li><code>input_text</code>（可选，上下文）：前几轮用户语音的识别结果或领域相关的词表（role为user），需同时传入<code>text</code>字段。</li><li><code>text</code>（可选，上下文）：前几轮大语言模型的回复内容（role为assistant），需同时传入<code>text</code>字段。</li></ul><p><strong>input_audio</strong><code>object</code><strong>（条件必选）</strong></p><p>当<code>type</code>为<code>input_audio</code>时必填。</p><section class="collapse expanded" id="accordion-属性-4"><p>属性</p><div><p><strong>data</strong><code>string</code><strong>（必选）</strong></p><p>待识别音频数据。关于支持的音频格式、文件大小限制、时长限制等输入要求，请参见<a href="/zh/model-studio/asr-model#asr_audio_spec02">音频规格</a>。支持以下两种方式：</p><ul><li><strong>音频文件URL</strong>：直接传入可公开访问的音频文件地址。</li><li><strong>Base64 Data URI</strong>：采用Data URI格式传入Base64编码的音频数据，值由<code>data:{MIME_TYPE};base64,</code>前缀与Base64编码的音频数据拼接而成。支持的MIME类型包括<code>audio/wav</code>、<code>audio/mp3</code>等。</li></ul><p>示例（URL方式）：<code>https://example.com/audio/sample.wav</code></p><p>示例（Base64方式）：<code>data:audio/wav;base64,{BASE64_ENCODED_DATA}</code></p></div></section><p><strong>text</strong><code>string</code><strong>（条件必选）</strong></p><p>当<code>type</code>为<code>input_text</code>时，填入前几轮用户语音的识别结果或领域相关的词表；当<code>type</code>为<code>text</code>时，填入前几轮大语言模型的回复内容。文本按字符数计算，每个字符计为 1。每轮上下文中所有消息的 <code>text</code> 字段长度之和不超过 400 个字符，超出部分从末尾截断。</p></div></section></div></section></div></section><p><strong>parameters</strong><code>object</code><strong>（必选）</strong></p><p>模型参数。</p><div class="note note-note"><div class="note-icon-wrapper"></div><div class="note-content"><p><strong>说明</strong>润色顺滑功能默认关闭，<strong>暂未开放。</strong></p><p>润色顺滑：模型在识别语音的同时，自动清理无意义语气词和口吃重复，处理说话过程中的自我纠正，理顺口语表达，并规范标点与文本格式。输出结果更加简洁、流畅、易读，同时尽可能保留用户的最终意图和关键信息。</p></div></div><section class="collapse expanded" id="accordion-属性-5"><p>属性</p><div><p><strong>format</strong><code>string</code><strong>（必选）</strong></p><p>音频格式。根据实际音频格式填写，支持<code>wav</code>、<code>mp3</code>、<code>opus</code>等。详情请参见<a href="/zh/model-studio/asr-model#asr_audio_spec02">音频规格</a>。</p><p><strong>sample_rate</strong><code>string</code>（可选）</p><p>音频采样率，单位Hz。例如<code>16000</code>表示16kHz采样率。详情请参见<a href="/zh/model-studio/asr-model#asr_audio_spec02">音频规格</a>。</p><p><strong>vocabulary_id</strong><code>string</code>（可选）</p><p>预编译热词列表 ID。</p><p>需预先调用创建热词列表接口生成，识别时传入该 ID 即可使用列表中的热词。</p><p>适用于词汇已知且相对稳定、需要跨请求复用同一词表的场景。</p><p>使用方法请参见<a href="/zh/model-studio/improve-asr-accuracy#hw_precompiled_h3">预编译热词</a>。</p><p><strong>vocabulary</strong><code>object</code>（可选）</p><p>即时热词。</p><p>以键值对形式传入，键为热词文本（<code>string</code>），值为热词权重（<code>integer</code>），无需预先创建热词列表。权重取值范围为 [1, 5] 或 50：取 [1, 5] 时值越大模型越倾向输出该词；取 50 时为超级热词，召回率大幅提升，但超级热词数量最多不超过 50 个。</p><p>适用于临时性、会话级别的热词优化。</p><p>与预编译热词同时配置时，仅即时热词生效。使用方法请参见<a href="/zh/model-studio/improve-asr-accuracy#hw_instant_h3">即时热词</a>。</p><div class="note note-important"><div class="note-icon-wrapper"></div><div class="note-content"><p><strong>重要</strong>仅<code>qwen-audio-3.0-asr-flash</code>支持即时热词。</p></div></div><p><strong>language_hints</strong> <code>array[string]</code>（可选）</p><p>设置待识别语言代码。如果无法提前确定语种，可不设置，模型会自动识别语种。</p><p>对于 Qwen-Audio-3.0-ASR-Flash 系列模型，最多支持设置 4 个值，即便设置超出 4 个，也仅前 4 个生效；对于 Fun-ASR-Flash 系列模型，仅支持设置 1 个值，即便设置多个，也仅第一个生效。</p><section class="collapse" id="accordion-点击查看支持的语言代码"><p>点击查看支持的语言代码</p><div><ul><li><p>qwen-audio-3.0-asr-flash、fun-asr-flash-2026-06-15：</p><ul><li>zh: 中文</li><li>en: 英文</li><li>ja: 日语</li><li>ko：韩语</li><li>vi：越南语</li><li>th：泰语</li><li>id：印尼语</li><li>ms：马来语</li><li>tl：菲律宾语</li><li>hi：印地语</li><li>ar：阿拉伯语</li><li>fr：法语</li><li>de：德语</li><li>es：西班牙语</li><li>pt：葡萄牙语</li><li>ru：俄语</li><li>it：意大利语</li><li>nl：荷兰语</li><li>sv：瑞典语</li><li>da：丹麦语</li><li>fi：芬兰语</li><li>no：挪威语</li><li>el：希腊语</li><li>pl：波兰语</li><li>cs：捷克语</li><li>hu：匈牙利语</li><li>ro：罗马尼亚语</li><li>bg：保加利亚语</li><li>hr：克罗地亚语</li><li>sk：斯洛伐克语</li></ul></li></ul></div></section></div></section></td><td><p>以下为华北2（北京）地域的配置，调用时请将"{WorkspaceId}"替换为真实的业务空间ID，各地域的配置不同。</p><section data-tag="tabbed-content-box" outputclass="tabbed-content-box" id="sec-tabs-2" class="tabbed-content-box section"><section id="非流式" class="section"><h4 id="非流式-h4">非流式</h4><pre data-tag="codeblock" id="code-block" outputclass="language-bash" code-type="xCode" class="pre codeblock language-bash"><code>curl --location --request POST 'https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation' \
     --header "Authorization: Bearer $DASHSCOPE_API_KEY" \
     --header "Content-Type: application/json" \
     --header "X-DashScope-SSE: disable" \
     --data '{
    "model": "qwen-audio-3.0-asr-flash",
    "input": {
        "messages": [
            {
                "role": "user",
                "content": [
                    {
                        "type": "input_audio",
                        "input_audio": {
                            "data": "{YOUR_AUDIO_URL}"
                        }
                    }
                ]
            }
        ]
    },
    "parameters": {
        "format": "wav",
        "sample_rate": "16000"
    }
}'
</code></pre></section><section id="流式" class="section"><h4 id="流式-h4">流式</h4><pre data-tag="codeblock" id="code-block-2" outputclass="language-bash" code-type="xCode" class="pre codeblock language-bash"><code>curl --location --request POST 'https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation' \
     --header "Authorization: Bearer $DASHSCOPE_API_KEY" \
     --header "Content-Type: application/json" \
     --header "X-DashScope-SSE: enable" \
     --data '{
    "model": "qwen-audio-3.0-asr-flash",
    "input": {
        "messages": [
            {
                "role": "user",
                "content": [
                    {
                        "type": "input_audio",
                        "input_audio": {
                            "data": "{YOUR_AUDIO_URL}"
                        }
                    }
                ]
            }
        ]
    },
    "parameters": {
        "format": "wav",
        "sample_rate": "16000"
    }
}'
</code></pre></section><section id="携带上下文-非流式" class="section"><h4 id="携带上下文-非流式-h4">携带上下文-非流式</h4><pre data-tag="codeblock" id="code-block-3" outputclass="language-bash" code-type="xCode" class="pre codeblock language-bash"><code>curl --location --request POST 'https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation' \
     --header "Authorization: Bearer $DASHSCOPE_API_KEY" \
     --header "Content-Type: application/json" \
     --header "X-DashScope-SSE: disable" \
     --data '{
    "model": "qwen-audio-3.0-asr-flash",
    "input": {
        "messages": [
            {
                "role": "user",
                "content": [
                    {
                        "type": "input_text",
                        "text": "你好啊"
                    }
                ]
            },
            {
                "role": "assistant",
                "content": [
                    {
                        "type": "text",
                        "text": "你好啊，我是通义千问，有什么可以帮助你的？"
                    }
                ]
            },
            {
                "role": "user",
                "content": [
                    {
                        "type": "input_audio",
                        "input_audio": {
                            "data": "{YOUR_AUDIO_URL}"
                        }
                    }
                ]
            }
        ]
    },
    "parameters": {
        "format": "wav",
        "sample_rate": "16000"
    }
}'
</code></pre></section><section id="携带上下文-流式" class="section"><h4 id="携带上下文-流式-h4">携带上下文-流式</h4><pre data-tag="codeblock" id="code-block-4" outputclass="language-bash" code-type="xCode" class="pre codeblock language-bash"><code>curl --location --request POST 'https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation' \
     --header "Authorization: Bearer $DASHSCOPE_API_KEY" \
     --header "Content-Type: application/json" \
     --header "X-DashScope-SSE: enable" \
     --data '{
    "model": "qwen-audio-3.0-asr-flash",
    "input": {
        "messages": [
            {
                "role": "user",
                "content": [
                    {
                        "type": "input_text",
                        "text": "你好啊"
                    }
                ]
            },
            {
                "role": "assistant",
                "content": [
                    {
                        "type": "text",
                        "text": "你好啊，我是通义千问，有什么可以帮助你的？"
                    }
                ]
            },
            {
                "role": "user",
                "content": [
                    {
                        "type": "input_audio",
                        "input_audio": {
                            "data": "{YOUR_AUDIO_URL}"
                        }
                    }
                ]
            }
        ]
    },
    "parameters": {
        "format": "wav",
        "sample_rate": "16000"
    }
}'
</code></pre></section><section id="base64" class="section"><h4 id="base64-h4">Base64</h4><p>可输入Base64编码数据（<a href="https://www.rfc-editor.org/rfc/rfc2397">Data URL</a>），格式为：<code>data:&lt;mediatype&gt;;base64,&lt;data&gt;</code>。</p><ul><li><p><code>&lt;mediatype&gt;</code>：MIME类型</p><p>因音频格式而异，例如：</p><ul><li>WAV：<code>audio/wav</code></li><li>MP3：<code>audio/mpeg</code></li></ul></li><li><p><code>&lt;data&gt;</code>：音频转成的Base64编码的字符串</p><p>Base64编码会增大体积，请控制原文件大小，确保编码后仍符合输入音频大小限制（10MB）</p></li><li><p>示例：<code>data:audio/wav;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4LjI5LjEwMAAAAAAAAAAAAAAA//PAxABQ/BXRbMPe4IQAhl9</code></p><section class="collapse" id="accordion-点击查看示例代码"><p>点击查看示例代码</p><div><div outputclass="tabbed-codeblock" data-tag="fig" id="fig-code-group" class="tabbed-codeblock-box"><div class="tab-box"></div><input id="fig-code-group-python-tab" type="radio" name="check-fig-code-group" checked=""><label for="fig-code-group-python-tab">python</label><div class="codeblock-item"><pre data-tag="codeblock" id="code-code-group-python" outputclass="language-python" code-type="xCode" class="pre codeblock language-python"><code>import base64, pathlib

# 请替换为自己的音频文件路径，确保其符合音频要求
file_path = pathlib.Path("{YOUR_AUDIO_FILE}")
base64_str = base64.b64encode(file_path.read_bytes()).decode()
data_uri = f"data:audio/mpeg;base64,{base64_str}"
</code></pre></div><input id="fig-code-group-java-tab" type="radio" name="check-fig-code-group"><label for="fig-code-group-java-tab">java</label><div class="codeblock-item"><pre data-tag="codeblock" id="code-code-group-java" outputclass="language-java" code-type="xCode" class="pre codeblock language-java"><code>import java.nio.file.*;
import java.util.Base64;

public class Main {
    /**
     * 请替换为自己的音频文件路径，确保其符合音频要求
     */
    public static String toDataUrl(String filePath) throws Exception {
        byte[] bytes = Files.readAllBytes(Paths.get(filePath));
        String encoded = Base64.getEncoder().encodeToString(bytes);
        return "data:audio/mpeg;base64," + encoded;
    }

    public static void main(String[] args) throws Exception {
        System.out.println(toDataUrl("{YOUR_AUDIO_FILE}"));
    }
}
</code></pre></div></div></div></section></li></ul><pre data-tag="codeblock" id="code-block-5" outputclass="language-python" code-type="xCode" class="pre codeblock language-python"><code>import base64, pathlib
import os
import requests

# 请替换为自己的音频文件路径，确保其符合音频要求
file_path = pathlib.Path("{YOUR_AUDIO_FILE}")
base64_str = base64.b64encode(file_path.read_bytes()).decode()
data_uri = f"data:audio/wav;base64,{base64_str}"

url = "https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation"

headers = {
    "Authorization": f"Bearer {os.environ['DASHSCOPE_API_KEY']}",
    "Content-Type": "application/json",
    "X-DashScope-SSE": "disable",
}

payload = {
    "model": "qwen-audio-3.0-asr-flash",
    "input": {
        "messages": [
            {
                "role": "user",
                "content": [
                    {
                        "type": "input_audio",
                        "input_audio": {
                            "data": data_uri,
                        },
                    }
                ],
            }
        ]
    },
    "parameters": {
        "format": "wav",
        "sample_rate": "16000",
    },
}

response = requests.post(url, headers=headers, json=payload)
print(response.status_code)
print(response.json())
</code></pre></section><section id="即时热词" class="section"><h4 id="即时热词-h4">即时热词</h4><pre data-tag="codeblock" id="code-block-6" outputclass="language-bash" code-type="xCode" class="pre codeblock language-bash"><code>curl --location --request POST 'https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation' \
     --header "Authorization: Bearer $DASHSCOPE_API_KEY" \
     --header "Content-Type: application/json" \
     --header "X-DashScope-SSE: disable" \
     --data '{
    "model": "qwen-audio-3.0-asr-flash",
    "input": {
        "messages": [
            {
                "role": "user",
                "content": [
                    {
                        "type": "input_audio",
                        "input_audio": {
                            "data": "{YOUR_AUDIO_URL}"
                        }
                    }
                ]
            }
        ]
    },
    "parameters": {
        "format": "wav",
        "sample_rate": "16000",
        "vocabulary": {"张三": 5, "李四": 5}
    }
}'
</code></pre></section></section></td></tr></tbody></table>

<table bordertype="no-border"><colgroup><col style="width:56.81%"><col style="width:43.19%"></colgroup><tbody><tr><td><h2>响应参数<span id="h-fl-rs"></span></h2><p><strong>request_id</strong><code>string</code></p><p>本次请求的唯一标识。</p><p><strong>output</strong><code>object</code></p><p>输出结果。</p><section class="collapse expanded" id="accordion-属性-6"><p>属性</p><div><p><strong>text</strong><code>string</code></p><p>当前累积的完整识别文本。</p><p><strong>sentence</strong><code>object</code></p><p>当前句子的详细信息。</p><section class="collapse expanded" id="accordion-属性-7"><p>属性</p><div><p><strong>sentence_id</strong><code>integer</code></p><p>句子编号，从1开始。</p><p><strong>sentence_end</strong><code>boolean</code></p><p>是否为该句的最终结果。为<code>true</code>时表示该句识别完成。</p><p><strong>begin_time</strong><code>integer</code></p><p>句子开始时间，单位毫秒。</p><p><strong>end_time</strong><code>integer</code></p><p>句子结束时间，单位毫秒。仅在<code>sentence_end</code>为<code>true</code>时返回。</p><p><strong>text</strong><code>string</code></p><p>当前句子的识别文本。</p><p><strong>channel_id</strong><code>integer</code></p><p>声道编号，从0开始。</p><p><strong>words</strong><code>array</code></p><p>词级别时间戳列表。</p><section class="collapse" id="accordion-属性-8"><p>属性</p><div><p><strong>text</strong><code>string</code></p><p>词文本。</p><p><strong>begin_time</strong><code>integer</code></p><p>词开始时间，单位毫秒。</p><p><strong>end_time</strong><code>integer</code></p><p>词结束时间，单位毫秒。</p><p><strong>punctuation</strong><code>string</code></p><p>词后的标点符号。无标点时为空字符串。</p><p><strong>fixed</strong><code>boolean</code></p><p>词是否已稳定。<code>false</code>表示后续事件中该词的时间戳可能调整。</p></div></section></div></section></div></section><p><strong>usage</strong><code>object</code></p><p>用量信息。仅在<code>sentence_end</code>为<code>true</code>时返回。</p><section class="collapse" id="accordion-属性-9"><p>属性</p><div><p><strong>duration</strong><code>integer</code></p><p>已处理的音频时长，单位秒。</p></div></section></td><td><section data-tag="tabbed-content-box" outputclass="tabbed-content-box" id="sec-tabs-3" class="tabbed-content-box section"><section id="非流式-2" class="section"><h4 id="非流式-2-h4">非流式</h4><pre data-tag="codeblock" id="code-block-7" outputclass="language-json" code-type="xCode" class="pre codeblock language-json"><code>{
    "output": {
        "sentence": {
            "begin_time": 760,
            "channel_id": 0,
            "end_time": 3800,
            "sentence_end": true,
            "sentence_id": 1,
            "text": "Hello World，这里是阿里巴巴语音实验室。",
            "words": [
                {"begin_time": 760, "end_time": 1040, "fixed": true, "punctuation": "", "text": "Hello"},
                {"begin_time": 1040, "end_time": 1240, "fixed": true, "punctuation": "，", "text": " World"},
                {"begin_time": 1360, "end_time": 1880, "fixed": true, "punctuation": "", "text": "这里是"},
                {"begin_time": 1880, "end_time": 2520, "fixed": true, "punctuation": "", "text": "阿里巴巴"},
                {"begin_time": 2520, "end_time": 2840, "fixed": true, "punctuation": "", "text": "语音"},
                {"begin_time": 2840, "end_time": 3800, "fixed": true, "punctuation": "。", "text": "实验室"}
            ]
        },
        "text": "Hello World，这里是阿里巴巴语音实验室。"
    },
    "usage": {
        "duration": 4
    },
    "request_id": "40e0734d-096f-9ae3-86c1-a8c013287561"
}
</code></pre></section><section id="流式-2" class="section"><h4 id="流式-2-h4">流式</h4><p>仅当音频时长不少于1分钟且设置<code>X-DashScope-SSE: enable</code>时，服务端才会以Server-Sent Events协议返回识别结果。SSE事件格式如下：</p><pre data-tag="codeblock" id="code-block-8" code-type="xCode" class="pre codeblock"><code>id:{序列号}
event:result
:HTTP_STATUS/200
data:{JSON数据}
</code></pre><p>返回示例：</p><pre data-tag="codeblock" id="code-block-9" code-type="xCode" class="pre codeblock"><code>id:1
event:result
:HTTP_STATUS/200
data:{"output":{"sentence":{"sentence_id":1,"sentence_end":true,"end_time":3800,"words":[{"end_time":1040,"punctuation":"","begin_time":760,"fixed":true,"text":"Hello"},{"end_time":1240,"punctuation":"，","begin_time":1040,"fixed":true,"text":" World"},{"end_time":1880,"punctuation":"","begin_time":1360,"fixed":true,"text":"这里是"},{"end_time":2520,"punctuation":"","begin_time":1880,"fixed":true,"text":"阿里巴巴"},{"end_time":2840,"punctuation":"","begin_time":2520,"fixed":true,"text":"语音"},{"end_time":3800,"punctuation":"。","begin_time":2840,"fixed":true,"text":"实验室"}],"begin_time":760,"text":"Hello World，这里是阿里巴巴语音实验室。","channel_id":0},"text":"Hello World，这里是阿里巴巴语音实验室。"},"usage":{"duration":4},"request_id":"fc1582e4-935c-9fc2-a482-a98bf43daa69"}
</code></pre></section></section></td></tr></tbody></table>

## SSE 流式结果处理逻辑

在流式模式下，客户端需关注以下处理要点：

1.  每收到一个SSE事件，解析`data`字段中的JSON。
2.  通过`output.sentence.sentence_end`判断当前句子是否结束：当该值为`true`时，该句识别完成，词级时间戳已稳定，可作为最终结果使用；当该值为`false`时，识别仍在进行中，文本和时间戳可能在后续事件中更新。
3.  `usage`信息仅在句子结束事件中返回，可用于计量音频处理时长。
