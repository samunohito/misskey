---
name: click-path-audit
description: Vue ボタン/操作要素の handler を順に追って、関数単体は動くが互いに状態を打ち消し合う系のバグを検出する。"systematic-debugging で原因不明だがボタンが効かない"、"ストアを変更した後の影響範囲監査"、"Pizzax store / refs / EventEmitter に副作用 reset がないか確認"、"click path audit"、"button doesn't work" 等で起動する。
---

<!--
SPDX-License-Identifier: MIT
SPDX-FileCopyrightText: 2026 Affaan Mustafa and everything-claude-code contributors
SPDX-FileCopyrightText: click-path-audit original authors (community origin via ECC)

出典 (upstream): https://github.com/affaan-m/everything-claude-code (v2.0.0-rc.1)
upstream path: skills/click-path-audit/SKILL.md
upstream origin frontmatter: community
upstream license: MIT — https://github.com/affaan-m/everything-claude-code/blob/main/LICENSE
project-level notice: see .claude/THIRD_PARTY_LICENSES.md (Misskey 内サードパーティ一覧 + MIT 全文)
note: upstream "origin: community" が示すとおり、本 skill の発想と元事例 (ThreadList の "New Email" バグ) は ECC のコミュニティ寄稿由来。具体的な元著者は upstream のフロントマターと git history を参照。

Imported into Misskey .claude/ on 2026-05-10 as a standalone copy (no dependency on the ECC plugin runtime). description was rewritten in Japanese and React+Zustand examples were re-expressed in Vue 3 + Pizzax store / refs / EventEmitter context, with Misskey-specific touchpoints appended; body content remains MIT-licensed.

misskey-note: 元 ECC 版は React + Zustand を例にしていたが、Misskey は Vue 3 + os.* + 自前 Pizzax store (`@/lib/pizzax.js`) + ref / Composition API + EventEmitter なので、ストア用語と例を Misskey 文脈に補足した版。Pinia は Misskey フロントエンドでは使われていない (依存なし)。packages/frontend/src/components/ と pages/ の .vue を対象とする想定。
-->

# /click-path-audit — Behavioural Flow Audit

静的なコードリーディングでは見つけにくいバグ — 状態相互作用の副作用、連続呼び出し間の race、handler が黙って互いを打ち消す現象 — を見つける。

## このスキルが解く問題

従来のデバッグは:
- 関数は存在するか？(配線漏れ)
- クラッシュするか？(ランタイムエラー)
- 戻り値の型は正しいか？(データ流れ)

を見るが、以下は見ない:

- **ボタンのラベルが約束する状態に最終的になっているか？**
- **関数 B が直前の関数 A の効果を黙って打ち消していないか？**
- **共有状態 (Pizzax store / 共有 ref / global emitter) の副作用が意図した動作を相殺していないか？**

## 動作

各 interactive な触点について:

```
1. handler を特定 (@click, @submit, v-on, watch, etc.)
2. handler 内の関数呼び出しを順番にトレースする
3. 各呼び出しについて:
   a. 何の状態を READ しているか
   b. 何の状態を WRITE しているか
   c. 共有状態に副作用があるか
   d. 副作用として他の状態を reset/clear していないか
4. CHECK: 後の呼び出しが前の呼び出しの状態変更を打ち消していないか
5. CHECK: 最終状態がボタンラベルの約束と一致するか
6. CHECK: race condition (async の解決順序問題) がないか
```

## 実行手順

### Step 1: ストアのマップを作る

任意の触点を監査する前に、対象範囲のストア・action の **副作用マップ** を作る:

```
範囲内の全 Pizzax store / 共有 ref / global emitter について:
  各 action / setter:
    - どのフィールドを set するか
    - 副作用として他のフィールドを RESET していないか
    - 記録: actionName → {sets: [...], resets: [...]}
```

これが critical reference。資料がなければ「副作用 reset」は見えない。

**出力フォーマット例:**

```
STORE: noteStore (Pizzax)
  setComposing(bool) → sets: {composing}
  selectThread(thread|null) → sets: {selectedThread, selectedThreadId, replies, selectedReply}
                              RESETS: {composing: false, draftBody: ''}
  setDraftGenerating(bool) → sets: {draftGenerating}

DANGEROUS RESETS (他人の state を消す action):
  selectThread → composing を reset (本来は setComposing が持ち主)
  set('key', defaultValue) → 該当キーを default に戻す
```

### Step 2: 各触点を監査

```
TOUCHPOINT: [Button label] in [Component:line]
  HANDLER: @click → {
    call 1: functionA() → sets {X: true}
    call 2: functionB() → sets {Y: null} RESETS {X: false}  ← CONFLICT
  }
  EXPECTED: ユーザーが見る最終状態は [ボタンラベルの約束する状態]
  ACTUAL: X が false (functionB が reset した)
  VERDICT: BUG — [説明]
```

#### Pattern 1: Sequential Undo

```ts
function handler() {
  setStateA(true)      // X = true
  setStateB(null)      // 副作用: X = false に reset
}
// 結果: X は false。最初の呼び出しは無駄。
```

#### Pattern 2: Async Race

```ts
function handler() {
  fetchA().then(() => state.loading = false)
  fetchB().then(() => state.loading = true)
}
// 最終 loading は解決順序次第。
```

#### Pattern 3: Stale Closure / 古い ref 値

```ts
const count = ref(0)
const handler = () => {
  count.value = count.value + 1
  count.value = count.value + 1
}
// reactive なので Vue では React より起こりにくいが、
// composable のキャプチャや setTimeout 経由で発生する場合あり
```

#### Pattern 4: Missing State Transition

```
- ボタンラベルは "保存" だが handler は validate しか走らない
- "削除" ボタンが flag だけ立てて API を呼ばない
- "送信" ボタンの API endpoint が削除/壊れている
```

#### Pattern 5: Conditional Dead Path

```ts
function handler() {
  if (someState.value) {     // この時点で常に false
    doTheActualThing()       // 到達しない
  }
}
```

#### Pattern 6: Watch / watchEffect Interference

```ts
// ボタンが stateX = true を set
// watch(stateX) が走り stateX = false に戻す
// ユーザーには何も起きていないように見える
```

### Step 3: レポート

各バグについて:

```
CLICK-PATH-NNN: [severity: CRITICAL/HIGH/MEDIUM/LOW]
  Touchpoint: [Button label] in [file:line]
  Pattern: [Sequential Undo / Async Race / Stale Closure / Missing Transition / Dead Path / Watch Interference]
  Handler: [function 名 or inline]
  Trace:
    1. [call] → sets {field: value}
    2. [call] → RESETS {field: value}  ← CONFLICT
  Expected: [ユーザーが期待する状態]
  Actual: [実際に起きること]
  Fix: [具体的な修正案]
```

## スコープ管理

監査は重い。範囲を明確に:

- **全アプリ監査**: 大きなリファクタ後やリリース前。並列エージェントでページごとに分担。
- **単一ページ監査**: 新規ページ作成後、もしくはユーザーから「このボタン効かない」報告。
- **ストア単位監査**: Pizzax store / 共有 ref の writer を変更した時 — 全 consumer を監査。

### Misskey での並列分割例 (全アプリ監査時)

Agent 1 が必ず先に完了し、その出力を他の agent に渡す。

```
Agent 1: 全 Pizzax store / 共有 emitter / 主要 ref の副作用マップ (Step 1)
Agent 2: タイムライン / ノート関連 (TimelinePage, MkNote, MkNoteSub, MkSubNoteContent)
Agent 3: 投稿フォーム (MkPostForm, MkPostFormDialog, draft 復元)
Agent 4: ドライブ (DrivePage, MkDrive*, ファイル操作系)
Agent 5: 設定 (settings/*.vue, theme/policy 操作)
Agent 6: チャット / 通知 (chat/*, notifications.vue)
Agent 7: 管理 (admin/*.vue, role/policy/queue)
```

## 使う場面

- systematic-debugging で「バグなし」だがユーザーが UI 不具合を報告
- Pizzax store の writer / 共有 ref の更新を変更した後 (全 caller を監査)
- 共有状態を触る refactor の後
- リリース前のクリティカルフロー確認
- ボタンが「何も起きない」 — まさにこれ用

## 使わない場面

- API レベルのバグ (response shape 不一致, 不在 endpoint) → systematic-debugging へ
- スタイル/レイアウト問題 → 視認確認
- パフォーマンス → profiling

## 他 skill との連携

> **依存メモ**: 以下 3 つは外部プラグイン `superpowers` 由来 (Misskey の `.claude/settings.json` の `enabledPlugins` に含まれる) の skill。`.claude/skills/` 配下にローカルコピーがあるわけではないので、`superpowers` プラグインを無効化している環境では参照できない (代わりに自分で同等の手順を踏む)。本 skill 自体は ECC plugin runtime に依存していない (= ECC 非使用環境でも単体で動く) という意味の「standalone copy」。

- `superpowers:systematic-debugging` の **後** に走らせる (静的問題はそちらが捕まえる)
- `superpowers:verification-before-completion` の **前** に走らせる (修正の効果検証はそちら)
- `superpowers:test-driven-development` に **フィード** する (見つけたバグはテスト化)
- Misskey の `vue-component-reviewer` agent は SPDX/i18n/SCSS/a11y を見る。click-path-audit は **動的振る舞いの整合性** という別軸。両方走らせると相互補完。

## Misskey 固有の注意

- Misskey の global UI は `os.alert` / `os.confirm` / `os.popup` / `os.toast` / `os.apiWithDialog` 経由。`window.alert` ではない。handler 内で `os.*` の戻り値 (`Promise<{canceled, result}>` 系) が無視されていないか確認する。
- 投稿フォームは draft localStorage / Pizzax / EventEmitter 連携が複雑。`MkPostForm` 系は要注意領域。
- タイムラインの並び替え/フィルタは `streamingClient` イベントと local state が競合しやすい。

## 元バグ事例

ECC 元版が紹介する事例:

```
ThreadList.tsx の "New Email" ボタン:
  onClick={() => {
    useEmailStore.getState().setComposeMode(true)
    useEmailStore.getState().selectThread(null)  // 副作用で composeMode を false に戻す
  }}
```

`selectThread` が `composeMode: false` を内部で set していたため、ボタンは何もしないように見える。
systematic-debugging では検出できなかった (関数は存在し、クラッシュもせず、型も正しい)。
click-path-audit が Step 1 でストアマップを作ることで、Step 2 で「call 2 が call 1 の効果を打ち消す」と機械的に発見できる。
