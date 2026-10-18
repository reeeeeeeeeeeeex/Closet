# Android photo capture fix and photo swiping

Validated on 2026-10-18. Version: **1.5.1 / Android versionCode 9**.

- Picked gallery photos are written to the app's private media storage as soon as they are selected. The photo draft keeps only asset hashes, so opening the camera later cannot invalidate the earlier picks with `NotReadableError`.
- The gallery → camera → save flow was confirmed on a physical Android phone after the fix.
- The full-screen photo viewer supports one-finger horizontal swipes while the photo is at its fitted 100% size: swipe left for the next photo, swipe right for the previous one. The previous/next buttons and keyboard arrow keys remain available.
- Swipe detection requires at least 48 px or 12% of the stage width and a clearly horizontal direction. Short and diagonal drags do not navigate, and mouse drags are ignored on desktop. Pinch zoom, zoomed panning, cropping and saving keep their existing gestures.
- Wardrobe cards, outfit cards and photo galleries share the same viewer, so every entry point gains the swipe gesture.

## Verification

- The production build, TypeScript, ESLint and all 21 `pnpm test` suites passed. `tests/photo-view.mjs` covers left/right swipes, the minimum distance, diagonal drags and the wide-screen threshold.
- Android: versionCode 9 was built with the existing release certificate. `aapt` reports `app.newcloset.android` / `1.5.1` and `apksigner` verifies the same certificate as previous releases.
- Physical-device swipe acceptance remains pending; the photo capture fix itself was confirmed on the user's phone.
- All Closet services were closed after testing, and project service ports were confirmed closed.

## Release APK

- `outputs/android/new-closet-1.5.1.apk` — 10,696,536 bytes.
- SHA-256: `4a56053ea02809c6794b426f537186758df691e6f33cced2748f33c69351ebc6`.
- Signing certificate SHA-256: `c42d6cb416221b0358cffbdbe6d52024938cd796f3a75f5c85dbb462bbe6af93` (same certificate as previous releases).

中文：相册照片选中后会立即写入 App 私有媒体存储，草稿只保留资源哈希，之后再打开相机不会让前面的照片失效。用户已在安卓真机上确认“两张相册照片 + 拍一张 + 保存”可以正常完成。全屏看图界面新增单指左右滑动切换照片（左滑下一张、右滑上一张），左右箭头和键盘方向键保留；放大后的平移、双指缩放、裁剪和保存中的手势不变。滑动需超过 48 px 或屏宽 12%，斜向和短距离拖动不会误触，桌面鼠标拖动不触发。单品、搭配和照片画廊共用该查看器。生产构建、类型检查、静态检查和全部 21 组测试通过；APK 使用原发布证书，真机滑动验收仍待进行。
