# Android 1.1.0 发布验证

验证日期：2026-10-14。模型配置和手机本地工具说明见 [安卓本地 AI](android-ai.md)。本记录对应最终 Release APK，不把历史版本的验收当作新版结果。

## 安装包

- 文件：`outputs/android/new-closet-1.1.0.apk`，10,658,527 字节。
- 包名：`app.newcloset.android`，版本 1.1.0 / versionCode 2，最低 API 29，目标 API 36。
- SHA-256：`802b6227c2fe4f1677617c2ea677e1527cf8e55f1418c6f5972bdc3382bbaca6`。
- 发布证书 SHA-256：`c42d6cb416221b0358cffbdbe6d52024938cd796f3a75f5c85dbb462bbe6af93`，与 1.0.0 相同。
- APK v2 签名验证通过，未包含 `client-test.js` 仪器测试入口。签名、密钥、资料和缓存未提交 Git。

## 本次检查

最终源码的 Next.js 生产构建、Vite 移动端生产构建、静态检查、类型检查及 16 组完整回归通过。Android Release 编译、签名和校验值生成通过。

隔离模拟器为 Android 15 / API 35，WebView 124.0.6367.219。安装的是上述最终 APK：

| 验证 | 结果 |
| --- | --- |
| 全部仪器回归：离线 SQLite、大文档、账号、原图、ZIP、同步、照片手势、界面保存与手机 AI | OK (9 tests) |
| 关闭电脑全部 Closet 服务后，独立手机 AI、两种模型消息、真实 JPEG、权限及保存 | OK (1 test) |
| 强制停止并同签名覆盖安装后，原有单品、全部记录 ID、密钥密文及 Keystore 解密后的实际请求 | OK (2 tests) |

全套回归中的旧覆盖安装方法需要独立启用，因此另行执行了上表两项实际升级检查。模型测试采用本地模拟供应商，验收实际 Android Keystore、HTTP、SQLite、图片解码和聊天界面，不代表真实模型的视觉理解或推荐质量。未使用真实用户照片或真实模型额度。

原始结果：`.test-runtime/android-results/android-1.1-suite-api35.txt`、`android-1.1-ai-without-closet.txt`、`android-1.1-upgrade-api35.txt`。模型接收的图像为手机系统生成的实际 JPEG，模拟服务验证 MIME、像素尺寸、记录映射和两个供应商的认证格式。

本次没有物理手机，未在最终 1.1.0 包上重跑 API 29。实际供应商、真机网络、厂商键盘、相册/相机、真实系统选择器及低内存仍需实际设备验证；旧版本的 API 29 结果保留在历史说明中。

测试结束关闭全部正式和临时 Closet 服务、模拟模型及本项目测试模拟器，不重新启动正式服务。
