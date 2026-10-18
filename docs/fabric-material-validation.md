# Free-text fabric material

Validated on 2026-10-18. Version: **1.5.0 / Android versionCode 8**.

- Every item can record an optional free-text fabric or material note in item details, such as `100% 棉`, `羊毛混纺`, or `真皮 / 再生皮革`. The field can be left empty, and clearing it before saving also works.
- Fabric material appears in the item editor only and stays off the wardrobe cards. It participates in item search on the web and through MCP, and it is included in the AI wardrobe prompt.
- Calendar snapshots keep the value captured at save time. The v11 ZIP format stores it; versions 1–10 remain importable, and older backups without the field upgrade automatically.
- Both languages include the new label, placeholder and guidance.
- Records that use this field require the other device to run 1.5.0 or newer before syncing or importing; older Android builds cannot read the new field.

## Verification

- `pnpm build`, `pnpm typecheck`, `pnpm lint` and all 21 `pnpm test` suites passed. New `tests/fabric.mjs` covers every category, trimming, clearing, 100-character limit, immutable snapshots, sync serialization, v10 backups without the field, search and cards; `tests/portability.mjs` now covers v1–v10 upgrades and the v11 round trip; `tests/runtime.mjs` covers the production API and legacy records without the field.
- Production browser acceptance ran on an independent port with isolated data through headless Edge. It entered a free-text fabric note, saved and reopened it, cleared it, restored it, searched by fabric text, and confirmed the text never appears on the cards. Screenshots: `outputs/fabric-acceptance/`; assertions: `outputs/fabric-acceptance/acceptance.json`.
- Android: the Vite bundle and APK were rebuilt; the packaged WebView assets contain the new field, hint and placeholder. Version code 8 is signed with the same certificate as previous releases. Emulator and physical-phone acceptance remain pending.
- All Closet services, the acceptance server and the headless browser were closed after testing; project service ports were confirmed closed.

## Release APK

- `outputs/android/new-closet-1.5.0.apk` — 10,696,140 bytes.
- SHA-256: `e608f41250c9d9a606c5d9b3141d79bad5c4fc74a61017977b1ce0081523d7a4`.
- Signing certificate SHA-256: `c42d6cb416221b0358cffbdbe6d52024938cd796f3a75f5c85dbb462bbe6af93` (same certificate as previous releases).

中文：所有分类的单品均可在详情中选填自由文字的面料材质，例如“100% 棉”“羊毛混纺”“真皮 / 再生皮革”，可留空或清空后保存。面料只显示在编辑界面，不显示在封面卡片，但参与搜索（网页与 MCP）。日历快照保留当时的数值，备份格式升到 v11，仍可导入 v1–v10 备份。网页端已通过构建、类型检查、静态检查、21 组测试和浏览器验收；Android 端已重新打包并验证签名与内嵌界面，模拟器和真机验收仍待进行。使用该字段后，另一端需升级到 1.5.0 及以上才能同步或导入。
