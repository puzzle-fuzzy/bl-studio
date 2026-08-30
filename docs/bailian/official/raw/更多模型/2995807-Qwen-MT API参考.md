本文介绍通过OpenAI兼容接口 或 DashScopeAPI 调用 Qwen-MT 模型的输入与输出参数。

> 相关文档： [翻译能力（Qwen-MT）](/zh/model-studio/machine-translation)

## OpenAI 兼容

#### 北京地域

SDK 调用配置的`base_url`为：`https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/compatible-mode/v1`

HTTP 请求地址：`POST https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/compatible-mode/v1/chat/completions`

#### 新加坡地域

SDK 调用配置的`base_url`为：`https://{WorkspaceId}.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1`

HTTP 请求地址：`POST https://{WorkspaceId}.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1/chat/completions`

#### 美国（弗吉尼亚）地域

SDK 调用配置的`base_url`：`https://{WorkspaceId}.us-east-1.maas.aliyuncs.com/compatible-mode/v1`

HTTP 请求地址：`POST https://{WorkspaceId}.us-east-1.maas.aliyuncs.com/compatible-mode/v1/chat/completions`

#### 新加坡地域

SDK 调用配置的`base_url`为：`https://{WorkspaceId}.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1`

HTTP 请求地址：`POST https://{WorkspaceId}.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1/chat/completions`

#### 美国（弗吉尼亚）地域

SDK 调用配置的`base_url`：`https://{WorkspaceId}.us-east-1.maas.aliyuncs.com/compatible-mode/v1`

HTTP 请求地址：`POST https://{WorkspaceId}.us-east-1.maas.aliyuncs.com/compatible-mode/v1/chat/completions`

#### 北京地域

SDK 调用配置的`base_url`为：`https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/compatible-mode/v1`

HTTP 请求地址：`POST https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/compatible-mode/v1/chat/completions`

**重要**阿里云百炼为华北2（北京）、新加坡地域推出了业务空间专属域名，**能够为推理请求提供卓越的性能和更高的稳定性**，建议迁移至新域名：

-   华北2（北京）地域：从 `https://dashscope.aliyuncs.com` 迁移至 `https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com`
-   新加坡地域：从 `https://dashscope-intl.aliyuncs.com` 迁移至 `https://{WorkspaceId}.ap-southeast-1.maas.aliyuncs.com`

其中 `{WorkspaceId}` 为您的业务空间 ID，可在阿里云百炼控制台的**业务空间详情**页面查看。现有域名仍可正常使用。

> 您需要已 [获取与配置 API Key](/zh/model-studio/get-api-key) 并 [配置API Key到环境变量](/zh/model-studio/configure-api-key-through-environment-variables) 。若通过OpenAI SDK进行调用，需要 [安装SDK](/zh/model-studio/install-sdk) 。

<table><colgroup><col style="width:57.57%"><col style="width:42.43%"></colgroup><tbody><tr><td><h3>请求体<span id="afcd41d2b57zf"></span></h3></td><td rowspan="12"><section data-tag="tabbed-content-box" outputclass="tabbed-content-box" id="sec-tabs-3" class="tabbed-content-box section"><section id="基础使用" class="section"><h4 id="基础使用-h4">基础使用</h4><section data-tag="tabbed-content-box" outputclass="tabbed-content-box" id="sec-tabs-4" class="tabbed-content-box section"><section id="python" class="section"><h4 id="python-h4">Python</h4><pre data-tag="codeblock" id="code-block" outputclass="language-python" code-type="xCode" class="pre codeblock language-python"><code>import os
from openai import OpenAI

client = OpenAI(
    # 若没有配置环境变量，请用阿里云百炼API Key将下行替换为：api_key="sk-xxx",
    # 新加坡和北京地域的API Key不同。获取API Key：https://help.aliyun.com/zh/model-studio/get-api-key
    api_key=os.getenv("DASHSCOPE_API_KEY"),
    # 以下是北京地域的base_url
    base_url="https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/compatible-mode/v1",
)
messages = [
    {
        "role": "user",
        "content": "我看到这个视频后没有笑"
    }
]
translation_options = {
    "source_lang": "Chinese",
    "target_lang": "English"
}

completion = client.chat.completions.create(
    model="qwen-mt-plus",
    messages=messages,
    extra_body={
        "translation_options": translation_options
    }
)
print(completion.choices[0].message.content)
</code></pre></section><section id="node-js" class="section"><h4 id="node-js-h4">Node.js</h4><pre data-tag="codeblock" id="code-block-2" outputclass="language-javascript" code-type="xCode" class="pre codeblock language-javascript"><code>// 需要 Node.js v18+，需在 ES Module 环境下运行
import OpenAI from "openai";

const openai = new OpenAI(
    {
        // 若没有配置环境变量，请用阿里云百炼API Key将下行替换为：apiKey: "sk-xxx",
        apiKey: process.env.DASHSCOPE_API_KEY,
        // 以下是北京地域的base_url
        baseURL: "https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/compatible-mode/v1"
    }
);
const completion = await openai.chat.completions.create({
    model: "qwen-mt-plus",
    messages: [
        { role: "user", content: "我看到这个视频后没有笑" }
    ],
    translation_options: {
        source_lang: "Chinese",
        target_lang: "English"
    }
});
console.log(JSON.stringify(completion));
</code></pre></section><section id="curl" class="section"><h4 id="curl-h4">curl</h4><p>各地域的<a href="/zh/model-studio/qwen-mt-api">请求地址</a>和API Key不同，以下是北京地域的请求地址。</p><pre data-tag="codeblock" id="code-block-3" outputclass="language-bash" code-type="xCode" class="pre codeblock language-bash"><code>curl -X POST https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/compatible-mode/v1/chat/completions \
-H "Authorization: Bearer $DASHSCOPE_API_KEY" \
-H "Content-Type: application/json" \
-d '{
    "model": "qwen-mt-plus",
    "messages": [{"role": "user", "content": "看完这个视频我没有笑"}],
    "translation_options": {
      "source_lang": "auto",
      "target_lang": "English"
      }
}'
</code></pre></section></section></section><section id="术语干预" class="section"><h4 id="术语干预-h4">术语干预</h4><section data-tag="tabbed-content-box" outputclass="tabbed-content-box" id="sec-tabs-5" class="tabbed-content-box section"><section id="python-2" class="section"><h4 id="python-2-h4">Python</h4><pre data-tag="codeblock" id="code-block-4" outputclass="language-python" code-type="xCode" class="pre codeblock language-python"><code>import os
from openai import OpenAI

client = OpenAI(
    # 若没有配置环境变量，请用阿里云百炼API Key将下行替换为：api_key="sk-xxx",
    api_key=os.getenv("DASHSCOPE_API_KEY"),
    # 以下是北京地域的base_url
    base_url="https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/compatible-mode/v1",
)
messages = [
    {
        "role": "user",
        "content": "而这套生物传感器运用了石墨烯这种新型材料，它的目标物是化学元素，敏锐的“嗅觉”让它能更深度、准确地体现身体健康状况。"
    }
]
translation_options = {
    "source_lang": "Chinese",
    "target_lang": "English",
    "terms": [
        {
            "source": "生物传感器",
            "target": "biological sensor"
        },
        {
            "source": "石墨烯",
            "target": "graphene"
        },
        {
            "source": "化学元素",
            "target": "chemical elements"
        },
        {
            "source": "身体健康状况",
            "target": "health status of the body"
        }
    ]
}

completion = client.chat.completions.create(
    model="qwen-mt-plus",
    messages=messages,
    extra_body={
        "translation_options": translation_options
    }
)
print(completion.choices[0].message.content)
</code></pre></section><section id="node-js-2" class="section"><h4 id="node-js-2-h4">Node.js</h4><pre data-tag="codeblock" id="code-block-5" outputclass="language-javascript" code-type="xCode" class="pre codeblock language-javascript"><code>// 需要 Node.js v18+，需在 ES Module 环境下运行
import OpenAI from "openai";

const openai = new OpenAI(
    {
        // 若没有配置环境变量，请用阿里云百炼API Key将下行替换为：apiKey: "sk-xxx",
        apiKey: process.env.DASHSCOPE_API_KEY,
        // 以下是北京地域的base_url
        baseURL: "https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/compatible-mode/v1"
    }
);
const completion = await openai.chat.completions.create({
    model: "qwen-mt-plus",
    messages: [
        { role: "user", content: "而这套生物传感器运用了石墨烯这种新型材料，它的目标物是化学元素，敏锐的“嗅觉”让它能更深度、准确地体现身体健康状况。" }
    ],
    translation_options: {
        source_lang: "Chinese",
        target_lang: "English",
        terms: [
            {
                "source": "生物传感器",
                "target": "biological sensor"
            },
            {
                "source": "石墨烯",
                "target": "graphene"
            },
            {
                "source": "化学元素",
                "target": "chemical elements"
            },
            {
                "source": "身体健康状况",
                "target": "health status of the body"
            }
        ]
    }
});
console.log(JSON.stringify(completion));
</code></pre></section><section id="curl-2" class="section"><h4 id="curl-2-h4">curl</h4><p>各地域的<a href="/zh/model-studio/qwen-mt-api">请求地址</a>和API Key不同，以下是北京地域的请求地址。</p><pre data-tag="codeblock" id="code-block-6" outputclass="language-bash" code-type="xCode" class="pre codeblock language-bash"><code>curl -X POST https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/compatible-mode/v1/chat/completions \
-H "Authorization: Bearer $DASHSCOPE_API_KEY" \
-H "Content-Type: application/json" \
-d '{
  "model": "qwen-mt-plus",
  "messages": [
    {
      "role": "user",
      "content": "而这套生物传感器运用了石墨烯这种新型材料，它的目标物是化学元素，敏锐的“嗅觉”让它能更深度、准确地体现身体健康状况。"
    }
  ],
  "translation_options": {
    "source_lang": "Chinese",
    "target_lang": "English",
    "terms": [
      {
        "source": "生物传感器",
        "target": "biological sensor"
      },
      {
        "source": "石墨烯",
        "target": "graphene"
      },
      {
        "source": "化学元素",
        "target": "chemical elements"
      },
      {
        "source": "身体健康状况",
        "target": "health status of the body"
      }
    ]
  }
}'
</code></pre></section></section></section><section id="翻译记忆" class="section"><h4 id="翻译记忆-h4">翻译记忆</h4><section data-tag="tabbed-content-box" outputclass="tabbed-content-box" id="sec-tabs-6" class="tabbed-content-box section"><section id="python-3" class="section"><h4 id="python-3-h4">Python</h4><pre data-tag="codeblock" id="code-block-7" outputclass="language-python" code-type="xCode" class="pre codeblock language-python"><code>import os
from openai import OpenAI

client = OpenAI(
    # 若没有配置环境变量，请用阿里云百炼API Key将下行替换为：api_key="sk-xxx",
    api_key=os.getenv("DASHSCOPE_API_KEY"),
    # 以下是北京地域的base_url
    base_url="https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/compatible-mode/v1",
)
messages = [
    {
        "role": "user",
        "content": "通过如下命令可以看出安装thrift的版本信息；"
    }
]
translation_options = {
    "source_lang": "Chinese",
    "target_lang": "English",
    "tm_list": [
        {
            "source": "您可以通过如下方式查看集群的内核版本信息:",
            "target": "You can use one of the following methods to query the engine version of a cluster:"
        },
        {
            "source": "我们云HBase的thrift环境是0.9.0,所以建议客户端的版本也为 0.9.0,可以从这里下载thrift的0.9.0 版本,下载的源码包我们后面会用到,这里需要先安装thrift编译环境,对于源码安装可以参考thrift官网;",
            "target": "The version of Thrift used by ApsaraDB for HBase is 0.9.0. Therefore, we recommend that you use Thrift 0.9.0 to create a client. Click here to download Thrift 0.9.0. The downloaded source code package will be used later. You must install the Thrift compiling environment first. For more information, see Thrift official website."
        },
        {
            "source": "您可以通过PyPI来安装SDK,安装命令如下:",
            "target": "You can run the following command in Python Package Index (PyPI) to install Elastic Container Instance SDK for Python:"
        }
    ]
}

completion = client.chat.completions.create(
    model="qwen-mt-plus",
    messages=messages,
    extra_body={
        "translation_options": translation_options
    }
)
print(completion.choices[0].message.content)
</code></pre></section><section id="node-js-3" class="section"><h4 id="node-js-3-h4">Node.js</h4><pre data-tag="codeblock" id="code-block-8" outputclass="language-javascript" code-type="xCode" class="pre codeblock language-javascript"><code>// 需要 Node.js v18+，需在 ES Module 环境下运行
import OpenAI from "openai";

const openai = new OpenAI(
    {
        // 若没有配置环境变量，请用阿里云百炼API Key将下行替换为：apiKey: "sk-xxx",
        apiKey: process.env.DASHSCOPE_API_KEY,
        // 以下是北京地域的base_url
        baseURL: "https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/compatible-mode/v1"
    }
);
const completion = await openai.chat.completions.create({
    model: "qwen-mt-plus",
    messages: [
        { role: "user", content: "通过如下命令可以看出安装thrift的版本信息；" }
    ],
    translation_options: {
        source_lang: "Chinese",
        target_lang: "English",
        tm_list: [
            {
                "source": "您可以通过如下方式查看集群的内核版本信息:",
                "target": "You can use one of the following methods to query the engine version of a cluster:"
            },
            {
                "source": "我们云HBase的thrift环境是0.9.0,所以建议客户端的版本也为 0.9.0,可以从这里下载thrift的0.9.0 版本,下载的源码包我们后面会用到,这里需要先安装thrift编译环境,对于源码安装可以参考thrift官网;",
                "target": "The version of Thrift used by ApsaraDB for HBase is 0.9.0. Therefore, we recommend that you use Thrift 0.9.0 to create a client. Click here to download Thrift 0.9.0. The downloaded source code package will be used later. You must install the Thrift compiling environment first. For more information, see Thrift official website."
            },
            {
                "source": "您可以通过PyPI来安装SDK,安装命令如下:",
                "target": "You can run the following command in Python Package Index (PyPI) to install Elastic Container Instance SDK for Python:"
            }
        ]
    }
});
console.log(JSON.stringify(completion));
</code></pre></section><section id="curl-3" class="section"><h4 id="curl-3-h4">curl</h4><p>各地域的<a href="/zh/model-studio/qwen-mt-api">请求地址</a>和API Key不同，以下是北京地域的请求地址。</p><pre data-tag="codeblock" id="code-block-9" outputclass="language-bash" code-type="xCode" class="pre codeblock language-bash"><code>curl -X POST https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/compatible-mode/v1/chat/completions \
-H "Authorization: Bearer $DASHSCOPE_API_KEY" \
-H "Content-Type: application/json" \
-d '{
  "model": "qwen-mt-plus",
  "messages": [
    {
      "role": "user",
      "content": "通过如下命令可以看出安装thrift的版本信息；"
    }
  ],
  "translation_options": {
    "source_lang": "Chinese",
    "target_lang": "English",
    "tm_list":[
          {"source": "您可以通过如下方式查看集群的内核版本信息:", "target": "You can use one of the following methods to query the engine version of a cluster:"},
          {"source": "我们云HBase的thrift环境是0.9.0,所以建议客户端的版本也为 0.9.0,可以从这里下载thrift的0.9.0 版本,下载的源码包我们后面会用到,这里需要先安装thrift编译环境,对于源码安装可以参考thrift官网;", "target": "The version of Thrift used by ApsaraDB for HBase is 0.9.0. Therefore, we recommend that you use Thrift 0.9.0 to create a client. Click here to download Thrift 0.9.0. The downloaded source code package will be used later. You must install the Thrift compiling environment first. For more information, see Thrift official website."},
          {"source": "您可以通过PyPI来安装SDK,安装命令如下:", "target": "You can run the following command in Python Package Index (PyPI) to install Elastic Container Instance SDK for Python:"}
    ]
  }
}'
</code></pre></section></section></section><section id="领域提示" class="section"><h4 id="领域提示-h4">领域提示</h4><section data-tag="tabbed-content-box" outputclass="tabbed-content-box" id="sec-tabs-7" class="tabbed-content-box section"><section id="python-4" class="section"><h4 id="python-4-h4">Python</h4><pre data-tag="codeblock" id="code-block-10" outputclass="language-python" code-type="xCode" class="pre codeblock language-python"><code>import os
from openai import OpenAI

client = OpenAI(
    # 若没有配置环境变量，请用阿里云百炼API Key将下行替换为：api_key="sk-xxx",
    api_key=os.getenv("DASHSCOPE_API_KEY"),
    # 以下是北京地域的base_url
    base_url="https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/compatible-mode/v1",
)
messages = [
    {
        "role": "user",
        "content": "第二个SELECT语句返回一个数字，表示在没有LIMIT子句的情况下，第一个SELECT语句返回了多少行。"
    }
]
translation_options = {
    "source_lang": "Chinese",
    "target_lang": "English",
    "domains": "The sentence is from Ali Cloud IT domain. It mainly involves computer-related software development and usage methods, including many terms related to computer software and hardware. Pay attention to professional troubleshooting terminologies and sentence patterns when translating. Translate into this IT domain style."
}

completion = client.chat.completions.create(
    model="qwen-mt-plus",
    messages=messages,
    extra_body={
        "translation_options": translation_options
    }
)
print(completion.choices[0].message.content)
</code></pre></section><section id="node-js-4" class="section"><h4 id="node-js-4-h4">Node.js</h4><pre data-tag="codeblock" id="code-block-11" outputclass="language-javascript" code-type="xCode" class="pre codeblock language-javascript"><code>// 需要 Node.js v18+，需在 ES Module 环境下运行
import OpenAI from "openai";

const openai = new OpenAI(
    {
        // 若没有配置环境变量，请用阿里云百炼API Key将下行替换为：apiKey: "sk-xxx",
        apiKey: process.env.DASHSCOPE_API_KEY,
        // 以下是北京地域的base_url
        baseURL: "https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/compatible-mode/v1"
    }
);
const completion = await openai.chat.completions.create({
    model: "qwen-mt-plus",
    messages: [
        { role: "user", content: "第二个SELECT语句返回一个数字，表示在没有LIMIT子句的情况下，第一个SELECT语句返回了多少行。" }
    ],
    translation_options: {
        source_lang: "Chinese",
        target_lang: "English",
        domains: "The sentence is from Ali Cloud IT domain. It mainly involves computer-related software development and usage methods, including many terms related to computer software and hardware. Pay attention to professional troubleshooting terminologies and sentence patterns when translating. Translate into this IT domain style."
    }
});
console.log(JSON.stringify(completion));
</code></pre></section><section id="curl-4" class="section"><h4 id="curl-4-h4">curl</h4><p>各地域的<a href="/zh/model-studio/qwen-mt-api">请求地址</a>和API Key不同，以下是北京地域的请求地址。</p><pre data-tag="codeblock" id="code-block-12" outputclass="language-bash" code-type="xCode" class="pre codeblock language-bash"><code>curl -X POST https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/compatible-mode/v1/chat/completions \
-H "Authorization: Bearer $DASHSCOPE_API_KEY" \
-H "Content-Type: application/json" \
-d '{
  "model": "qwen-mt-plus",
  "messages": [
    {
      "role": "user",
      "content": "第二个SELECT语句返回一个数字，表示在没有LIMIT子句的情况下，第一个SELECT语句返回了多少行。"
    }
  ],
  "translation_options": {
    "source_lang": "Chinese",
    "target_lang": "English",
    "domains": "The sentence is from Ali Cloud IT domain. It mainly involves computer-related software development and usage methods, including many terms related to computer software and hardware. Pay attention to professional troubleshooting terminologies and sentence patterns when translating. Translate into this IT domain style."
  }
}'
</code></pre></section></section></section></section></td></tr><tr><td><p><strong>model</strong><code>string</code><strong>（必选）</strong></p><p>模型名称。支持的模型：qwen-mt-plus、qwen-mt-flash、qwen-mt-lite、qwen-mt-turbo。</p></td></tr><tr><td><p><strong>messages</strong><code>array</code><strong>（必选）</strong></p><p>消息数组，用于向大模型传递上下文。仅支持传入 User Message。</p><section class="collapse expanded" id="accordion-消息类型"><p>消息类型</p><div><p>User Message<code>object</code><strong>（必选）</strong></p><p>用户消息，用于传递待翻译的句子。</p><section class="collapse expanded" id="accordion-属性"><p>属性</p><div><p><strong>content</strong><code>string</code><strong>（必选）</strong></p><p>待翻译的句子。</p><p><strong>role</strong><code>string</code><strong>（必选）</strong></p><p>用户消息的角色，必须设为<code>user</code>。</p></div></section></div></section></td></tr><tr><td><p><strong>stream</strong><code>boolean</code>（可选） 默认值为 <code>false</code></p><p>是否以流式方式输出回复。</p><p>可选值：</p><ul><li><code>false</code>：等待模型生成完整回复后一次性返回。</li><li><code>true</code>：模型边生成边返回数据块。客户端需逐块读取，以还原完整回复。</li></ul><div class="note note-note"><div class="note-icon-wrapper"></div><div class="note-content"><p><strong>说明</strong>当前仅qwen-mt-flash、qwen-mt-lite模型支持以增量形式返回数据，每次返回仅包含新生成的内容。qwen-mt-plus和qwen-mt-turbo模型以非增量形式返回数据，每次返回当前已经生成的整个序列，暂时无法修改。如：</p><p>I</p><p>I didn</p><p>I didn't</p><p>I didn't laugh</p><p>I didn't laugh after</p><p>...</p></div></div></td></tr><tr><td><p><strong>stream_options</strong><code>object</code>（可选）</p><p>流式输出的配置项，仅在 <code>stream</code> 为 <code>true</code> 时生效。</p><section class="collapse expanded" id="accordion-属性-2"><p>属性</p><div><p><strong>include_usage</strong><code>boolean</code>（可选）默认值为 <code>false</code></p><p>是否在<strong>最后一个数据块</strong>包含Token消耗信息。</p><p>可选值：</p><ul><li><code>true</code>：包含；</li><li><code>false</code>：不包含。</li></ul></div></section></td></tr><tr><td><p><strong>max_tokens</strong><code>integer</code>（可选）</p><p>用于限制模型输出的最大 Token 数。若生成内容超过此值，响应将被截断。</p><p>默认值与最大值均为模型的最大输出长度，请参见<a href="/zh/model-studio/machine-translation#154957e783dxk">模型选型</a>。</p></td></tr><tr><td><p><strong>seed</strong><code>integer</code>（可选）</p><p>随机数种子。用于确保在相同输入和参数下生成结果可复现。若调用时传入相同的&nbsp;<code>seed</code>&nbsp;且其他参数不变，模型将尽可能返回相同结果。</p><p>取值范围：<code>[0,2 31 −1]</code>。</p></td></tr><tr><td><p><strong>temperature</strong><code>float</code>（可选）默认值为0.65</p><p>采样温度，控制模型生成文本的多样性。</p><p>temperature越高，生成的文本更多样，反之，生成的文本更确定。</p><p>取值范围： [0, 2)</p><p>temperature与top_p均可以控制生成文本的多样性，建议只设置其中一个值。</p></td></tr><tr><td><p><strong>top_p</strong><code>float</code>（可选）默认值为0.8</p><p>核采样的概率阈值，控制模型生成文本的多样性。</p><p>top_p越高，生成的文本更多样。反之，生成的文本更确定。</p><p>取值范围：（0,1.0]</p><p>temperature与top_p均可以控制生成文本的多样性，建议只设置其中一个值。</p></td></tr><tr><td><p><strong>top_k</strong><code>integer</code>（可选）默认值为1</p><p>生成过程中采样候选集的大小。例如，取值为50时，仅将单次生成中得分最高的50个Token组成随机采样的候选集。取值越大，生成的随机性越高；取值越小，生成的确定性越高。取值为None或当top_k大于100时，表示不启用top_k策略，此时仅有top_p策略生效。</p><p>取值需要大于或等于0。</p><p>该参数非OpenAI标准参数。通过 Python SDK调用时，请放入 <strong>extra_body</strong> 对象中，配置方式为：<code>extra_body={"top_k": xxx}</code>；通过 Node.js SDK或HTTP方式调用时，请作为顶层参数传递。</p></td></tr><tr><td><p><strong>repetition_penalty</strong><code>float</code>（可选）默认值为1.0</p><p>模型生成时连续序列中的重复度。提高repetition_penalty时可以降低模型生成的重复度，1.0表示不做惩罚。没有严格的取值范围，只要大于0即可。</p><p>该参数非OpenAI标准参数。通过 Python SDK调用时，请放入 <strong>extra_body</strong> 对象中，配置方式为：<code>extra_body={"repetition_penalty": xxx}</code>；通过 Node.js SDK或HTTP方式调用时，请作为顶层参数传递。</p></td></tr><tr><td><p><strong>translation_options</strong><code>object</code><strong>（必选）</strong></p><p>需配置的翻译参数。</p><section class="collapse expanded" id="accordion-属性-3"><p>属性</p><div><p><strong>source_lang</strong> <code>string</code> （必选）</p><p>源语言的英文全称，详情请参见<a href="/zh/model-studio/machine-translation#038d2865bbydc">支持的语言</a>。若设为<code>auto</code>，模型会自动识别输入的语种。</p><p><strong>target_lang</strong> <code>string</code> （必选）</p><p>目标语言的英文全称，详情请参见<a href="/zh/model-studio/machine-translation#038d2865bbydc">支持的语言</a>。</p><p><strong>terms</strong> <code>arrays</code> （可选）</p><p>使用<a href="/zh/model-studio/machine-translation#2bf54a5ab5voe">术语干预</a>功能时需设置的术语数组。</p><section class="collapse" id="accordion-属性-4"><p>属性</p><div><p><strong>source</strong> <code>string</code> （必选）</p><p>源语言的术语。</p><p><strong>target</strong> <code>string</code> （必选）</p><p>目标语言的术语。</p></div></section><p><strong>tm_list</strong> <code>arrays</code> （可选）</p><p>使用<a href="/zh/model-studio/machine-translation#17e15234e7gfp">翻译记忆</a>功能时需设置的翻译记忆数组。</p><section class="collapse" id="accordion-属性-5"><p>属性</p><div><p><strong>source</strong> <code>string</code> （必选）</p><p>源语言的语句。</p><p><strong>target</strong> <code>string</code> （必选）</p><p>目标语言的语句。</p></div></section><p><strong>domains</strong> <code>string</code> （可选）</p><p>使用<a href="/zh/model-studio/machine-translation#4af23a31db7lf">领域提示</a>功能时需设置的领域提示语句。</p><blockquote><p>领域提示语句暂时只支持英文。</p></blockquote></div></section><p>该参数非OpenAI标准参数。通过 Python SDK调用时，请放入 <strong>extra_body</strong> 对象中，配置方式为：<code>extra_body={"translation_options": xxx}</code>；通过 Node.js SDK或HTTP方式调用时，请作为顶层参数传递。</p></td></tr></tbody></table>

<table><colgroup><col style="width:57.57%"><col style="width:42.43%"></colgroup><tbody><tr><td><h3>chat响应对象（非流式输出）<span id="cd3063363egdc"></span></h3></td><td rowspan="9"><pre data-tag="codeblock" id="code-block-13" outputclass="language-json" code-type="xCode" class="pre codeblock language-json"><code>{
  "id": "chatcmpl-999a5d8a-f646-4039-968a-167743ae0f22",
  "choices": [
    {
      "finish_reason": "stop",
      "index": 0,
      "logprobs": null,
      "message": {
        "content": "I didn't laugh after watching this video.",
        "refusal": null,
        "role": "assistant",
        "annotations": null,
        "audio": null,
        "function_call": null,
        "tool_calls": null
      }
    }
  ],
  "created": 1762346157,
  "model": "qwen-mt-plus",
  "object": "chat.completion",
  "service_tier": null,
  "system_fingerprint": null,
  "usage": {
    "completion_tokens": 9,
    "prompt_tokens": 53,
    "total_tokens": 62,
    "completion_tokens_details": null,
    "prompt_tokens_details": null
  }
}
</code></pre></td></tr><tr><td><p><strong>id</strong><code>string</code></p><p>本次请求的唯一标识符。</p></td></tr><tr><td><p><strong>choices</strong><code>array</code></p><p>模型生成内容的数组。</p><section class="collapse expanded" id="accordion-属性-6"><p>属性</p><div><p><strong>finish_reason</strong><code>string</code></p><p>模型停止生成的原因。</p><p>有两种情况：</p><ul><li>自然停止输出时为<code>stop</code>；</li><li>生成长度过长而结束为<code>length</code>。</li></ul><p><strong>index</strong><code>integer</code></p><p>当前对象在<code>choices</code>数组中的索引。</p><p><strong>message</strong><code>object</code></p><p>模型输出的消息。</p><section class="collapse expanded" id="accordion-属性-7"><p>属性</p><div><p><strong>content</strong> <code>string</code></p><p>模型翻译结果。</p><p><strong>refusal</strong> <code>string</code></p><p>该参数当前固定为<code>null</code>。</p><p><strong>role</strong> <code>string</code></p><p>消息的角色，固定为<code>assistant</code>。</p><p><strong>audio</strong> <code>object</code></p><p>该参数当前固定为<code>null</code>。</p><p><strong>function_call</strong> <code>object</code></p><p>该参数当前固定为<code>null</code>。</p><p><strong>tool_calls</strong> <code>array</code></p><p>该参数当前固定为<code>null</code>。</p></div></section></div></section></td></tr><tr><td><p><strong>created</strong><code>integer</code></p><p>本次请求被创建时的时间戳。</p></td></tr><tr><td><p><strong>model</strong><code>string</code></p><p>本次请求使用的模型。</p></td></tr><tr><td><p><strong>object</strong> <code>string</code></p><p>始终为<code>chat.completion</code>。</p></td></tr><tr><td><p><strong>service_tier</strong> <code>string</code></p><p>该参数当前固定为<code>null</code>。</p></td></tr><tr><td><p><strong>system_fingerprint</strong><code>string</code></p><p>该参数当前固定为<code>null</code>。</p></td></tr><tr><td><p><strong>usage</strong> <code>object</code></p><p>本次请求的 Token 消耗信息。</p><section class="collapse" id="accordion-属性-8"><p>属性</p><div><p><strong>completion_tokens</strong> <code>integer</code></p><p>模型输出的 Token 数。</p><p><strong>prompt_tokens</strong> <code>integer</code></p><p>输入的 Token 数。</p><p><strong>total_tokens</strong> <code>integer</code></p><p>消耗的总 Token 数，为<code>prompt_tokens</code>与<code>completion_tokens</code>的总和。</p><p><strong>completion_tokens_details</strong> <code>object</code></p><p>该参数当前固定为<code>null</code>。</p><p><strong>prompt_tokens_details</strong> <code>object</code></p><p>该参数当前固定为<code>null</code>。</p></div></section></td></tr></tbody></table>

<table><colgroup><col style="width:57.13%"><col style="width:42.87%"></colgroup><tbody><tr><td><h3>chat响应chunk对象（流式输出）<span id="e98e6b7aa5nb2"></span></h3></td><td rowspan="9"><div outputclass="tabbed-codeblock" data-tag="fig" id="fig-code-group" class="tabbed-codeblock-box"><div class="tab-box"></div><input id="fig-code-group-增量输出-tab" type="radio" name="check-fig-code-group" checked=""><label for="fig-code-group-增量输出-tab">增量输出</label><div class="codeblock-item"><pre data-tag="codeblock" id="code-code-group-增量输出" outputclass="language-json" code-type="xCode" class="pre codeblock language-json"><code>{"id": "chatcmpl-d8aa6596-b366-4ed0-9f6d-2e89247f554e", "choices": [{"delta": {"content": "", "function_call": null, "refusal": null, "role": "assistant", "tool_calls": null}, "finish_reason": null, "index": 0, "logprobs": null}], "created": 1762504029, "model": "qwen-mt-flash", "object": "chat.completion.chunk", "service_tier": null, "system_fingerprint": null, "usage": null}
{"id": "chatcmpl-d8aa6596-b366-4ed0-9f6d-2e89247f554e", "choices": [{"delta": {"content": "I", "function_call": null, "refusal": null, "role": null, "tool_calls": null}, "finish_reason": null, "index": 0, "logprobs": null}], "created": 1762504029, "model": "qwen-mt-flash", "object": "chat.completion.chunk", "service_tier": null, "system_fingerprint": null, "usage": null}
{"id": "chatcmpl-d8aa6596-b366-4ed0-9f6d-2e89247f554e", "choices": [{"delta": {"content": " didn", "function_call": null, "refusal": null, "role": null, "tool_calls": null}, "finish_reason": null, "index": 0, "logprobs": null}], "created": 1762504029, "model": "qwen-mt-flash", "object": "chat.completion.chunk", "service_tier": null, "system_fingerprint": null, "usage": null}
{"id": "chatcmpl-d8aa6596-b366-4ed0-9f6d-2e89247f554e", "choices": [{"delta": {"content": "'t", "function_call": null, "refusal": null, "role": null, "tool_calls": null}, "finish_reason": null, "index": 0, "logprobs": null}], "created": 1762504029, "model": "qwen-mt-flash", "object": "chat.completion.chunk", "service_tier": null, "system_fingerprint": null, "usage": null}
{"id": "chatcmpl-d8aa6596-b366-4ed0-9f6d-2e89247f554e", "choices": [{"delta": {"content": " laugh", "function_call": null, "refusal": null, "role": null, "tool_calls": null}, "finish_reason": null, "index": 0, "logprobs": null}], "created": 1762504029, "model": "qwen-mt-flash", "object": "chat.completion.chunk", "service_tier": null, "system_fingerprint": null, "usage": null}
{"id": "chatcmpl-d8aa6596-b366-4ed0-9f6d-2e89247f554e", "choices": [{"delta": {"content": " after", "function_call": null, "refusal": null, "role": null, "tool_calls": null}, "finish_reason": null, "index": 0, "logprobs": null}], "created": 1762504029, "model": "qwen-mt-flash", "object": "chat.completion.chunk", "service_tier": null, "system_fingerprint": null, "usage": null}
{"id": "chatcmpl-d8aa6596-b366-4ed0-9f6d-2e89247f554e", "choices": [{"delta": {"content": " watching", "function_call": null, "refusal": null, "role": null, "tool_calls": null}, "finish_reason": null, "index": 0, "logprobs": null}], "created": 1762504029, "model": "qwen-mt-flash", "object": "chat.completion.chunk", "service_tier": null, "system_fingerprint": null, "usage": null}
{"id": "chatcmpl-d8aa6596-b366-4ed0-9f6d-2e89247f554e", "choices": [{"delta": {"content": " this", "function_call": null, "refusal": null, "role": null, "tool_calls": null}, "finish_reason": null, "index": 0, "logprobs": null}], "created": 1762504029, "model": "qwen-mt-flash", "object": "chat.completion.chunk", "service_tier": null, "system_fingerprint": null, "usage": null}
{"id": "chatcmpl-d8aa6596-b366-4ed0-9f6d-2e89247f554e", "choices": [{"delta": {"content": " video", "function_call": null, "refusal": null, "role": null, "tool_calls": null}, "finish_reason": null, "index": 0, "logprobs": null}], "created": 1762504029, "model": "qwen-mt-flash", "object": "chat.completion.chunk", "service_tier": null, "system_fingerprint": null, "usage": null}
{"id": "chatcmpl-d8aa6596-b366-4ed0-9f6d-2e89247f554e", "choices": [{"delta": {"content": ".", "function_call": null, "refusal": null, "role": null, "tool_calls": null}, "finish_reason": null, "index": 0, "logprobs": null}], "created": 1762504029, "model": "qwen-mt-flash", "object": "chat.completion.chunk", "service_tier": null, "system_fingerprint": null, "usage": null}
{"id": "chatcmpl-d8aa6596-b366-4ed0-9f6d-2e89247f554e", "choices": [{"delta": {"content": "", "function_call": null, "refusal": null, "role": null, "tool_calls": null}, "finish_reason": "stop", "index": 0, "logprobs": null}], "created": 1762504029, "model": "qwen-mt-flash", "object": "chat.completion.chunk", "service_tier": null, "system_fingerprint": null, "usage": null}
{"id": "chatcmpl-d8aa6596-b366-4ed0-9f6d-2e89247f554e", "choices": [{"delta": {"content": "", "function_call": null, "refusal": null, "role": null, "tool_calls": null}, "finish_reason": "stop", "index": 0, "logprobs": null}], "created": 1762504029, "model": "qwen-mt-flash", "object": "chat.completion.chunk", "service_tier": null, "system_fingerprint": null, "usage": null}
{"id": "chatcmpl-d8aa6596-b366-4ed0-9f6d-2e89247f554e", "choices": [], "created": 1762504029, "model": "qwen-mt-flash", "object": "chat.completion.chunk", "service_tier": null, "system_fingerprint": null, "usage": {"completion_tokens": 9, "prompt_tokens": 56, "total_tokens": 65, "completion_tokens_details": null, "prompt_tokens_details": null}}
</code></pre></div><input id="fig-code-group-非增量输出-tab" type="radio" name="check-fig-code-group"><label for="fig-code-group-非增量输出-tab">非增量输出</label><div class="codeblock-item"><pre data-tag="codeblock" id="code-code-group-非增量输出" outputclass="language-json" code-type="xCode" class="pre codeblock language-json"><code>{"id":"chatcmpl-478e183e-cbdc-4ea0-aeae-4c2ba1d03e4d","choices":[{"delta":{"content":"","function_call":null,"refusal":null,"role":"assistant","tool_calls":null},"finish_reason":null,"index":0,"logprobs":null}],"created":1762346453,"model":"qwen-mt-plus","object":"chat.completion.chunk","service_tier":null,"system_fingerprint":null,"usage":null}
{"id":"chatcmpl-478e183e-cbdc-4ea0-aeae-4c2ba1d03e4d","choices":[{"delta":{"content":"I","function_call":null,"refusal":null,"role":null,"tool_calls":null},"finish_reason":null,"index":0,"logprobs":null}],"created":1762346453,"model":"qwen-mt-plus","object":"chat.completion.chunk","service_tier":null,"system_fingerprint":null,"usage":null}
{"id":"chatcmpl-478e183e-cbdc-4ea0-aeae-4c2ba1d03e4d","choices":[{"delta":{"content":"I didn","function_call":null,"refusal":null,"role":null,"tool_calls":null},"finish_reason":null,"index":0,"logprobs":null}],"created":1762346453,"model":"qwen-mt-plus","object":"chat.completion.chunk","service_tier":null,"system_fingerprint":null,"usage":null}
{"id":"chatcmpl-478e183e-cbdc-4ea0-aeae-4c2ba1d03e4d","choices":[{"delta":{"content":"I didn’t","function_call":null,"refusal":null,"role":null,"tool_calls":null},"finish_reason":null,"index":0,"logprobs":null}],"created":1762346453,"model":"qwen-mt-plus","object":"chat.completion.chunk","service_tier":null,"system_fingerprint":null,"usage":null}
{"id":"chatcmpl-478e183e-cbdc-4ea0-aeae-4c2ba1d03e4d","choices":[{"delta":{"content":"I didn’t laugh","function_call":null,"refusal":null,"role":null,"tool_calls":null},"finish_reason":null,"index":0,"logprobs":null}],"created":1762346453,"model":"qwen-mt-plus","object":"chat.completion.chunk","service_tier":null,"system_fingerprint":null,"usage":null}
{"id":"chatcmpl-478e183e-cbdc-4ea0-aeae-4c2ba1d03e4d","choices":[{"delta":{"content":"I didn’t laugh after","function_call":null,"refusal":null,"role":null,"tool_calls":null},"finish_reason":null,"index":0,"logprobs":null}],"created":1762346453,"model":"qwen-mt-plus","object":"chat.completion.chunk","service_tier":null,"system_fingerprint":null,"usage":null}
{"id":"chatcmpl-478e183e-cbdc-4ea0-aeae-4c2ba1d03e4d","choices":[{"delta":{"content":"I didn’t laugh after watching","function_call":null,"refusal":null,"role":null,"tool_calls":null},"finish_reason":null,"index":0,"logprobs":null}],"created":1762346453,"model":"qwen-mt-plus","object":"chat.completion.chunk","service_tier":null,"system_fingerprint":null,"usage":null}
{"id":"chatcmpl-478e183e-cbdc-4ea0-aeae-4c2ba1d03e4d","choices":[{"delta":{"content":"I didn’t laugh after watching this","function_call":null,"refusal":null,"role":null,"tool_calls":null},"finish_reason":null,"index":0,"logprobs":null}],"created":1762346453,"model":"qwen-mt-plus","object":"chat.completion.chunk","service_tier":null,"system_fingerprint":null,"usage":null}
{"id":"chatcmpl-478e183e-cbdc-4ea0-aeae-4c2ba1d03e4d","choices":[{"delta":{"content":"I didn’t laugh after watching this video","function_call":null,"refusal":null,"role":null,"tool_calls":null},"finish_reason":null,"index":0,"logprobs":null}],"created":1762346453,"model":"qwen-mt-plus","object":"chat.completion.chunk","service_tier":null,"system_fingerprint":null,"usage":null}
{"id":"chatcmpl-478e183e-cbdc-4ea0-aeae-4c2ba1d03e4d","choices":[{"delta":{"content":"I didn’t laugh after watching this video.","function_call":null,"refusal":null,"role":null,"tool_calls":null},"finish_reason":null,"index":0,"logprobs":null}],"created":1762346453,"model":"qwen-mt-plus","object":"chat.completion.chunk","service_tier":null,"system_fingerprint":null,"usage":null}
{"id":"chatcmpl-478e183e-cbdc-4ea0-aeae-4c2ba1d03e4d","choices":[{"delta":{"content":"I didn’t laugh after watching this video.","function_call":null,"refusal":null,"role":null,"tool_calls":null},"finish_reason":"stop","index":0,"logprobs":null}],"created":1762346453,"model":"qwen-mt-plus","object":"chat.completion.chunk","service_tier":null,"system_fingerprint":null,"usage":null}
{"id":"chatcmpl-478e183e-cbdc-4ea0-aeae-4c2ba1d03e4d","choices":[{"delta":{"content":"I didn’t laugh after watching this video.","function_call":null,"refusal":null,"role":null,"tool_calls":null},"finish_reason":"stop","index":0,"logprobs":null}],"created":1762346453,"model":"qwen-mt-plus","object":"chat.completion.chunk","service_tier":null,"system_fingerprint":null,"usage":null}
{"id":"chatcmpl-478e183e-cbdc-4ea0-aeae-4c2ba1d03e4d","choices":[],"created":1762346453,"model":"qwen-mt-plus","object":"chat.completion.chunk","service_tier":null,"system_fingerprint":null,"usage":{"completion_tokens":9,"prompt_tokens":56,"total_tokens":65,"completion_tokens_details":null,"prompt_tokens_details":null}}
</code></pre></div></div></td></tr><tr><td><p><strong>id</strong><code>string</code></p><p>本次调用的唯一标识符。每个chunk对象有相同的 id。</p></td></tr><tr><td><p><strong>choices</strong><code>array</code></p><p>模型生成内容的数组。若设置<code>include_usage</code>参数为<code>true</code>，则在最后一个chunk中为空。</p><section class="collapse expanded" id="accordion-属性-9"><p>属性</p><div><p><strong>delta</strong> <code>object</code></p><p>流式返回的输出内容。</p><section class="collapse expanded" id="accordion-属性-10"><p>属性</p><div><p><strong>content</strong> <code>string</code></p><p>翻译结果，qwen-mt-flash和qwen-mt-lite为增量式更新，qwen-mt-plus和qwen-mt-turbo为非增量式更新。</p><p><strong>function_call</strong> <code>object</code></p><p>该参数当前固定为<code>null</code>。</p><p><strong>refusal</strong> <code>object</code></p><p>该参数当前固定为<code>null</code>。</p><p><strong>role</strong> <code>string</code></p><p>消息对象的角色，只在第一个chunk中有值。</p></div></section><p><strong>finish_reason</strong> <code>string</code></p><p>模型停止生成的原因。有三种情况：</p><ul><li>自然停止输出时为<code>stop</code>；</li><li>生成未结束时为<code>null</code>；</li><li>生成长度过长而结束为<code>length</code>。</li></ul><p><strong>index</strong> <code>integer</code></p><p>当前响应在<code>choices</code>数组中的索引。</p></div></section></td></tr><tr><td><p><strong>created</strong><code>integer</code></p><p>本次请求被创建时的时间戳。每个chunk有相同的时间戳。</p></td></tr><tr><td><p><strong>model</strong><code>string</code></p><p>本次请求使用的模型。</p></td></tr><tr><td><p><strong>object</strong> <code>string</code></p><p>始终为<code>chat.completion.chunk</code>。</p></td></tr><tr><td><p><strong>service_tier</strong> <code>string</code></p><p>该参数当前固定为<code>null</code>。</p></td></tr><tr><td><p><strong>system_fingerprint</strong><code>string</code></p><p>该参数当前固定为<code>null</code>。</p></td></tr><tr><td><p><strong>usage</strong> <code>object</code></p><p>本次请求消耗的Token。只在<code>include_usage</code>为<code>true</code>时，在最后一个chunk返回。</p><section class="collapse" id="accordion-属性-11"><p>属性</p><div><p><strong>completion_tokens</strong> <code>integer</code></p><p>模型输出的 Token 数。</p><p><strong>prompt_tokens</strong> <code>integer</code></p><p>输入 Token 数。</p><p><strong>total_tokens</strong> <code>integer</code></p><p>总 Token 数，为<code>prompt_tokens</code>与<code>completion_tokens</code>的总和。</p><p><strong>completion_tokens_details</strong> <code>object</code></p><p>该参数当前固定为<code>null</code>。</p><p><strong>prompt_tokens_details</strong> <code>object</code></p><p>该参数当前固定为<code>null</code>。</p></div></section></td></tr></tbody></table>

## DashScope

#### 北京地域

HTTP 请求地址：`POST https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/api/v1/services/aigc/text-generation/generation`

SDK 调用无需配置 `base_url`，其默认值为`https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/api/v1`。

#### 新加坡地域

HTTP 请求地址：`POST https://{WorkspaceId}.ap-southeast-1.maas.aliyuncs.com/api/v1/services/aigc/text-generation/generation`

SDK调用配置的`base_url`：

#### Python代码

```
dashscope.base_http_api_url = 'https://{WorkspaceId}.ap-southeast-1.maas.aliyuncs.com/api/v1'
```

#### Java代码

-   **方式一：**

```
import com.alibaba.dashscope.protocol.Protocol;
Generation gen = new Generation(Protocol.HTTP.getValue(), "https://{WorkspaceId}.ap-southeast-1.maas.aliyuncs.com/api/v1");
```

-   **方式二：**

```
import com.alibaba.dashscope.utils.Constants;
Constants.baseHttpApiUrl="https://{WorkspaceId}.ap-southeast-1.maas.aliyuncs.com/api/v1";
```

#### 美国（弗吉尼亚）地域

HTTP 请求地址：`POST https://{WorkspaceId}.us-east-1.maas.aliyuncs.com/api/v1/services/aigc/text-generation/generation`

SDK调用配置的`base_url`：

#### Python代码

```
dashscope.base_http_api_url = 'https://{WorkspaceId}.us-east-1.maas.aliyuncs.com/api/v1'
```

#### Java代码

-   **方式一：**

```
import com.alibaba.dashscope.protocol.Protocol;
Generation gen = new Generation(Protocol.HTTP.getValue(), "https://{WorkspaceId}.us-east-1.maas.aliyuncs.com/api/v1");
```

-   **方式二：**

```
import com.alibaba.dashscope.utils.Constants;
Constants.baseHttpApiUrl="https://{WorkspaceId}.us-east-1.maas.aliyuncs.com/api/v1";
```

#### 新加坡地域

HTTP 请求地址：`POST https://{WorkspaceId}.ap-southeast-1.maas.aliyuncs.com/api/v1/services/aigc/text-generation/generation`

SDK调用配置的`base_url`：

#### Python代码

```
dashscope.base_http_api_url = 'https://{WorkspaceId}.ap-southeast-1.maas.aliyuncs.com/api/v1'
```

#### Java代码

-   **方式一：**

```
import com.alibaba.dashscope.protocol.Protocol;
Generation gen = new Generation(Protocol.HTTP.getValue(), "https://{WorkspaceId}.ap-southeast-1.maas.aliyuncs.com/api/v1");
```

-   **方式二：**

```
import com.alibaba.dashscope.utils.Constants;
Constants.baseHttpApiUrl="https://{WorkspaceId}.ap-southeast-1.maas.aliyuncs.com/api/v1";
```

#### 美国（弗吉尼亚）地域

HTTP 请求地址：`POST https://{WorkspaceId}.us-east-1.maas.aliyuncs.com/api/v1/services/aigc/text-generation/generation`

SDK调用配置的`base_url`：

#### Python代码

```
dashscope.base_http_api_url = 'https://{WorkspaceId}.us-east-1.maas.aliyuncs.com/api/v1'
```

#### Java代码

-   **方式一：**

```
import com.alibaba.dashscope.protocol.Protocol;
Generation gen = new Generation(Protocol.HTTP.getValue(), "https://{WorkspaceId}.us-east-1.maas.aliyuncs.com/api/v1");
```

-   **方式二：**

```
import com.alibaba.dashscope.utils.Constants;
Constants.baseHttpApiUrl="https://{WorkspaceId}.us-east-1.maas.aliyuncs.com/api/v1";
```

#### 北京地域

HTTP 请求地址：`POST https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/api/v1/services/aigc/text-generation/generation`

SDK 调用无需配置 `base_url`，其默认值为`https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/api/v1`。

> 您需要已 [获取与配置 API Key](/zh/model-studio/get-api-key) 并 [配置API Key到环境变量](/zh/model-studio/configure-api-key-through-environment-variables) 。若通过DashScope SDK进行调用，需要 [安装DashScope SDK](/zh/model-studio/install-sdk) 。

<table><colgroup><col style="width:56.98%"><col style="width:43.02%"></colgroup><tbody><tr><td><h3>请求体<span id="2a1c410015otp"></span></h3></td><td rowspan="11"><section data-tag="tabbed-content-box" outputclass="tabbed-content-box" id="sec-tabs-14" class="tabbed-content-box section"><section id="基础使用-2" class="section"><h4 id="基础使用-2-h4">基础使用</h4><section data-tag="tabbed-content-box" outputclass="tabbed-content-box" id="sec-tabs-15" class="tabbed-content-box section"><section id="python-5" class="section"><h4 id="python-5-h4">Python</h4><pre data-tag="codeblock" id="code-block-26" outputclass="language-python" code-type="xCode" class="pre codeblock language-python"><code>import os
import dashscope

# 若使用新加坡地域的模型，请将{WorkspaceId}替换为真实的业务空间ID，并释放下列注释
# dashscope.base_http_api_url = "https://{WorkspaceId}.ap-southeast-1.maas.aliyuncs.com/api/v1"

messages = [
    {
        "role": "user",
        "content": "我看到这个视频后没有笑"
    }
]
translation_options = {
    "source_lang": "auto",
    "target_lang": "English",
}
response = dashscope.Generation.call(
    # 若没有配置环境变量，请用阿里云百炼API Key将下行替换为：api_key="sk-xxx",
    api_key=os.getenv('DASHSCOPE_API_KEY'),
    model="qwen-mt-plus",
    messages=messages,
    result_format='message',
    translation_options=translation_options
)
print(response.output.choices[0].message.content)
</code></pre></section><section id="java" class="section"><h4 id="java-h4">Java</h4><pre data-tag="codeblock" id="code-block-27" outputclass="language-java" code-type="xCode" class="pre codeblock language-java"><code>// DashScope SDK 版本需要不低于 2.20.6
import java.lang.System;
import java.util.Collections;
import com.alibaba.dashscope.aigc.generation.Generation;
import com.alibaba.dashscope.aigc.generation.GenerationParam;
import com.alibaba.dashscope.aigc.generation.GenerationResult;
import com.alibaba.dashscope.aigc.generation.TranslationOptions;
import com.alibaba.dashscope.common.Message;
import com.alibaba.dashscope.common.Role;
import com.alibaba.dashscope.exception.ApiException;
import com.alibaba.dashscope.exception.InputRequiredException;
import com.alibaba.dashscope.exception.NoApiKeyException;
import com.alibaba.dashscope.utils.Constants;

public class Main {
    // 若使用新加坡地域的模型，请将{WorkspaceId}替换为真实的业务空间ID，并释放下列注释
    // static {Constants.baseHttpApiUrl="https://{WorkspaceId}.ap-southeast-1.maas.aliyuncs.com/api/v1";}
    public static GenerationResult callWithMessage() throws ApiException, NoApiKeyException, InputRequiredException {
        Generation gen = new Generation();
        Message userMsg = Message.builder()
                .role(Role.USER.getValue())
                .content("我看到这个视频后没有笑")
                .build();
        TranslationOptions options = TranslationOptions.builder()
                .sourceLang("auto")
                .targetLang("English")
                .build();
        GenerationParam param = GenerationParam.builder()
                // 若没有配置环境变量，请用阿里云百炼API Key将下行替换为：.apiKey("sk-xxx")
                .apiKey(System.getenv("DASHSCOPE_API_KEY"))
                .model("qwen-mt-plus")
                .messages(Collections.singletonList(userMsg))
                .resultFormat(GenerationParam.ResultFormat.MESSAGE)
                .translationOptions(options)
                .build();
        return gen.call(param);
    }
    public static void main(String[] args) {
        // 以下为华北2（北京）地域的配置，调用时请将{WorkspaceId}替换为真实的业务空间ID，各地域的配置不同。
        Constants.baseHttpApiUrl = "https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/api/v1";
        try {
            GenerationResult result = callWithMessage();
            System.out.println(result.getOutput().getChoices().get(0).getMessage().getContent());
        } catch (ApiException | NoApiKeyException | InputRequiredException e) {
            System.err.println("错误信息："+e.getMessage());
            e.printStackTrace();
        } finally {
            System.exit(0);
        }
    }
}
</code></pre></section><section id="curl-5" class="section"><h4 id="curl-5-h4">curl</h4><p>各地域的<a href="/zh/model-studio/qwen-mt-api">请求地址</a>和API Key不同，以下是北京地域的请求地址。</p><pre data-tag="codeblock" id="code-block-28" outputclass="language-bash" code-type="xCode" class="pre codeblock language-bash"><code>curl -X POST https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/api/v1/services/aigc/text-generation/generation \
-H "Authorization: $DASHSCOPE_API_KEY" \
-H "Content-Type: application/json" \
-d '{
  "model": "qwen-mt-plus",
  "input": {
    "messages": [
      {
        "content": "我看到这个视频后没有笑",
        "role": "user"
      }
    ]
  },
  "parameters": {
    "translation_options": {
      "source_lang": "auto",
      "target_lang": "English"
    }
  }
}'
</code></pre></section></section></section><section id="术语干预-2" class="section"><h4 id="术语干预-2-h4">术语干预</h4><section data-tag="tabbed-content-box" outputclass="tabbed-content-box" id="sec-tabs-16" class="tabbed-content-box section"><section id="python-6" class="section"><h4 id="python-6-h4">Python</h4><pre data-tag="codeblock" id="code-block-29" outputclass="language-python" code-type="xCode" class="pre codeblock language-python"><code>import os
import dashscope

# 若使用新加坡地域的模型，请将{WorkspaceId}替换为真实的业务空间ID，并释放下列注释
# dashscope.base_http_api_url = "https://{WorkspaceId}.ap-southeast-1.maas.aliyuncs.com/api/v1"
messages = [
    {
        "role": "user",
        "content": "而这套生物传感器运用了石墨烯这种新型材料，它的目标物是化学元素，敏锐的“嗅觉”让它能更深度、准确地体现身体健康状况。"
    }
]
translation_options = {
    "source_lang": "Chinese",
    "target_lang": "English",
    "terms": [
        {
            "source": "生物传感器",
            "target": "biological sensor"
        },
        {
            "source": "石墨烯",
            "target": "graphene"
        },
        {
            "source": "化学元素",
            "target": "chemical elements"
        },
        {
            "source": "身体健康状况",
            "target": "health status of the body"
        }
    ]
}
response = dashscope.Generation.call(
    # 若没有配置环境变量，请用阿里云百炼API Key将下行替换为：api_key="sk-xxx",
    api_key=os.getenv('DASHSCOPE_API_KEY'),
    model="qwen-mt-plus",
    messages=messages,
    result_format='message',
    translation_options=translation_options
)
print(response.output.choices[0].message.content)
</code></pre></section><section id="java-2" class="section"><h4 id="java-2-h4">Java</h4><pre data-tag="codeblock" id="code-block-30" outputclass="language-java" code-type="xCode" class="pre codeblock language-java"><code>// DashScope SDK 版本需要不低于 2.20.6
import java.lang.System;
import java.util.Collections;
import java.util.Arrays;
import com.alibaba.dashscope.aigc.generation.Generation;
import com.alibaba.dashscope.aigc.generation.GenerationParam;
import com.alibaba.dashscope.aigc.generation.GenerationResult;
import com.alibaba.dashscope.aigc.generation.TranslationOptions;
import com.alibaba.dashscope.aigc.generation.TranslationOptions.Term;
import com.alibaba.dashscope.common.Message;
import com.alibaba.dashscope.common.Role;
import com.alibaba.dashscope.exception.ApiException;
import com.alibaba.dashscope.exception.InputRequiredException;
import com.alibaba.dashscope.exception.NoApiKeyException;
import com.alibaba.dashscope.utils.Constants;

public class Main {
    // 若使用新加坡地域的模型，请将{WorkspaceId}替换为真实的业务空间ID，并释放下列注释
    // static {Constants.baseHttpApiUrl="https://{WorkspaceId}.ap-southeast-1.maas.aliyuncs.com/api/v1";}
    public static GenerationResult callWithMessage() throws ApiException, NoApiKeyException, InputRequiredException {
        Generation gen = new Generation();
        Message userMsg = Message.builder()
                .role(Role.USER.getValue())
                .content("而这套生物传感器运用了石墨烯这种新型材料，它的目标物是化学元素，敏锐的“嗅觉”让它能更深度、准确地体现身体健康状况。")
                .build();
        Term term1 = Term.builder()
                .source("生物传感器")
                .target("biological sensor")
                .build();
        Term term2 = Term.builder()
                .source("身体健康状况")
                .target("health status of the body")
                .build();
        TranslationOptions options = TranslationOptions.builder()
                .sourceLang("auto")
                .targetLang("English")
                .terms(Arrays.asList(term1, term2))
                .build();
        GenerationParam param = GenerationParam.builder()
                // 若没有配置环境变量，请用阿里云百炼API Key将下行替换为：.apiKey("sk-xxx")
                .apiKey(System.getenv("DASHSCOPE_API_KEY"))
                .model("qwen-mt-plus")
                .messages(Collections.singletonList(userMsg))
                .resultFormat(GenerationParam.ResultFormat.MESSAGE)
                .translationOptions(options)
                .build();
        return gen.call(param);
    }
    public static void main() {
        try {
            GenerationResult result = callWithMessage();
            System.out.println(result.getOutput().getChoices().get(0).getMessage().getContent());
        } catch (ApiException | NoApiKeyException | InputRequiredException e) {
            System.err.println("错误信息："+e.getMessage());
        }
        System.exit(0);
    }
}
</code></pre></section><section id="curl-6" class="section"><h4 id="curl-6-h4">curl</h4><p>各地域的<a href="/zh/model-studio/qwen-mt-api">请求地址</a>和API Key不同，以下是北京地域的请求地址。</p><pre data-tag="codeblock" id="code-block-31" outputclass="language-bash" code-type="xCode" class="pre codeblock language-bash"><code>curl -X POST https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/api/v1/services/aigc/text-generation/generation \
-H "Authorization: $DASHSCOPE_API_KEY" \
-H 'Content-Type: application/json' \
-d '{
  "model": "qwen-mt-plus",
  "input": {
    "messages": [
      {
        "content": "而这套生物传感器运用了石墨烯这种新型材料，它的目标物是化学元素，敏锐的“嗅觉”让它能更深度、准确地体现身体健康状况。",
        "role": "user"
      }
    ]
  },
  "parameters": {
    "translation_options": {
      "source_lang": "Chinese",
      "target_lang": "English",
      "terms": [
        {
          "source": "生物传感器",
          "target": "biological sensor"
        },
        {
          "source": "身体健康状况",
          "target": "health status of the body"
        }
      ]
  }
}'
</code></pre></section></section></section><section id="翻译记忆-2" class="section"><h4 id="翻译记忆-2-h4">翻译记忆</h4><section data-tag="tabbed-content-box" outputclass="tabbed-content-box" id="sec-tabs-17" class="tabbed-content-box section"><section id="python-7" class="section"><h4 id="python-7-h4">Python</h4><pre data-tag="codeblock" id="code-block-32" outputclass="language-python" code-type="xCode" class="pre codeblock language-python"><code>import os
import dashscope

# 若使用新加坡地域的模型，请将{WorkspaceId}替换为真实的业务空间ID，并释放下列注释
# dashscope.base_http_api_url = "https://{WorkspaceId}.ap-southeast-1.maas.aliyuncs.com/api/v1"
messages = [
    {
        "role": "user",
        "content": "通过如下命令可以看出安装thrift的版本信息；"
    }
]
translation_options = {
    "source_lang": "Chinese",
    "target_lang": "English",
    "tm_list": [
        {
            "source": "您可以通过如下方式查看集群的内核版本信息:",
            "target": "You can use one of the following methods to query the engine version of a cluster:"
        },
        {
            "source": "我们云HBase的thrift环境是0.9.0,所以建议客户端的版本也为 0.9.0,可以从这里下载thrift的0.9.0 版本,下载的源码包我们后面会用到,这里需要先安装thrift编译环境,对于源码安装可以参考thrift官网;",
            "target": "The version of Thrift used by ApsaraDB for HBase is 0.9.0. Therefore, we recommend that you use Thrift 0.9.0 to create a client. Click here to download Thrift 0.9.0. The downloaded source code package will be used later. You must install the Thrift compiling environment first. For more information, see Thrift official website."
        },
        {
            "source": "您可以通过PyPI来安装SDK,安装命令如下:",
            "target": "You can run the following command in Python Package Index (PyPI) to install Elastic Container Instance SDK for Python:"
        }
    ]}
response = dashscope.Generation.call(
    # 若没有配置环境变量，请用阿里云百炼API Key将下行替换为：api_key="sk-xxx",
    api_key=os.getenv('DASHSCOPE_API_KEY'),
    model="qwen-mt-plus",
    messages=messages,
    result_format='message',
    translation_options=translation_options
)
print(response.output.choices[0].message.content)
</code></pre></section><section id="java-3" class="section"><h4 id="java-3-h4">Java</h4><pre data-tag="codeblock" id="code-block-33" outputclass="language-java" code-type="xCode" class="pre codeblock language-java"><code>// DashScope SDK 版本需要不低于 2.20.6
import java.lang.System;
import java.util.Collections;
import java.util.Arrays;
import com.alibaba.dashscope.aigc.generation.Generation;
import com.alibaba.dashscope.aigc.generation.GenerationParam;
import com.alibaba.dashscope.aigc.generation.GenerationResult;
import com.alibaba.dashscope.aigc.generation.TranslationOptions;
import com.alibaba.dashscope.aigc.generation.TranslationOptions.Tm;
import com.alibaba.dashscope.common.Message;
import com.alibaba.dashscope.common.Role;
import com.alibaba.dashscope.exception.ApiException;
import com.alibaba.dashscope.exception.InputRequiredException;
import com.alibaba.dashscope.exception.NoApiKeyException;
import com.alibaba.dashscope.utils.Constants;

public class Main {
    // 若使用新加坡地域的模型，请将{WorkspaceId}替换为真实的业务空间ID，并释放下列注释
    // static {Constants.baseHttpApiUrl="https://{WorkspaceId}.ap-southeast-1.maas.aliyuncs.com/api/v1";}
    public static GenerationResult callWithMessage() throws ApiException, NoApiKeyException, InputRequiredException {
        Generation gen = new Generation();
        Message userMsg = Message.builder()
                .role(Role.USER.getValue())
                .content("通过如下命令可以看出安装thrift的版本信息；")
                .build();
        Tm tm1 = Tm.builder()
                .source("您可以通过如下方式查看集群的内核版本信息:")
                .target("You can use one of the following methods to query the engine version of a cluster:")
                .build();
        Tm tm2 = Tm.builder()
                .source("我们云HBase的thrift环境是0.9.0,所以建议客户端的版本也为 0.9.0,可以从这里下载thrift的0.9.0 版本,下载的源码包我们后面会用到,这里需要先安装thrift编译环境,对于源码安装可以参考thrift官网;")
                .target("The version of Thrift used by ApsaraDB for HBase is 0.9.0. Therefore, we recommend that you use Thrift 0.9.0 to create a client. Click here to download Thrift 0.9.0. The downloaded source code package will be used later. You must install the Thrift compiling environment first. For more information, see Thrift official website.")
                .build();
        Tm tm3 = Tm.builder()
                .source("您可以通过PyPI来安装SDK,安装命令如下:")
                .target("You can run the following command in Python Package Index (PyPI) to install Elastic Container Instance SDK for Python:")
                .build();
        TranslationOptions options = TranslationOptions.builder()
                .sourceLang("auto")
                .targetLang("English")
                .tmList(Arrays.asList(tm1, tm2, tm3))
                .build();
        GenerationParam param = GenerationParam.builder()
                // 若没有配置环境变量，请用阿里云百炼API Key将下行替换为：.apiKey("sk-xxx")
                .apiKey(System.getenv("DASHSCOPE_API_KEY"))
                .model("qwen-mt-plus")
                .messages(Collections.singletonList(userMsg))
                .resultFormat(GenerationParam.ResultFormat.MESSAGE)
                .translationOptions(options)
                .build();
        return gen.call(param);
    }
    public static void main() {
        try {
            GenerationResult result = callWithMessage();
            System.out.println(result.getOutput().getChoices().get(0).getMessage().getContent());
        } catch (ApiException | NoApiKeyException | InputRequiredException e) {
            System.err.println("错误信息："+e.getMessage());
        }
        System.exit(0);
    }
}
</code></pre></section><section id="curl-7" class="section"><h4 id="curl-7-h4">curl</h4><p>各地域的<a href="/zh/model-studio/qwen-mt-api">请求地址</a>和API Key不同，以下是北京地域的请求地址。</p><pre data-tag="codeblock" id="code-block-34" outputclass="language-bash" code-type="xCode" class="pre codeblock language-bash"><code>curl -X POST https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/api/v1/services/aigc/text-generation/generation \
-H "Authorization: $DASHSCOPE_API_KEY" \
-H 'Content-Type: application/json' \
-d '{
  "model": "qwen-mt-plus",
  "input": {
    "messages": [
      {
        "content": "通过如下命令可以看出安装thrift的版本信息；",
        "role": "user"
      }
    ]
  },
  "parameters": {
    "translation_options": {
      "source_lang": "Chinese",
      "target_lang": "English",
      "tm_list":[
          {"source": "您可以通过如下方式查看集群的内核版本信息:", "target": "You can use one of the following methods to query the engine version of a cluster:"},
          {"source": "我们云HBase的thrift环境是0.9.0,所以建议客户端的版本也为 0.9.0,可以从这里下载thrift的0.9.0 版本,下载的源码包我们后面会用到,这里需要先安装thrift编译环境,对于源码安装可以参考thrift官网;", "target": "The version of Thrift used by ApsaraDB for HBase is 0.9.0. Therefore, we recommend that you use Thrift 0.9.0 to create a client. Click here to download Thrift 0.9.0. The downloaded source code package will be used later. You must install the Thrift compiling environment first. For more information, see Thrift official website."},
          {"source": "您可以通过PyPI来安装SDK,安装命令如下:", "target": "You can run the following command in Python Package Index (PyPI) to install Elastic Container Instance SDK for Python:"}
      ]
  }
}'
</code></pre></section></section></section><section id="领域提示-2" class="section"><h4 id="领域提示-2-h4">领域提示</h4><section data-tag="tabbed-content-box" outputclass="tabbed-content-box" id="sec-tabs-18" class="tabbed-content-box section"><section id="python-8" class="section"><h4 id="python-8-h4">Python</h4><pre data-tag="codeblock" id="code-block-35" outputclass="language-python" code-type="xCode" class="pre codeblock language-python"><code>import os
import dashscope

# 若使用新加坡地域的模型，请将{WorkspaceId}替换为真实的业务空间ID，并释放下列注释
# dashscope.base_http_api_url = "https://{WorkspaceId}.ap-southeast-1.maas.aliyuncs.com/api/v1"

messages = [
    {
        "role": "user",
        "content": "第二个SELECT语句返回一个数字，表示在没有LIMIT子句的情况下，第一个SELECT语句返回了多少行。"
    }
]
translation_options = {
    "source_lang": "Chinese",
    "target_lang": "English",
    "domains": "The sentence is from Ali Cloud IT domain. It mainly involves computer-related software development and usage methods, including many terms related to computer software and hardware. Pay attention to professional troubleshooting terminologies and sentence patterns when translating. Translate into this IT domain style."
}
response = dashscope.Generation.call(
    # 若没有配置环境变量，请用阿里云百炼API Key将下行替换为：api_key="sk-xxx",
    api_key=os.getenv('DASHSCOPE_API_KEY'),
    model="qwen-mt-plus",
    messages=messages,
    result_format='message',
    translation_options=translation_options
)
print(response.output.choices[0].message.content)
</code></pre></section><section id="java-4" class="section"><h4 id="java-4-h4">Java</h4><pre data-tag="codeblock" id="code-block-36" outputclass="language-java" code-type="xCode" class="pre codeblock language-java"><code>// DashScope SDK 版本需要不低于 2.20.6
import java.lang.System;
import java.util.Collections;
import com.alibaba.dashscope.aigc.generation.Generation;
import com.alibaba.dashscope.aigc.generation.GenerationParam;
import com.alibaba.dashscope.aigc.generation.GenerationResult;
import com.alibaba.dashscope.aigc.generation.TranslationOptions;
import com.alibaba.dashscope.common.Message;
import com.alibaba.dashscope.common.Role;
import com.alibaba.dashscope.exception.ApiException;
import com.alibaba.dashscope.exception.InputRequiredException;
import com.alibaba.dashscope.exception.NoApiKeyException;
import com.alibaba.dashscope.utils.Constants;

public class Main {
    // 若使用新加坡地域的模型，请将{WorkspaceId}替换为真实的业务空间ID，并释放下列注释
    // static {Constants.baseHttpApiUrl="https://{WorkspaceId}.ap-southeast-1.maas.aliyuncs.com/api/v1";}
    public static GenerationResult callWithMessage() throws ApiException, NoApiKeyException, InputRequiredException {
        Generation gen = new Generation();
        Message userMsg = Message.builder()
                .role(Role.USER.getValue())
                .content("第二个SELECT语句返回一个数字，表示在没有LIMIT子句的情况下，第一个SELECT语句返回了多少行。")
                .build();
        TranslationOptions options = TranslationOptions.builder()
                .sourceLang("auto")
                .targetLang("English")
                .domains("The sentence is from Ali Cloud IT domain. It mainly involves computer-related software development and usage methods, including many terms related to computer software and hardware. Pay attention to professional troubleshooting terminologies and sentence patterns when translating. Translate into this IT domain style.")
                .build();
        GenerationParam param = GenerationParam.builder()
                // 若没有配置环境变量，请用阿里云百炼API Key将下行替换为：.apiKey("sk-xxx")
                .apiKey(System.getenv("DASHSCOPE_API_KEY"))
                .model("qwen-mt-plus")
                .messages(Collections.singletonList(userMsg))
                .resultFormat(GenerationParam.ResultFormat.MESSAGE)
                .translationOptions(options)
                .build();
        return gen.call(param);
    }
    public static void main() {
        try {
            GenerationResult result = callWithMessage();
            System.out.println(result.getOutput().getChoices().get(0).getMessage().getContent());
        } catch (ApiException | NoApiKeyException | InputRequiredException e) {
            System.err.println("错误信息："+e.getMessage());
        }
        System.exit(0);
    }
}
</code></pre></section><section id="curl-8" class="section"><h4 id="curl-8-h4">curl</h4><p>各地域的<a href="/zh/model-studio/qwen-mt-api">请求地址</a>和API Key不同，以下是北京地域的请求地址。</p><pre data-tag="codeblock" id="code-block-37" outputclass="language-bash" code-type="xCode" class="pre codeblock language-bash"><code>curl -X POST https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/api/v1/services/aigc/text-generation/generation \
-H "Authorization: $DASHSCOPE_API_KEY" \
-H 'Content-Type: application/json' \
-d '{
  "model": "qwen-mt-plus",
  "input": {
    "messages": [
      {
        "content": "第二个SELECT语句返回一个数字，表示在没有LIMIT子句的情况下，第一个SELECT语句返回了多少行。",
        "role": "user"
      }
    ]
  },
  "parameters": {
    "translation_options": {
      "source_lang": "Chinese",
      "target_lang": "English",
      "domains": "The sentence is from Ali Cloud IT domain. It mainly involves computer-related software development and usage methods, including many terms related to computer software and hardware. Pay attention to professional troubleshooting terminologies and sentence patterns when translating. Translate into this IT domain style."}
  }
}'
</code></pre></section></section></section></section></td></tr><tr><td><p><strong>model</strong><code>string</code><strong>（必选）</strong></p><p>模型名称。支持的模型：qwen-mt-plus、qwen-mt-flash、qwen-mt-lite、qwen-mt-turbo。</p></td></tr><tr><td><p><strong>messages</strong><code>array</code><strong>（必选）</strong></p><p>消息数组，用于向大模型传递上下文。仅支持传入 User Message。</p><section class="collapse expanded" id="accordion-消息类型-2"><p>消息类型</p><div><p>User Message<code>object</code><strong>（必选）</strong></p><p>用户消息，用于传递待翻译的句子。</p><section class="collapse expanded" id="accordion-属性-12"><p>属性</p><div><p><strong>content</strong><code>string</code><strong>（必选）</strong></p><p>待翻译的句子。</p><p><strong>role</strong><code>string</code><strong>（必选）</strong></p><p>用户消息的角色，必须设为<code>user</code>。</p></div></section></div></section></td></tr><tr><td><p><strong>max_tokens</strong><code>integer</code>（可选）</p><p>用于限制模型输出的最大 Token 数。若生成内容超过此值，响应将被截断。</p><p>默认值与最大值均为模型的最大输出长度，请参见<a href="/zh/model-studio/machine-translation#154957e783dxk">模型选型</a>。</p><blockquote><p>Java SDK中为<strong>maxTokens</strong>*。*通过HTTP调用时，请将 <strong>max_tokens</strong>放入 <strong>parameters</strong> 对象中。</p></blockquote></td></tr><tr><td><p><strong>seed</strong><code>integer</code>（可选）</p><p>随机数种子。用于确保在相同输入和参数下生成结果可复现。若调用时传入相同的&nbsp;<code>seed</code>&nbsp;且其他参数不变，模型将尽可能返回相同结果。</p><p>取值范围：<code>[0,2 31 −1]</code>。</p><blockquote><p>通过HTTP调用时，请将 <strong>seed</strong>放入 <strong>parameters</strong> 对象中。</p></blockquote></td></tr><tr><td><p><strong>temperature</strong><code>float</code>（可选）默认值为0.65</p><p>采样温度，控制模型生成文本的多样性。</p><p>temperature越高，生成的文本更多样，反之，生成的文本更确定。</p><p>取值范围： [0, 2)</p><p>temperature与top_p均可以控制生成文本的多样性，建议只设置其中一个值。</p><blockquote><p>通过HTTP调用时，请将 <strong>temperature</strong>放入 <strong>parameters</strong> 对象中。</p></blockquote></td></tr><tr><td><p><strong>top_p</strong><code>float</code>（可选）默认值为0.8</p><p>核采样的概率阈值，控制模型生成文本的多样性。</p><p>top_p越高，生成的文本更多样。反之，生成的文本更确定。</p><p>取值范围：（0,1.0]</p><p>temperature与top_p均可以控制生成文本的多样性，建议只设置其中一个值。</p><blockquote><p>Java SDK中为<strong>topP</strong>*。*通过HTTP调用时，请将 <strong>top_p</strong>放入 <strong>parameters</strong> 对象中。</p></blockquote></td></tr><tr><td><p><strong>repetition_penalty</strong><code>float</code>（可选）默认值为1.0</p><p>模型生成时连续序列中的重复度。提高repetition_penalty时可以降低模型生成的重复度，1.0表示不做惩罚。没有严格的取值范围，只要大于0即可。</p><blockquote><p>Java SDK中为<strong>repetitionPenalty</strong>*。*通过HTTP调用时，请将 <strong>repetition_penalty</strong>放入 <strong>parameters</strong> 对象中。</p></blockquote></td></tr><tr><td><p><strong>top_k</strong><code>integer</code>（可选）默认值为1</p><p>生成过程中采样候选集的大小。例如，取值为50时，仅将单次生成中得分最高的50个Token组成随机采样的候选集。取值越大，生成的随机性越高；取值越小，生成的确定性越高。取值为None或当top_k大于100时，表示不启用top_k策略，此时仅有top_p策略生效。</p><p>取值需要大于或等于0。</p><blockquote><p>Java SDK中为<strong>topK</strong>*。*通过HTTP调用时，请将 <strong>top_k</strong>放入 <strong>parameters</strong> 对象中。</p></blockquote></td></tr><tr><td><p><strong>stream</strong><code>boolean</code>（可选）</p><p>是否以流式方式输出回复。</p><p>可选值：</p><ul><li><code>false</code>：等待模型生成完整回复后一次性返回。</li><li><code>true</code>：模型边生成边返回数据块。客户端需逐块读取，以还原完整回复。</li></ul><div class="note note-note"><div class="note-icon-wrapper"></div><div class="note-content"><p><strong>说明</strong>当前仅qwen-mt-flash、qwen-mt-lite模型支持以增量形式返回数据，每次返回仅包含新生成的内容。qwen-mt-plus和qwen-mt-turbo模型以非增量形式返回数据，每次返回当前已经生成的整个序列，暂时无法修改。如：</p><p>I</p><p>I didn</p><p>I didn't</p><p>I didn't laugh</p><p>I didn't laugh after</p><p>...</p></div></div><blockquote><p>该参数仅支持Python SDK。通过Java SDK实现流式输出请通过<code>streamCall</code>接口调用；通过HTTP实现流式输出请在Header中指定<code>X-DashScope-SSE</code>为<code>enable</code>。</p></blockquote></td></tr><tr><td><p><strong>translation_options</strong><code>object</code><strong>（必选）</strong></p><p>需配置的翻译参数。</p><section class="collapse expanded" id="accordion-属性-13"><p>属性</p><div><p><strong>source_lang</strong> <code>string</code> （必选）</p><p>源语言的英文全称，详情请参见<a href="/zh/model-studio/machine-translation#038d2865bbydc">支持的语言</a>。若设为<code>auto</code>，模型会自动识别输入的语种。</p><p><strong>target_lang</strong> <code>string</code> （必选）</p><p>目标语言的英文全称，详情请参见<a href="/zh/model-studio/machine-translation#038d2865bbydc">支持的语言</a>。</p><p><strong>terms</strong> <code>arrays</code> （可选）</p><p>使用<a href="/zh/model-studio/machine-translation#2bf54a5ab5voe">术语干预</a>功能时需设置的术语数组。</p><section class="collapse" id="accordion-属性-14"><p>属性</p><div><p><strong>source</strong> <code>string</code> （必选）</p><p>源语言的术语。</p><p><strong>target</strong> <code>string</code> （必选）</p><p>目标语言的术语。</p></div></section><p><strong>tm_list</strong> <code>arrays</code> （可选）</p><p>使用<a href="/zh/model-studio/machine-translation#17e15234e7gfp">翻译记忆</a>功能时需设置的翻译记忆数组。</p><section class="collapse" id="accordion-属性-15"><p>属性</p><div><p><strong>source</strong> <code>string</code> （必选）</p><p>源语言的语句。</p><p><strong>target</strong> <code>string</code> （必选）</p><p>目标语言的语句。</p></div></section><p><strong>domains</strong> <code>string</code> （可选）</p><p>使用<a href="/zh/model-studio/machine-translation#4af23a31db7lf">领域提示</a>功能时需设置的领域提示语句。</p><blockquote><p>领域提示语句暂时只支持英文。</p></blockquote></div></section><blockquote><p>Java SDK中为<code>translationOptions</code>。通过HTTP调用时，请将 <strong>translation_options</strong>放入 <strong>parameters</strong> 对象中。</p></blockquote></td></tr></tbody></table>

<table><colgroup><col style="width:56.83%"><col style="width:43.17%"></colgroup><tbody><tr><td><h3>chat响应对象（流式与非流式输出格式一致）<span id="0e1c44902ea1e"></span></h3></td><td rowspan="6"><pre data-tag="codeblock" id="code-block-38" outputclass="language-json" code-type="xCode" class="pre codeblock language-json"><code>{
  "status_code": 200,
  "request_id": "9b4ec3b2-6d29-40a6-a08b-7e3c9a51c289",
  "code": "",
  "message": "",
  "output": {
    "text": null,
    "finish_reason": "stop",
    "choices": [
      {
        "finish_reason": "stop",
        "message": {
          "role": "assistant",
          "content": "I didn't laugh after watching this video."
        }
      }
    ],
    "model_name": "qwen-mt-plus"
  },
  "usage": {
    "input_tokens": 53,
    "output_tokens": 9,
    "total_tokens": 62
  }
}
</code></pre></td></tr><tr><td><p><strong>status_code</strong><code>string</code></p><p>本次请求的状态码。200 表示请求成功，否则表示请求失败。</p><blockquote><p>Java SDK 通过<code>GenerationResult.getStatusCode()</code>返回该参数（成功时为 200）。调用失败会抛出异常，可通过<code>ApiException.getStatus().getStatusCode()</code>获取错误状态码。</p></blockquote></td></tr><tr><td><p><strong>request_id</strong><code>string</code></p><p>本次调用的唯一标识符。</p><blockquote><p>Java SDK返回参数为<strong>requestId。</strong></p></blockquote></td></tr><tr><td><p><strong>code</strong><code>string</code></p><p>错误码，调用成功时为空值。</p><blockquote><p>只有Python SDK返回该参数。</p></blockquote></td></tr><tr><td><p><strong>output</strong><code>object</code></p><p>调用结果信息。</p><section class="collapse" id="accordion-属性-16"><p>属性</p><div><p><strong>text</strong><code>string</code></p><p>该参数当前固定为<code>null</code>。</p><p><strong>finish_reason</strong><code>string</code></p><p>模型结束生成的原因。有以下情况：</p><ul><li>正在生成时为<code>null</code>；</li><li>模型输出自然结束为<code>stop</code>；</li><li>因生成长度过长而结束为<code>length</code>；</li></ul><p><strong>choices</strong><code>array</code></p><p>模型的输出信息。</p><section class="collapse" id="accordion-属性-17"><p>属性</p><div><p><strong>finish_reason</strong><code>string</code></p><p>有以下情况：</p><ul><li>正在生成时为<code>null</code>；</li><li>因模型输出自然结束为<code>stop</code>；</li><li>因生成长度过长而结束为<code>length</code>；</li></ul><p><strong>message</strong><code>object</code></p><p>模型输出的消息对象。</p><section class="collapse" id="accordion-属性-18"><p>属性</p><div><p><strong>role</strong><code>string</code></p><p>输出消息的角色，固定为<code>assistant</code>。</p><p><strong>content</strong><code>string</code></p><p>翻译的结果。</p></div></section></div></section><p><strong>model_name</strong><code>string</code></p><p>本次请求使用的模型名称。</p></div></section></td></tr><tr><td><p><strong>usage</strong><code>object</code></p><p>本次请求使用的Token信息。</p><section class="collapse" id="accordion-属性-19"><p>属性</p><div><p><strong>input_tokens</strong> <code>integer</code></p><p>输入 Token 数。</p><p><strong>output_tokens</strong> <code>integer</code></p><p>输出 Token 数。</p><p><strong>total_tokens</strong> <code>integer</code></p><p>总 Token 数，为<strong>input_tokens</strong>与<strong>output_tokens</strong>之和<strong>。</strong></p></div></section></td></tr></tbody></table>

## 错误码

如果模型调用失败并返回报错信息，请参见[错误码](/zh/model-studio/error-code)进行解决。

.aliyun-docs-content .one-codeblocks pre {

max-height: calc(80vh - 136px) !important;

height: auto;

}

.tab-item {

font-size: 12px !important; /*你可以根据需要调整字体大小*/

padding: 0px 5px !important;

}

.expandable-content {

border-left: none !important;

border-right: none !important;

border-bottom: none !important;

}
