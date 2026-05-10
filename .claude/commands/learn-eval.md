---
description: 現セッションからパターンを抽出し、品質ゲートを通したうえで Global / Project のどちらに保存するかを判定して新規 skill 案として提示する。
---

<!--
SPDX-License-Identifier: MIT
SPDX-FileCopyrightText: 2026 Affaan Mustafa and everything-claude-code contributors

出典 (upstream): https://github.com/affaan-m/everything-claude-code (v2.0.0-rc.1)
upstream path: commands/learn-eval.md
upstream license: MIT — https://github.com/affaan-m/everything-claude-code/blob/main/LICENSE
project-level notice: see .claude/THIRD_PARTY_LICENSES.md (Misskey 内サードパーティ一覧 + MIT 全文)

Imported into Misskey .claude/ on 2026-05-10. Quality-gate flow (extract → checklist → holistic verdict → save) は upstream ECC 版から借用 (MIT)。Misskey の skill 命名規則と SPDX 規約に関する補足を追加した。

note: ECC 版そのままに近い構成。Misskey の skill 命名・SPDX 規約・日本語 description の方針を補足。実保存は必ずユーザーの確認を取り、Global (~/.claude/skills/learned/) か Project (.claude/skills/learned/) かを明示する。
-->

# /learn-eval — 抽出 → 評価 → 保存

`/learn` 系の拡張版。パターンを抽出し、品質ゲートと保存先決定を経てから skill ファイルを書く。

## 抽出対象

1. **エラー解決パターン** — 根本原因 + 修正 + 再利用性
2. **デバッグ手法** — 自明でない手順、ツール組み合わせ
3. **ワークアラウンド** — ライブラリの癖、API 制約、バージョン固有の修正
4. **プロジェクト固有パターン** — 規約・アーキテクチャ判断・統合パターン

## 手順

1. セッションを振り返り抽出可能なパターンを洗い出す
2. 最も価値のある insight を 1 つ特定する

3. **保存先の判定:**
   - Q: 「このパターンは別プロジェクトでも役立つか？」
   - **Global** (`~/.claude/skills/learned/`): 2 プロジェクト以上で使える汎用パターン (bash 互換性、LLM API の癖、デバッグ手法など)
   - **Project** (`.claude/skills/learned/` in 現プロジェクト): プロジェクト固有 (Misskey 特有の SPDX/migration/i18n/endpoint-list 規約や Vue 3 + 自前 Pizzax store / 共有 ref / EventEmitter の癖など。**Misskey は Pinia 不採用**、状態管理は [packages/frontend/src/lib/pizzax.ts](../../packages/frontend/src/lib/pizzax.ts))
   - 迷ったら Global → Project は手動移動が容易

4. skill ファイル雛形 (Misskey 規約適用版):

```markdown
---
name: <pattern-name>
description: 130 文字以内の日本語で要約。何を解決するか + どんな発話で起動するかを書く。
user-invocable: false
origin: auto-extracted
---

# [パターン名]

**Extracted:** [yyyy-mm-dd]
**Context:** [いつ適用するか]

## Problem
[何を解決するか — 具体的に]

## Solution
[パターン / 手法 / ワークアラウンド — コード例付き]

## When to Use
[トリガー条件]
```

5. **品質ゲート — チェックリスト + 総合判定**

   ### 5a. 必須チェックリスト

   実ファイルを読んで以下を **全て** 確認:

   - [ ] `~/.claude/skills/`、`.claude/skills/`、ECC 由来 skill 群をキーワードで grep し内容重複の有無
   - [ ] `~/.claude/projects/.../memory/MEMORY.md` (auto-memory)、project memory の内容重複
   - [ ] 既存 skill への append で済まないか
   - [ ] 一回限りの fix ではなく、再利用可能なパターンか

   ### 5b. 総合判定

   | Verdict                  | 意味                                  | 次のアクション                       |
   |--------------------------|---------------------------------------|--------------------------------------|
   | **Save**                 | ユニーク・具体・スコープ明確          | Step 6 へ                            |
   | **Improve then Save**    | 価値あるが要 refinement               | 改善点提示 → 再評価 (1 回まで)       |
   | **Absorb into [X]**      | 既存 skill に追記が適切                | 対象 skill と差分提示 → Step 6 へ    |
   | **Drop**                 | 些細・冗長・抽象すぎ                  | 理由を述べて中止                     |

   **判断観点 (採点はしない、総合的に重み付け):**

   - **Specificity & Actionability**: コード例・コマンドが即使える
   - **Scope Fit**: 名前・トリガー・内容が単一パターンに収束
   - **Uniqueness**: 既存 skill に無い価値 (チェックリスト結果が示す)
   - **Reusability**: 将来セッションでの実トリガーシナリオが想定可能

6. **判定別の確認フロー**

   - **Improve then Save**: 改善点 + 修正版 draft + 再評価結果 → Save なら確認後保存
   - **Save**: 保存先パス + チェックリスト結果 + 1 行の根拠 + draft 全文 → ユーザー確認後保存
   - **Absorb into [X]**: 対象パス + 追加箇所 (diff 形式) + チェックリスト結果 + 根拠 → ユーザー確認後 append
   - **Drop**: チェックリスト結果と理由のみ提示 (確認不要)

7. 判定に従って保存 / append

## Step 5 出力フォーマット

```text
### Checklist
- [x] skills/ grep: 重複なし (or: 重複あり → 詳細)
- [x] memory: 重複なし (or: 重複あり → 詳細)
- [x] 既存 skill への append: 新規が適切 (or: [X] に append すべき)
- [x] Reusability: 確認 (or: 一回限り → Drop)

### Verdict: Save / Improve then Save / Absorb into [X] / Drop

**Rationale:** (判定理由を 1-2 文で)
```

## Misskey 固有の補足

- description は **日本語** で書く (既存 4 skills と同じ命名スタイル)
- skill 名は **kebab-case**、Misskey 既存命名 (`add-mk-component`, `create-migration` 等) と衝突しないこと
- パターン例:
  - `apply-spdx`: SPDX 抜けに気付いて修正したパターンを抽出 (Project 保存推奨)
  - `endpoint-list-registration`: endpoint-list.ts 登録漏れの検出と修正 (Project)
  - `pizzax-side-effect-detection`: Pizzax store / 共有 ref の writer 副作用 reset 発見手法 (Project、click-path-audit と隣接)

## 注意

- 些細な fix (typo, syntax error) は抽出しない
- 一回限りの問題 (特定 API 障害など) は抽出しない
- 将来時間を節約できるパターンに集中
- skill は単一パターンに絞る
- Verdict が Absorb なら新規ファイルではなく既存 skill に追記
