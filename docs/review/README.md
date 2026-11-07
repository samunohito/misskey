# Review guidelines

変更をレビューする人 (人間・AI) 向け。

[Contribution guide](../../CONTRIBUTING.md)

このディレクトリは Misskey のレビュー観点の正本です。人間のレビュアーも、AI レビュアー (Claude Code / Codex / CodeRabbit) も、ここを参照します。

## ファイルと適用範囲

| ファイル | 適用範囲 | 主な内容 |
| --- | --- | --- |
| [general.md](general.md) | すべての変更 | Security / Performance / Testing、静的解析で検出できる問題の扱い、命名・実装方針 |
| [pull-request.md](pull-request.md) | PR 全体 (タイトル・説明文・変更範囲) | Scope、スコープ外の変更の扱い、PR の作り方 |
| [frontend.md](frontend.md) | `packages/frontend/**`、`packages/frontend-embed/**`、`packages/frontend-shared/**`、`packages/i18n/**`、`locales/**` | 命名、`<script>`、i18n、スタイル、`os.*`、a11y、Storybook、アイコン |
| [backend.md](backend.md) | `packages/backend/**` | API エンドポイント、Nest DI、ActivityPub、テスト |
| [database.md](database.md) | migration、entity、SQL / TypeORM を書く箇所 | entity、クエリ、スキーマ変更、migration の書き方と `down()` |

変更領域に対応するファイルと `general.md` を読んでください。PR 全体をレビューするときは `pull-request.md` も読んでください (差分だけを見るレビューでは、PR のタイトルや説明文が前提の項目は適用できません)。

## 項目の書式

各項目は次の形式です。

```
- **[重大度]** 確認すること (破ると何が起きるか)。 → [規約文書](リンク)
```

- 各項目は、既存の規約文書 (`docs/contributing/`、`.claude/skills/*/references/`、CONTRIBUTING.md) の規約を、レビューで確認する形に要約したものです。本文だけで判断できるように書いています。理由や手順の詳細はリンク先にあります
- 重大度の基準:
  - `[Critical]`: 見落とすと本番障害・データ損失・セキュリティ問題・翻訳資産の喪失につながる (CI が検出して止める問題は、[general.md](general.md) の「静的解析で検出できる問題」と同じく軽く扱う)
  - `[Major]`: 直すべき規約違反 (動作はするが、規約や設計に反する)
  - `[Minor]`: 推奨・体裁
- 1 つの変更に複数の項目が当たる場合は、最も高い重大度に従います
- 各節の「**指摘しないこと:**」は、誤検知を避けるための注記です (重大度はありません)

## 正本の範囲

- このディレクトリが正本なのは「レビューで何を確認するか (観点の選定と重大度)」です
- 規約の内容そのもの (なぜそうするか・どう書くか) の正本は、リンク先の規約文書です。規約文書を変えたら、対応する項目も合わせて直してください
- [AGENTS.md](../../AGENTS.md) の「絶対にやってはいけない事」はここに再掲していません

## ここに書かないもの

- AI レビュアーの振る舞い (出力形式、口調、差分の取り方) は各ツールの設定 (`.claude/agents/*.md`、`.coderabbit.yaml`) に書きます。ただし、指摘の強さや範囲に関わる方針 (静的解析で検出できる問題の扱い、スコープ外の変更の扱いなど) は、人間と AI に共通する観点としてここに置きます
- 人間のレビュアーの心構え (良い点にも触れる、推薦記事など) は [Maintainer guide](../contributing/maintainer-guide.md) にあります

## ファイルを増やす基準

ある領域の観点が溜まり、別の専門知識が要ると分かった時点で独立させてください (例: ActivityPub は現在 `backend.md` の節)。
