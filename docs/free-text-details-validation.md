# Purchase prices and free-text sizes

Validated on 2026-10-18. Version: **1.3.0 / Android versionCode 6**. Release: [v1.3.0](https://github.com/reeeeeeeeeeeeex/Closet/releases/tag/v1.3.0).

- Web and Android item details have an optional purchase price, entered as text. Prices are absent from wardrobe cards and item selection cards.
- EU/CN shoe sizes, garment measurements, and personal body measurements accept text, including ranges, units, and notes. Blank fields can be cleared. Existing numeric values retain their type and value.
- Both languages include the new labels and guidance. Displayed text retains user-entered units without appending duplicate units.
- ZIP format v10 preserves prices and text measurements; versions 1–9 remain importable. Snapshots and sync preserve these fields. Both devices need the updated app to use the new fields when syncing.

## Verification

- `pnpm build`, `pnpm lint`, `pnpm typecheck`, and all 18 `pnpm test` suites passed. The first test run passed its assertions but could not clean up child processes inside the sandbox; the final run completed with exit code 0 and verified closed service ports.
- Production browser, independent port 4337 and `.test-runtime/free-text-browser/` data: created and reopened an item with `约200元 / gift` and `约68–72 cm`; created shoes with `38/39` and `约240 mm`; saved personal measurements. Wardrobe cards did not show prices.
- Android API 35: five instrumentation tests passed, covering actual keyboard entry of `38/39`, price/measurement saving, restart and export preservation, field clearing, language persistence, navigation drafts, editor scrolling, and two keyboard show/hide cycles.
- Screenshots: `outputs/free-text-validation/`. Test logs: `.test-runtime/free-text-*.log`.
- All Closet services, the browser test tab, and the dedicated emulator were closed. Physical-phone acceptance remains pending.

## Release APK

- `outputs/android/new-closet-1.3.0.apk` — 10,694,988 bytes.
- SHA-256: `1d26b16b374e5641e28b93e967b8f87cd0921494818c57816638576b2940c48d`.
- Signing certificate SHA-256: `c42d6cb416221b0358cffbdbe6d52024938cd796f3a75f5c85dbb462bbe6af93` (same certificate as previous releases).

中文：两端已加入可留空的购买价格，鞋码、衣物尺寸和身体尺寸均可自由填写文字。价格不显示在主页面卡片上，旧数字记录保留；保存、清空、备份、同步和中英界面均已验证。APK 已在模拟器验收，尚未在用户的物理手机上验证，随 v1.3.0 GitHub Release 提供。
