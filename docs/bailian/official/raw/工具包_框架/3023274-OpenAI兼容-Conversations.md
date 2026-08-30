在跨设备或长时间中断的对话中，手动维护消息列表容易丢失上下文。阿里云百炼提供兼容 OpenAI 的 Conversations API。配合 Responses API，可自动注入历史上下文，无需手动同步消息，实现跨场景、跨设备的对话延续。

## Create conversation

创建一个新会话，可同时添加初始消息项。

**华北2（北京）：POST** `https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/compatible-mode/v1/conversations`

**新加坡：POST** `https://{WorkspaceId}.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1/conversations`

**重要**旧版URL路径 `/api/v2/apps/protocols/compatible-mode/v1/conversations` 即将停止维护，请尽快迁移至新版路径 `/compatible-mode/v1/conversations`。

**重要**阿里云百炼为华北2（北京）、新加坡地域推出了业务空间专属域名，**能够为推理请求提供卓越的性能和更高的稳定性**，建议迁移至新域名：

-   华北2（北京）地域：从 `https://dashscope.aliyuncs.com` 迁移至 `https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com`
-   新加坡地域：从 `https://dashscope-intl.aliyuncs.com` 迁移至 `https://{WorkspaceId}.ap-southeast-1.maas.aliyuncs.com`

其中 `{WorkspaceId}` 为您的业务空间 ID，可在阿里云百炼控制台的**业务空间详情**页面查看。现有域名仍可正常使用。

<table bordertype="no-border"><colgroup><col style="width:57.55%"><col style="width:42.45%"></colgroup><tbody><tr><td><p><strong>items</strong><code>array</code>（可选）</p><p>初始消息项列表，最多20条。</p><section class="collapse expanded" id="accordion-属性"><p>属性</p><div><p><strong>type</strong><code>string</code><strong>(必选)</strong></p><p>消息类型，仅支持 <code>message</code>。</p><p><strong>role</strong><code>string</code><strong>(必选)</strong></p><p>消息的角色。<code>system</code> 与<code>developer</code> 角色的指令优先级高于 <code>user</code> 角色，<code>assistant</code> 角色表示模型在之前交互中生成的消息。取值：<code>user</code> 、<code>assistant</code> 、<code>system</code> 、<code>developer</code> 。</p><p><strong>content</strong><code>string or array</code><strong>(必选)</strong></p><p>消息内容。支持纯文本字符串或结构化内容列表（如 ResponseInputText 对象数组），列表格式可包含文本等多种内容类型。</p></div></section><p><strong>metadata</strong><code>object</code>（可选）</p><p>会话元数据，用于以结构化格式存储会话的附加信息。最多16对键值对，key最大长度64字符，value最大长度512字符。</p></td><td><div outputclass="tabbed-codeblock" data-tag="fig" id="fig-code-group" class="tabbed-codeblock-box"><div class="tab-box"></div><input id="fig-code-group-python-tab" type="radio" name="check-fig-code-group" checked=""><label for="fig-code-group-python-tab">Python</label><div class="codeblock-item"><pre data-tag="codeblock" id="code-code-group-python" outputclass="language-python" code-type="xCode" class="pre codeblock language-python"><code>import os
from openai import OpenAI

client = OpenAI(
    api_key=os.getenv("DASHSCOPE_API_KEY"),
    base_url="https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/compatible-mode/v1",
)

conversation = client.conversations.create(
    metadata={"topic": "demo"},
    items=[
        {"type": "message", "role": "system", "content": "李红，一位温婉而坚韧的江南女子，出生在浙江省杭州市，她今年20岁，她的兴趣爱好是琴棋书画。"}
    ]
)
print(conversation)
</code></pre></div><input id="fig-code-group-node-js-tab" type="radio" name="check-fig-code-group"><label for="fig-code-group-node-js-tab">Node.js</label><div class="codeblock-item"><pre data-tag="codeblock" id="code-code-group-node-js" outputclass="language-javascript" code-type="xCode" class="pre codeblock language-javascript"><code>import OpenAI from "openai";

const client = new OpenAI({
    apiKey: process.env.DASHSCOPE_API_KEY,
    baseURL: "https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/compatible-mode/v1",
});

const conversation = await client.conversations.create({
    metadata: { topic: "demo" },
    items: [
        {
            type: "message",
            role: "system",
            content: "李红，一位温婉而坚韧的江南女子，出生在浙江省杭州市，她今年20岁，她的兴趣爱好是琴棋书画。"
        }
    ]
});
console.log(conversation);
</code></pre></div><input id="fig-code-group-curl-tab" type="radio" name="check-fig-code-group"><label for="fig-code-group-curl-tab">cURL</label><div class="codeblock-item"><pre data-tag="codeblock" id="code-code-group-curl" outputclass="language-bash" code-type="xCode" class="pre codeblock language-bash"><code>curl --location 'https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/compatible-mode/v1/conversations' \
--header 'Content-Type: application/json' \
--header 'Authorization: Bearer $DASHSCOPE_API_KEY' \
--data '{
    "metadata": {
        "topic": "demo"
    },
    "items": [
        {
            "type": "message",
            "role": "system",
            "content": "李红，一位温婉而坚韧的江南女子，出生在浙江省杭州市，她今年20岁，她的兴趣爱好是琴棋书画"
        }
    ]
}'
</code></pre></div></div></td></tr></tbody></table>

### 响应参数

<table bordertype="no-border"><colgroup><col style="width:57.55%"><col style="width:42.45%"></colgroup><tbody><tr><td><p><strong>created_at</strong><code>integer</code></p><p>会话创建的 Unix 时间戳（毫秒）。</p><p><strong>id</strong><code>string</code></p><p>会话唯一标识符。</p><p><strong>metadata</strong><code>object</code></p><p>会话元数据，以键值对形式存储的附加信息。最多16对，key最大长度64字符，value最大长度512字符。</p><p><strong>object</strong><code>string</code></p><p>对象类型，固定为 <code>conversation</code>。</p></td><td><pre data-tag="codeblock" id="code-block" outputclass="language-json" code-type="xCode" class="pre codeblock language-json"><code>{
    "created_at": 1771316949128,
    "id": "conv_xxx",
    "metadata": {
        "topic": "demo"
    },
    "object": "conversation"
}
</code></pre></td></tr></tbody></table>

## Retrieve conversation

获取指定会话的信息。

**华北2（北京）：GET** `https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/compatible-mode/v1/conversations/{conversation_id}`

**新加坡：GET** `https://{WorkspaceId}.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1/conversations/{conversation_id}`

<table bordertype="no-border"><colgroup><col style="width:57.55%"><col style="width:42.45%"></colgroup><tbody><tr><td><p><strong>conversation_id</strong><code>string</code><strong>(必选, Path)</strong></p><p>会话ID。</p></td><td><div outputclass="tabbed-codeblock" data-tag="fig" id="fig-code-group-2" class="tabbed-codeblock-box"><div class="tab-box"></div><input id="fig-code-group-2-python-tab" type="radio" name="check-fig-code-group-2" checked=""><label for="fig-code-group-2-python-tab">Python</label><div class="codeblock-item"><pre data-tag="codeblock" id="code-code-group-2-python" outputclass="language-python" code-type="xCode" class="pre codeblock language-python"><code>import os
from openai import OpenAI

client = OpenAI(
    api_key=os.getenv("DASHSCOPE_API_KEY"),
    base_url="https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/compatible-mode/v1",
)

conversation = client.conversations.retrieve("conv_xxx")
print(conversation)
</code></pre></div><input id="fig-code-group-2-node-js-tab" type="radio" name="check-fig-code-group-2"><label for="fig-code-group-2-node-js-tab">Node.js</label><div class="codeblock-item"><pre data-tag="codeblock" id="code-code-group-2-node-js" outputclass="language-javascript" code-type="xCode" class="pre codeblock language-javascript"><code>import OpenAI from "openai";

const client = new OpenAI({
    apiKey: process.env.DASHSCOPE_API_KEY,
    baseURL: "https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/compatible-mode/v1",
});

const conversation = await client.conversations.retrieve(
    "conv_xxx"
);
console.log(conversation);
</code></pre></div><input id="fig-code-group-2-curl-tab" type="radio" name="check-fig-code-group-2"><label for="fig-code-group-2-curl-tab">cURL</label><div class="codeblock-item"><pre data-tag="codeblock" id="code-code-group-2-curl" outputclass="language-bash" code-type="xCode" class="pre codeblock language-bash"><code>curl --location 'https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/compatible-mode/v1/conversations/conv_xxx' \
--header 'Authorization: Bearer $DASHSCOPE_API_KEY'
</code></pre></div></div></td></tr></tbody></table>

### 响应参数

<table bordertype="no-border"><colgroup><col style="width:57.55%"><col style="width:42.45%"></colgroup><tbody><tr><td><p><strong>created_at</strong><code>integer</code></p><p>会话创建的 Unix 时间戳（毫秒）。</p><p><strong>id</strong><code>string</code></p><p>会话唯一标识符。</p><p><strong>metadata</strong><code>object</code></p><p>会话元数据，以键值对形式存储的附加信息。最多16对，key最大长度64字符，value最大长度512字符。</p><p><strong>object</strong><code>string</code></p><p>对象类型，固定为 <code>conversation</code>。</p></td><td><pre data-tag="codeblock" id="code-block-2" outputclass="language-json" code-type="xCode" class="pre codeblock language-json"><code>{
    "created_at": 1771316949128,
    "id": "conv_xxx",
    "metadata": {
        "topic": "demo"
    },
    "object": "conversation"
}
</code></pre></td></tr></tbody></table>

## Update conversation

更新会话的元数据信息。

**华北2（北京）：POST** `https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/compatible-mode/v1/conversations/{conversation_id}`

**新加坡：POST** `https://{WorkspaceId}.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1/conversations/{conversation_id}`

<table bordertype="no-border"><colgroup><col style="width:57.55%"><col style="width:42.45%"></colgroup><tbody><tr><td><p><strong>conversation_id</strong><code>string</code><strong>(必选, Path)</strong></p><p>会话ID。</p><p><strong>metadata</strong><code>object</code><strong>(必选)</strong></p><p>会话元数据，会完全覆盖原有元数据。最多16对键值对，key最大长度64字符，value最大长度512字符。</p></td><td><div outputclass="tabbed-codeblock" data-tag="fig" id="fig-code-group-3" class="tabbed-codeblock-box"><div class="tab-box"></div><input id="fig-code-group-3-python-tab" type="radio" name="check-fig-code-group-3" checked=""><label for="fig-code-group-3-python-tab">Python</label><div class="codeblock-item"><pre data-tag="codeblock" id="code-code-group-3-python" outputclass="language-python" code-type="xCode" class="pre codeblock language-python"><code>import os
from openai import OpenAI

client = OpenAI(
    api_key=os.getenv("DASHSCOPE_API_KEY"),
    base_url="https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/compatible-mode/v1",
)

updated = client.conversations.update(
    "conv_xxx",
    metadata={"topic": "update"}
)
print(updated)
</code></pre></div><input id="fig-code-group-3-node-js-tab" type="radio" name="check-fig-code-group-3"><label for="fig-code-group-3-node-js-tab">Node.js</label><div class="codeblock-item"><pre data-tag="codeblock" id="code-code-group-3-node-js" outputclass="language-javascript" code-type="xCode" class="pre codeblock language-javascript"><code>import OpenAI from "openai";

const client = new OpenAI({
    apiKey: process.env.DASHSCOPE_API_KEY,
    baseURL: "https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/compatible-mode/v1",
});

const updated = await client.conversations.update(
    "conv_xxx",
    { metadata: { topic: "update" } }
);
console.log(updated);
</code></pre></div><input id="fig-code-group-3-curl-tab" type="radio" name="check-fig-code-group-3"><label for="fig-code-group-3-curl-tab">cURL</label><div class="codeblock-item"><pre data-tag="codeblock" id="code-code-group-3-curl" outputclass="language-bash" code-type="xCode" class="pre codeblock language-bash"><code>curl --location 'https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/compatible-mode/v1/conversations/conv_xxx' \
--header 'Content-Type: application/json' \
--header 'Authorization: Bearer $DASHSCOPE_API_KEY' \
--data '{
    "metadata": {
        "topic": "update"
    }
}'
</code></pre></div></div></td></tr></tbody></table>

### 响应参数

<table bordertype="no-border"><colgroup><col style="width:57.55%"><col style="width:42.45%"></colgroup><tbody><tr><td><p><strong>created_at</strong><code>integer</code></p><p>会话创建的 Unix 时间戳（毫秒）。</p><p><strong>id</strong><code>string</code></p><p>会话唯一标识符。</p><p><strong>metadata</strong><code>object</code></p><p>会话元数据，以键值对形式存储的附加信息。最多16对，key最大长度64字符，value最大长度512字符。</p><p><strong>object</strong><code>string</code></p><p>对象类型，固定为 <code>conversation</code>。</p></td><td><pre data-tag="codeblock" id="code-block-3" outputclass="language-json" code-type="xCode" class="pre codeblock language-json"><code>{
    "created_at": 1771318152759,
    "id": "conv_xxx",
    "metadata": {
        "topic": "update"
    },
    "object": "conversation"
}
</code></pre></td></tr></tbody></table>

## Delete conversation

删除指定会话。会话中的消息项不会被删除。

**华北2（北京）：DELETE** `https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/compatible-mode/v1/conversations/{conversation_id}`

**新加坡：DELETE** `https://{WorkspaceId}.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1/conversations/{conversation_id}`

<table bordertype="no-border"><colgroup><col style="width:57.55%"><col style="width:42.45%"></colgroup><tbody><tr><td><p><strong>conversation_id</strong><code>string</code><strong>(必选, Path)</strong></p><p>会话ID。</p></td><td><div outputclass="tabbed-codeblock" data-tag="fig" id="fig-code-group-4" class="tabbed-codeblock-box"><div class="tab-box"></div><input id="fig-code-group-4-python-tab" type="radio" name="check-fig-code-group-4" checked=""><label for="fig-code-group-4-python-tab">Python</label><div class="codeblock-item"><pre data-tag="codeblock" id="code-code-group-4-python" outputclass="language-python" code-type="xCode" class="pre codeblock language-python"><code>import os
from openai import OpenAI

client = OpenAI(
    api_key=os.getenv("DASHSCOPE_API_KEY"),
    base_url="https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/compatible-mode/v1",
)

result = client.conversations.delete("conv_xxx")
print(result)
</code></pre></div><input id="fig-code-group-4-node-js-tab" type="radio" name="check-fig-code-group-4"><label for="fig-code-group-4-node-js-tab">Node.js</label><div class="codeblock-item"><pre data-tag="codeblock" id="code-code-group-4-node-js" outputclass="language-javascript" code-type="xCode" class="pre codeblock language-javascript"><code>import OpenAI from "openai";

const client = new OpenAI({
    apiKey: process.env.DASHSCOPE_API_KEY,
    baseURL: "https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/compatible-mode/v1",
});

const result = await client.conversations.del(
    "conv_xxx"
);
console.log(result);
</code></pre></div><input id="fig-code-group-4-curl-tab" type="radio" name="check-fig-code-group-4"><label for="fig-code-group-4-curl-tab">cURL</label><div class="codeblock-item"><pre data-tag="codeblock" id="code-code-group-4-curl" outputclass="language-bash" code-type="xCode" class="pre codeblock language-bash"><code>curl --location --request DELETE 'https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/compatible-mode/v1/conversations/conv_xxx' \
--header 'Authorization: Bearer $DASHSCOPE_API_KEY'
</code></pre></div></div></td></tr></tbody></table>

### 响应参数

<table bordertype="no-border"><colgroup><col style="width:57.55%"><col style="width:42.45%"></colgroup><tbody><tr><td><p><strong>deleted</strong><code>boolean</code></p><p>是否删除成功。</p><p><strong>id</strong><code>string</code></p><p>被删除的会话ID。</p><p><strong>object</strong><code>string</code></p><p>对象类型，固定为 <code>conversation.deleted</code>。</p></td><td><pre data-tag="codeblock" id="code-block-4" outputclass="language-json" code-type="xCode" class="pre codeblock language-json"><code>{
    "deleted": true,
    "id": "conv_xxx",
    "object": "conversation.deleted"
}
</code></pre></td></tr></tbody></table>

## Create Items

向指定会话添加消息项。

**华北2（北京）：POST** `https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/compatible-mode/v1/conversations/{conversation_id}/items`

**新加坡：POST** `https://{WorkspaceId}.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1/conversations/{conversation_id}/items`

<table bordertype="no-border"><colgroup><col style="width:57.55%"><col style="width:42.45%"></colgroup><tbody><tr><td><p><strong>conversation_id</strong><code>string</code><strong>(必选, Path)</strong></p><p>会话ID。</p><p><strong>items</strong><code>array</code><strong>(必选)</strong></p><p>消息项列表，每次最多添加20条。</p><section class="collapse expanded" id="accordion-属性-2"><p>属性</p><div><p><strong>type</strong><code>string</code><strong>(必选)</strong></p><p>消息类型，仅支持 <code>message</code>。</p><p><strong>role</strong><code>string</code><strong>(必选)</strong></p><p>消息的角色。<code>system</code> 、<code>developer</code>角色的指令优先级高于 <code>user</code> 角色，<code>assistant</code> 角色表示模型在之前交互中生成的消息。取值：<code>user</code>、<code>assistant</code>、<code>system</code>、<code>developer</code>。</p><p><strong>content</strong><code>string or array</code><strong>(必选)</strong></p><p>消息内容。支持纯文本字符串或结构化内容列表（如 ResponseInputText 对象数组），列表格式可包含文本等多种内容类型。</p></div></section></td><td><div outputclass="tabbed-codeblock" data-tag="fig" id="fig-code-group-5" class="tabbed-codeblock-box"><div class="tab-box"></div><input id="fig-code-group-5-python-tab" type="radio" name="check-fig-code-group-5" checked=""><label for="fig-code-group-5-python-tab">Python</label><div class="codeblock-item"><pre data-tag="codeblock" id="code-code-group-5-python" outputclass="language-python" code-type="xCode" class="pre codeblock language-python"><code>import os
from openai import OpenAI

client = OpenAI(
    api_key=os.getenv("DASHSCOPE_API_KEY"),
    base_url="https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/compatible-mode/v1",
)

items = client.conversations.items.create(
    "conv_xxx",
    items=[
        {
            "type": "message",
            "role": "user",
            "content": [{"type": "input_text", "text": "李红的专业是师范教育"}],
        }
    ],
)
print(items.data)
</code></pre></div><input id="fig-code-group-5-node-js-tab" type="radio" name="check-fig-code-group-5"><label for="fig-code-group-5-node-js-tab">Node.js</label><div class="codeblock-item"><pre data-tag="codeblock" id="code-code-group-5-node-js" outputclass="language-javascript" code-type="xCode" class="pre codeblock language-javascript"><code>import OpenAI from "openai";

const client = new OpenAI({
    apiKey: process.env.DASHSCOPE_API_KEY,
    baseURL: "https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/compatible-mode/v1",
});

const items = await client.conversations.items.create(
    "conv_xxx",
    {
        items: [
            {
                type: "message",
                role: "user",
                content: [{ type: "input_text", text: "李红的专业是师范教育" }]
            }
        ]
    }
);
console.log(items.data);
</code></pre></div><input id="fig-code-group-5-curl-tab" type="radio" name="check-fig-code-group-5"><label for="fig-code-group-5-curl-tab">cURL</label><div class="codeblock-item"><pre data-tag="codeblock" id="code-code-group-5-curl" outputclass="language-bash" code-type="xCode" class="pre codeblock language-bash"><code>curl --location 'https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/compatible-mode/v1/conversations/conv_xxx/items' \
--header 'Content-Type: application/json' \
--header 'Authorization: Bearer $DASHSCOPE_API_KEY' \
--data '{
    "items": [
        {
            "type": "message",
            "role": "user",
            "content": [{
                "type": "input_text",
                "text": "李红的专业是师范教育"
            }]
        }
    ]
}'
</code></pre></div></div></td></tr></tbody></table>

### 响应参数

<table bordertype="no-border"><colgroup><col style="width:57.55%"><col style="width:42.45%"></colgroup><tbody><tr><td><p><strong>data</strong><code>array[object]</code></p><p>创建的消息项列表。</p><section class="collapse expanded" id="accordion-属性-3"><p>属性</p><div><p><strong>id</strong><code>string</code></p><p>消息项唯一标识符。</p><p><strong>content</strong><code>string or array</code></p><p>消息内容。纯文本字符串或结构化内容列表（如 ResponseInputText 对象数组）。</p><p><strong>role</strong><code>string</code></p><p>消息的角色类型，取值：<code>user</code>、<code>assistant</code>、<code>system</code>、<code>developer</code>。</p><p><strong>status</strong><code>string</code></p><p>消息的处理状态，取值：<code>in_progress</code>（处理中）、<code>completed</code>（已完成）、<code>incomplete</code>（未完成）。</p><p><strong>type</strong><code>string</code></p><p>消息项的类型，固定为 <code>message</code>。</p></div></section><p><strong>first_id</strong><code>string</code></p><p>列表中第一条消息项的ID。</p><p><strong>has_more</strong><code>boolean</code></p><p>是否还有更多数据。</p><p><strong>last_id</strong><code>string</code></p><p>列表中最后一条消息项的ID。</p></td><td><pre data-tag="codeblock" id="code-block-5" outputclass="language-json" code-type="xCode" class="pre codeblock language-json"><code>{
    "data": [
        {
            "content": [
                {
                    "text": "李红的专业是师范教育",
                    "type": "input_text"
                }
            ],
            "id": "msg_xxx",
            "role": "user",
            "status": "completed",
            "type": "message"
        }
    ],
    "first_id": "msg_xxx",
    "has_more": false,
    "last_id": "msg_xxx"
}
</code></pre></td></tr></tbody></table>

## List Items

列出会话中的所有消息项。

**华北2（北京）：GET** `https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/compatible-mode/v1/conversations/{conversation_id}/items`

**新加坡：GET** `https://{WorkspaceId}.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1/conversations/{conversation_id}/items`

<table bordertype="no-border"><colgroup><col style="width:57.55%"><col style="width:42.45%"></colgroup><tbody><tr><td><p><strong>conversation_id</strong><code>string</code><strong>(必选, Path)</strong></p><p>会话ID。</p><p><strong>after</strong><code>string</code>（可选）</p><p>分页游标，返回指定消息ID之后的消息项。</p><p><strong>order</strong><code>string</code>（可选）</p><p>排序方式，<code>asc</code>（升序）或 <code>desc</code>（降序），默认 <code>desc</code>。</p><p><strong>limit</strong><code>integer</code>（可选）</p><p>返回数量，范围1-100，默认20。</p></td><td><div outputclass="tabbed-codeblock" data-tag="fig" id="fig-code-group-6" class="tabbed-codeblock-box"><div class="tab-box"></div><input id="fig-code-group-6-python-tab" type="radio" name="check-fig-code-group-6" checked=""><label for="fig-code-group-6-python-tab">Python</label><div class="codeblock-item"><pre data-tag="codeblock" id="code-code-group-6-python" outputclass="language-python" code-type="xCode" class="pre codeblock language-python"><code>import os
from openai import OpenAI

client = OpenAI(
    api_key=os.getenv("DASHSCOPE_API_KEY"),
    base_url="https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/compatible-mode/v1",
)

items = client.conversations.items.list("conv_xxx")
print(items.data)
</code></pre></div><input id="fig-code-group-6-node-js-tab" type="radio" name="check-fig-code-group-6"><label for="fig-code-group-6-node-js-tab">Node.js</label><div class="codeblock-item"><pre data-tag="codeblock" id="code-code-group-6-node-js" outputclass="language-javascript" code-type="xCode" class="pre codeblock language-javascript"><code>import OpenAI from "openai";

const client = new OpenAI({
    apiKey: process.env.DASHSCOPE_API_KEY,
    baseURL: "https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/compatible-mode/v1",
});

const items = await client.conversations.items.list(
    "conv_xxx"
);
console.log(items.data);
</code></pre></div><input id="fig-code-group-6-curl-tab" type="radio" name="check-fig-code-group-6"><label for="fig-code-group-6-curl-tab">cURL</label><div class="codeblock-item"><pre data-tag="codeblock" id="code-code-group-6-curl" outputclass="language-bash" code-type="xCode" class="pre codeblock language-bash"><code>curl --location 'https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/compatible-mode/v1/conversations/conv_xxx/items?limit=10&amp;order=asc' \
--header 'Authorization: Bearer $DASHSCOPE_API_KEY'
</code></pre></div></div></td></tr></tbody></table>

### 响应参数

<table bordertype="no-border"><colgroup><col style="width:57.55%"><col style="width:42.45%"></colgroup><tbody><tr><td><p><strong>data</strong><code>array[object]</code></p><p>消息项列表。</p><section class="collapse expanded" id="accordion-属性-4"><p>属性</p><div><p><strong>id</strong><code>string</code></p><p>消息项唯一标识符。</p><p><strong>content</strong><code>string or array</code></p><p>消息内容。纯文本字符串或结构化内容列表（如 ResponseInputText 对象数组）。</p><p><strong>role</strong><code>string</code></p><p>消息的角色类型，取值：<code>user</code>、<code>assistant</code>、<code>system</code>、<code>developer</code>。</p><p><strong>status</strong><code>string</code></p><p>消息的处理状态，取值：<code>in_progress</code>（处理中）、<code>completed</code>（已完成）、<code>incomplete</code>（未完成）。</p><p><strong>type</strong><code>string</code></p><p>消息项的类型，固定为 <code>message</code>。</p></div></section><p><strong>first_id</strong><code>string</code></p><p>列表中第一条消息项的ID。</p><p><strong>has_more</strong><code>boolean</code></p><p>是否还有更多数据。</p><p><strong>last_id</strong><code>string</code></p><p>列表中最后一条消息项的ID。</p><p><strong>object</strong><code>string</code></p><p>对象类型，固定为 <code>list</code>。</p></td><td><pre data-tag="codeblock" id="code-block-6" outputclass="language-json" code-type="xCode" class="pre codeblock language-json"><code>{
    "data": [
        {
            "content": [
                {
                    "text": "李红，一位温婉而坚韧的江南女子，出生在浙江省，今年20岁",
                    "type": "input_text"
                }
            ],
            "id": "msg_7639f8f6-484b-454a-8125-96a3f40eb9e8",
            "role": "user",
            "status": "completed",
            "type": "message"
        },
        {
            "content": [
                {
                    "text": "李红的闺蜜是小芳",
                    "type": "input_text"
                }
            ],
            "id": "msg_288594f6-6ef1-4519-94d4-a545ca311828",
            "role": "user",
            "status": "completed",
            "type": "message"
        }
    ],
    "first_id": "msg_7639f8f6-484b-454a-8125-96a3f40eb9e8",
    "has_more": false,
    "last_id": "msg_288594f6-6ef1-4519-94d4-a545ca311828",
    "object": "list"
}
</code></pre></td></tr></tbody></table>

## Retrieve Item

获取指定消息项的详情。

**华北2（北京）：GET** `https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/compatible-mode/v1/conversations/{conversation_id}/items/{item_id}`

**新加坡：GET** `https://{WorkspaceId}.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1/conversations/{conversation_id}/items/{item_id}`

<table bordertype="no-border"><colgroup><col style="width:57.55%"><col style="width:42.45%"></colgroup><tbody><tr><td><p><strong>conversation_id</strong><code>string</code><strong>(必选, Path)</strong></p><p>会话ID。</p><p><strong>item_id</strong><code>string</code><strong>(必选, Path)</strong></p><p>消息项ID。</p></td><td><div outputclass="tabbed-codeblock" data-tag="fig" id="fig-code-group-7" class="tabbed-codeblock-box"><div class="tab-box"></div><input id="fig-code-group-7-python-tab" type="radio" name="check-fig-code-group-7" checked=""><label for="fig-code-group-7-python-tab">Python</label><div class="codeblock-item"><pre data-tag="codeblock" id="code-code-group-7-python" outputclass="language-python" code-type="xCode" class="pre codeblock language-python"><code>import os
from openai import OpenAI

client = OpenAI(
    api_key=os.getenv("DASHSCOPE_API_KEY"),
    base_url="https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/compatible-mode/v1",
)

item = client.conversations.items.retrieve(
    "msg_xxx",
    conversation_id="conv_xxx"
)
print(item)
</code></pre></div><input id="fig-code-group-7-node-js-tab" type="radio" name="check-fig-code-group-7"><label for="fig-code-group-7-node-js-tab">Node.js</label><div class="codeblock-item"><pre data-tag="codeblock" id="code-code-group-7-node-js" outputclass="language-javascript" code-type="xCode" class="pre codeblock language-javascript"><code>import OpenAI from "openai";

const client = new OpenAI({
    apiKey: process.env.DASHSCOPE_API_KEY,
    baseURL: "https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/compatible-mode/v1",
});

const item = await client.conversations.items.retrieve(
    "msg_xxx",
    { conversation_id: "conv_xxx" }
);
console.log(item);
</code></pre></div><input id="fig-code-group-7-curl-tab" type="radio" name="check-fig-code-group-7"><label for="fig-code-group-7-curl-tab">cURL</label><div class="codeblock-item"><pre data-tag="codeblock" id="code-code-group-7-curl" outputclass="language-bash" code-type="xCode" class="pre codeblock language-bash"><code>curl --location 'https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/compatible-mode/v1/conversations/conv_xxx/items/msg_xxx' \
--header 'Authorization: Bearer $DASHSCOPE_API_KEY'
</code></pre></div></div></td></tr></tbody></table>

### 响应参数

<table bordertype="no-border"><colgroup><col style="width:57.55%"><col style="width:42.45%"></colgroup><tbody><tr><td><p><strong>content</strong><code>array[object]</code></p><p>消息内容列表，包含一个或多个内容对象。</p><section class="collapse expanded" id="accordion-属性-5"><p>属性</p><div><p><strong>type</strong><code>string</code></p><p>内容类型，如 <code>input_text</code>（用户输入文本）或 <code>output_text</code>（模型输出文本）。</p><p><strong>text</strong><code>string</code></p><p>文本内容。</p></div></section><p><strong>id</strong><code>string</code></p><p>消息项唯一标识符。</p><p><strong>role</strong><code>string</code></p><p>消息的角色类型，取值：<code>user</code>、<code>assistant</code>、<code>system</code>、<code>developer</code>。</p><p><strong>status</strong><code>string</code></p><p>消息的处理状态，取值：<code>in_progress</code>（处理中）、<code>completed</code>（已完成）、<code>incomplete</code>（未完成）。</p><p><strong>type</strong><code>string</code></p><p>消息项的类型，固定为 <code>message</code>。</p></td><td><pre data-tag="codeblock" id="code-block-7" outputclass="language-json" code-type="xCode" class="pre codeblock language-json"><code>{
    "content": [
        {
            "text": "李红的专业是师范教育",
            "type": "input_text"
        }
    ],
    "id": "msg_xxx",
    "role": "user",
    "status": "completed",
    "type": "message"
}
</code></pre></td></tr></tbody></table>

## Delete Item

删除指定的消息项。

**华北2（北京）：DELETE** `https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/compatible-mode/v1/conversations/{conversation_id}/items/{item_id}`

**新加坡：DELETE** `https://{WorkspaceId}.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1/conversations/{conversation_id}/items/{item_id}`

<table bordertype="no-border"><colgroup><col style="width:57.55%"><col style="width:42.45%"></colgroup><tbody><tr><td><p><strong>conversation_id</strong><code>string</code><strong>(必选, Path)</strong></p><p>会话ID。</p><p><strong>item_id</strong><code>string</code><strong>(必选, Path)</strong></p><p>消息项ID。</p></td><td><div outputclass="tabbed-codeblock" data-tag="fig" id="fig-code-group-8" class="tabbed-codeblock-box"><div class="tab-box"></div><input id="fig-code-group-8-python-tab" type="radio" name="check-fig-code-group-8" checked=""><label for="fig-code-group-8-python-tab">Python</label><div class="codeblock-item"><pre data-tag="codeblock" id="code-code-group-8-python" outputclass="language-python" code-type="xCode" class="pre codeblock language-python"><code>import os
from openai import OpenAI

client = OpenAI(
    api_key=os.getenv("DASHSCOPE_API_KEY"),
    base_url="https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/compatible-mode/v1",
)

result = client.conversations.items.delete(
    "msg_xxx",
    conversation_id="conv_xxx"
)
print(result)
</code></pre></div><input id="fig-code-group-8-node-js-tab" type="radio" name="check-fig-code-group-8"><label for="fig-code-group-8-node-js-tab">Node.js</label><div class="codeblock-item"><pre data-tag="codeblock" id="code-code-group-8-node-js" outputclass="language-javascript" code-type="xCode" class="pre codeblock language-javascript"><code>import OpenAI from "openai";

const client = new OpenAI({
    apiKey: process.env.DASHSCOPE_API_KEY,
    baseURL: "https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/compatible-mode/v1",
});

const result = await client.conversations.items.del(
    "msg_xxx",
    { conversation_id: "conv_xxx" }
);
console.log(result);
</code></pre></div><input id="fig-code-group-8-curl-tab" type="radio" name="check-fig-code-group-8"><label for="fig-code-group-8-curl-tab">cURL</label><div class="codeblock-item"><pre data-tag="codeblock" id="code-code-group-8-curl" outputclass="language-bash" code-type="xCode" class="pre codeblock language-bash"><code>curl --location --request DELETE 'https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/compatible-mode/v1/conversations/conv_xxx/items/msg_xxx' \
--header 'Authorization: Bearer $DASHSCOPE_API_KEY'
</code></pre></div></div></td></tr></tbody></table>

### 响应参数

<table bordertype="no-border"><colgroup><col style="width:57.55%"><col style="width:42.45%"></colgroup><tbody><tr><td><p><strong>deleted</strong><code>boolean</code></p><p>是否删除成功。</p><p><strong>id</strong><code>string</code></p><p>被删除的消息项ID。</p><p><strong>object</strong><code>string</code></p><p>对象类型，固定为 <code>conversation.item.deleted</code>。</p></td><td><pre data-tag="codeblock" id="code-block-8" outputclass="language-json" code-type="xCode" class="pre codeblock language-json"><code>{
    "deleted": true,
    "id": "msg_xxx",
    "object": "conversation.item.deleted"
}
</code></pre></td></tr></tbody></table>

## Response API 使用 conversation 示例

通过 Responses API 的 `conversation` 参数，可以实现多轮对话的上下文保持。

> 请勿同时传入`previous_response_id`和`conversation`，否则会报错：`[400] INVALID_REQUEST: Mutually exclusive parameters: Ensure you are only providing one of: previous_response_id or conversation.`

Python

```
import os
from openai import OpenAI

client = OpenAI(
    api_key=os.getenv("DASHSCOPE_API_KEY"),
    base_url="https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/compatible-mode/v1",
)

conversation = client.conversations.create(
    items=[
        {
            "type": "message",
            "role": "system",
            "content": "李红，一位温婉而坚韧的江南女子，出生在浙江省杭州市，她今年20岁，她的兴趣爱好是琴棋书画。",
        }
    ]
)

response1 = client.responses.create(
    conversation=conversation.id, model="qwen3.8-max", input="李红今年多大了"
)
print(f"第一轮响应: {response1.output_text}")

response2 = client.responses.create(
    conversation=conversation.id, model="qwen3.8-max", input="她的兴趣爱好是什么？"
)
print(f"第二轮响应: {response2.output_text}")
```

Node.js

```
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.DASHSCOPE_API_KEY,
  baseURL: "https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/compatible-mode/v1",
});

const conversation = await client.conversations.create({
  items: [
    {
      type: "message",
      role: "system",
      content: "李红，一位温婉而坚韧的江南女子，出生在浙江省杭州市，她今年20岁，她的兴趣爱好是琴棋书画。"
    }
  ]
});

const response1 = await client.responses.create({
  conversation: conversation.id,
  model: "qwen3.8-max",
  input: "李红今年多大了"
});
console.log("第一轮响应:", response1.output_text);

const response2 = await client.responses.create({
  conversation: conversation.id,
  model: "qwen3.8-max",
  input: "她的兴趣爱好是什么？"
});
console.log("第二轮响应:", response2.output_text);
```

## 使用限制

-   创建会话或添加消息项时，`items` 最多包含20条。
-   `metadata` 最多16对键值对，key最大长度64字符，value最大长度512字符。
-   会话信息保留最近7天内的最新100条，超出时间或数量限制的内容将自动清理。
