AnimateAnyone模型，可基于AnimateAnyone-template模型生成的动作模板，以及通过AnimateAnyone-detect模型检测的人物图像生成人物动作视频。本文档介绍了该模型提供的视频生成能力的API调用方法。

## 模型概览

#### **模型简介**

| 模型名 | 模型简介 |
| --- | --- |
| animate-anyone-gen2 | animate-anyone-gen2是一个人物动作视频生成模型，可基于人物图片和人物动作模板生成人物动作视频。 |

#### **模型效果示例**

| 人物图片 | 动作模板 | 输出（按图片背景生成） | 输出（按视频背景生成） |
| --- | --- | --- | --- |
|  |  |  |  |
|  |  |  |  |

**说明**

-   以上示例，由集成了“舞动人像AnimateAnyone”的通义APP生成。
    
-   动作模板需先通过[AnimateAnyone 动作模板生成API](https://help.aliyun.com/zh/model-studio/animate-anyone-template-api)制作，请确保动作模板视频的来源符合相关法律法规，且已获得该视频内容（包含音频）的使用许可。
    

## HTTP调用接口

### 功能描述

用于生成人物动作视频。

### 前提条件

-   已开通服务并获得API-KEY：[获取API Key](https://help.aliyun.com/zh/model-studio/get-api-key)。
    
-   输入的动作模板由[AnimateAnyone 动作模板生成API](https://help.aliyun.com/zh/model-studio/animate-anyone-template-api)生成；
    
-   输入的图像已通过[AnimateAnyone 图像检测API](https://help.aliyun.com/zh/model-studio/animate-anyone-detect-api)检测。
    

### **输入限制**

-   图像格式：格式为jpg、png、jpeg、bmp。
    
-   图像要求：图像文件＜5M，宽高比≤2，最大边长≤4096像素。
    
-   上传的图像文件支持HTTP链接，不支持本地路径。也可使用平台提供的[临时存储空间](https://help.aliyun.com/zh/model-studio/get-temporary-file-url)，上传本地文件并创建链接。
    
-   输入图像与视频生成类型的适用关系：
    
    | 输入图片 | 按图片背景生成（即use_ref_img_bg设为true） | 按视频背景生成（即use_ref_img_bg设为false） |
    | --- | --- | --- |
    | 全身人像 | 支持 | 支持 |
    | 半身人像 | 支持 | 不推荐 |
    
    **说明**
    
    按视频背景生成时，需将图片中人像匹配到视频中人像的对应位置。对于半身人像图中未出现的区域（如腿部），模型将随机生成补全，有较大不确定性，故不推荐在该条件下做视频生成。
    

### 作业提交接口

```http
POST https://dashscope.aliyuncs.com/api/v1/services/aigc/image2video/video-synthesis/
```

**说明**

-   因该算法调用耗时较长，故采用异步调用的方式提交任务。
    
-   任务提交之后，系统会返回对应的作业ID，后续可通过“作业任务状态查询和结果获取接口”获取任务状态及对应结果。
    

#### **入参描述**

| 字段 | 类型 | 传参方式 | 必选 | 描述 | 示例值 |
| --- | --- | --- | --- | --- | --- |
| Content-Type | String | Header | 是 | 请求类型：application/json。 | application/json |
| Authorization | String | Header | 是 | API-Key，例如：Bearer d1**2a。 | Bearer d1**2a |
| X-DashScope-Async | String | Header | 是 | 使用 enable，表明使用异步方式提交作业。 | enable |
| model | String | Body | 是 | 指明需要调用的模型。 | animate-anyone-gen2 |
| input.image_url | String | Body | 是 | 用户上传的图片 URL，该图应先通过AnimateAnyone 图像检测API，并结合所需生成的画幅进行适当裁剪。图像文件＜5M，宽高比≤2，最大边长≤4096格式支持jpg、png、jpeg、bmp。说明上传文件支持HTTP或HTTPS链接方式，不支持本地链接方式。您也可在此获取临时公网URL。 | http://aaa/bbb.jpg |
| input.template_id | String | Body | 是 | 动作模板ID，用于指明所需使用的动作模板。应输入AnimateAnyone 动作模板生成API生成的template_id。说明动作模板ID会进行权限校验，请确保所使用的template_id是由当前的云账号创建得到的。使用建议：提高模板视频的分辨率和帧率，可有效提升生成视频的画质效果。 | AACT.xxx.xxx-xxx.xxx |
| parameters.use_ref_img_bg | Boolean | Body | 否 | 生成视频的背景控制，可设值为true或false。设true时将以输入图片的画面为背景生成视频。设false时将以模板文件的原视频画面为背景生成视频。默认值为false。 | false |
| parameters.video_ratio | String | Body | 否 | 选择按图片背景生成视频时，可选画幅为 "9:16"或"3:4"，默认为"9:16"。说明选择按视频背景生成时，即use_ref_img_bg设false时，该参数不生效。将按模板视频的比例生成新视频。说明应确保输入图像的画幅与所选画幅一致，以避免生成视频的画面变形 | "9:16" |

#### **出参描述**

| 字段 | 类型 | 描述 | 示例值 |
| --- | --- | --- | --- |
| output.task_id | String | 提交异步任务的作业 id，实际作业结果需要通过异步任务查询接口获取。 | a8532587-fa8c-4ef8-82be-0c46b17950d1 |
| output.task_status | String | 提交异步任务后的作业状态。 | “PENDING” |
| request_id | String | 本次请求的系统唯一码。 | 7574ee8f-38a3-4b1e-9280-11c33ab46e51 |

#### **请求示例**

```curl
curl --location 'https://dashscope.aliyuncs.com/api/v1/services/aigc/image2video/video-synthesis/' \
--header 'X-DashScope-Async: enable' \
--header "Authorization: Bearer $DASHSCOPE_API_KEY" \
--header 'Content-Type: application/json' \
--data '{
    "model": "animate-anyone-gen2",
    "input": {
        "image_url": "http://xxx/1.jpg",
        "template_id": "AACT.xxx.xxx-xxx.xxx"
    },
      "parameters": {
         "use_ref_img_bg": false,
         "video_ratio": "9:16"
    }
  }'
```

#### **响应示例**

```json
{
    "output": {
    "task_id": "a8532587-fa8c-4ef8-82be-0c46b17950d1", 
        "task_status": "PENDING"
    }
    "request_id": "7574ee8f-38a3-4b1e-9280-11c33ab46e51"
}
```

### **作业任务状态查询和结果获取接口**

```http
GET https://dashscope.aliyuncs.com/api/v1/tasks/{task_id}
```

**说明**

-   异步任务查询接口提供 20 QPS 的访问流量限制。若有更高频次的查询需求，可通过EventBridge配置事件转发，详见[EventBridge配置事件转发](https://help.aliyun.com/zh/model-studio/manage-asynchronous-tasks#a69637e1a7sza)。
    
-   已提交的异步任务列表查询，及异步任务的取消管理，详见[管理异步任务](https://help.aliyun.com/zh/model-studio/manage-asynchronous-tasks#f26499d72adsl)。
    

#### **入参描述**

| 字段 | 类型 | 传参方式 | 必选 | 描述 | 示例值 |
| --- | --- | --- | --- | --- | --- |
| Authorization | String | Header | 是 | API-Key，例如：Bearer d1**2a。 | Bearer d1**2a |
| task_id | String | Url Path | 是 | 需要查询作业的task_id。 | a8532587-fa8c-4ef8-82be-0c46b17950d1 |

#### **出参描述**

| 字段 | 类型 | 描述 | 示例值 |
| --- | --- | --- | --- |
| output.task_id | String | 查询作业的 task_id | a8532587-fa8c-4ef8-82be-0c46b17950d1 |
| output.task_status | String | 被查询作业的作业状态 | 任务状态：PENDING 排队中PRE-PROCESSING 前置处理中RUNNING 处理中POST-PROCESSING 后置处理中SUCCEEDED 成功FAILED 失败UNKNOWN 作业不存在或状态未知 |
| output.video_url | String | 平台输出的视频结果，video_url有效期为作业完成后24小时 | https://xxx/1.mp4" |
| usage.video_duration | Float | 本次请求生成视频时长计量，单位：秒 | "video_duration": 10.23 |
| usage.video_ratio | String | 本次请求生成视频的画幅类型，该值为standard | "video_ratio": "standard" |
| request_id | String | 本次请求的系统唯一码 | 7574ee8f-38a3-4b1e-9280-11c33ab46e51 |

#### **请求示例**

```curl
curl -X GET \
--header 'Authorization: Bearer <YOUR_API_KEY>' \
https://dashscope.aliyuncs.com/api/v1/tasks/<YOUR_TASK_ID>
```

#### **响应示例**

```json
{
    "request_id":"7574ee8f-38a3-4b1e-9280-11c33ab46e51",
    "output":{
        "task_id":"a8532587-fa8c-4ef8-82be-0c46b17950d1",
    "task_status":"SUCCEEDED",
        "video_url":"https://xxx/1.mp4"
    },
    "usage":{
        "video_duration": 10.23,
        "video_ratio": "standard"
    }
}
```

#### **异常响应示例**

```json
{
    "request_id": "7574ee8f-38a3-4b1e-9280-11c33ab46e51"
      "output": {
        "task_id": "a8532587-fa8c-4ef8-82be-0c46b17950d1", 
        "task_status": "FAILED",
        "code": "xxx", 
        "message": "xxxxxx", 
    }  
}
```

## 状态码说明

大模型服务平台通用状态码请查阅：[错误码](https://help.aliyun.com/zh/model-studio/error-code)。

本模型还有如下特定错误码：

| http 返回码* | 错误码（code） | 错误信息（message） | 含义说明 |
| --- | --- | --- | --- |
| 400 | InvalidURL.ConnectionRefused | Connection to ${url} refused, please provide available URL | 下载被拒绝，请提供可用的url |
| 400 | InvalidURL.Timeout | Download ${url} timeout, please check network connection. | 下载超时，10s超时 |
| 400 | InvalidFile.Size | Invalid file size, The image file size must be smaller than 5MB. | 图片文件超过5M大小 |
| 400 | InvalidFile.Resolution | The image resolution is invalid, please make sure that the largest length of image is smaller than 4096, and the smallest length of image is larger than 224. | 上传图片大小不符合要求 |
| 400 | InvalidFile.AspectRatio | Invalid file ratio. The file aspect ratio (height/width) must be between 2.0 and 0.5 | 图片文件宽高比必须在2.0到0.5之间 |
| 400 | InvalidFile.Template.Content | Invalid template content. | 动作模板无权限，或模板内容不符合要求。 |
| 400 | InvalidParameter | parameters.video_ratio must be 9:16 or 3:4 | video_ratio 入参只能为 9:16 或 3:4 |
