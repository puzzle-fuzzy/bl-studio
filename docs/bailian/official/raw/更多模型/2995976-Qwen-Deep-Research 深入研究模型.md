本文介绍通过 DashScope API 调用 Qwen-Deep-Research 模型的输入与输出参数。

> 相关文档：[深入研究（Qwen-Deep-Research）](/zh/model-studio/qwen-deep-research)

**重要**Qwen-Deep-Research模型仅支持华北2（北京）地域，如需使用模型，请使用华北2（北京）地域的[API Key](https://bailian.console.aliyun.com/?tab=model#/api-key)。

**说明**模型当前仅支持通过 Python DashScope SDK 调用，暂不支持 Java SDK 与 OpenAI 兼容接口。

## DashScope

> 您需要已[获取与配置 API Key](/zh/model-studio/get-api-key)并[配置API Key到环境变量](/zh/model-studio/configure-api-key-through-environment-variables)。若通过DashScope SDK进行调用，需要[安装DashScope SDK](/zh/model-studio/install-sdk)。

<table bordertype="no-border"><colgroup><col style="width:56.98%"><col style="width:43.02%"></colgroup><tbody><tr><td><h3>请求体<span id="2a1c410015otp"></span></h3><p><strong>model</strong><code>string</code><strong>（必选）</strong></p><p>模型名称。支持的模型：qwen-deep-research。</p><p><strong>messages</strong><code>array</code><strong>（必选）</strong></p><p>传递给大模型的上下文，按对话顺序排列。</p><section class="collapse expanded" id="accordion-消息类型"><p>消息类型</p><div><p>User Message<code>object</code><strong>（必选）</strong></p><p>用户消息，用于向模型传递问题、指令或上下文。在 Qwen-Deep-Research 的两阶段调用流程中，用户消息起到不同作用：</p><ul><li><strong>第一步（模型反问确认）</strong>：用户消息用于发起初始的研究请求，提出一个较为宽泛的研究主题。</li><li><strong>第二步（深入研究）</strong>：用户消息用于回答模型提出的澄清式问题，帮助模型聚焦研究方向，进行更具针对性的深入分析。</li></ul><section class="collapse" id="accordion-属性"><p>属性</p><div><p><strong>content</strong><code>string</code><strong>（必选）</strong></p><p>消息内容。</p><p><strong>role</strong><code>string</code><strong>（必选）</strong></p><p>系统消息的角色，固定为user。</p></div></section><p>Assistant Message <code>object</code>（可选）</p><p>模型对用户消息的回复。在第二步（深入研究）的API调用中，此参数用以传入模型在第一步（反问确认）中返回的澄清式问题，作为对话历史的一部分，从而引导模型进行更具针对性的分析。</p><p><strong>content</strong><code>string</code>（可选）</p><p>消息内容。</p><p><strong>role</strong><code>string</code><strong>（必选）</strong></p><p>固定为<code>assistant</code>。</p></div></section><p><strong>output_format</strong><code>string</code>（可选）</p><p>指定输出研究报告的格式和详细程度。支持以下取值：</p><ul><li><code>model_detailed_report</code>（默认） 生成一份结构完整、内容详尽的深度研究报告，篇幅约6000 Token，适合需要全面深入分析的场景。</li><li><code>model_summary_report</code> 生成一份核心观点突出、内容精炼的摘要式研究报告，篇幅约1500-2000 Token，适合快速了解关键信息和结论的场景。</li></ul></td><td><div outputclass="tabbed-codeblock" data-tag="fig" id="fig-code-group" class="tabbed-codeblock-box"><div class="tab-box"></div><input id="fig-code-group-python-tab" type="radio" name="check-fig-code-group" checked=""><label for="fig-code-group-python-tab">Python</label><div class="codeblock-item"><pre data-tag="codeblock" id="code-code-group-python" outputclass="language-python" code-type="xCode" class="pre codeblock language-python"><code>import os
import dashscope
# 以下为华北2（北京）地域的配置，调用时请将WorkspaceId替换为真实的业务空间ID，各地域的配置不同。
dashscope.base_http_api_url = "https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/api/v1"

# 第一步：模型反问确认
messages = [{'role': 'user', 'content': '研究一下人工智能在教育中的应用'}]

responses = dashscope.Generation.call(
    api_key=os.getenv('DASHSCOPE_API_KEY'),
    model="qwen-deep-research",
    messages=messages,
    stream=True
)

# 获取模型反问内容
step1_content = ""
for response in responses:
    if hasattr(response, 'output') and response.output:
        message = response.output.get('message', {})
        content = message.get('content', '')
        if content:
            step1_content += content
            print(content, end='', flush=True)

# 第二步：深入研究
messages = [
    {'role': 'user', 'content': '研究一下人工智能在教育中的应用'},
    {'role': 'assistant', 'content': step1_content},
    {'role': 'user', 'content': '我主要关注个性化学习和智能评估这两个方面'}
]

responses = dashscope.Generation.call(
    api_key=os.getenv('DASHSCOPE_API_KEY'),
    model="qwen-deep-research",
    messages=messages
)

# 流式输出研究结果
for response in responses:
    if hasattr(response, 'output') and response.output:
        message = response.output.get('message', {})
        content = message.get('content', '')
        if content:
            print(content, end='', flush=True)
</code></pre></div><input id="fig-code-group-curl-tab" type="radio" name="check-fig-code-group"><label for="fig-code-group-curl-tab">curl</label><div class="codeblock-item"><pre data-tag="codeblock" id="code-code-group-curl" outputclass="language-bash" code-type="xCode" class="pre codeblock language-bash"><code>echo "第一步：模型反问确认"
curl --location 'https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/api/v1/services/aigc/text-generation/generation' \
--header 'X-DashScope-SSE: enable' \
--header "Authorization: Bearer $DASHSCOPE_API_KEY" \
--header 'Content-Type: application/json' \
--data '{
    "input": {
        "messages": [
            {
                "content": "研究一下人工智能在教育中的应用",
                "role": "user"
            }
        ]
    },
    "model": "qwen-deep-research"
}'

echo -e "\n\n"
echo "第二步：深入研究"
curl --location 'https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/api/v1/services/aigc/text-generation/generation' \
--header 'X-DashScope-SSE: enable' \
--header "Authorization: Bearer $DASHSCOPE_API_KEY" \
--header 'Content-Type: application/json' \
--data '{
    "input": {
        "messages": [
            {
                "content": "研究一下人工智能在教育中的应用",
                "role": "user"
            },
            {
                "content": "请告诉我您希望重点研究人工智能在教育中的哪些具体应用场景？",
                "role": "assistant"
            },
            {
                "content": "我主要关注个性化学习方面",
                "role": "user"
            }
        ]
    },
    "model": "qwen-deep-research"
}'
</code></pre></div></div></td></tr></tbody></table>

<table bordertype="no-border"><colgroup><col style="width:56.83%"><col style="width:43.17%"></colgroup><tbody><tr><td><h3>响应对象<span id="0e1c44902ea1e"></span></h3><p><strong>status_code</strong><code>string</code></p><p>本次请求的状态码。200 表示请求成功，否则表示请求失败。</p><blockquote><p>调用失败会抛出异常，异常信息为<strong>status_code</strong>和<strong>message</strong>的内容。</p></blockquote><p><strong>request_id</strong><code>string</code></p><p>本次调用的唯一标识符。</p><p><strong>code</strong><code>string</code></p><p>错误码，调用成功时为空值。</p><blockquote><p>只有Python SDK返回该参数。</p></blockquote><p><strong>message</strong> <code>string</code></p><p>错误提示信息，调用成功时为空值。</p><p><strong>output</strong><code>object</code></p><p>调用结果信息。</p><section class="collapse" id="accordion-属性-2"><p>属性</p><div><p><strong>text</strong><code>string</code></p><p>该参数当前固定为<code>null</code>。</p><p><strong>finish_reason</strong><code>string</code></p><p>模型结束生成的原因。有以下情况：</p><ul><li>正在生成时为<code>null</code>；</li><li>模型输出自然结束为<code>stop</code>；</li><li>因生成长度过长而结束为<code>length</code></li></ul><p><strong>choices</strong><code>array</code></p><p>模型的输出信息。</p><section class="collapse" id="accordion-属性-3"><p>属性</p><div><p><strong>finish_reason</strong><code>string</code></p><p>有以下情况：</p><ul><li>正在生成时为<code>null</code>；</li><li>因模型输出自然结束为<code>stop</code>；</li><li>因生成长度过长而结束为<code>length</code></li></ul></div></section><p><strong>message</strong><code>object</code></p><p>模型输出的消息对象。</p><section class="collapse" id="accordion-属性-4"><p>属性</p><div><strong>属性</strong><p><strong>phase</strong><code>string</code></p><p>当前所处阶段，其中包含：</p><ul><li>answer：反问确认与回答阶段;</li><li>ResearchPlanning：研究规划阶段</li><li>WebResearch：网络搜索阶段</li><li>KeepAlive：连接保持阶段</li></ul><p><strong>role</strong><code>string</code></p><p>输出消息的角色，固定为<code>assistant</code>。</p><p><strong>content</strong><code>string</code></p><p>模型的输出内容。</p><p><strong>extra</strong> <code>array</code></p><p>模型获取的网络搜索与参考信息。</p><p><strong>deep_research</strong><code>object</code></p><p>仅在<code>answer</code>与<code>WebResearch</code>阶段包含获取的网络搜索与参考信息，其余阶段均为null。</p><p><strong>research</strong><code>object</code></p><p>模型的研究过程与内容信息。</p><section class="collapse" id="accordion-属性-5"><p>属性</p><div><p><strong>researchGoal</strong><code>string</code></p><p>研究目标。</p><p><strong>query</strong><code>string</code></p><p>研究过程中的搜索内容。</p><p><strong>id</strong><code>integer</code></p><p>搜索的轮数*，*取值范围 [1-15]。</p><p><strong>learningMap</strong><code>object</code></p><p>从调用工具总结获取到的内容，和调用工具相关联。</p><p><strong>references</strong><code>object</code></p><p>模型生成答案所引用的内容，仅回答阶段包含此参数。</p><section class="collapse" id="accordion-属性-6"><p>属性</p><div><p><strong>icon</strong> <code>string</code></p><p>参考内容URL的网页图标链接。</p><p><strong>index_number</strong> <code>integer</code></p><p>参考内容的索引。</p><p><strong>description</strong><code>string</code></p><p>参考内容的简介。</p><p><strong>title</strong><code>string</code></p><p>参考内容的网页标题。</p><p><strong>url</strong> <code>string</code></p><p>参考内容的网页URL。</p></div></section><p><strong>webSites</strong><code>object</code></p><p>模型研究过程中所参考的内容，仅网络搜索阶段包含此参数。</p><section class="collapse" id="accordion-属性-7"><p>属性</p><div><p><strong>icon</strong> <code>string</code></p><p>参考内容URL的网页图标链接。</p><p><strong>index_number</strong> <code>integer</code></p><p>参考内容的索引。</p><p><strong>description</strong><code>string</code></p><p>参考内容的简介。</p><p><strong>title</strong><code>string</code></p><p>参考内容的网页标题。</p><p><strong>url</strong> <code>string</code></p><p>参考内容的网页URL。</p></div></section></div></section><p><strong>status</strong><code>string</code></p><p>模型输出过程中不同阶段的状态：</p><ul><li>typing：正在生成该阶段内容。</li><li>finished：阶段已完成。</li><li>streamingQueries：正在生成研究目标和搜索查询</li><li>streamingWebResult：正在执行搜索、网页阅读和代码执行</li><li>WebResultFinished：网络搜索阶段完成</li></ul></div></section><p><strong>finished</strong><code>boolean</code></p><p>标识模型的内容流式输出是否已全部完成。有以下情况：</p><ul><li>内容仍在持续输出中为<code>false</code>；</li><li>内容已全部输出完毕，当前为最后一个响应为<code>true</code></li></ul><p><strong>finished_reason</strong> <code>string</code></p><p>标识模型的内容流式输出结束的原因。有以下情况：</p><ul><li>正在生成时为<code>null</code>；</li><li>模型内容流式输出自然结束为<code>stop</code></li></ul></div></section><p><strong>usage</strong><code>object</code></p><p>本次请求使用的Token信息。</p><section class="collapse" id="accordion-属性-8"><p>属性</p><div><p><strong>input_tokens</strong> <code>integer</code></p><p>输入 Token 数。</p><p><strong>output_tokens</strong> <code>integer</code></p><p>输出 Token 数。</p></div></section></td><td><div outputclass="tabbed-codeblock" data-tag="fig" id="fig-code-group-2" class="tabbed-codeblock-box"><div class="tab-box"></div><input id="fig-code-group-2-研究规划阶段-tab" type="radio" name="check-fig-code-group-2" checked=""><label for="fig-code-group-2-研究规划阶段-tab">研究规划阶段</label><div class="codeblock-item"><pre data-tag="codeblock" id="code-code-group-2-研究规划阶段" outputclass="language-json" code-type="xCode" class="pre codeblock language-json"><code>{
  "status_code": 200,
  "request_id": "2a6187f0-7e7b-40bb-a87e-xxx",
  "code": "",
  "message": "",
  "output": {
        "text": null,
        "finish_reason": null,
        "choices": null,
        "message": {
            "phase": "ResearchPlanning",
            "role": "assistant",
            "content": "",
            "extra": {
                "deep_research": {}
            },
            "status": "typing"
        },
        "fininshed": false,
        "fininshed_reason": "null"
    },
    "usage": {
        "input_tokens": 694,
        "output_tokens": 0
    },
    "request_id": "2a6187f0-7e7b-40bb-xxx"
}
</code></pre></div><input id="fig-code-group-2-网络搜索阶段-tab" type="radio" name="check-fig-code-group-2"><label for="fig-code-group-2-网络搜索阶段-tab">网络搜索阶段</label><div class="codeblock-item"><pre data-tag="codeblock" id="code-code-group-2-网络搜索阶段" outputclass="language-json" code-type="xCode" class="pre codeblock language-json"><code>{
  "status_code": 200,
  "request_id": "2a6187f0-7e7b-40bb-a87e-xxx",
  "code": "",
  "message": "",
  "output": {
    "message": {
      "phase": "WebResearch",
      "role": "assistant",
      "content": "",
      "extra": {
        "deep_research": {
          "query": {
            "researchGoal": "通过查找",
            "query": "",
            "id": 1
          }
        }
      },
      "status": "streamingQueries"
    },
    "fininshed": false,
    "fininshed_reason": "null"
  },
  "usage": {
    "input_tokens": 694,
    "output_tokens": 0
  }
}
</code></pre></div><input id="fig-code-group-2-连接保持阶段-tab" type="radio" name="check-fig-code-group-2"><label for="fig-code-group-2-连接保持阶段-tab">连接保持阶段</label><div class="codeblock-item"><pre data-tag="codeblock" id="code-code-group-2-连接保持阶段" outputclass="language-json" code-type="xCode" class="pre codeblock language-json"><code>{
  "status_code": 200,
  "request_id": "2a6187f0-7e7b-40bb-a87e-xxx",
  "code": "",
  "message": "",
  "output": {
    "message": {
      "phase": "KeepAlive",
      "role": "assistant",
      "content": "",
      "extra": {
        "deep_research": {}
      },
      "status": "typing"
    },
    "fininshed": false,
    "fininshed_reason": "null"
  },
  "usage": {
    "input_tokens": 694,
    "output_tokens": 0
  }
}
</code></pre></div><input id="fig-code-group-2-反问确认与回答阶段-tab" type="radio" name="check-fig-code-group-2"><label for="fig-code-group-2-反问确认与回答阶段-tab">反问确认与回答阶段</label><div class="codeblock-item"><pre data-tag="codeblock" id="code-code-group-2-反问确认与回答阶段" outputclass="language-json" code-type="xCode" class="pre codeblock language-json"><code>{
  "status_code": 200,
  "request_id": "2a6187f0-7e7b-40bb-a87e-xxx",
  "code": "",
  "message": "",
  "output": {
    "message": {
      "phase": "answer",
      "role": "assistant",
      "content": "，这些承诺相互",
      "extra": {
        "deep_research": {
          "references": [
            {
              "icon": "",
              "index_number": 1,
              "description": "计划中设想的两个xxx从未在 ",
              "title": "历史和背景| 联合国 - the United Nations",
              "url": "https://www.un.org/xxx"
            }
          ]
        }
      },
      "status": "typing"
    },
    "fininshed": false,
    "fininshed_reason": "null"
  },
  "usage": {
    "input_tokens": 694,
    "output_tokens": 0
  }
}
</code></pre></div></div></td></tr></tbody></table>
