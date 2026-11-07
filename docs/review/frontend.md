# Frontend review guidelines

フロントエンド (`packages/frontend/**`、`locales/**`) の変更をレビューする人 (人間・AI) 向け。

[Review guidelines](README.md)

## 命名

- [Major] 共有 / 再利用コンポーネント (`packages/frontend/src/components/` 配下、サブディレクトリ含む) は `Mk` プレフィックス必須 (例: `MkButton.vue`, `global/MkAvatar.vue`, `grid/MkGrid.vue`)。
- [Major] ページ固有のものは `pages/` 配下に置き、`Mk` プレフィックスは不要。
- [Critical] **`Mk` プレフィックス必須** — 共有コンポーネントは `MkButton.vue` / `global/MkAvatar.vue` のように `Mk` で始める。ページ固有 UI は `Mk` を付けず `pages/` 側に置く (出典: [adding-mk-component.md](../../.claude/skills/working-on-frontend/references/tasks/adding-mk-component.md#L8))
- | 配置先 | 用途 | 命名 |
  |---|---|---|
  | `packages/frontend/src/components/Mk<Name>.vue` | 通常の共有 UI コンポーネント | `Mk<Name>.vue` |
  | `packages/frontend/src/components/global/Mk<Name>.vue` | `components/index.ts` で Vue グローバルコンポーネント登録 (`app.component`) され、import 無しで全テンプレートから使える基本部品 (`MkA` / `MkAvatar` / `MkAcct` 等) | `Mk<Name>.vue` (サブディレクトリ内でも `Mk` prefix 必須) |
  | `packages/frontend/src/components/grid/Mk<Name>.vue` | テーブル/グリッド系の部品セット | 同上 |
  | `packages/frontend/src/pages/<Name>.vue` | 単一ページ専用の UI (再利用しない) | `Mk` prefix **不要** |
  (出典: [adding-mk-component.md](../../.claude/skills/working-on-frontend/references/tasks/adding-mk-component.md#L15-L20))
- 迷ったら「他の `Mk*.vue` から import される可能性があるか?」で判定する。Yes なら `components/`、No なら `pages/`。 (出典: [adding-mk-component.md](../../.claude/skills/working-on-frontend/references/tasks/adding-mk-component.md#L22))
- 似た用途の既存 `Mk*` を 1-2 個読んで、props 命名 (`primary` / `danger` / `small` 等の形容詞、`onClose` ではなく `emit('close')` 等) を揃える (出典: [adding-mk-component.md](../../.claude/skills/working-on-frontend/references/tasks/adding-mk-component.md#L179))

## script

- [Major] `<script lang="ts" setup>` または `<script setup lang="ts">` のどちらでもよい (既存コードは多数派が前者だが、後者も `MkThemePreview.vue` 等で使われている)。属性順は指摘しない。`lang="ts"` が **無い** ものは指摘する。
- [Major] 型ジェネリックが必要なら `generic="T extends ..."` 属性を加える (順序問わず)。
- [Major] `defineProps<{ ... }>()` / `defineEmits<{ ... }>()` は **type-only** 形式。runtime の object 形式 (`defineProps({ ... })`) は使わない。
- [Major] Options API (`export default { data() { ... } }`) は禁止。
- | 項目 | 規約 | 新規不可 |
  |---|---|---|
  | `<script>` 開始タグ | `<script lang="ts" setup>` または `<script setup lang="ts">` (順序不問) | `<script>` (lang 無し) / Options API (`export default { data() {...} }`) |
  | Props 定義 | `defineProps<{ ... }>()` (type-only) | runtime object 形式 `defineProps({ name: { type: String } })` |
  | Emits 定義 | `defineEmits<{ (ev: 'click'): void }>()` (type-only) | runtime array 形式 `defineEmits(['click'])` |
  | 型ジェネリック | `<script setup lang="ts" generic="T extends ...">` 属性で渡す。複雑な型宣言が必要なら **2 ブロック構成** ([generic パターン](../../.claude/skills/working-on-frontend/references/knowledge/component-conventions.md#generic--2-ブロック-script)) | — |
  | `<style>` 開始タグ | `<style lang="scss" module>`、参照は `:class="$style.foo"` | `<style scoped>` (module なし) は新規不可 (legacy 混在) |
  | CSS 値 | `var(--MI_THEME-...)` (テーマ) / `var(--MI-...)` (UI 共通定数) を使う | `#fff` / `rgb(...)` / `rgba(...)` のハードコード ([scss-modules.md](../../.claude/skills/working-on-frontend/references/knowledge/scss-modules.md)) |
  | グローバル class | `_button` / `_panel` / `_selectable` / `_buttonPrimary` 等の global utility class を活用 | — |
  | アイコン | Tabler icons クラス `<i class="ti ti-info-circle">` | インライン SVG / 別アイコンセット |
  (出典: [component-conventions.md](../../.claude/skills/working-on-frontend/references/knowledge/component-conventions.md#L46-L55))
- デフォルト値が必要なら `withDefaults(defineProps<{...}>(), { ... })` を使う (type-only のまま既定値を渡せる) (出典: [component-conventions.md](../../.claude/skills/working-on-frontend/references/knowledge/component-conventions.md#L110))
- | 項目 | 規約 | 新規不可 |
  |---|---|---|
  | `<script>` 開始タグ | `<script lang="ts" setup>` または `<script setup lang="ts">` | `<script>` (lang 無し) / Options API |
  | Props 定義 | `defineProps<{ ... }>()` (type-only) | runtime object 形式 |
  | Emits 定義 | `defineEmits<{ (ev: 'click'): void }>()` (type-only) | runtime array 形式 |
  | `<style>` 開始タグ | `<style lang="scss" module>`、参照は `:class="$style.foo"` | `<style scoped>` (module なし) |
  | CSS 値 | `var(--MI_THEME-...)` / `var(--MI-...)` | `#fff` / `rgb(...)` のハードコード |
  | グローバル class | `_button` / `_panel` / `_selectable` 等を活用 | — |
  | アイコン | Tabler icons クラス `<i class="ti ti-info-circle">` | インライン SVG / 別アイコンセット |
  (出典: [adding-mk-component.md](../../.claude/skills/working-on-frontend/references/tasks/adding-mk-component.md#L122-L130))

## vue

- Composition API + `<script setup lang="ts">` を基本とする (Options API は新規導入しない)。型宣言や module スコープのユーティリティを置きたい時は、setup ブロックと **併用** する形で追加の `<script lang="ts">` ブロックを置いて構わない (例: [MkInput.vue](../../packages/frontend/src/components/MkInput.vue) は `SupportedTypes` 型を別ブロックで宣言してから setup を書いている)。SCSS は **CSS Modules** で書き、`<style lang="scss" module>` を使う。 (出典: [component-conventions.md](../../.claude/skills/working-on-frontend/references/knowledge/component-conventions.md#L18))
- 新規ファイルの v-model 連動は原則として `defineModel` を使う (`props.modelValue` + `emit` の手書きは既存コードに残るのみ) (出典: [component-conventions.md](../../.claude/skills/working-on-frontend/references/knowledge/component-conventions.md#L202))
- `emit('ok')` 等の単純 emit は中継するだけにし、`os.confirm` などの実際の確認 UI 起動は呼び出し元の責務にする (テスト・差し替えしやすくするため) (出典: [component-conventions.md](../../.claude/skills/working-on-frontend/references/knowledge/component-conventions.md#L242))
- Use TypeScript. (出典: [frontend.md](../contributing/frontend.md#L9))
- **When creating a new component, please use the Composition API (with [setup sugar](https://v3.vuejs.org/api/sfc-script-setup.html) and [ref sugar](https://github.com/vuejs/rfcs/discussions/369)) instead of the Options API.** (出典: [frontend.md](../contributing/frontend.md#L10))
- コネクションには`markRaw`せよ
  **Vueのコンポーネントのdataオプションとして**misskey.jsのコネクションを設定するとき、必ず`markRaw`でラップしてください。インスタンスが不必要にリアクティブ化されることで、misskey.js内の処理で不具合が発生するとともに、パフォーマンス上の問題にも繋がる。なお、Composition APIを使う場合はこの限りではない(リアクティブ化はマニュアルなため)。
  (出典: [frontend.md](../contributing/frontend.md#L137-L138))

## i18n

- [Critical] 文字列リテラルの直書き禁止 (テンプレート / JS 両方)。
- [Critical] 引数なし: `i18n.ts.<path>` (例: `i18n.ts.deleted`)。
- [Critical] 引数あり: `i18n.tsx.<path>(...)` (関数呼び出し、例: `i18n.tsx.takeOverConfirm({ name })`)。
- 文言は **必ず** [i18n.ts](../../packages/frontend/src/i18n.ts) 経由で参照する。引数の有無で **使う変数名そのものが変わる**。間違えると、非パラメータキーを `i18n.tsx` で呼ぶ場合は型エラーになるが、パラメータキーを `i18n.ts` で参照する場合は型エラーにならず `{name}` 等が未展開のまま画面に出る (後述のトラブルシュート参照)。 (出典: [i18n-usage.md](../../.claude/skills/working-on-frontend/references/knowledge/i18n-usage.md#L15))
-   YAML 側に `{name}` 形式のプレースホルダが含まれているキーは **`i18n.tsx`** からしか呼べない。誤って `i18n.ts.unfollowConfirm` と書くと値がフォーマット前の関数になってそのまま表示される。 (出典: [i18n-usage.md](../../.claude/skills/working-on-frontend/references/knowledge/i18n-usage.md#L29))
- **既存キーの再利用が第一**。新キー追加が必要に見えても、まず `locales/ja-JP.yml` を grep して `deleteAreYouSure({ x })` のような汎用キー (`x` プレースホルダ) が転用可能でないか確認する。新キー追加は [tasks/adding-i18n-key.md](../../.claude/skills/working-on-frontend/references/tasks/adding-i18n-key.md)。他言語ファイルは Crowdin の自動配信先なので絶対に手で触らない (出典: [i18n-usage.md](../../.claude/skills/working-on-frontend/references/knowledge/i18n-usage.md#L31))
- HTML を含むキー値は **必ずダブルクォート** で囲む (YAML パース失敗回避) (出典: [i18n-usage.md](../../.claude/skills/working-on-frontend/references/knowledge/i18n-usage.md#L80))
- `v-html` 越しの XSS リスクが無いことを必ず確認する。パラメータ側にユーザー入力をそのまま渡すと事故る。安全な静的文字列か、別途エスケープ済の値だけにする (出典: [i18n-usage.md](../../.claude/skills/working-on-frontend/references/knowledge/i18n-usage.md#L81))
- 識別子として無効なキー名 (ブラケット記法)

  キー名が数字始まりや予約語の場合、ドット記法ではアクセスできずブラケット記法を使う。

  出典: [packages/frontend/src/components/MkSignin.totp.vue](../../packages/frontend/src/components/MkSignin.totp.vue)

  ```vue
  <div :class="$style.totpDescription">{{ i18n.ts['2fa'] }}</div>
  ```

  新規キー追加時は **lowerCamelCase を守れば不要**。
  (出典: [i18n-usage.md](../../.claude/skills/working-on-frontend/references/knowledge/i18n-usage.md#L117-L127))
- 既存キーをリネームしたい時 (3 段階)

  単純な「旧キー削除 → 新キー追加」を 1 PR で行うと、すべての言語の旧キー翻訳が失われる。以下のように分割する。
  (出典: [i18n-usage.md](../../.claude/skills/working-on-frontend/references/knowledge/i18n-usage.md#L175-L177))
- ja-JP.yml だけで旧キー削除 + 新キー追加してしまった場合は、PR を分割するか、上記 3 段階に組み直す。**マージ前なら間に合う** (出典: [i18n-usage.md](../../.claude/skills/working-on-frontend/references/knowledge/i18n-usage.md#L217))
- 型エラー: `Property '<key>' does not exist on type 'Locale'`

  **症状**:
  ```
  packages/frontend/src/components/MkXxx.vue
  > i18n.ts.newKey
    Property 'newKey' does not exist on type 'Locale'.
  ```

  **原因**: ja-JP.yml にキーは追加したが、`packages/i18n` の型生成 (`autogen/locale.ts`) が再生成されていない。
  (出典: [i18n-usage.md](../../.claude/skills/working-on-frontend/references/knowledge/i18n-usage.md#L234-L243))
- | yml の値 | ts | tsx |
  |---|---|---|
  | `"保存"` | `i18n.ts.save` ✅ | (キー存在せず) ❌ |
  | `"{name}のフォローを解除しますか？"` | `i18n.ts.unfollowConfirm` → `{name}` 未置換の文字列のまま ❌ | `i18n.tsx.unfollowConfirm({ name })` ✅ |
  (出典: [i18n-usage.md](../../.claude/skills/working-on-frontend/references/knowledge/i18n-usage.md#L271-L274))
- 実行時警告: `Unexpected locale key: <key>`

  **症状**: 開発モードのコンソールに出る。

  **原因**: dev mode の Proxy が ja-JP.yml に存在しないキーへのアクセスを検知 ([packages/frontend-shared/js/i18n.ts](../../packages/frontend-shared/js/i18n.ts) の dev 用 Proxy)。

  **対処**: ja-JP.yml に該当キーを追加するか、参照側のタイポを直す。
  (出典: [i18n-usage.md](../../.claude/skills/working-on-frontend/references/knowledge/i18n-usage.md#L276-L282))
- **対処**: yml と呼び出し側でパラメータ名を一致させる。yml 側のキー名を変更したら、呼び出し側 (frontend 全体) を grep で揃える。 (出典: [i18n-usage.md](../../.claude/skills/working-on-frontend/references/knowledge/i18n-usage.md#L295))
- **原因**: 値に YAML の特殊文字 (`<` `>` `:` `'` `&` `*` `|` `>` `#`) を含むのに **クォートしていない**。 (出典: [i18n-usage.md](../../.claude/skills/working-on-frontend/references/knowledge/i18n-usage.md#L301))
- キー名衝突: `_lang_` を上書きしてしまう

  **症状**: 各言語ファイルの先頭にある `_lang_` (例: ja-JP は `"日本語"`) を別用途で使おうとして上書き。

  **原因**: `_lang_` は **言語自身の表記** に予約されている ([packages/i18n/src/autogen/locale.ts](../../packages/i18n/src/autogen/locale.ts) の先頭キー)。

  **対処**: 新規キーは別名にする。
  (出典: [i18n-usage.md](../../.claude/skills/working-on-frontend/references/knowledge/i18n-usage.md#L318-L324))
- [packages/i18n/scripts/generateLocaleInterface.ts](../../packages/i18n/scripts/generateLocaleInterface.ts) の正規表現は `/\{(\w+)\}/g`。つまり受け付けるのは **`{paramName}` 形式の単純置換のみ**。 (出典: [i18n-usage.md](../../.claude/skills/working-on-frontend/references/knowledge/i18n-usage.md#L341))
- 予約キー `_lang_`

  各 yml ファイルの **トップレベル先頭** に置かれ、その言語自身の表記名を持つ。

  ```yaml
  # locales/ja-JP.yml (トップレベル先頭)
  _lang_: "日本語"
  ```

  UI の言語切替プルダウンなどで参照される。**新規キーには使わない**。
  (出典: [i18n-usage.md](../../.claude/skills/working-on-frontend/references/knowledge/i18n-usage.md#L371-L380))
- i18n は frontend (および一部の SSR されるエラーページ) でのみ使われる。`packages/backend` 配下から `import { i18n }` するパターンは原則無く、API エラー文言は別ルート (`ApiError` の i18n 化されていないメッセージ + frontend 側で翻訳) で扱う。 (出典: [i18n-usage.md](../../.claude/skills/working-on-frontend/references/knowledge/i18n-usage.md#L394))
- 改行の扱い

  ダブルクォート値の中で `\n` は実際の改行になる。block scalar (`|`) でも可だが、HTML タグやプレースホルダ混在では扱いづらい。慣習はダブルクォート + `\n`。

  Vue 側で表示時に `white-space: pre-wrap` などを当てる必要あり。
  (出典: [i18n-usage.md](../../.claude/skills/working-on-frontend/references/knowledge/i18n-usage.md#L396-L400))
- 文字列リテラルを SFC に直書きしない (`<span>こんにちは</span>` 等)。必ず `i18n.ts.<key>` を経由する (出典: [adding-i18n-key.md](../../.claude/skills/working-on-frontend/references/tasks/adding-i18n-key.md#L8))
- 既存キーの破壊的リネームは Crowdin 翻訳資産を失わせる。**追加 → 移行 → 旧キー削除** の 3 段階に分割する。詳細手順と誤編集の復旧は [knowledge/i18n-usage.md §Crowdin 安全策](../../.claude/skills/working-on-frontend/references/knowledge/i18n-usage.md) (出典: [adding-i18n-key.md](../../.claude/skills/working-on-frontend/references/tasks/adding-i18n-key.md#L9))
- 単純キー: lowerCamelCase (例: `saveChanges`, `confirmDelete`) (出典: [adding-i18n-key.md](../../.claude/skills/working-on-frontend/references/tasks/adding-i18n-key.md#L31))
- カテゴリ: アンダースコア接頭辞 (例: `_settings`, `_abuseUserReport`) (出典: [adding-i18n-key.md](../../.claude/skills/working-on-frontend/references/tasks/adding-i18n-key.md#L32))
- 既存セクション内に追加する場合は **周辺の既存配置・意味グループに合わせる** (例えば `_settings` は機能ブロック順に並んでおりアルファベット順ではない)。新セクション全体を末尾に追加するのは可 (出典: [adding-i18n-key.md](../../.claude/skills/working-on-frontend/references/tasks/adding-i18n-key.md#L33))
- **HTML タグ (`<b>` `<br>` `<strong>` 等) や `:` `'` `&` を含む値は必ずダブルクォートで囲む** (未クォートだと YAML パース失敗) (出典: [adding-i18n-key.md](../../.claude/skills/working-on-frontend/references/tasks/adding-i18n-key.md#L34))
- [Critical] **文字列リテラルの直書き禁止** — テンプレート / JS どちらでも、ユーザーに見せる文言は必ず `i18n.ts.<key>` か `i18n.tsx.<key>(...)` 経由 → [knowledge/i18n-usage.md](../../.claude/skills/working-on-frontend/references/knowledge/i18n-usage.md) (出典: [adding-mk-component.md](../../.claude/skills/working-on-frontend/references/tasks/adding-mk-component.md#L10))
- 引数なし → `i18n.ts.<key>` / 引数あり → `i18n.tsx.<key>(...)`。詳細は → [knowledge/i18n-usage.md](../../.claude/skills/working-on-frontend/references/knowledge/i18n-usage.md)。 (出典: [adding-mk-component.md](../../.claude/skills/working-on-frontend/references/tasks/adding-mk-component.md#L136))

## スタイル

- [Major] `<style lang="scss" module>` を既定とし、`:class="$style.foo"` で参照する。
- [Major] 新規で `<style scoped>` (module なし) は使わない (legacy)。
- [Major] **CSS 変数の使用必須** (色・余白・角丸など):
    - テーマ色: `var(--MI_THEME-*)` (例: `var(--MI_THEME-panel)`)
    - UI 共通: `var(--MI-*)` (例: `var(--MI-radius)`)
    - 直接の `#fff` / `rgb(...)` / `rgba(...)` ハードコードは禁止
- `_panel` / `_button` / `_buttonPrimary` は global utility class なので、自前で同じスタイルを書かない (出典: [component-conventions.md](../../.claude/skills/working-on-frontend/references/knowledge/component-conventions.md#L241))
- [Major] Misskey のテーマシステムは 2 系統の CSS 変数で構成される。新規のスタイルは **必ず変数経由** にする。直接の `#fff` / `rgb()` / `rgba()` ハードコードは vue-component-reviewer から Major 指摘される。 (出典: [scss-modules.md](../../.claude/skills/working-on-frontend/references/knowledge/scss-modules.md#L7))
- `var(--MI-radius)` を使うとアプリ全体で角丸の大きさが揃う。`border-radius: 12px;` のように直書きすると、後から角丸を変える要件が来たときに全件直すことになる。 (出典: [scss-modules.md](../../.claude/skills/working-on-frontend/references/knowledge/scss-modules.md#L45))
- 色は基本ハードコード禁止だが、以下のケースは正当化される:

  - `transparent` / `currentColor` / `none` などの CSS キーワード
  - alpha だけ動的に変えたい → `color-mix(in srgb, var(--MI_THEME-fg) 50%, transparent)` のように合成する
  - アイコンサイズ等、CSS 変数化されていない数値定数 (`font-size: 14px;` 等は OK)
  (出典: [scss-modules.md](../../.claude/skills/working-on-frontend/references/knowledge/scss-modules.md#L49-L53))
- `packages/frontend/src/style.scss` に定義されたグローバル class。`<style module>` 内のクラスと **併用** する (`:class="[$style.root, '_button']"` ではなく、HTML の `class="_button"` 属性で直接書く)。 (出典: [scss-modules.md](../../.claude/skills/working-on-frontend/references/knowledge/scss-modules.md#L57))
- `<style lang="scss" module>` 内に書いたクラス名はビルド時にハッシュ化されて他コンポーネントから参照できなくなる。これを意図的に外したい (子コンポーネント側の特定クラスや外部ライブラリのクラスにスタイルを当てたい) 場合のみ `:global(...)` を使う: (出典: [scss-modules.md](../../.claude/skills/working-on-frontend/references/knowledge/scss-modules.md#L102))
- `:deep(...)` で子コンポーネント内部を狙う

  ```scss
  .root :deep(.child-internal-class) {
  	color: var(--MI_THEME-accent);
  }
  ```

  これも頻用しない (子コンポーネントを直接修正する方が望ましい)。
  (出典: [scss-modules.md](../../.claude/skills/working-on-frontend/references/knowledge/scss-modules.md#L114-L122))
- module class は **camelCase** が慣習 (`root` / `inputCore` / `headerText`) (出典: [scss-modules.md](../../.claude/skills/working-on-frontend/references/knowledge/scss-modules.md#L126))
- BEM 風の `block__element--modifier` は使わない (CSS Modules でハッシュ化されるので名前衝突を心配する必要が無い) (出典: [scss-modules.md](../../.claude/skills/working-on-frontend/references/knowledge/scss-modules.md#L127))
- 状態 modifier は `&.active` / `&.disabled` のようにネストする (出典: [scss-modules.md](../../.claude/skills/working-on-frontend/references/knowledge/scss-modules.md#L128))
- `#fff` / `#000` / `rgba(0, 0, 0, 0.5)` のハードコード → `var(--MI_THEME-fg)` / `var(--MI_THEME-bg)` / `color-mix(...)` 等に置き換える (出典: [scss-modules.md](../../.claude/skills/working-on-frontend/references/knowledge/scss-modules.md#L132))
- `<style scoped>` で書いている (module ではない) → `<style lang="scss" module>` に直し、`:class="$style.foo"` で参照する (出典: [scss-modules.md](../../.claude/skills/working-on-frontend/references/knowledge/scss-modules.md#L133))
- 自前で `border-radius: 8px; padding: 14px;` を書いている → `_panel` global class 使えば不要 (出典: [scss-modules.md](../../.claude/skills/working-on-frontend/references/knowledge/scss-modules.md#L134))
- 自前で button styling を書いている → `_button` global class を base に乗せる (出典: [scss-modules.md](../../.claude/skills/working-on-frontend/references/knowledge/scss-modules.md#L135))
- グローバル utility class (`_button` / `_panel` / `_selectable` / `_gaps_m`) を使えば独自スタイルを書かずに済む → [knowledge/scss-modules.md](../../.claude/skills/working-on-frontend/references/knowledge/scss-modules.md) (出典: [adding-mk-component.md](../../.claude/skills/working-on-frontend/references/tasks/adding-mk-component.md#L180))
- コンポーネントのスタイル定義でmarginを持たせない
  コンポーネント自身がmarginを設定するのは問題の元となることはよく知られている
  marginはそのコンポーネントを使う側が設定する
  (出典: [frontend.md](../contributing/frontend.md#L140-L142))
- HTMLのクラス名で follow という単語は使わない
  広告ブロッカーで誤ってブロックされる
  (出典: [frontend.md](../contributing/frontend.md#L144-L145))

## os-api

- [Critical] 直接の `alert()` / `confirm()` / `window.prompt()` / `window.alert()` は禁止。
- [Critical] `os.alert` / `os.confirm` / `os.popup` / `os.toast` / `os.popupMenu` / `os.contextMenu` / `os.form` / `os.apiWithDialog` を使う ([os.ts](../../packages/frontend/src/os.ts) 参照)。
- [`packages/frontend/src/os.ts`](../../packages/frontend/src/os.ts) で公開されている UI 操作 API の一覧。**ブラウザ標準の `window.alert()` / `window.confirm()` / `window.prompt()` を直接呼ばない**。これらは Misskey のテーマ / アクセシビリティ / モーダルレイヤと整合しないため。 (出典: [os-api.md](../../.claude/skills/working-on-frontend/references/knowledge/os-api.md#L3))
- カスタムダイアログを開く場合は、コンポーネント (props / emits) を `os.popup` で起動する。`dispose()` で閉じる。 (出典: [os-api.md](../../.claude/skills/working-on-frontend/references/knowledge/os-api.md#L69))
- 通常の `misskeyApi(...)` だと自前でエラーダイアログ表示が必要だが、`apiWithDialog` は失敗時に自動で `os.alert({ type: 'error', ... })` を表示してくれる。ただし返す promise は元の `misskeyApi(...)` と同一で **reject される** ([os.ts](../../packages/frontend/src/os.ts) で `return promise`)。`await` する場合は依然 try/catch が要る (ダイアログ表示後に後続処理を止めたいだけなら catch して握りつぶす)。 (出典: [os-api.md](../../.claude/skills/working-on-frontend/references/knowledge/os-api.md#L81))
- なぜブラウザ標準 UI を使わないか

  - `window.alert()` は Misskey のテーマ (ダークモード / カスタムテーマ) に追従しない
  - `window.confirm()` はキーボード操作・focus trap・i18n のいずれも Misskey の規約と整合しない
  - `window.prompt()` の入力 UI も同じ
  - ブラウザ依存の表示揺れ (Firefox / Safari / Chrome で見た目が違う)
  - vue-component-reviewer から指摘される

  代わりに `os.alert` / `os.confirm` / `os.form` / `os.popup` を使う。
  (出典: [os-api.md](../../.claude/skills/working-on-frontend/references/knowledge/os-api.md#L83-L91))
- [Critical] **ブラウザ標準 UI を直接呼ばない** — `alert()` / `confirm()` / `window.prompt()` は禁止、必ず `os.alert` / `os.confirm` / `os.popup` 経由 → [knowledge/os-api.md](../../.claude/skills/working-on-frontend/references/knowledge/os-api.md) (出典: [adding-mk-component.md](../../.claude/skills/working-on-frontend/references/tasks/adding-mk-component.md#L11))
- `os.alert` / `os.confirm` / `os.popup` 等 UI ヘルパー (ブラウザ標準 `alert()` 直呼びは禁止) → [references/knowledge/os-api.md](../../.claude/skills/working-on-frontend/references/knowledge/os-api.md) (出典: [SKILL.md](../../.claude/skills/working-on-frontend/SKILL.md#L28))

## a11y

- [Major] クリック可能要素は `<button>` か、`role="button"` + `tabindex="0"` + キーボードハンドラ (`@keydown.enter` 等) を実装する。
- [Major] 装飾以外の `<div @click>` で a11y 配慮がないものは指摘する。
- [Major] フォーム要素には対応する `<label>` または `aria-label` を付ける。
- [Major] `:disabled` バインドや `aria-disabled` の整合性を確認する。
- `<button>` はデフォルトで `tabindex` / Enter / Space / `aria-disabled` の挙動とブラウザ標準のフォーカスリングを持つので、追加の ARIA を書かなくてよい (出典: [component-conventions.md](../../.claude/skills/working-on-frontend/references/knowledge/component-conventions.md#L259))
- form の中で意図せず submit させたくない場合は `type="button"` を明示する (省略時は `type="submit"` 扱い) (出典: [component-conventions.md](../../.claude/skills/working-on-frontend/references/knowledge/component-conventions.md#L260))
- 装飾やレイアウト都合で `<button>` が使えないときは、**4 点セット** を必ず揃える。

  ```vue
  <div
  	role="button"
  	tabindex="0"
  	:aria-disabled="disabled"
  	:class="$style.fakeButton"
  	@click="onClick"
  	@keydown.enter="onClick"
  	@keydown.space.prevent="onClick"
  >
  	<slot></slot>
  </div>
  ```
  (出典: [component-conventions.md](../../.claude/skills/working-on-frontend/references/knowledge/component-conventions.md#L264-L278))
- `@keydown.enter` を忘れて click だけ付けるのが最頻出ミス。 (出典: [component-conventions.md](../../.claude/skills/working-on-frontend/references/knowledge/component-conventions.md#L288))
- `<a>` をボタン代わりに使うのは原則禁止

  URL に飛ばない `<a href="#" @click.prevent>` は a11y / SEO 両面で良くない。リンクなら `<MkA>` ([MkA.vue](../../packages/frontend/src/components/global/MkA.vue))、アクションなら `<button>` を使う。
  (出典: [component-conventions.md](../../.claude/skills/working-on-frontend/references/knowledge/component-conventions.md#L290-L292))
- slot や label を見せたくない (アイコンのみのボタンなど) 場合は `aria-label`: (出典: [component-conventions.md](../../.claude/skills/working-on-frontend/references/knowledge/component-conventions.md#L314))
- `aria-label` の値も i18n 経由にする (英語直書きは禁止)。 (出典: [component-conventions.md](../../.claude/skills/working-on-frontend/references/knowledge/component-conventions.md#L322))
- **実情:** 現状コードベースでは `aria-label` の使用例自体が乏しい (アイコンの hover ヒントには `:title="i18n.ts..."` が使われるが、`title` は tooltip でありスクリーンリーダー向けラベルの代替にはならない)。このため aria-label は確立した慣習というより a11y 上の推奨ベストプラクティスとして書いている。新規でアイコンのみのボタンを足すなら付けるのが望ましい。 (出典: [component-conventions.md](../../.claude/skills/working-on-frontend/references/knowledge/component-conventions.md#L324))
- 本物の `<button :disabled>` ならブラウザが click を抑止するが、`<div role="button">` は止めてくれない。`aria-disabled` を付けるだけでなく、**ハンドラ側でも早期 return** する: (出典: [component-conventions.md](../../.claude/skills/working-on-frontend/references/knowledge/component-conventions.md#L328))
- Tab で全ての操作可能要素にたどり着けること (`tabindex="-1"` を不用意に付けない) (出典: [component-conventions.md](../../.claude/skills/working-on-frontend/references/knowledge/component-conventions.md#L339))
- モーダル / popup を開いたら focus trap を考える ([MkModal.vue](../../packages/frontend/src/components/MkModal.vue) のような既存コンポーネントは内部で対応している) (出典: [component-conventions.md](../../.claude/skills/working-on-frontend/references/knowledge/component-conventions.md#L340))
- リスト中の項目は矢印キー操作も考慮する。Space / Enter で開く・確定する UI は `MkSelect.vue` の `@keydown.space.enter`(メニューを開く) パターンを参考にする (出典: [component-conventions.md](../../.claude/skills/working-on-frontend/references/knowledge/component-conventions.md#L341))
- `<div @click>` に role / tabindex / keydown が無い (出典: [component-conventions.md](../../.claude/skills/working-on-frontend/references/knowledge/component-conventions.md#L354))
- アイコンだけのボタンに `aria-label` が無い (Tabler icon 自体には意味情報が無い) (出典: [component-conventions.md](../../.claude/skills/working-on-frontend/references/knowledge/component-conventions.md#L355))
- `disabled` スタイルだけ付けて `aria-disabled` / ハンドラ抑止が無い (出典: [component-conventions.md](../../.claude/skills/working-on-frontend/references/knowledge/component-conventions.md#L356))
- フォーカスリング (`:focus-visible` / `outline`) を `outline: none` で消したまま放置 (出典: [component-conventions.md](../../.claude/skills/working-on-frontend/references/knowledge/component-conventions.md#L357))
- **クリック可能要素は `<button class="_button">` を第一選択**。やむを得ず `<div @click>` なら `role="button"` + `tabindex="0"` + `@keydown.enter` / `@keydown.space.prevent` の 4 点セット必須 (出典: [adding-mk-component.md](../../.claude/skills/working-on-frontend/references/tasks/adding-mk-component.md#L146))
- **フォーム要素 (`<input>` / `<select>` / `<textarea>`) は `<label>` 接続もしくは `aria-label`** (出典: [adding-mk-component.md](../../.claude/skills/working-on-frontend/references/tasks/adding-mk-component.md#L147))
- **`:disabled` バインドと `aria-disabled` を一致**させる。ハンドラ側でも早期 return (出典: [adding-mk-component.md](../../.claude/skills/working-on-frontend/references/tasks/adding-mk-component.md#L148))
- **キーボードのみで完結**できるか確認 (Tab で focus 移動できる / Enter で確定できる) (出典: [adding-mk-component.md](../../.claude/skills/working-on-frontend/references/tasks/adding-mk-component.md#L149))
- ARIA 属性は最小限 (出典: [adding-mk-component.md](../../.claude/skills/working-on-frontend/references/tasks/adding-mk-component.md#L150))

## storybook

- [Major] 共有 `Mk*` コンポーネントを新規追加した場合、`Mk<Name>.stories.impl.ts` が同階層に併設されているか (サブディレクトリ含む。例: `components/global/MkAvatar.stories.impl.ts`, `components/grid/MkGrid.stories.impl.ts`)。
- [Major] **ファイル名は `.stories.impl.ts` 固定** (`.stories.ts` は生成物なので手編集・コミット不可)。
- [Major] 既存 [MkButton.stories.impl.ts](../../packages/frontend/src/components/MkButton.stories.impl.ts) を雛形例として参照する。
- 各コンポーネント横に `*.stories.impl.ts` を併設する慣習 (例: `MkButton.stories.impl.ts`)。Chromatic (`pnpm --filter frontend chromatic`) で視覚回帰チェック。 (出典: [frontend-testing.md](../../.claude/skills/working-on-frontend/references/knowledge/frontend-testing.md#L50))
- 共有 `Mk*` コンポーネントには `Mk<Name>.stories.impl.ts` を **同階層** に併設するのが慣習。 (出典: [storybook.md](../../.claude/skills/working-on-frontend/references/knowledge/storybook.md#L3))
- **ファイル名は `.stories.impl.ts` 固定** (`.stories.ts` は `packages/frontend/.storybook/generate.tsx` による生成物で手編集・コミット不可) (出典: [storybook.md](../../.claude/skills/working-on-frontend/references/knowledge/storybook.md#L7))
- 同階層に置く (`components/MkButton.stories.impl.ts`、`components/global/MkAvatar.stories.impl.ts` 等) (出典: [storybook.md](../../.claude/skills/working-on-frontend/references/knowledge/storybook.md#L8))
- `satisfies StoryObj<typeof MkColoredTag>` が無いと `args` の型補完が効かなくなる (出典: [storybook.md](../../.claude/skills/working-on-frontend/references/knowledge/storybook.md#L48))
- `layout` を変えるだけで Storybook 上の見え方が大きく変わる。レイアウト依存のコンポーネント (sticky header 等) なら `'fullscreen'` を選ぶ。 (出典: [storybook.md](../../.claude/skills/working-on-frontend/references/knowledge/storybook.md#L155))
- 新規コンポーネントの stories が Sidebar に出ない場合、多くは [generate.tsx](../../packages/frontend/.storybook/generate.tsx) の生成対象 **allowlist** に入っていないため。`src/{components,pages,...}/**/*.vue` の全体 glob はコメントアウトされており、対象は `globSync('src/components/global/Mk*.vue')` / `globSync('src/components/Mk[B-E]*.vue')` などの**明示列挙**になっている。`.stories.impl.ts` を併設しただけでは自動では出ないことがあるので、対象外なら generate.tsx に 1 行追加する。加えて、ファイル名 (`.stories.impl.ts`) と SPDX ヘッダー以降に構文エラーが無いかも確認する。 (出典: [storybook.md](../../.claude/skills/working-on-frontend/references/knowledge/storybook.md#L189))
- ストーリーが必要 (= ほぼ常に必要) なら、同階層に `Mk<Name>.stories.impl.ts` も作る → [knowledge/storybook.md](../../.claude/skills/working-on-frontend/references/knowledge/storybook.md)。 (出典: [adding-mk-component.md](../../.claude/skills/working-on-frontend/references/tasks/adding-mk-component.md#L24))
- 共有 `Mk*` コンポーネントには `Mk<Name>.stories.impl.ts` を **同階層** に併設する (サブディレクトリ含む)。詳細は → [knowledge/storybook.md](../../.claude/skills/working-on-frontend/references/knowledge/storybook.md)。 (出典: [adding-mk-component.md](../../.claude/skills/working-on-frontend/references/tasks/adding-mk-component.md#L156))
- 大きな機能なら Storybook で各バリエーション (variant / size / disabled / loading) を網羅する (出典: [adding-mk-component.md](../../.claude/skills/working-on-frontend/references/tasks/adding-mk-component.md#L181))
- Also, you can use msw to mock API requests in the storybook. Creating a `MyComponent.stories.msw.ts` file to define the mock handlers.

  ```ts
  import { HttpResponse, http } from 'msw';
  export const handlers = [
  	http.post('/api/notes/timeline', ({ request }) => {
  		return HttpResponse.json([]);
  	}),
  ];
  ```

  Don't forget to re-run the `.storybook/generate.js` script after adding, editing, or removing the above files.
  (出典: [frontend.md](../contributing/frontend.md#L124-L135))

## アイコン

- [Minor] アイコンは Tabler icons クラス (`<i class="ti ti-info-circle">` 等) を使う。
- [Minor] インライン SVG や別アイコンセットは原則使わない (既存パターンに合わせる)。
- **アイコンを動的に設定する際には、 `ti-${someVal}` のような、アイコン名のみを動的に変化させる実装を行わないでください。**
  必ず `ti-xxx` のような完全なクラス名を含めるようにしてください。
  (出典: [frontend.md](../contributing/frontend.md#L16-L17))

## テスト

- 共有コンポーネント (`MkX.vue`) のユニットテストは現状少なく、`*.spec.ts` / `__tests__/` 形式は採用していない (Storybook + Playwright でカバー) (出典: [frontend-testing.md](../../.claude/skills/working-on-frontend/references/knowledge/frontend-testing.md#L16))
- 新規 frontend 機能の E2E は Playwright に書くのが基本。ただし対象は主要 UI フロー (login / post / drive etc) に限定し、細かい単位テストは Vitest または Storybook で代替する慣習。 (出典: [frontend-testing.md](../../.claude/skills/working-on-frontend/references/knowledge/frontend-testing.md#L39))

## その他

- > [!WARNING]
  > 現状、ルートは定義された順に評価されます。
  > たとえば、`/foo/:id`ルート定義の次に`/foo/bar`ルート定義がされていた場合、後者がマッチすることはありません。
  (出典: [frontend.md](../contributing/frontend.md#L38-L40))
