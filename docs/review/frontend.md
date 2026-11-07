# Frontend review guidelines

フロントエンド (`packages/frontend/**`、`packages/frontend-embed/**`、`packages/frontend-shared/**`、`packages/i18n/**`、`locales/**`) の変更をレビューする人 (人間・AI) 向け。

[Review guidelines](README.md)

## 命名

- **[Major]** 共有・再利用コンポーネントは `packages/frontend/src/components/` 配下 (サブディレクトリ `global/` / `grid/` も含む) に置き、ファイル名は `Mk` で始まる (`MkButton.vue` / `global/MkAvatar.vue`)。1 ページ専用の UI は `pages/` 配下に置き、`Mk` は付けない。他のコンポーネントから import されうるかどうかで置き場所を決める → [adding-mk-component.md](../../.claude/skills/working-on-frontend/references/tasks/adding-mk-component.md)
- **[Minor]** props と emit の名前は、似た用途の既存 `Mk*` に揃える (真偽値 props は `primary` / `danger` / `small` のような形容詞、閉じる通知は `onClose` prop ではなく `emit('close')`) → [adding-mk-component.md](../../.claude/skills/working-on-frontend/references/tasks/adding-mk-component.md)

## `<script>`

- **[Major]** SFC の `<script>` に `lang="ts"` が付いている。`lang` の無い `<script>` は TypeScript の型検査から外れる → [component-conventions.md](../../.claude/skills/working-on-frontend/references/knowledge/component-conventions.md)
- **[Major]** 新規コンポーネントは Composition API (`<script setup>`) で書かれている。Options API (`export default { data() { ... } }`) は新しく持ち込まない → [frontend.md](../contributing/frontend.md)
- **[Major]** `defineProps<{ ... }>()` / `defineEmits<{ ... }>()` は型引数だけで定義する (既定値は `withDefaults(defineProps<{ ... }>(), { ... })`)。runtime の object 形式 `defineProps({ name: { type: String } })` や配列形式 `defineEmits(['click'])` は使わない → [component-conventions.md](../../.claude/skills/working-on-frontend/references/knowledge/component-conventions.md)

**指摘しないこと:**
- `<script lang="ts" setup>` と `<script setup lang="ts">` の属性順や、`generic="T extends ..."` 属性の位置
- 型宣言や module スコープのユーティリティを置くために、`<script setup>` と別に `<script lang="ts">` ブロックを併用していること (例: `MkInput.vue`)
- 変更していない既存コンポーネントが Options API のままであること

## Vue

- **[Minor]** 新規ファイルの `v-model` 連動は `defineModel` で書く (`props.modelValue` + `emit('update:modelValue')` の手書きは既存コードに残るだけ) → [component-conventions.md](../../.claude/skills/working-on-frontend/references/knowledge/component-conventions.md)
- **[Major]** misskey.js のストリーミングコネクションをリアクティブ化しない。Options API の `data` に置く場合は `markRaw` で包む。リアクティブ化されると misskey.js 内部の処理が壊れ、性能も落ちる → [frontend.md](../contributing/frontend.md)

## ルーティング

- **[Major]** `packages/frontend/src/router.definition.ts` のルートは上から順に評価され最初に一致したものが使われるので、`/foo/bar` のような固定パスは `/foo/:id` のようなパラメータ付きルートより前に定義されている。逆順だと固定パスのページに到達できない → [frontend.md](../contributing/frontend.md)

## i18n

- **[Major]** ユーザーに見せる文言をテンプレートにも JS/TS にも直書きせず、`i18n.ts.<key>` / `i18n.tsx.<key>(...)` を通す。`aria-label` / `title` / `placeholder` の値も同じ。直書きすると翻訳されない → [i18n-usage.md](../../.claude/skills/working-on-frontend/references/knowledge/i18n-usage.md)
- **[Major]** `locales/ja-JP.yml` の値に `{name}` 形式のプレースホルダがあるキーは `i18n.tsx.<key>({ name })` で呼び、引数名をプレースホルダ名と一致させる。`i18n.ts.<key>` で参照すると型エラーにならないまま `{name}` が未展開で画面に出る → [i18n-usage.md](../../.claude/skills/working-on-frontend/references/knowledge/i18n-usage.md)
- **[Critical]** 既存キーのリネームは、新キー追加と参照の移行だけを 1 つの PR で行い、旧キーの削除は Crowdin で新キーの翻訳が揃ってから別 PR で行う。同じ PR で旧キーを消すと全言語の翻訳が失われる → [i18n-usage.md](../../.claude/skills/working-on-frontend/references/knowledge/i18n-usage.md)
- **[Critical]** `locales/ja-JP.yml` の文言が、未引用のせいで意図と違う値として解釈されていない (例: `[お知らせ]` は配列に、`前文 #後文` の `#後文` はコメントになり、文言が黙って変わる)。該当する値はダブルクォートで囲む → [adding-i18n-key.md](../../.claude/skills/working-on-frontend/references/tasks/adding-i18n-key.md)
- **[Critical]** HTML を含む文言を `v-html` で描画する場合、パラメータにユーザー入力をそのまま渡していない (静的な文字列かエスケープ済みの値だけ)。渡すと XSS になる → [i18n-usage.md](../../.claude/skills/working-on-frontend/references/knowledge/i18n-usage.md)
- **[Minor]** `locales/ja-JP.yml` のキーを追加・変更したら、再生成した `packages/i18n/src/autogen/locale.ts` も同じ PR にコミットされている (CI は型検査の前に再生成するので失敗しないが、古いままだと次の PR に差分が混ざる) → [i18n-usage.md](../../.claude/skills/working-on-frontend/references/knowledge/i18n-usage.md)
- **[Major]** プレースホルダは `{paramName}` 形式 (英数字とアンダースコア) の単純置換だけを使う。複数形構文などそれ以外の書式は展開されない → [i18n-usage.md](../../.claude/skills/working-on-frontend/references/knowledge/i18n-usage.md)
- **[Major]** トップレベル先頭の予約キー `_lang_` (その言語自身の表記名。言語切替 UI が参照する) を書き換えたり別用途に使ったりしていない → [i18n-usage.md](../../.claude/skills/working-on-frontend/references/knowledge/i18n-usage.md)
- **[Minor]** 新キーが、既存キーや `x` プレースホルダを持つ汎用キー (例: `deleteAreYouSure`) と明らかに同じ意味・用途で重複していない → [i18n-usage.md](../../.claude/skills/working-on-frontend/references/knowledge/i18n-usage.md)
- **[Minor]** 新キー名は lowerCamelCase、カテゴリは `_settings` のようなアンダースコア接頭辞にする。数字始まりなどブラケット記法 (`i18n.ts['2fa']`) が必要になる名前は新しく作らない → [adding-i18n-key.md](../../.claude/skills/working-on-frontend/references/tasks/adding-i18n-key.md)
- **[Minor]** 文言内の改行はダブルクォート値の `\n` で表し、表示側で `white-space: pre-wrap` などを当てて改行を反映している → [i18n-usage.md](../../.claude/skills/working-on-frontend/references/knowledge/i18n-usage.md)

**指摘しないこと:**
- 既存キーに対するブラケット記法 (`i18n.ts['2fa']`) の使用
- backend の `ApiError` のメッセージが i18n を通っていないこと (backend は i18n を使わず、frontend 側で翻訳する)

## スタイル

- **[Major]** スタイルは `<style lang="scss" module>` で書き、`:class="$style.foo"` で参照する。`module` の無い `<style scoped>` を新しく書かない → [scss-modules.md](../../.claude/skills/working-on-frontend/references/knowledge/scss-modules.md)
- **[Major]** テーマに追従すべき色 (文字・背景・枠線・アクセントなど) は `var(--MI_THEME-*)` (例: `var(--MI_THEME-fg)` / `var(--MI_THEME-panel)`) を使い、`#fff` / `rgb(...)` をハードコードしない。透明度を変えるなら `color-mix(in srgb, var(--MI_THEME-fg) 50%, transparent)` などで合成する。ハードコードするとテーマ (ダークモード等) に追従しない → [scss-modules.md](../../.claude/skills/working-on-frontend/references/knowledge/scss-modules.md)
- **[Minor]** 角丸や余白は、対応する UI 共通変数 (`var(--MI-radius)` / `var(--MI-margin)` 等) があればそれを使う → [scss-modules.md](../../.claude/skills/working-on-frontend/references/knowledge/scss-modules.md)
- **[Major]** コンポーネント自身のルート要素に外側の `margin` を持たせない。外側の余白はそのコンポーネントを使う側が設定する → [frontend.md](../contributing/frontend.md)
- **[Major]** CSS Modules を通さない生の HTML クラス名に `follow` という語を含めない。広告ブロッカーに誤ってブロックされる → [frontend.md](../contributing/frontend.md)
- **[Minor]** ボタンやパネルの見た目を自前で書かず、`packages/frontend/src/style.scss` のグローバルクラス (`_button` / `_buttonPrimary` / `_panel` / `_selectable` / `_gaps_m` 等) を静的な `class="_button"` で付けて使う → [scss-modules.md](../../.claude/skills/working-on-frontend/references/knowledge/scss-modules.md)
- **[Minor]** `:global(...)` は外部ライブラリなど module 外のクラスに当てる必要がある場合だけ、`:deep(...)` で子コンポーネントの内部を狙うのは子を直接直せない場合だけ使う → [scss-modules.md](../../.claude/skills/working-on-frontend/references/knowledge/scss-modules.md)

**指摘しないこと:**
- `transparent` / `currentColor` / `none` などの CSS キーワードの色指定
- 影 (`box-shadow`)・半透明のオーバーレイ・チャートの色定数など、テーマに依存させない固定色
- `font-size: 14px` など、対応する CSS 変数が無い数値の直書き
- CSS Modules のクラス名 (`$style.follow` 等) に `follow` が含まれること (本番ビルドではハッシュ名に置き換わる)
- 変更していない既存ファイルの `<style scoped>`

## `os.*` API

- **[Major]** ブラウザ標準の `alert()` / `confirm()` / `prompt()` (`window.*` を含む) を直接呼ばず、`packages/frontend/src/os.ts` の `os.alert` / `os.confirm` / `os.inputText` / `os.select` / `os.form` / `os.toast` / `os.popupMenu` / `os.contextMenu` などを使う。標準ダイアログはテーマ・キーボード操作・focus trap・i18n に追従しない → [os-api.md](../../.claude/skills/working-on-frontend/references/knowledge/os-api.md)
- **[Major]** 独自のダイアログはコンポーネントを `os.popup(Component, props, events)` で開き、返り値の `dispose()` で閉じる → [os-api.md](../../.claude/skills/working-on-frontend/references/knowledge/os-api.md)
- **[Minor]** `os.apiWithDialog` は失敗時にエラーダイアログを出したうえで Promise を reject する。失敗後に後続処理 (成功前提の表示更新など) を続けていない (try/catch・`.catch`・呼び出し元への伝播のいずれでもよい)。`misskeyApi(...)` を直接使う場合は自前でエラーを表示している → [os-api.md](../../.claude/skills/working-on-frontend/references/knowledge/os-api.md)

## アクセシビリティ

- **[Major]** クリックで操作する要素は `<button>` (見た目を消すなら `class="_button"`) を使う。装飾以外の `<div @click>` を使うなら `role="button"` / `tabindex="0"` / `@keydown.enter` / `@keydown.space.prevent` の 4 つを揃える (`@keydown.enter` の付け忘れが最も多い) → [component-conventions.md](../../.claude/skills/working-on-frontend/references/knowledge/component-conventions.md)
- **[Major]** URL に遷移しない `<a href="#" @click.prevent>` をボタン代わりにしない。リンクなら `<MkA>`、操作なら `<button>` を使う → [component-conventions.md](../../.claude/skills/working-on-frontend/references/knowledge/component-conventions.md)
- **[Major]** `<form>` 内で送信させたくない `<button>` には `type="button"` を明示する (省略すると `type="submit"` になる) → [component-conventions.md](../../.claude/skills/working-on-frontend/references/knowledge/component-conventions.md)
- **[Major]** `<input>` / `<select>` / `<textarea>` は `<label>` と結び付いているか `aria-label` を持つ → [adding-mk-component.md](../../.claude/skills/working-on-frontend/references/tasks/adding-mk-component.md)
- **[Major]** `role="button"` を付けた独自要素を無効化する場合は、`aria-disabled` を付け、ハンドラ側でも無効時に早期 return する。ブラウザは click を止めないので、見た目だけ無効にしていると操作できてしまう → [component-conventions.md](../../.claude/skills/working-on-frontend/references/knowledge/component-conventions.md)
- **[Major]** `outline: none` などでフォーカスリングを消す場合は、`:focus-visible` で代わりの表示を用意している → [component-conventions.md](../../.claude/skills/working-on-frontend/references/knowledge/component-conventions.md)
- **[Minor]** アイコンだけのボタンには i18n 経由の `aria-label` を付ける。`title` はツールチップでありスクリーンリーダー向けラベルの代わりにならない → [component-conventions.md](../../.claude/skills/working-on-frontend/references/knowledge/component-conventions.md)
- **[Minor]** 自作のモーダル / ポップアップは focus trap を備える (`MkModal.vue` を使っていれば対応済み) → [component-conventions.md](../../.claude/skills/working-on-frontend/references/knowledge/component-conventions.md)

**指摘しないこと:**
- ネイティブの `<button>` に `role` / `tabindex` / キーボードハンドラ / 追加の ARIA 属性が無いこと (ブラウザ標準で備わっている)
- ARIA 属性が最小限であること

## Storybook

- **[Major]** Story のファイルは `Mk<Name>.stories.impl.ts` (既定 story の上書き) / `Mk<Name>.stories.meta.ts` (meta の上書き) として書く。`*.stories.ts` は `packages/frontend/.storybook/generate.tsx` の生成物 (gitignore 済み) なので、手で編集したりコミットしたりしない → [storybook.md](../../.claude/skills/working-on-frontend/references/knowledge/storybook.md)
- **[Major]** Storybook に出したい新規コンポーネントは `generate.tsx` の `components` 許可リストに含まれている。`.stories.impl.ts` を置くだけでは生成対象にならない → [frontend.md](../contributing/frontend.md)
- **[Major]** msw で API をモックするファイルはコンポーネントと同じ階層の `<Name>.msw.ts` (例: `MkFoo.vue` に対して `MkFoo.msw.ts`)。`generate.tsx` はこの名前だけを読むので、`<Name>.stories.msw.ts` では読み込まれない → [frontend.md](../contributing/frontend.md)
- **[Minor]** 各 story オブジェクトは `satisfies StoryObj<typeof <対象コンポーネント>>` で終わる。無いと `args` の型補完が効かない → [storybook.md](../../.claude/skills/working-on-frontend/references/knowledge/storybook.md)

## アイコン

- **[Major]** アイコンのクラスを動的に切り替える場合も、`ti-xxx` の完全なクラス名をソースに書く。`ti-${name}` のように名前だけを組み立てると、本番ビルドで未使用と判定されたアイコンが削除されて表示されない → [frontend.md](../contributing/frontend.md)
- **[Minor]** アイコンは Tabler icons のクラス (`<i class="ti ti-info-circle"></i>`) を使い、インライン SVG や別のアイコンセットを持ち込まない → [component-conventions.md](../../.claude/skills/working-on-frontend/references/knowledge/component-conventions.md)

**指摘しないこと:**
- アイコン用途ではないインライン SVG (ロゴ・図形・グラフなど)

## テスト

- **[Major]** Vitest のユニットテストは `packages/frontend/test/unit/` 配下に `*.test.ts` として置く (`vitest.config.unit.ts` の対象)。`src/` 内の `*.spec.ts` や `__tests__/` は実行されない → [frontend-testing.md](../../.claude/skills/working-on-frontend/references/knowledge/frontend-testing.md)
- **[Minor]** Playwright の E2E (`packages/frontend/test/e2e/*.spec.ts`) はログイン・投稿・ドライブなど主要な UI フローに限り、細かい単位の確認は Vitest か Storybook で行う → [frontend-testing.md](../../.claude/skills/working-on-frontend/references/knowledge/frontend-testing.md)

**指摘しないこと:**
- 共有コンポーネント (`Mk*.vue`) にユニットテストが無いこと (Storybook と Playwright でカバーしている)
