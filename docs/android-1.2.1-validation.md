# Android 1.2.1 viewport fix / 界面位移修复

Validated on 2026-10-15. This is a local signed fix APK; it has not been published as a GitHub release.

## Cause and fix

Opening **Filter and group** or the calendar month picker activates modal scroll locking. The scroll-lock library replaces the body's top and side padding with its margins. Android uses that padding for the device's safe area, so a nonzero top inset was lost while either dialog was open.

The Android stylesheet now preserves all four safe-area paddings while `body[data-scroll-locked]` is present. Modal focus and scroll locking remain enabled.

## Reproduction and regression

Tests ran in the signed release app on an isolated Android 15 / API 35 emulator with WebView 124.0.6367.219. This emulator reports zero safe-area insets. The regression test substitutes device insets into the loaded stylesheet (top 24px, sides 8px, bottom 16px), then opens and closes both dialogs using native touch events. These are simulated insets, not measurements from the user's phone.

| App position | 1.2.0 | 1.2.1 |
| --- | --- | --- |
| Before opening either dialog | x=8, y=24 | x=8, y=24 |
| While either dialog is open | x=0, y=0 | x=8, y=24 |
| After closing either dialog | x=8, y=24 | x=8, y=24 |

The regression fails on 1.2.0 and passes on 1.2.1. It checks the app and bottom navigation positions and widths, native WebView position, and both native and page scroll offsets. It also verifies that each dialog actually opens and closes. Native and page scroll offsets remained zero throughout the reproduction.

- Production Next.js and Android Vite builds, lint, and TypeScript checks passed.
- Final APK: modal positions, photo gestures/cropping, navigation/draft protection, saving an item through the interface, and bilingual persistence: `OK (5 tests)`.
- The same modal test with all safe-area insets set to zero passed separately: `OK (1 test)`.
- An initial supplementary run was interrupted by the emulator exiting; the final five-test run completed after restarting it.

Raw logs are local under `.test-runtime/android-results/viewport-*.txt`. No computer Closet service was needed for these offline tests. All Closet services and the isolated test emulator are closed afterward.

## Local artifact

- APK: `outputs/android/new-closet-1.2.1.apk`, 10,694,740 bytes.
- Application ID: `app.newcloset.android`; version 1.2.1 / versionCode 4.
- SHA-256: `b53a7edc46c861120bf45d8a813a41e886358008aa9d6bef718af79f46ec5d8b`.
- Signing certificate SHA-256: `c42d6cb416221b0358cffbdbe6d52024938cd796f3a75f5c85dbb462bbe6af93`, unchanged from 1.2.0; signature verification and update installation passed.

No physical phone was used. Confirmation on the affected phone is still pending.

## 中文

“筛选与分组”和日历月份弹层会启用滚动锁。原来的滚动锁样式覆盖了 Android 页面为状态栏、屏幕边缘预留的安全区，导致整个内容区域上移。现在弹层打开期间仍保留四周安全留白。

在实际 Android WebView 中模拟顶部 24px 安全区后，旧版打开两种弹层均从 y=24 变为 y=0，关闭后恢复；新版打开、关闭均保持 y=24。页面与原生 WebView 的滚动位置一直为 0。零安全区场景也通过验证。

最终签名 APK 的上述 5 项针对性回归、生产构建和代码检查通过。安装包沿用原签名，可覆盖安装。本次为本地修复包，尚未发布到 GitHub Release，也尚未在用户的物理手机上验证。
