# Android 安装、同步与构建

## 安装

首版为 New Closet 1.0.0，包名 `app.newcloset.android`，支持 Android 10（API 29）及以上，需要系统 Android System WebView 124 或更新版本。老系统如仍使用出厂 WebView，请先在系统应用商店更新；App 会显示更新提示。将 `outputs/android/new-closet-1.0.0.apk` 复制到手机并打开，允许此次使用的文件管理器安装应用。SHA-256 在同目录的 `.apk.sha256` 文件中。

安装包内含完整界面。账号、单品、分组、搭配、日历快照、尺码、颜色库和原图都保存在 App 的私有目录，不依赖电脑运行。覆盖安装同签名更新会保留资料。卸载会删除私有资料，卸载前请在“数据与备份”导出 ZIP。

安卓新 UI 使用底部“衣橱、搭配、日历、我的”导航；尺码和数据与备份位于“我的”。本版设计参考、实际截图和测试见 [Android UI v1](android-ui-v1.md)。

## 照片查看与裁剪

点击照片直接展开大图，双指或滚轮缩放，放大后拖动查看；底部提供编辑、裁剪和原图下载。裁剪结果保存为新照片，原图保留。详情表单内的裁剪还需保存资料才会提交。参见 [照片查看器说明](photo-viewer.md)。

## 与电脑同步

1. 电脑在项目目录执行 `pnpm build`，然后在 PowerShell 中执行：

   ```powershell
   $env:CLOSET_HOST = '0.0.0.0'
   pnpm start
   ```

2. 电脑浏览器打开 `http://127.0.0.1:4320`，选择账号，在“数据与备份 → 局域网同步”生成配对码（有效期 5 分钟、仅使用一次）。
3. 手机连接同一局域网，在 App 的“我的 → 数据与备份 → 局域网同步”输入 `http://电脑局域网IP:4320` 和配对码。一个手机账号绑定一个电脑账号，账号名称可各自不同。
4. 之后点击“立即双向同步”。同步该账号的全部衣橱及颜色库，照片只传输缺少的原图。电脑不可连接时仍可正常保存到手机。

第一次配对时，空手机衣橱接入电脑衣橱；两端已经有资料则保留双方各自的衣橱，不根据同名合并。其他手机通过同一电脑交换资料。首版只支持局域网地址，没有后台自动同步或手机直连；电脑服务和手机 App 在同步时都要运行。

双方修改同一记录时，展开手机/电脑版本核对内容、原图，再选择保留哪边。关联的分组、搭配、日历一起处理，无关联的资料继续同步。暂不选择会保留冲突。不要用 ZIP 导入代替同步：导入始终建立一个独立的新衣橱。

传输中断后点击重试；已提交但没收到响应的操作会按原提交编号确认，避免重复导入。电脑资料在传输时又变化会重新核对，手机在同步期间的新保存也保留。删除标记防止旧设备或重新配对时悄悄恢复已删除记录。

电脑 IP 改变或撤销授权后，可在手机解除配对并重新配对；本机资料保留。电脑端可按设备撤销授权。局域网访问需要网络允许访问该端口；构建与测试脚本不会改防火墙。

## 存储和备份

Android 使用系统 SQLite。每个账号的资料以分块 JSON 和修订号存储，分块避免 Android CursorWindow 的单行大小限制，整次保存使用 SQLite 事务与比较修订号提交。原图按账号、SHA-256 分开保存，校验后通过临时文件原子写入，不压缩、不重新编码。

保存规则与电脑共用 `lib/mutations.ts`。同步采用稳定衣橱标识、共同基线、删除标记、关联分组冲突和持久化待确认提交，不根据设备时钟判断哪边覆盖。图片文件先就绪，再提交引用它的记录。

系统文件选择器负责 ZIP 和原图导出、ZIP 导入。ZIP 流式处理，原图逐张校验；保留 v9 格式和 v1–v8 导入。备份包含可移植资料，不含同步令牌、设备身份或共同基线。单张图片最多 20 MB，每条记录最多 20 张，每衣橱最多 2000 条记录，备份最多 2 GB；账号同步清单上限 32 MB。本地账号文档（含同步基线和待确认提交，不含原图文件）上限 64 MB，大型资料应拆分账号。

## 可重复构建

需要 Node.js 24、pnpm、JDK 21、Android SDK platform 36 / build-tools 36.0.0。依赖由 `pnpm-lock.yaml` 锁定。

```powershell
pnpm install --frozen-lockfile
$env:CLOSET_JAVA_HOME = '你的 JDK 21 路径'
$env:ANDROID_HOME = '你的 Android SDK 路径'
pnpm android:apk
```

`android:apk` 依次执行 `pnpm build`、Vite 生产打包、Capacitor 资源同步、Gradle Release 构建、APK 签名验证和 SHA-256 计算。默认使用 Gradle wrapper；可通过 `CLOSET_GRADLE` 指定兼容的 Gradle 8.13+。项目内安装的 JDK 也可放在 `.local/android-tools/jdk21/`，不会修改系统 Java 设置。

首次构建生成固定签名：`.local/android-signing/closet-release.jks` 与 `release.properties`。必须将整个签名目录另行安全备份；后续版本沿用同一签名，并增加 `versionCode`。签名、密码、SDK、个人资料、构建产物和测试目录都不提交 Git。已有密钥缺失密码或反之时脚本停止，不会静默换签名。

## 验证命令

```powershell
pnpm build
pnpm lint
pnpm typecheck
pnpm test
```

`pnpm test` 包含既有网页回归、同步合并单元测试，以及生产电脑服务与两个持久化手机适配器的集成测试。模拟适配器不能代替 Android 仪器测试或真机验收。

Android 仪器测试使用 `ClosetInstrumentedTest`，覆盖真实 SQLite 大资料/重启/旧修订拒绝、原图字节、原生局域网传输、损坏图片拒绝、系统文件选择器结果的 ZIP 往返，以及实际 WebView 界面保存。文件选择器结果在仪器测试中由 Espresso 返回受控文件，用户实际选择器操作需结合设备验收。

先构建并同步生产前端，再运行 `node scripts/android-test-server.mjs` 建立 `.test-runtime/` 下的生产测试服务，默认端口 4337；连接信息写入 `.test-runtime/android-connection.json`。配对码过期或使用后必须重新生成。执行 `node scripts/build-mobile-instrumentation.mjs` 将真实移动端适配器打入测试 APK（正式 APK 不含测试入口）。构建测试包用 `:app:assembleDebug :app:assembleDebugAndroidTest`；测试包名与正式版分开。用 `-PclosetTestRelease` 和 `:app:assembleRelease :app:assembleReleaseAndroidTest` 可验证同签名发布包，测试时只使用隔离模拟器。

发布包及测试包构建好后，执行 `powershell -File scripts/test-android.ps1 -Serial emulator-5570`（替换为隔离模拟器的 adb 序列号），自动更新配对码、安装、测试、强制停止和同签名覆盖安装，再核对之前的资料仍存在。日志在 `.test-runtime/android-results/`。脚本会修改指定设备的 New Closet 资料，不能直接用来测试已有个人资料的手机。

无论测试结果如何，结束后关闭所有 Closet 服务及测试模拟器，并确认包括 4320 在内的项目服务端口不再监听；不自动重启正式服务。发布验证记录见 `docs/android-validation.md`。
