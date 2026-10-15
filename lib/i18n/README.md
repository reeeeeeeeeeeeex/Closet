# Translation guide / 翻译说明

## English

New Closet includes English (`en`, the default) and Simplified Chinese (`zh-CN`). Choose **Language** in the profile menu on the web or Android. The web stores your choice in the `closet_locale` cookie; Android also uses local storage so it survives an app restart. HTML language, page title, description, dates, numbers, and plural forms follow your choice. Switching languages preserves drafts.

- `messages/en.json`: English translations.
- `messages/zh-CN.json`: source catalog and Simplified Chinese translations.
- `messages/locale.template.json`: blank template for a new language; never enabled as a locale.

Source sentences are stable gettext-style keys. Keep keys unchanged and write natural translations in the values. User-written names, brands, notes, and custom colors are not translated. Built-in color labels are translated without changing stored values, and searches accept displayed color names.

Use `t("source sentence")` from `useI18n()` in components, or `tr` in client event handlers. Translate complete sentences rather than fragments. Keep parameter names such as `{count}` and `{value1}` intact; their order may change. Pass a numeric `count` for plural selection:

```json
{
  "{count} 条记录": {
    "one": "{count} record",
    "other": "{count} records"
  }
}
```

`Intl` handles dates, numbers, and CLDR plural categories. Missing or blank translations fall back to the Chinese source catalog, then to the source key. Matching is case-insensitive; English region tags such as `en-GB` resolve to `en`. An unset or unsupported locale resolves to English. ISO dates, category identifiers, measurements, and shoe sizes keep their storage formats.

Server and native validation messages are translated at the display boundary. Explicit patterns cover errors with a status code or parameter name; arbitrary user content is not rewritten. Native file, camera, date, and color pickers belong to the browser or operating system and may follow the system language.

To add a language, copy the template, fill every translation, import it in `core.ts`, and register it in `catalogs` and `SUPPORTED_LOCALES`. Run `pnpm i18n:extract` after adding messages. It scans app, component, library, mobile, and Android native error strings, updates the source and template catalogs, and leaves other languages untouched. Complete new translations before shipping, and build before running tests.

## 简体中文

New Closet 提供自然英文（`en`，默认）与简体中文（`zh-CN`）。网页和 Android 均可在账号菜单的“语言”中切换。网页通过 `closet_locale` Cookie 保存选择，Android 另用本地存储保证重启后保留。HTML 语言、页面标题、介绍、日期、数字和复数形式跟随选择，切换时保留草稿。

- `messages/en.json`：英文译文。
- `messages/zh-CN.json`：来源语言包与简体中文译文。
- `messages/locale.template.json`：新增语言的空白模板，不作为语言启用。

来源句子是稳定的 gettext 风格键，不修改键，译文按目标语言自然改写。用户填写的名称、品牌、备注和自定义颜色不翻译。内置颜色仅翻译显示名，不改变存储值，搜索支持当前显示语言的颜色名。

组件使用 `useI18n()` 的 `t`，客户端事件使用 `tr`。动态文案使用完整句子与命名插值，保留 `{count}`、`{value1}` 等参数名，位置可调整。需要复数时传入数字 `count`，格式见上方例子。

日期、数字和 CLDR 复数由 `Intl` 处理。空白或缺失译文依次回退到中文来源包、来源键。语言匹配忽略大小写，`en-GB` 等英文地区标签使用 `en`；未设置或不支持的语言默认英文。ISO 日期、分类标识、尺寸和鞋码的存储格式不变。

服务端与 Android 原生校验信息在显示时翻译，明确的匹配规则处理含状态码或参数名的错误，不替换任意用户资料。文件、相机、日期和颜色选择器由浏览器或系统提供，可能使用系统语言。

新增语言时复制模板并补齐译文，在 `core.ts` 导入，加入 `catalogs` 与 `SUPPORTED_LOCALES`。新增文案后运行 `pnpm i18n:extract`，扫描网页、组件、库、手机端与 Android 原生错误信息，更新来源包和空白模板，保留其他语言包不变。发布前补齐新译文，测试前先构建。
