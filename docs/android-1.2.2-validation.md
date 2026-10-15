# Android 1.2.2 editor layout fix / 编辑页布局修复

Validated on 2026-10-15. This signed APK is a local fix candidate and has not been published to GitHub Release.

## Reproduction and fix

On 1.2.1, scrolling the item editor moved the save bar into the middle of the form and moved the close button offscreen. This reproduced without opening the keyboard: after a native swipe, the dialog scrolled 179px and the footer bottom moved from 842px to 663px in the WebView's CSS coordinates.

The fullscreen editor inherited a non-`none` CSS `translate`, even though its value was zero. Its fixed descendants therefore belonged to the scrolling dialog instead of the viewport. The sticky header also did not consistently cover the top safe area.

Item and outfit editors now use a fullscreen column layout. The header, close button, error message, and save bar sit outside the scrolling fieldset. The frame reserves the device's safe area and resizes with the keyboard; only the fields scroll. Android-specific selectors keep the desktop layout unchanged.

## Validation

- Production Next.js and Android Vite builds, lint, and TypeScript checks passed.
- The signed APK passed seven targeted Android tests: editor scrolling, keyboard resizing, filter/month dialog positions, photo gestures/cropping, navigation/draft protection, item saving, and bilingual persistence (`OK (7 tests)`).
- Editor scrolling, keyboard resizing, and filter/month dialog positions also passed with zero safe-area insets (`OK (3 tests)`).
- Item and outfit editors both scroll while retaining their header, close button, and save bar. Fields stay above the footer.
- A native touch opens the system keyboard, and Android Back closes it. Two consecutive cycles restore the original viewport size and footer position. With the keyboard open, the footer stays immediately above it.
- Actual emulator screenshots were inspected for the scrolled item form and the keyboard's shown and hidden states.
- Final frame checks wait for WebView rendering and verify that native and page scroll offsets remain zero; both inset configurations passed.

Tests used an isolated Android 15 / API 35 emulator with WebView 124.0.6367.219. Nonzero safe-area coverage substitutes top 24px, side 8px, and bottom 16px into the loaded stylesheet. The fixture handles complete CSS declarations, including padding shorthands; an early check exposed and corrected the fixture's omission of those shorthands. These inset values are simulated, not measurements from the user's phone.

Logs and screenshots are kept locally in `.test-runtime/android-results/editor-*.txt` and `outputs/android-ui-fixes/1.2.2/`. No computer Closet service was needed. All Closet services and the isolated emulator are closed after testing. Physical-device confirmation remains pending.

## Local artifact

- APK: `outputs/android/new-closet-1.2.2.apk`, 10,694,800 bytes.
- Application ID: `app.newcloset.android`; version 1.2.2 / versionCode 5.
- SHA-256: `ca2b72b9b17983fa4210ce9c149c8b193a90d134f9104494dfca959b2a94622d`.
- Signing certificate SHA-256: `c42d6cb416221b0358cffbdbe6d52024938cd796f3a75f5c85dbb462bbe6af93`, unchanged from 1.2.1. Signature verification and update installation passed.

## 中文

已在 1.2.1 实际 APK 中复现截图所示问题：无需弹出键盘，滚动单品表单就会把保存栏推到页面中间，并让关闭按钮移出屏幕。根因是固定按钮放在带位移属性的可滚动弹窗内。

现在单品与搭配编辑页都只滚动中间表单；标题、关闭按钮和保存栏保持在页面上下两端，并留出系统安全区。键盘弹出时保存栏位于键盘上方，收起后恢复底部。

生产构建、代码检查、7 项针对性安卓回归及零安全区下的 3 项布局回归通过，已核对模拟器实际截图。安装包沿用原签名，可直接覆盖安装。本次为本地修复包，尚未发布，也尚未在用户的物理手机上验证。
