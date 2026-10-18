# Category order and item deletion

Validated on 2026-10-18. Version: **1.4.0 / Android versionCode 7**.

- Default category order is now 上装 / 下装 / 外套 / 鞋履 / 包袋 / 配饰 / 连体／裙装, in both English and Chinese. Wardrobe tabs, the item category picker, outfit item filters and group content pickers all follow that order; “全部 / All” stays first.
- Item details keep “收起单品 / Archive item” and add “删除单品 / Delete item” with a confirmation dialog. Deleting removes only that item, unlinks it from outfits and groups, and also removes an outfit left with no items and no photos. Calendar entries keep their own snapshots, so past outfits stay readable and remain editable after the linked outfit is deleted.
- The brand suggestion list is derived from the remaining items (archived items included): after deleting the only item of a brand, its option disappears; brands still used by other items stay.
- Deleted records write sync tombstones as before. Because a calendar snapshot can keep references to the deleted item, wardrobes edited this way need Android 1.4.0 or newer before syncing; older APKs reject that replica. Both languages include the new labels and confirmations.

## Verification

- `pnpm build`, `pnpm typecheck`, `pnpm lint` and all 20 `pnpm test` suites passed. New suites: `tests/categories.mjs` (order in both locales) and `tests/item-deletion.mjs` (cascade, preserved snapshots, brands, stale/wrong-kind errors, cross-kind reference rejection); `tests/runtime.mjs` covers the production API, tombstones and calendar re-editing.
- Production browser acceptance ran on an independent port with isolated `.test-runtime/` data through headless Edge. It checked tab order, the delete/cancel/confirm flow, removal of an emptied outfit, the kept calendar snapshot and the brand list after deletion. Screenshots: `outputs/item-deletion-acceptance/`; assertions: `outputs/item-deletion-acceptance/acceptance.json`.
- Android: the Vite bundle and APK were rebuilt, and the packaged WebView assets contain the new delete flow and brand behaviour. The 1.4.0 APK installs over the previous release with the same signing certificate (versionCode 7). Emulator and physical-phone acceptance remain pending.
- All Closet services, the acceptance server and the headless browser were closed after testing; project service ports were confirmed closed.

## Release APK

- `outputs/android/new-closet-1.4.0.apk` — 10,695,760 bytes.
- SHA-256: `f6f65ac4e90e3478737efe1dc8790821932e741a94a4e2c6d54f711647748802`.
- Signing certificate SHA-256: `c42d6cb416221b0358cffbdbe6d52024938cd796f3a75f5c85dbb462bbe6af93` (same certificate as previous releases).

中文：分类默认顺序改为上装、下装、外套、鞋履、包袋、配饰、连体／裙装，中英文界面一致。单品详情在“收起”之外新增“删除”和二次确认；删除会解除该单品与搭配、分组的关系，没有任何单品和照片的空搭配一并删除，日历快照保留且仍可编辑。品牌候选只来自剩余单品（含已收起），唯一品牌的选项删除后消失。网页端已通过构建、类型检查、静态检查、20 组测试和浏览器验收；Android 端已重新打包并验证签名与内嵌界面，模拟器和真机验收仍待进行。删除后的资料需要 Android 1.4.0 及以上版本才能同步。
