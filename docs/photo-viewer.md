# 照片大图与裁剪

Web 和 Android 使用同一个查看器。点击单品列表的照片、搭配照片或详情中的照片预览，直接展开大图；点击卡片文字仍可编辑资料。选择搭配或分组成员时，卡片保持原来的选择行为。

- 双指或滚轮缩放，范围为适应窗口大小的 1–8 倍；放大后可拖动，双击切换放大/复原，底部也有缩放与重置按钮。
- 多照片可用底部前后按钮切换。查看区域获得键盘焦点时，方向键切图，`+` / `-` 缩放；Esc 或 Android 返回键关闭大图。在裁剪模式先退出裁剪。
- 底部“编辑资料”进入原有详情表单。“裁剪”支持自由比例、1:1、3:4、4:3，拖动选框移动，拖动四角调整大小。
- “保存为新照片”按原始像素裁剪成 PNG，不覆盖或压缩原图。裁剪封面时，新照片成为封面；原图仍留在照片列表。仍受每条记录 20 张、单张 20 MB 的限制，超过限制会明确报错。
- 从列表裁剪会通过原有版本检查直接保存。详情表单内裁剪只改变草稿，仍需点击“保存单品”或“保存搭配”；取消表单不会替换已经保存的照片。
- 日历历史快照可展开、缩放和下载，保持只读。仅由关联单品拼成、没有自身照片的搭配可查看关联照片，编辑入口仍编辑该搭配。
- Android 已保存原图通过系统文件选择器导出。尚未保存的草稿需先保存资料再导出。GIF 裁剪结果是静态 PNG。

## 验证入口

先运行 `pnpm build`，再运行 `pnpm lint`、`pnpm typecheck`、`pnpm test`。`tests/photo-view.mjs` 覆盖手势锚点、拖动和裁剪边界、固定比例、原图保留、封面选择及数量限制。

Android 仪器测试 `ClosetInstrumentedTest#photoViewerGesturesAndCrop` 使用真实 Release WebView、双指 MotionEvent、Canvas、SQLite 和私有图片文件。验证大图打开、双指与滚轮缩放、640×640 裁剪结果、像素颜色、原图 SHA-256，以及重建 Activity 后的持久化。测试创建独立的模拟器账号。

浏览器验收使用 `pnpm start`、独立端口 4338 和 `.test-runtime/photo-view-browser/`，检查桌面及手机视口的全屏布局、缩放、裁剪拖动、保存和嵌套编辑返回。测试结束关闭全部 Closet 服务和本次启动的模拟器。

## 2026-10-12 实际结果

- 最终生产构建、ESLint、TypeScript 和 `pnpm test` 的 15 组检查均通过。
- 桌面 1280×720 与手机 390×844 浏览器视口通过：全屏边界、原图适应尺寸、实际滚轮缩放、鼠标拖动、固定比例与选框拖动、裁剪提交、原图切换、详情内裁剪后取消草稿、Esc 返回。
- 浏览器下载的 `viewer-original.png` SHA-256 为 `0cb712b7a3c2dc1fa6e847ff17e6245e2223f262704fe089be559f276f3020ca`，与上传时相同。
- 最终 Release APK 在 Android 10 / API 29 和 Android 15 / API 35 均覆盖安装成功，各自执行照片仪器测试得到 `OK (1 test)`。验证了实际双指 MotionEvent、滚轮事件、全屏图片比例、640×640 裁剪及像素颜色、原图字节、Activity 重建后资料保留。
- 两套模拟器均使用 WebView 124；API 29 延续基础验收的 192 MB ART 堆配置。本次没有真实手机连接，真机触摸、厂商系统及长时间大照片压力仍需实际设备确认。
- 原始仪器日志：`.test-runtime/android-results/photo-view-api29.txt` 和 `photo-view-api35.txt`。截图：`outputs/android/photo-viewer.jpg`、`photo-viewer-crop.jpg`（使用红绿测试照片）。
- 当时验收 APK 已保留为 `outputs/android/new-closet-1.0.0-before-ui-v1.apk`，10,542,567 字节，SHA-256 `bb735f2cb77273113ccbeb90cbf29c2064962937dcf0fc14cbb218fb3192e0b8`。沿用原发布签名、包名与版本，可覆盖安装。
