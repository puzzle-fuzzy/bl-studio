AnimateAnyone动作模板生成模型，可基于人物运动视频提取人物动作，并生成可供AnimateAnyone视频生成模型使用的人物动作模板。本文档介绍了该模型提供的动作模板生成能力的API调用方法。

**重要**本文档仅适用于华北2（北京）地域，且必须使用该地域的[API Key](https://bailian.console.aliyun.com/?tab=model#/api-key)。

## 模型概览

| 
**模型名**

 | 

**模型简介**

 |
| --- | --- |
| 

animate-anyone-template-gen2

 | 

animate-anyone-template-gen2是一个人物动作模板生成模型，可基于人物运动视频提取人物动作并制作模板。

 |

## 模型输入要求

#### 正确示例：

| **符合动作模板制作要求的视频示例** |
| --- |
|  |  |

**说明**

-   上传的视频中人物应全身入镜、身体无遮挡、保持人脸清晰。
-   人物应从画面首帧开始出现，动作连贯，一镜到底（有场景切换的视频建议拆分成多段）。
-   建议：画面首帧人物正面朝向镜头；避免人物运动中出现大幅弯腰、下蹲、身体蜷缩等动作。

#### 错误示例：

| 
**身体蜷缩、遮挡**

 | 

**画面有多人**

 | 

**人物模糊**

 | 

**人物过小**

**（人脸不清晰）**

 | 

**人物过大**

**（人物不完整）**

 |
| --- | --- | --- | --- | --- |
| 

![身体遮挡@3x](https://help-static-aliyun-doc.aliyuncs.com/assets/img/zh-CN/0759193371/p886350.png)

 | 

![多人物@3x](https://help-static-aliyun-doc.aliyuncs.com/assets/img/zh-CN/0759193371/p886352.png)

 | 

![f3e2df6643d44db7a7d65d4571609bff_3 (1)](https://help-static-aliyun-doc.aliyuncs.com/assets/img/zh-CN/0759193371/p886586.png)

 | 

![人物过小@3x](https://help-static-aliyun-doc.aliyuncs.com/assets/img/zh-CN/0759193371/p886354.png)

 | 

![人物过大@3x](https://help-static-aliyun-doc.aliyuncs.com/assets/img/zh-CN/0759193371/p886570.png)

 |

**说明**

-   为保障模板制作效果，应避免上传视频中的任一帧画面出现上述错误情形。
-   当**视频首帧画面**出现上述错误情形时，当次提交的任务可能报错并中止。

**重要**

-   请确保上传的视频文件来源符合相关法律法规。
-   生成的动作模板的音频，与上传的视频文件中的音频一致。若不希望使用该音频，或尚未取得该音频（如音乐等）的使用许可，请在上传视频文件前，消除其中的音频信息。

## HTTP调用接口

### 功能描述

用于生成人物动作模板，该模板可作[AnimateAnyone 视频生成 API](/zh/model-studio/animateanyone-video-generation-api)的输入物，以生成人物动作视频。

### 前提条件

-   已开通服务并获得API-KEY：[获取与配置 API Key](/zh/model-studio/get-api-key)。

### 输入限制

-   视频格式：支持mp4、avi、mov。
-   视频文件不大于200MB。
-   视频边长不低于200，不大于2048；视频帧率≥24fps，视频编码采用H.264或H.265。
-   视频时长不小于2s且不大于60s。
-   视频长宽比介于1:3到3:1。
-   上传的视频文件支持HTTP链接，不支持本地路径。也可使用平台提供的[文件存储API](https://help.aliyun.com/zh/model-studio/data-connection)，上传本地文件并创建链接。

### 步骤1：创建任务获取任务ID

```
POST https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/api/v1/services/aigc/image2video/aa-template-generation
```

**说明**

-   因该算法调用耗时较长，故采用异步调用的方式提交任务。
-   任务提交之后，系统会返回对应的任务ID，后续可通过“根据任务ID查询结果接口”获取任务状态及对应结果。

#### 入参描述

<table><colgroup><col style="width:20.63%"><col style="width:8.5%"><col style="width:8.98%"><col style="width:5.51%"><col style="width:32.76%"><col style="width:23.62%"></colgroup><tbody><tr><td><p><strong>字段</strong></p></td><td><p><strong>类型</strong></p></td><td><p><strong>传参方式</strong></p></td><td><p><strong>必选</strong></p></td><td><p><strong>描述</strong></p></td><td><p><strong>示例值</strong></p></td></tr><tr><td><p>Content-Type</p></td><td><p>String</p></td><td><p>Header</p></td><td><p>是</p></td><td><p>请求类型：application/json</p></td><td><p>application/json</p></td></tr><tr><td><p>Authorization</p></td><td><p>String</p></td><td><p>Header</p></td><td><p>是</p></td><td><p>API-Key，例如：Bearer d1**2a</p></td><td><p>Bearer d1**2a</p></td></tr><tr><td><p>X-DashScope-Async</p></td><td><p>String</p></td><td><p>Header</p></td><td><p>是</p></td><td><p>使用 enable，表明使用异步方式提交任务。</p></td><td><p>enable</p></td></tr><tr><td><p>model</p></td><td><p>String</p></td><td><p>Body</p></td><td><p>是</p></td><td><p>指明需要调用的模型，此处用animate-anyone-template-gen2</p></td><td><p>animate-anyone-template-gen2</p></td></tr><tr><td><p>input.video_url</p></td><td><p>String</p></td><td><p>Body</p></td><td><p>否</p></td><td><p>用户上传的视频 URL，用于生成基于指定视频的动作模板。</p><ul><li><p>视频文件不大于200MB</p></li><li><p>视频边长不低于200，不大于2048</p></li><li><p>视频帧率≥24fps，视频编码采用H.264或H.265</p></li><li><p>视频时长不小于2s且不大于60s</p></li><li><p>视频长宽比介于1:3到3:1</p></li><li><p>视频格式支持：mp4、avi、mov</p></li></ul><div><p>上传文件支持HTTP或HTTPS链接方式，不支持本地链接方式。<span>您也可在此<a href="/zh/model-studio/get-temporary-file-url">获取临时公网URL</a>。</span></p></div></td><td><p>http://aaa/bbb.mp4</p></td></tr></tbody></table>

#### 出参描述：

<table><colgroup><col style="width:24.09%"><col style="width:11.02%"><col style="width:34.17%"><col style="width:30.72%"></colgroup><tbody><tr><td><p><strong>字段</strong></p></td><td><p><strong>类型</strong></p></td><td><p><strong>描述</strong></p></td><td><p><strong>示例值</strong></p></td></tr><tr><td><p>output.task_id</p></td><td><p>String</p></td><td><p>提交异步任务的任务 id，实际任务结果需要通过异步任务查询接口获取</p></td><td><p>a8532587-fa8c-4ef8-82be-0c46b17950d1</p></td></tr><tr><td><p>output.task_status</p></td><td><p>String</p></td><td><p>提交异步任务后的 任务状态</p></td><td><p>“PENDING”</p></td></tr><tr><td><p>request_id</p></td><td><p>String</p></td><td><p>本次请求的系统唯一码</p></td><td><p>7574ee8f-38a3-4b1e-9280-11c33ab46e51</p></td></tr></tbody></table>

#### 请求示例

```
curl --location 'https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/api/v1/services/aigc/image2video/aa-template-generation' \
--header 'X-DashScope-Async: enable' \
--header "Authorization: Bearer $DASHSCOPE_API_KEY" \
--header 'Content-Type: application/json' \
--data '{
    "model": "animate-anyone-template-gen2",
    "input": {
        "video_url": "https://help-static-aliyun-doc.aliyuncs.com/file-manage-files/zh-CN/20241210/cwjmsz/1.mp4"
    }
  }'
```

#### 响应示例

```
{
    "output": {
    "task_id": "a8532587-fa8c-4ef8-82be-xxxxxx",
        "task_status": "PENDING"
    },
    "request_id": "7574ee8f-38a3-4b1e-9280-xxxxxx"
}
```

### 步骤2：根据任务ID查询结果

```
GET https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/api/v1/tasks/{task_id}
```

**说明**

-   异步任务查询接口提供 20 QPS 的访问流量限制。若有更高频次的查询需求，可通过EventBridge配置事件转发，详见[EventBridge配置事件转发](/zh/model-studio/manage-asynchronous-tasks)。
-   已提交的异步任务列表查询，及异步任务的取消管理，详见[管理异步任务](/zh/model-studio/manage-asynchronous-tasks)。

#### 入参描述

| 
**字段**

 | 

**类型**

 | 

**传参方式**

 | 

**必选**

 | 

**描述**

 | 

**示例值**

 |
| --- | --- | --- | --- | --- | --- |
| 

Authorization

 | 

String

 | 

Header

 | 

是

 | 

API-Key，例如：Bearer d1\*\*2a。

 | 

Bearer d1\*\*2a

 |
| 

task\_id

 | 

String

 | 

Url Path

 | 

是

 | 

需要查询任务的task\_id。

 | 

a8532587-fa8c-4ef8-82be-0c46b17950d1

 |

#### 出参描述

<table><colgroup><col style="width:24.09%"><col style="width:11.02%"><col style="width:29.13%"><col style="width:35.76%"></colgroup><tbody><tr><td><p><strong>字段</strong></p></td><td><p><strong>类型</strong></p></td><td><p><strong>描述</strong></p></td><td><p><strong>示例值</strong></p></td></tr><tr><td><p>output.task_id</p></td><td><p>String</p></td><td><p>查询任务的 task_id</p></td><td><p>a8532587-fa8c-4ef8-82be-0c46b17950d1</p></td></tr><tr><td><p>output.task_status</p></td><td><p>String</p></td><td><p>被查询任务的任务状态</p></td><td><p>任务状态：</p><p>PENDING 排队中</p><p>RUNNING 处理中</p><p>SUCCEEDED 成功</p><p>FAILED 失败</p><p>UNKNOWN 任务不存在或状态未知</p></td></tr><tr><td><p>output.template_id</p></td><td><p>String</p></td><td><p>平台输出的动作模板ID，可作为“Animate-Anyone 视频生成接口”的入参。</p><p>动作模板ID会进行权限校验，请确保使用template_id的云账号与当前生产该动作模板的云账号一致。</p></td><td><p>AACT.xxx.xxx-xxx.xxx</p></td></tr><tr><td><p>usage.video_duration</p></td><td><p>Float</p></td><td><p>本次请求生成模板时长计量，单位：秒</p></td><td><p>"video_duration": 10.23</p></td></tr><tr><td><p>usage.video_ratio</p></td><td><p>String</p></td><td><p>本次请求生成视频模板的画幅类型，该值为standard</p></td><td><p>"video_ratio": "standard"</p></td></tr><tr><td><p>request_id</p></td><td><p>String</p></td><td><p>本次请求的系统唯一码</p></td><td><p>7574ee8f-38a3-4b1e-9280-11c33ab46e51</p></td></tr></tbody></table>

#### 请求示例

```
curl -X GET \
--header 'Authorization: Bearer <YOUR_API_KEY>' \
https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/api/v1/tasks/<YOUR_TASK_ID>
```

#### 响应示例

```
{
    "request_id": "7574ee8f-38a3-4b1e-9280-11c33ab46e51",
    "output": {
        "task_id": "a8532587-fa8c-4ef8-82be-0c46b17950d1",
        "task_status": "SUCCEEDED",
        "template_id": "AACT.xxx.xxx-xxx.xxx"
    },
    "usage": {
        "video_duration": 10.23,
        "video_ratio": "standard"
    }
}
```

##### 异常响应示例

```
{
    "request_id": "7574ee8f-38a3-4b1e-9280-11c33ab46e51",
    "output": {
        "task_id": "a8532587-fa8c-4ef8-82be-0c46b17950d1",
        "task_status": "FAILED",
        "code": "xxx",
        "message": "xxxxxx"
    }
}
```

## 状态码说明

大模型服务平台通用状态码请查阅：[错误码](/zh/model-studio/error-code)。
