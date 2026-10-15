# New Closet

A personal wardrobe app with original photos, outfit planning, offline Android support, local sync, and portable backups.

[English](#english) · [简体中文](#简体中文)

## English

### Your wardrobe, on your own devices

New Closet helps you organize the clothes you own, put together outfits, and keep a calendar of what you plan to wear or have worn. Your original photos stay intact, your data lives on your computer or Android device, and a ZIP backup lets you take it with you.

The desktop app runs as a local web service. The Android app stores its interface and data on the phone, works offline, and can sync manually with your computer over a local network. English is the default interface language; switch to Simplified Chinese from the profile menu on desktop or **You → Language** on Android. The phone remembers your choice across restarts.

### Features

- **Wardrobe catalog:** tops, bottoms, dresses and one-pieces, outerwear, shoes, bags, and accessories, with brands, colors, seasons, occasions, fit, measurements, and notes.
- **Original photos:** up to 20 photos per item or outfit, with a cover, zoom, and cropping saved as a new photo. Originals are never recompressed.
- **Flexible organization:** nested groups, search, filters, and archived items. An item or outfit can belong to multiple groups.
- **Outfits and calendar:** combine items, save outfit photos, or use both. Calendar entries keep independent snapshots, so later edits don't rewrite what you wore.
- **Personal measurements:** optional body measurements and separate EU and Chinese shoe sizes for each wardrobe.
- **AI and MCP:** connect an OpenAI-compatible or Anthropic model, or an external MCP client. Choose whether it can view photos, read measurements, or save outfits and calendar plans.
- **Portable data:** export records and original photos together, restore into a new wardrobe, or sync between Android and your computer. Separate profiles keep their own wardrobes and color libraries.

### Quick start

Requires **Node.js 24 or later** and **pnpm 11.25.0**.

```sh
git clone https://github.com/reeeeeeeeeeeeex/Closet.git
cd Closet
pnpm install --frozen-lockfile
pnpm build
pnpm start
```

Open [localhost:4320](http://127.0.0.1:4320). No sign-up or password is needed. Use the profile menu to add, switch, or rename profiles, or change the interface language. A fresh installation creates a profile named **Me**. Existing names and personal content are preserved.

On Windows, you can also double-click [`Start-Closet.cmd`](Start-Closet.cmd). It installs dependencies and builds the app on first use. Run `pnpm build` again after changing source files. `pnpm dev` is available for development; use production builds for acceptance testing.

### Local network access

The server listens only on your computer by default. To let devices on the same trusted network connect, start it from PowerShell with:

```powershell
$env:CLOSET_HOST = '0.0.0.0'
pnpm start
```

Open `http://YOUR_COMPUTER_LAN_IP:4320` on another device. Your computer must stay on, and its firewall must allow the port. **Everyone who can reach the web app can switch between all profiles.** Profiles organize data; they do not provide password-protected access. Keep the web service on a trusted computer or local network.

| Variable | Default | Purpose |
| --- | --- | --- |
| `CLOSET_HOST` | `127.0.0.1` | Listening address |
| `CLOSET_PORT` | `4320` | Server port |
| `CLOSET_DATA_DIR` | `./data` | Database and original photo storage |

Set these variables in the startup command's environment. Setting them only in `.env.local` is insufficient: the launcher reads them before Next.js starts.

### Android

The Android app supports offline editing and manual, two-way local network sync. Generate a pairing code in **Data and backups → Local network sync** on your computer, then enter its address and the code in the phone app. Pairing grants access to one profile. If a record changes on both devices, you choose which version to keep.

Requires Android 10 or later and Android System WebView 124 or later. To build an APK on Windows, install JDK 21 and Android SDK platform 36 / build-tools 36.0.0, set `CLOSET_JAVA_HOME` and `ANDROID_HOME` as needed, then run `pnpm android:apk`.

Download the signed Android 1.2.0 APK from [GitHub Releases](https://github.com/reeeeeeeeeeeeex/Closet/releases/latest), or build it yourself. The build script produces a signed APK under `outputs/android/`. Back up `.local/android-signing/`: future updates need the same signing key. Export your wardrobe before uninstalling. See the [Android guide](docs/android.md) and [1.2.0 validation notes](docs/android-1.2-validation.md).

### Storage and backups

Desktop data lives in `data/` by default. `closet.sqlite` stores records, profiles, settings, and migration history. `assets/<owner-hash>/<image-sha256>` stores original image bytes, deduplicated by SHA-256. A legacy `auth.json` is used only to preserve the session-signing key during migration; password sign-in has been retired.

In **Data and backups**, export a ZIP containing `manifest.json`, `README.txt`, and `assets/`. Import checks record relationships and photo checksums, then creates a **new wardrobe** in the current profile without overwriting existing wardrobes. The current format is `new-closet`, schema version **9**, with import support for versions **1–8**.

You can also stop the server and copy the entire data directory. Copying only the SQLite file while the server is running may miss changes in its WAL files. A complete directory copy includes local settings and credentials; the portable wardrobe ZIP excludes model keys and sync or MCP tokens.

Limits: 20 MB per photo, 20 photos per item or outfit, 2,000 records per wardrobe, 2 GB per backup, and 3 MB per manifest. Supported image formats are JPG, PNG, WebP, GIF, and AVIF; convert HEIC first. Background removal and automatic outfit recommendations are not included. Optional AI features send authorized content to your chosen model service.

Personal data, keys, logs, dependencies, build output, and test data are excluded from Git. No cloud account, Cloudflare, D1, or R2 is required.

### Development and translation

```sh
pnpm build
pnpm lint
pnpm typecheck
pnpm test
pnpm mobile:build
```

Build before running `pnpm test` or browser acceptance checks. Tests use isolated `.test-runtime/` data and separate local ports. After testing, stop **all** Closet services, including the regular service on port 4320, and confirm their ports are closed. Do not restart them automatically.

English and Simplified Chinese catalogs live in [`lib/i18n/messages/`](lib/i18n/messages/). Keys remain stable; user-written names and notes are not translated. See the [translation guide](lib/i18n/README.md) for persistence, plural forms, and adding languages. Run `pnpm i18n:extract` after adding messages; it preserves existing translations.

Tests cover backup round trips, original image bytes, snapshots, profiles, conflicts, sync, and AI/MCP permissions. AI tests use mock providers to verify protocol behavior, not real model suggestion quality. Database migrations in `drizzle/` run automatically. `legacy/cloud/` preserves earlier cloud reference material and is excluded from local builds.

### Documentation and licensing

- [AI and MCP](docs/ai-mcp.md), [Android AI](docs/android-ai.md) — Chinese
- [Photo viewer and cropping](docs/photo-viewer.md) — Chinese
- [Detailed wardrobe features and data conventions](docs/wardrobe-guide.zh-CN.md) — Chinese

New Closet is available under the [MIT License](LICENSE). You may use, modify, and redistribute it, including commercially, while keeping the copyright and license notice. See [third-party notices](THIRD_PARTY_NOTICES.md) for bundled components. Libre Closet served as a feature reference for this independent implementation; its implementation code was not copied.

## 简体中文

### 衣橱留在自己的设备里

New Closet 帮你整理已有衣物、组合搭配，并记录计划穿着和实际穿过的造型。原始照片完整保留，资料存放在自己的电脑或 Android 手机中，也能通过 ZIP 备份随时带走。

电脑端以本地网页服务运行；Android App 将界面和资料保存在手机，支持离线使用，并可通过局域网与电脑手动同步。界面默认英文，电脑端在账号菜单、Android 端在“我的 / You → 语言 / Language”切换为简体中文。手机重启后保留语言选择。

### 主要功能

- **衣橱整理：**支持上装、下装、连体与裙装、外套、鞋履、包袋和配饰，记录品牌、颜色、季节、场合、版型、尺寸与备注。
- **原图保存：**每件单品或搭配最多 20 张原图，可选封面、放大查看、将裁剪结果另存为新照片，原图不重新压缩。
- **灵活分组：**支持嵌套分组、搜索和筛选，同一内容可加入多个分组，暂时不穿的衣物可以收起。
- **搭配与日历：**可关联单品、保存搭配照片，或同时使用。日历保存独立快照，后续修改不会改变历史穿搭。
- **个人尺码：**每个衣橱单独记录身体尺寸、欧码和中国毫米鞋码，各项均可留空。
- **AI 与 MCP：**连接 OpenAI 兼容或 Anthropic 模型，也可使用外部 MCP 客户端。照片、身体尺码以及保存搭配和日历的权限由你选择。
- **数据迁移：**记录与原图一并导出，可恢复为新衣橱，或在 Android 与电脑间同步。不同账号分别保存衣橱和颜色库。

### 快速开始

需要 **Node.js 24 或更新版本**、**pnpm 11.25.0**。

```sh
git clone https://github.com/reeeeeeeeeeeeex/Closet.git
cd Closet
pnpm install --frozen-lockfile
pnpm build
pnpm start
```

打开 [localhost:4320](http://127.0.0.1:4320)，无需注册或密码。在账号菜单中新增、切换、重命名账号或调整语言。全新安装创建名为 **Me** 的账号；已有名称和个人内容保持不变。

Windows 也可双击 [`Start-Closet.cmd`](Start-Closet.cmd) 或 [`启动Closet.cmd`](启动Closet.cmd)。首次运行安装依赖并构建，修改源码后请重新执行 `pnpm build`。开发时可用 `pnpm dev`，验收使用生产构建产物。

### 局域网访问

默认仅本机可访问。在 PowerShell 中执行以下命令，即可让同一可信局域网内的设备连接：

```powershell
$env:CLOSET_HOST = '0.0.0.0'
pnpm start
```

其他设备打开 `http://电脑的局域网IP:4320`。电脑需保持运行，防火墙需允许该端口。**能访问网页的人都可以切换所有账号。**账号用于整理资料，不提供密码保护，请将服务用于可信本机或局域网。

| 环境变量 | 默认值 | 用途 |
| --- | --- | --- |
| `CLOSET_HOST` | `127.0.0.1` | 监听地址 |
| `CLOSET_PORT` | `4320` | 服务端口 |
| `CLOSET_DATA_DIR` | `./data` | 数据库与原图目录 |

这些变量应设置在启动命令的环境中，仅写入 `.env.local` 不足以生效：启动器需要在 Next.js 启动前读取。

### Android

Android App 支持离线编辑与手动双向同步。在电脑的“数据与备份 → 局域网同步”生成配对码，再在手机上填写电脑地址和配对码。配对只授权一个账号；同一记录在两端都被修改时，由你选择保留哪个版本。

需要 Android 10 或更新版本，以及 Android System WebView 124 或更新版本。在 Windows 构建 APK 时，安装 JDK 21、Android SDK platform 36 / build-tools 36.0.0，按需设置 `CLOSET_JAVA_HOME`、`ANDROID_HOME`，然后执行 `pnpm android:apk`。

可从 [GitHub Releases](https://github.com/reeeeeeeeeeeeex/Closet/releases/latest) 下载 Android 1.2.0 签名 APK，也可自行构建。构建产物生成于 `outputs/android/`。在“我的 / You → 语言 / Language”切换简体中文与英文，重启后保留选择。请另行妥善备份 `.local/android-signing/`，后续覆盖升级需要同一签名。卸载前请导出备份。详见 [Android 说明](docs/android.md) 和 [1.2.0 验证记录](docs/android-1.2-validation.md)。

### 数据与备份

电脑端默认使用 `data/`。`closet.sqlite` 保存记录、账号、设置和迁移记录；`assets/<owner-hash>/<image-sha256>` 保存原始图片字节，按 SHA-256 去重。旧版 `auth.json` 仅用于迁移时保留会话签名密钥，密码登录已停用。

在“数据与备份”导出完整 ZIP，包含 `manifest.json`、`README.txt` 和 `assets/`。导入先检查记录关联和照片校验值，再在当前账号下创建一个**新衣橱**，不覆盖原衣橱。当前格式为 `new-closet`、版本 **9**，支持导入 **1–8** 版备份。

也可停止服务后复制整个数据目录。运行时仅复制 SQLite 文件可能遗漏 WAL 中的数据。整个目录包含本地设置和凭据；可移植的衣橱 ZIP 不包含模型密钥、同步令牌或 MCP 令牌。

限制：单张照片最多 20 MB，每件单品或搭配最多 20 张照片，每衣橱最多 2,000 条记录，备份包最多 2 GB，清单最多 3 MB。支持 JPG、PNG、WebP、GIF、AVIF，HEIC 需先转换。暂不提供自动抠图和自动搭配推荐。使用可选 AI 功能时，已授权内容会发送给你配置的模型服务。

个人资料、密钥、日志、依赖、构建产物和测试资料被 Git 忽略。运行不需要云端账号、Cloudflare、D1 或 R2。

### 开发与翻译

```sh
pnpm build
pnpm lint
pnpm typecheck
pnpm test
pnpm mobile:build
```

测试和浏览器验收前先完成生产构建。测试使用独立端口及隔离的 `.test-runtime/` 数据目录。结束后关闭 **全部** Closet 服务，包括默认端口 4320 的正式服务，并确认端口不再监听，不自动重启。

中英文语言包位于 [`lib/i18n/messages/`](lib/i18n/messages/)。翻译键保持稳定，用户填写的名称和备注不自动翻译。语言保存、复数和新增语言见 [翻译说明](lib/i18n/README.md)。新增文案后执行 `pnpm i18n:extract`，已有译文不会被覆盖。

测试覆盖备份往返、原图字节、快照、账号、冲突、同步和 AI/MCP 权限。AI 测试使用模拟供应商验证协议，不代表真实模型的建议质量。`drizzle/` 中的数据库迁移自动执行；`legacy/cloud/` 保留原云端参考，不参与本地构建。

### 文档与许可

- [AI 与 MCP](docs/ai-mcp.md)、[Android 本地 AI](docs/android-ai.md)
- [照片查看与裁剪](docs/photo-viewer.md)
- [衣橱功能与数据约定](docs/wardrobe-guide.zh-CN.md)

New Closet 使用 [MIT 许可证](LICENSE)，允许使用、修改和分发，包括商业用途；分发时须保留版权和许可声明。随附组件的许可见[第三方声明](THIRD_PARTY_NOTICES.md)。本项目为独立实现，Libre Closet 仅作为功能参考，没有复制其实现代码。
