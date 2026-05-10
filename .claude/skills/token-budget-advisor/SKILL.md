---
name: token-budget-advisor
description: 応答を返す前にユーザーへ「どのくらいの深さで答えてほしいか」を選ばせ、トークン消費を制御する。"短い版で"、"詳細版で"、"al 50%"、"tldr"、"exhaustive answer"、"トークン消費" 等の発話で起動する。同セッション内で深さが既に指定されている時、回答が一行で済む時、"token" が認証/決済等の文脈の時は起動しない。TRIGGER words (英日西語混在 OK): "token budget", "token count", "token usage", "token limit", "response length", "answer depth", "short version", "brief answer", "detailed answer", "exhaustive answer", "tldr", "短い版", "詳細版", "簡潔に", "respuesta corta", "responde al 50%"。
---

<!--
SPDX-License-Identifier: MIT
SPDX-FileCopyrightText: 2026 Affaan Mustafa and everything-claude-code contributors
SPDX-FileCopyrightText: Token Budget Advisor original authors (community origin via ECC)

出典 (upstream): https://github.com/affaan-m/everything-claude-code (v2.0.0-rc.1)
upstream path: skills/token-budget-advisor/SKILL.md
upstream origin frontmatter: community
upstream license: MIT — https://github.com/affaan-m/everything-claude-code/blob/main/LICENSE
project-level notice: see .claude/THIRD_PARTY_LICENSES.md (Misskey 内サードパーティ一覧 + MIT 全文)
original community source (per upstream Source section):
  Token Budget Advisor for Claude Code by Xabilimon1
  https://github.com/Xabilimon1/Token-Budget-Advisor-Claude-Code-

Imported into Misskey .claude/ on 2026-05-10 as a standalone copy (no dependency on the ECC plugin runtime). description was rewritten in Japanese to align with existing Misskey skills; body content remains MIT-licensed.

note: Misskey の `.claude/` 配下に取り込み済 (contributor 共有設定)。プラグイン本体への依存なし。
-->

# Token Budget Advisor (TBA)

応答を返す前に「深さの選択肢」を提示してユーザーにトークン消費量を制御させる。

## 使う場面

- 応答の長さ・詳細度を制御したい時
- "tokens", "budget", "depth", "response length" などをユーザーが明示
- "short version", "tldr", "brief", "al 25%", "exhaustive" 等の発話
- 上限を upfront で決めたい時

**起動しない:** 同セッション内で深さが既に指定済 (黙って維持する)、回答が一行で済む明らかに自明な質問。

## ステップ

### Step 1 — 入力トークン推定

`context-budget` と同じヒューリスティクスで入力プロンプトのトークン数を概算する:

- prose: `words × 1.3`
- code 主体 / 混在: `chars / 4`

混在時は支配的なコンテンツ種別で見積もる。

### Step 2 — 応答サイズ見積

プロンプトの複雑度を分類して倍率レンジを掛ける:

| 複雑度       | 倍率レンジ    | 例 |
|--------------|---------------|---|
| Simple       | 3× – 8×       | "What is X?", yes/no |
| Medium       | 8× – 20×      | "How does X work?" |
| Medium-High  | 10× – 25×     | コンテキスト付きコード要求 |
| Complex      | 15× – 40×     | 複数論点・比較・アーキテクチャ |
| Creative     | 10× – 30×     | 物語・エッセイ |

応答ウィンドウ = `input_tokens × mult_min` 〜 `input_tokens × mult_max` (モデルの出力上限を超えないこと)。

### Step 3 — 深さ選択肢を提示

応答前に以下のブロックを出す:

```
Analyzing your prompt...

Input: ~[N] tokens  |  Type: [type]  |  Complexity: [level]

Choose your depth level:

[1] Essential   (25%)  ->  ~[tokens]   結論のみ・前置きなし
[2] Moderate    (50%)  ->  ~[tokens]   結論 + 必要な文脈 + 例 1 個
[3] Detailed    (75%)  ->  ~[tokens]   完全な回答 + 代替案
[4] Exhaustive (100%)  ->  ~[tokens]   無制限・全部入り

どのレベル？ (1-4 or "25% depth", "50% depth", "75% depth", "100% depth")

Precision: heuristic estimate ~85-90% accuracy (±15%).
```

各レベル内の応答ウィンドウ計算:
- 25% → `min + (max - min) × 0.25`
- 50% → `min + (max - min) × 0.50`
- 75% → `min + (max - min) × 0.75`
- 100% → `max`

### Step 4 — 選択深さで応答

| レベル            | 目標長              | 含める                                 | 省く                                   |
|-------------------|---------------------|----------------------------------------|----------------------------------------|
| 25% Essential     | 2-4 文              | 直接的な答え・結論                     | 文脈・例・nuance・代替案               |
| 50% Moderate      | 1-3 段落            | 答え + 必要な文脈 + 例 1 個            | 深掘り分析・edge case・参照            |
| 75% Detailed      | 構造化応答          | 複数例・pros/cons・代替案              | 極端な edge case・徹底参照             |
| 100% Exhaustive   | 制限なし            | 全部 — 完全分析・全コード・全観点      | 何も省かない                           |

## ショートカット — 質問を飛ばす

ユーザーが既に深さを示した場合、確認せず即時その深さで応答する:

| 発話                                                      | レベル |
|-----------------------------------------------------------|--------|
| "1" / "25% depth" / "短い版" / "tldr" / "brief"          | 25%    |
| "2" / "50% depth" / "moderate depth" / "balanced answer"  | 50%    |
| "3" / "75% depth" / "detailed answer" / "thorough"       | 75%    |
| "4" / "100% depth" / "exhaustive" / "完全版"             | 100%   |

セッション内で既に指定済なら **黙って維持** (変更指示が来るまで)。

## Precision Note

ヒューリスティクスのみ。実トークナイザは使わない。精度 ~85-90%、誤差 ±15%。disclaimer は常に出す。

## トリガー例

- 「short version で先に答えて」
- 「How many tokens will your answer use?」
- 「Respond at 50% depth」
- 「I want the exhaustive answer, not the summary」

## 起動しない例

- "What is a JWT token?" (token は認証文脈)
- "The checkout flow uses a payment token." (token は決済文脈)
- 既に同セッションで深さを指定済の場合
