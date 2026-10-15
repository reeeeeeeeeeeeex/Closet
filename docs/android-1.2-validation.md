# Android 1.2.0 validation / 发布验证

Validated on 2026-10-15 using the signed release APK below.

## Release artifact

- APK: `outputs/android/new-closet-1.2.0.apk`, 10,694,708 bytes.
- Application ID: `app.newcloset.android`; version 1.2.0 / versionCode 3.
- Minimum Android API: 29; target API: 36; required WebView: 124 or later.
- SHA-256: `402ad32246857ffd8cf1a54e6f2011f7b43901a39f03877e6ddc6e400a4ad5fe`.
- Signing certificate SHA-256: `c42d6cb416221b0358cffbdbe6d52024938cd796f3a75f5c85dbb462bbe6af93`, unchanged from 1.0.0 and 1.1.0.
- APK v2 signature verified. The release contains license notices and excludes the instrumentation-only `client-test.js` bundle.

## Checks

Production Next.js and Vite builds, lint, and TypeScript checks passed. All 17 JavaScript suites passed; the AI/MCP suite passed on a separate rerun after a connection reset during the first run.

The final APK ran on an isolated Android 15 / API 35 emulator with WebView 124.0.6367.219:

| Check | Result |
| --- | --- |
| Android suite: storage, original photos, ZIP round trip, local sync, UI saves, navigation, gestures, AI, and bilingual persistence | `OK (11 tests)`; two upgrade methods are gated in this invocation and checked separately below |
| Fresh language preference defaults to English; switch English → Chinese → English; both choices survive Activity recreation | Passed |
| Switching language leaves the stored wardrobe document unchanged | Passed |
| English and Chinese language controls viewed in the actual Android app | Passed |
| With every computer Closet service stopped: local Android AI and bilingual persistence | `OK (1 test)` for each check |
| Force-stop and reinstall the signed APK: saved item and English preference retained | `OK (1 test)` |
| After reinstall: record IDs and encrypted model key retained; Android Keystore can still decrypt the key for a model request | `OK (1 test)` |

The readiness helper waits until navigation is enabled and loading has finished before interacting with the app. An early attempt exposed that test timing issue; it was fixed before the successful final run. Emulator interruptions were resolved before the final suite completed.

Raw logs are kept locally under `.test-runtime/android-results/android-1.2-*.txt`. Test services use isolated data. All Closet services, model fixtures, and this project's test emulator are stopped after acceptance.

The model provider is a local fixture that checks actual native HTTP requests, credentials, and JPEG image data. These checks do not assess a live model's recommendations. No physical phone was used, and API 29 was not rerun for this release. Vendor keyboards, real camera/gallery interaction, system file pickers, and low-memory behavior still require physical-device testing.

## 中文

本次验证对应上述最终签名 APK。新增中英双语界面，首次默认英文；在“我的 / You → 语言 / Language”切换。两种语言均在重启界面后保留，切换不改写衣橱资料。语言选择保存在手机本地，系统相机、相册和文件选择器继续使用 Android 自身语言设置。

生产构建、静态检查、类型检查和 17 组 JavaScript 回归通过；其中 AI/MCP 首轮连接重置，单独重跑通过。最终安装包在隔离 Android 15 / API 35、WebView 124 环境完成全套仪器回归，返回 `OK (11 tests)`；其中两个升级方法需显式启用，已另行运行通过。

关闭全部电脑 Closet 服务后，手机本地 AI 与双语保存检查通过。强制停止并覆盖安装相同签名的 APK 后，原有单品、英文选择、全部记录 ID、模型密钥密文及 Keystore 解密后的请求均验证通过。测试脚本已修正为等待界面可操作，最终成功运行前发生的模拟器中断已恢复。

本次没有物理手机，未重跑 API 29，也未调用真实模型服务。真实设备上的键盘、相机/相册、系统文件选择器和低内存行为仍需真机验收。测试结束关闭所有正式与临时 Closet 服务、模型模拟服务和本项目测试模拟器，不重启正式服务。
