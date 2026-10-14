# 安卓本地 AI 与 MCP 工具

安卓“我的 → 穿搭灵感”提供与电脑相同的模型设置和聊天。支持 OpenAI 兼容 Chat Completions 和 Anthropic 原生 Messages，直接从手机连接用户填写的模型服务，查询手机本地衣橱、原图、搭配、尺码与日历。电脑 Closet 服务无需运行；模型服务本身仍需可访问。

手机和电脑共用 `lib/mcp-core.ts` 的工具注册、参数校验、筛选及照片关联，内置模型通过官方 MCP Client 与内存传输调用工具。`lib/ai-runtime.ts` 共用模型循环和图片消息格式。手机适配器读取自己的 SQLite 文档和图片，在本地保存搭配及日历；不会借助电脑数据替代手机记录。

## 配置和权限

填写接口类型、包含 API 路径的服务地址、模型名与 API Key。模型需要支持工具调用，看图需要视觉支持。默认授权资料与照片，身体尺码及保存权限分别选择。选择保存权限后，在需求中明确要求保存搭配或安排日历。

手机模型配置与电脑配置独立，不随衣橱同步或 ZIP 备份传输。API Key 使用 Android Keystore 中的 AES-256 密钥、GCM 和账号关联数据加密后保存在 App 私有 SQLite 中，原生网络层解密并发送给配置的模型服务；密钥不会作为模型配置响应返回 WebView。更换接口类型或地址时需重新输入密钥。支持 HTTPS，以及本机/局域网 HTTP 模型；拒绝 URL 内凭据、查询和片段，不跟随重定向。HTTP 局域网仅用于用户自己的本地模型或隔离测试。

照片从本机原图生成临时 JPEG 预览，每张附有对应记录 ID。支持 1024、1536 最大边长，最多四张、4000 万输入像素和每张 1500 KiB 输出；原图不改变。解码由 Android 系统负责，旧系统无法解码的格式会返回错误。OpenAI 和 Anthropic 分别使用各自的图像消息格式。

所有操作绑定发送时的账号、衣橱和权限，检查当前账号及权限后才执行。搭配和日历保存复用原有变更规则，并在同一手机文档提交中保存 requestId 收据；重复请求不创建重复记录。最近工具活动不包含图片、参数、回答或密钥，手机活动和收据不进入 ZIP/同步资料。

停止请求会断开未完成的原生网络连接，成功保存的记录保留。请求上限与电脑相同：180 秒、12 轮、32 次工具调用及 12 MiB 图像 base64 数据。衣橱管理、相册、备份和同步继续使用已有本地存储。

## 外部 agent

安卓本版提供内置模型使用的本地 MCP 工具，不在手机上开放 HTTP/stdio MCP 服务。外部 agent 连接电脑端 `/mcp` 或 stdio，按 [AI/MCP 说明](ai-mcp.md) 配置。手机资料仍可通过原有手动同步同步到电脑。

## 验证

生产前端、原生 Release 编译及签名验证通过。隔离 Android 15 / API 35 模拟器中的 `phoneModelAndMcpTools` 针对最终 APK 完成 `OK (1 test)`，验证真实 SQLite、Android Keystore、原生 HTTP、系统图片解码、两种模型请求里的实际 JPEG、原图字节保持、权限拒绝、保存重试和日历快照，并通过实际聊天界面发送后看到回答。

该测试启动手机独立模型流程时电脑 Closet 服务未运行。模型供应商由本地模拟服务提供，因此证明手机调用和消息格式，不等同于真实模型的语义理解或推荐质量。本次没有连接物理手机；最新包的 API 29 验证范围另见发布记录。

运行 `node scripts/build-mobile-instrumentation.mjs` 构建只进入测试 APK 的测试入口。`node scripts/android-ai-fixture.mjs` 启动隔离模型服务器并写入 `.test-runtime/android-ai-fixture.json`；以 `closetModelAddress` 参数传给仪器测试。所有测试模型和数据均为受控样本，不使用真实 API Key、用户照片或模型额度。

参考：[Android Keystore](https://developer.android.com/privacy-and-security/keystore)、[Android ImageDecoder](https://developer.android.com/reference/android/graphics/ImageDecoder)。
