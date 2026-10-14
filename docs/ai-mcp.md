# AI 与 MCP

电脑端“AI 穿搭灵感”支持模型配置、对话、外部 MCP 连接和操作记录。内置 AI 通过官方 MCP Client 与内存传输连接衣橱 MCP Server，和外部 HTTP/stdio 共用工具定义、权限、取图和业务校验。

## 内置模型

选择 OpenAI 兼容或 Anthropic 原生接口，填写服务地址、模型名、API Key 和权限并保存，然后发送需求。地址包括 API 路径，例如 `https://api.openai.com/v1` 或 `https://api.anthropic.com/v1`；程序分别追加 `/chat/completions` 或 `/messages`。模型需要支持工具调用；看图还需要视觉能力。本版 OpenAI 使用 Chat Completions，不使用 Responses。

支持 HTTPS，以及 localhost、127.0.0.1、::1 的 HTTP 本机服务。无密钥的本机服务可填写 `local`。地址不能包含凭据、查询参数或片段，不跟随重定向。更换服务地址或供应商需重新填写密钥；仅改模型或权限可留空保留密钥。

读取资料必选，默认开启照片；身体尺码和写入默认关闭。允许写入后，用户在需求中明确要求保存搭配或安排日历，模型可调用相应工具。没有删除或批量改写工具。

密钥在 SQLite 中以账号密钥派生的 AES-256-GCM 加密保存，不回传浏览器，不进入衣橱 ZIP、同步包或日志。同时持有整个数据库的人也持有账号密钥；完整复制 data 目录会带走模型配置和 MCP 授权。Git 忽略个人 data 数据。

每次请求固定当前账号和衣橱，最长 180 秒，最多 12 轮、32 次工具调用、12 MiB 图片 base64；每账号同时一个请求。对话只在当前页面保留最近 20 条文字消息，工具和图片按需重新查询。停止会取消后续工作，已成功保存的记录保留。发送时显示本轮工具操作与照片数量。

## 外部 MCP

在“外部 AI 连接（MCP）”填写名称、选择权限，为当前衣橱创建连接。令牌仅创建时显示，数据库只保存 SHA-256 摘要。连接绑定账号和一个衣橱，网页切换或重命名账号不改变授权；可随时撤销。

HTTP 客户端配置 Streamable HTTP 地址 `http://127.0.0.1:4320/mcp`，认证头 `Authorization: Bearer <连接令牌>`。需要先启动 Closet。使用无会话的 JSON 响应，每连接每分钟最多 120 个协议请求，最大请求 128 KiB。校验来源、Host、参数、记录及图片归属。

本机 stdio 客户端可配置附带的转接入口，它连接已运行的 Closet 服务，不直接操作数据库：

```json
{
  "mcpServers": {
    "closet": {
      "command": "node",
      "args": ["D:/New Closet/scripts/mcp-stdio.mjs"],
      "env": {
        "CLOSET_MCP_URL": "http://127.0.0.1:4320/mcp",
        "CLOSET_MCP_TOKEN": "替换为连接令牌"
      }
    }
  }
}
```

也可用 `pnpm mcp` 手动启动。按实际安装修改地址和路径。错误只写 stderr，协议 stdout 不混入日志或凭据。

默认允许 localhost 和 IP 地址。使用自定义主机名时，启动前设置 `CLOSET_MCP_ALLOWED_HOSTS`，多个名称用逗号分隔。代理需保留正确协议和 Host。本版为个人令牌接入，未提供 OAuth 自动授权、资源订阅或公网部署；云端客户端需能访问 HTTPS 地址且支持手动 Bearer 认证，只接受 OAuth 的平台尚不能直接连接。现有免密码网页应保留在可信本机/局域网。

## 工具

| 工具 | 权限 | 功能 |
| --- | --- | --- |
| list_closets | read | 授权衣橱与数量 |
| list_subsets | read | 分组层级与直接成员 |
| search_items | read | 分页搜索分类、场合、季节、品牌、颜色、分组和文字 |
| get_item | read | 单品详情、版本、分组与照片索引 |
| search_outfits | read | 搭配及关联单品 ID |
| get_calendar | read | 日期范围内的计划与已穿记录 |
| get_personal_sizes | sizes | 身体尺码 |
| get_photos | photos | 单品、搭配或日历快照的实际图片 |
| create_outfit | write | 保存真实单品组合 |
| plan_outfit | write | 安排搭配并保存独立历史快照 |

列表每页最多 50 条，用 nextOffset 继续。未授权工具不出现在列表中，直接调用也不能绕过权限。工具参数不接受账号或衣橱 ID，以连接范围为准。搜索依据已录入资料，不提供图片向量搜索或自动标注。

`get_photos` 默认封面，通过 photoIndexes 可取最多四张图片。每张返回记录 ID、名称、照片索引、封面标记及 MCP image 内容块。临时按方向旋转、缩放为最大 1024 或 1536 像素 JPEG，原图字节不改变；透明背景合成白色，动图使用第一帧。最大 4000 万输入像素，单张预览最多 1500 KiB，无法处理时返回错误。

OpenAI 的文字工具结果后追加带实际图片的多模态 user 消息；Anthropic 的 tool_result 直接含 base64 image。每张图附有记录标识。外部客户端仍须把 image 内容块传入支持视觉的模型，不能仅把图片链接显示在界面中。

写入复用网页的事务、关联、版本、颜色库及同步规则。写工具使用 requestId UUID；同一编号和参数重复调用返回原结果，不重复保存，编号用于不同参数返回冲突。

最近 200 次操作保存在当前账号，页面显示最近 30 次，只保存来源、工具名、衣橱、成功状态和时间，不保存参数、照片、回答和凭据。

## 验证与适用范围

先 `pnpm build`，再 `pnpm test`。新增 `tests/ai-mcp.mjs` 使用隔离数据和独立端口，通过与 pnpm start 相同的生产入口运行，检查 HTTP/stdio、账号隔离、权限拒绝、原图保留、两种模型请求内实际 JPEG、写入重试、密钥、错误和取消。测试结束关闭全部 Closet 服务，包括正式 4320 和临时服务；不自动重启。`scripts/stop-services.ps1` 只结束路径属于本项目的服务，其他程序占用端口会报告。

供应商请求通过本地模拟服务器验格式，未消耗真实模型额度；尚未检验真实模型的视觉理解或推荐质量，需填写用户选定的模型后检验。Android 原生应用也支持手机直接连接模型并调用本地 MCP 工具，不依赖电脑 Closet 服务；详情见 [安卓本地 AI](android-ai.md)。外部 HTTP/stdio 接入仍由电脑端提供。

参考：[MCP 工具](https://modelcontextprotocol.io/specification/latest/server/tools)、[OpenAI 工具调用](https://developers.openai.com/api/docs/guides/function-calling)、[Anthropic 工具调用](https://platform.claude.com/docs/en/agents-and-tools/tool-use/implement-tool-use)、[Anthropic 视觉](https://platform.claude.com/docs/en/build-with-claude/vision)。
