---
name: strategic-compact
description: タスクのフェーズ境界 (research → plan → implement → test) で手動 `/compact` を提案し、auto-compact による中途半端な圧縮を避ける。"context が重い"、"フェーズ切替"、"compact 提案して"、"context pressure"、"次のタスクに移る前に整理して" 等で起動する。
---

<!--
SPDX-License-Identifier: MIT
SPDX-FileCopyrightText: 2026 Affaan Mustafa and everything-claude-code contributors

出典 (upstream): https://github.com/affaan-m/everything-claude-code (v2.0.0-rc.1)
upstream path: skills/strategic-compact/SKILL.md (+ suggest-compact.sh)
upstream origin frontmatter: ECC
upstream license: MIT — https://github.com/affaan-m/everything-claude-code/blob/main/LICENSE
project-level notice: see .claude/THIRD_PARTY_LICENSES.md (Misskey 内サードパーティ一覧 + MIT 全文)

Imported into Misskey .claude/ on 2026-05-10 as a standalone copy (no dependency on the ECC plugin runtime). description was rewritten in Japanese and Misskey-specific examples were appended; body content remains MIT-licensed. suggest-compact.sh is a verbatim copy of the upstream bash script.

note: hook 設定は読者の選択。Misskey の共有 `.claude/settings.json` には現状 hook を登録していない (Claude が触っていないファイルにまで副作用が及ぶのを避けるため) ので、本 skill 由来の PreToolUse hook も共有には入れず、必要な人が `.claude/settings.local.json` に opt-in する運用とする。
-->

# Strategic Compact Skill

ワークフローの戦略的なポイントで手動 `/compact` を提案する。auto-compact は arbitrary なタイミングで発火するので、論理境界で自分で打つ方が context を保てる。

## 起動タイミング

- コンテキスト窓のかなりの割合 (体感 50% 超 / Sonnet なら 100K+, Opus 4.7 1M モデルなら 500K+ あたりが目安) を消費している長セッション。具体値はモデルに依存するので絶対値ではなく **割合** で判断する
- 多段階タスク (research → plan → implement → test)
- 同セッション内で関連性の薄いタスクへ切替
- 大きなマイルストーン完了後の次フェーズ開始時
- 応答が遅く・粗くなった (context pressure)

## なぜ戦略的か

Auto-compaction の問題:
- タスクの途中で発火し重要な context が失われる
- 論理境界の認識がない
- 複雑な多段階操作を中断する

戦略的 compaction:
- **探索後・実装前** — 探索の context を圧縮、実装計画を残す
- **マイルストーン完了直後** — 次フェーズに fresh で入る
- **大きな文脈切替の直前** — 関係ない探索 context を払う

## 仕組み

`suggest-compact.sh` を PreToolUse (Edit/Write) で動かす場合の挙動:

1. **ツール呼び出しをカウント** — セッション内呼び出しを集計
2. **しきい値検出** — デフォルト 50 で初回提案
3. **以後の周期提案** — 25 ごとにリマインド

## Hook 設定 (任意 — Misskey デフォルトでは入れない)

共有 `.claude/settings.json` には hook を登録しない方針 (Claude が触っていないファイルへの副作用を避けるため)。個別に有効化したい場合のみ、ユーザースコープ `~/.claude/settings.json` か個人ローカル `.claude/settings.local.json` (gitignore 済) で次のように設定する (`<repo-root>` は Misskey リポジトリの絶対パスに置き換える):

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [{
          "type": "command",
          "command": "<repo-root>/.claude/skills/strategic-compact/suggest-compact.sh"
        }]
      }
    ]
  }
}
```

環境変数:
- `COMPACT_THRESHOLD` — 初回提案までの呼び出し数 (default: 50)

## Compaction 判断表

| フェーズ遷移                | Compact?  | 理由                                                          |
|-----------------------------|-----------|---------------------------------------------------------------|
| Research → Planning         | Yes       | 探索の context は重い、計画は蒸留済                           |
| Planning → Implementation   | Yes       | 計画は TodoWrite/ファイルに残るので code 用に context を空ける |
| Implementation → Testing    | Maybe     | 直近コードを参照するなら残す、フォーカス切替なら圧縮          |
| Debugging → Next feature    | Yes       | デバッグ trace が無関係な作業を汚す                           |
| Mid-implementation          | No        | 変数名・パス・部分状態を失うコストが大きい                    |
| 失敗アプローチ後            | Yes       | 死に筋の reasoning を払って次を試す                           |

## Compaction で残るもの・失うもの

| Persist (残る)                          | Lost (失う)                              |
|------------------------------------------|------------------------------------------|
| CLAUDE.md の指示                         | 中間 reasoning と analysis               |
| TodoWrite のリスト                       | 過去に読んだファイル内容                 |
| Memory ファイル (`~/.claude/memory/`)    | 多段階会話 context                       |
| Git 状態 (commits, branches)             | ツール呼び出し履歴                       |
| ディスク上のファイル                     | 口頭で伝えたユーザー preference          |

## ベストプラクティス

1. **計画固まったら compact** — TodoWrite に落とした直後がベスト
2. **デバッグ後に compact** — エラー解決の context を払う
3. **実装中は compact しない** — 関連変更のための context を温存
4. **提案を読む** — hook は *いつ* を教える、*やるか* は判断
5. **重要事項を先に書き出す** — compact 前にファイル/メモリへ
6. **要約付き compact** — `/compact Focus on implementing auth middleware next` のように custom メッセージを添える

## Misskey での適用例

- API endpoint 追加: 探索 (関連 endpoint 読む) → 計画 (meta/paramDef 設計) → ここで `/compact "次は backend/src/server/api/endpoints/<name>.ts 実装、endpoint-list.ts 登録、e2e テスト、misskey-js 再生成"` → 実装フェーズに fresh な context で入る
- Migration 作成: スキーマ調査 → up/down 案 → ここで `/compact "次は migration:generate 実行と SPDX 付与、check-migrations 通過"` → コマンド実行に集中
- Vue コンポーネント追加: 既存 Mk* 確認 → 設計 → ここで `/compact "次は MkXxx.vue + .stories.impl.ts、SPDX/型/CSS modules/i18n 適用"` → 実装

## 関連

- `token-budget-advisor` — 応答ごとの深さ制御
- `context-budget` — overhead の見える化
