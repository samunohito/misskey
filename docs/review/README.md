# Review guidelines

変更をレビューする人 (人間・AI) 向け。

[Contribution guide](../../CONTRIBUTING.md)

このディレクトリは Misskey のレビュー観点の正本です。人間のレビュアーも、AI レビュアー (Claude Code / Codex / CodeRabbit) も、ここを参照します。

## ファイルと適用範囲

| ファイル | 適用範囲 | 主な内容 |
| --- | --- | --- |
| [general.md](general.md) | すべての変更 | Scope / Security / Performance / Testing、スコープ外の変更の扱い、レビュー対象外、命名・実装方針、PR |
| [frontend.md](frontend.md) | `packages/frontend/**`、`locales/**` | 命名、`<script>`、i18n、スタイル、`os.*`、a11y、Storybook、アイコン |
| [backend.md](backend.md) | `packages/backend/**` | API エンドポイント、Nest DI、ActivityPub、テスト |
| [database.md](database.md) | migration、entity、SQL / TypeORM を書く箇所 | SQL / TypeORM の落とし穴、enum・列変更、migration の書き方と `down()` |

変更領域に対応するファイルと `general.md` を読んでください。

## 項目の書式

各項目は次の形式です。

```
- [重大度] 観点の本文 (出典: [ファイル名](出典へのリンク))
```

- 本文は出典から **そのまま書き写したもの** です (先頭の箇条書き記号・見出し記号を外し、相対リンクをこのディレクトリ起点に付け替えた以外は変更していません)
- `[Critical]` / `[Major]` / `[Minor]` の重大度ラベルは、出典に重大度が明記されているものだけを転記しています。ラベルが無い項目は、出典に重大度の記載が無いものです
- 同じ観点が複数の出典にある場合は、統合せずに出典ごとに並べています。出典間で重大度や記述が食い違っていても、そのまま残しています
- 背景・手順の詳細は出典 (`docs/contributing/` や `.claude/skills/` の references) にあります

## 正本の範囲

- このディレクトリが正本なのは「レビューで何を確認するか (観点の選定と重大度)」です
- 規約の内容そのもの (なぜそうするか・どう書くか) の正本は、出典の規約文書 (`docs/contributing/`、`.claude/skills/*/references/`、[AGENTS.md](../../AGENTS.md)) です。食い違ったら規約文書側を正とし、このディレクトリを追従させてください
- [AGENTS.md](../../AGENTS.md) の「絶対にやってはいけない事」はここに再掲していません

## ここに書かないもの

- AI レビュアーの振る舞い (出力形式、口調、差分の取り方) は各ツールの設定 (`.claude/agents/*.md`、`.coderabbit.yaml`) に書きます
- 人間のレビュアーの心構え (良い点にも触れる、推薦記事など) は [Maintainer guide](../contributing/maintainer-guide.md) にあります

## ファイルを増やす基準

材料が無いうちは空のファイルを作りません。ある領域の観点が溜まり、別の専門知識が要ると分かった時点で独立させてください (例: ActivityPub は現在 `backend.md` の節)。
