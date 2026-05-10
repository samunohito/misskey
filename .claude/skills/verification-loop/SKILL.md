---
name: verification-loop
description: 機能完了前 / PR 作成前に build → typecheck → lint → test → security → diff の段階ゲートを順に走らせ、各 phase で失敗したら停止して修正させる。"verification-loop 回して"、"PR 作成前にゲート"、"verify"、"完了前確認"、"PR 出す前にチェック" 等で起動する。Misskey の pnpm スクリプトに合わせて実装してある。
---

<!--
SPDX-License-Identifier: MIT
SPDX-FileCopyrightText: 2026 Affaan Mustafa and everything-claude-code contributors

出典 (upstream): https://github.com/affaan-m/everything-claude-code (v2.0.0-rc.1)
upstream path: skills/verification-loop/SKILL.md
upstream origin frontmatter: ECC
upstream license: MIT — https://github.com/affaan-m/everything-claude-code/blob/main/LICENSE
project-level notice: see .claude/THIRD_PARTY_LICENSES.md (Misskey 内サードパーティ一覧 + MIT 全文)

Imported into Misskey .claude/ on 2026-05-10 as a standalone copy (no dependency on the ECC plugin runtime). description was rewritten in Japanese and the verification commands were replaced with Misskey-specific pnpm scripts; body content (phase-gate flow / report format) remains MIT-licensed in spirit.

note: 元 ECC 版は npm 系コマンドを推奨していたが、Misskey の必須コマンド (`pnpm lint` / `pnpm --filter backend test` 等) に置換済。根拠は `AGENTS.md` の §必須コマンド。Misskey は Prettier / Biome を採用していないため、formatter フェーズは廃止し ESLint --fix の都度実行 (`pnpm exec eslint --fix <path>`) に集約した。共有 `.claude/settings.json` に Stop hook は登録していない (Claude が触っていないファイルまで再整形する副作用を避けるため。個人 opt-in レシピは本ファイル §「Hook との関係」を参照)。
-->

# Verification Loop Skill

Misskey の機能完了前 / PR 作成前に走らせる包括的な検証ループ。

## 使う場面

- 機能や大きなコード変更を完了した直後
- PR を作る前
- リファクタ完了後
- 「ちゃんと動いてる？」を確実にしたい時

## Verification Phases

各フェーズは Misskey 既定の pnpm スクリプトを使う。正典は [AGENTS.md §必須コマンド](../../../AGENTS.md#必須コマンド) を参照。

> **パイプの注意**: `| tail -N` は全入力を読み終わってから出力するため SIGPIPE を起こさず安全。一方 `| head -N` は N 行読んだ時点で終了するため、左側コマンドが SIGPIPE で非ゼロ終了し、`set -o pipefail` 有効時に成功していてもゲートが FAIL と誤認される。**Phase 2 は `| head` を使わず全出力を流す**。出力量が心配な場合はパイプを外して `pnpm <cmd>; echo "exit=$?"` で終了コードだけ確認する。

### Phase 1: Build

```bash
pnpm build 2>&1 | tail -30
```

build が落ちたら **STOP**。修正してから次へ。

### Phase 2: Type Check

backend は tsgo 経由:

```bash
pnpm --filter backend typecheck 2>&1
```

frontend は vue-tsc (Vue SFC の型まで含めて検査):

```bash
pnpm --filter frontend typecheck 2>&1
```

critical な型エラーは先に潰す。

### Phase 3: Lint

全パッケージ横断 (ルートの `lint` スクリプトは `pnpm --no-bail -r lint` を呼ぶので、最初の失敗で止まらず全パッケージの結果を集める):

```bash
pnpm lint 2>&1 | tail -50
```

個別ファイル fix が必要なら:

```bash
pnpm exec eslint --fix <path>
```

(共有 `.claude/settings.json` には Stop hook を登録していないため、自動の eslint --fix はかからない。本フェーズで残った警告・エラーは手動で潰す。個人で Stop hook を有効にしたい場合は本ファイル末尾の「Hook との関係」を参照。)

### Phase 4: Tests

変更スコープに応じて実行する:

| 変更箇所                     | コマンド                                                                  |
|------------------------------|---------------------------------------------------------------------------|
| `packages/backend` (純粋ロジック) | `pnpm --filter backend test`                                              |
| `packages/backend` (API endpoint, DB) | `pnpm --filter backend test:e2e`                                          |
| `packages/backend` (連合 / ActivityPub) | `pnpm --filter backend test:fed`                                          |
| `packages/frontend`          | `pnpm --filter frontend test`                                             |
| 全体スモーク                 | `pnpm e2e` (Cypress, 要 `start:test` セットアップ)                        |

> **backend `test` / `test:e2e` / `test:fed` の前提**: `.config/test.yml` が存在しない状態だと `loadConfig()` が失敗する。事前に `ncp .github/misskey/test.yml .config/test.yml` (または `cp .github/misskey/test.yml .config/test.yml`) を実行しておくこと。`pnpm --filter backend test:e2e` は内部で `cross-env NODE_ENV=test pnpm compile-config` を呼ぶため、コピー済みであれば追加の compile-config 実行は不要。詳細は [.claude/docs/testing.md](../../docs/testing.md) を参照。

レポート:
- Total / Passed / Failed
- Coverage は導入されている場合のみ

### Phase 5: misskey-js 再生成 (API 変更時のみ)

backend の API endpoint / paramDef / res を触ったら必須:

```bash
pnpm build-misskey-js-with-types
git diff --stat packages/misskey-js/src/autogen/
```

`packages/misskey-js/src/autogen/` の差分が出たら commit に含める。

### Phase 6: Migration 検査 (entity / migration を触った時のみ)

```bash
pnpm --filter backend check-migrations
```

これは TypeORM の schema builder で **pending DDL を検出** する検査 ([scripts/check_migrations_clean.js](../../../packages/backend/scripts/check_migrations_clean.js))。エンティティの `@Column` / `@Entity` 変更が migration に取り込まれていないと非ゼロ終了する。失敗時は **STOP** し、エンティティ修正と migration の整合を取り直す。

### Phase 7: Security Scan

最低限のチェック:

```bash
# 秘密値らしき文字列が混入していないか
git diff HEAD --name-only -z | xargs -0 grep -nE 'sk-[A-Za-z0-9]{20,}|api[_-]?key\s*=' 2>/dev/null | head -10 || true

# console.log の混入
git diff HEAD --name-only -z | xargs -0 grep -nE 'console\.(log|debug|warn|error)' 2>/dev/null | head -20 || true
```

> `|| true` は `set -o pipefail` 環境で `head` が先に終了したとき SIGPIPE 由来の非ゼロ終了でゲートが誤 FAIL になるのを防ぐためのもの。

### Phase 8: SPDX ヘッダー確認 (新規 .ts/.js/.cjs/.mjs/.vue/.scss/.html を作った時のみ)

[AGENTS.md §1 SPDX ヘッダー必須](../../../AGENTS.md#1-spdx-ヘッダー必須) の規約通り、新規ファイルに SPDX が入っているかを確認する。検査対象は **「ブランチ起点 (= `develop`) との差分で追加された全ファイル + 未コミットの追加 + 未追跡の新規」**。`git diff --diff-filter=A HEAD` だけだとブランチ上で既にコミット済の新規ファイルや untracked ファイルを取りこぼすので、3 経路を合算する。

また AGPL ヘッダーが必須なのは [check-spdx-license-id.yml の対象ディレクトリ](../../../.github/workflows/check-spdx-license-id.yml) に限られる。`packages/misskey-js/` 配下は **MIT サブパッケージ**なので AGPL チェックから除外する (AGENTS.md §1 で明示)。`*.config.{ts,js,cjs,mjs}` と `*eslint*` も CI 側で除外されているので除く。

```bash
# ブランチ起点 (develop) からの追加 + working tree の追加 + 未追跡を合算
BASE_REF="${BASE_REF:-develop}"
{
  git diff --name-only --diff-filter=A "$BASE_REF...HEAD"
  git diff --name-only --diff-filter=A HEAD
  git ls-files --others --exclude-standard
} | sort -u | while IFS= read -r f; do
  [ -z "$f" ] && continue
  # MIT サブパッケージは対象外
  case "$f" in
    packages/misskey-js/*) continue ;;
    *.config.ts|*.config.js|*.config.cjs|*.config.mjs) continue ;;
    *eslint*) continue ;;
  esac
  case "$f" in
    *.ts|*.js|*.cjs|*.mjs|*.scss|*.vue|*.html)
      head -6 "$f" | grep -q "SPDX-License-Identifier: AGPL-3.0-only" \
        || echo "MISSING SPDX: $f"
      ;;
  esac
done
```

> 完全な対象判定は CI 側 ([.github/workflows/check-spdx-license-id.yml](../../../.github/workflows/check-spdx-license-id.yml) の `directories` 配列) が正典。上記スクリプトは取りこぼしを減らすための事前ローカルチェックで、最終判断は CI に委ねる。

### Phase 9: CHANGELOG (ユーザー影響変更のみ)

[AGENTS.md §CHANGELOG](../../../AGENTS.md#changelog) の規約に従い、`## Unreleased` 配下の `### General` / `### Client` / `### Server` のいずれかに 1 行追加されているか:

```bash
grep -A 30 '^## Unreleased' CHANGELOG.md | head -40
```

リファクタリング等の内部変更は不要。

### Phase 10: Diff Review

```bash
git diff --stat HEAD
git diff HEAD --name-only
```

変更ファイル一覧を見て:
- 意図しない変更が混入していないか
- error handling 抜けがないか
- edge case の取りこぼしがないか

## Output Format

全フェーズ実行後、レポートを出す:

```
VERIFICATION REPORT (Misskey)
==================

Build:        [PASS/FAIL]
Typecheck:    [PASS/FAIL]   backend: X errors / frontend: Y errors
Lint:         [PASS/FAIL]   X warnings
Tests:        [PASS/FAIL]   backend: X/Y passed, frontend: A/B passed
misskey-js:   [PASS/SKIP]   (API 未変更なら SKIP) — autogen diff 行数: N
Migration:    [PASS/SKIP]   (entity 未変更なら SKIP)
Security:     [PASS/FAIL]   secrets: 0, console.log: X
SPDX:         [PASS/FAIL]   missing: X files (新規ファイル時のみ)
CHANGELOG:    [PASS/SKIP]   (内部変更なら SKIP)
Diff:         [N files changed, +X / -Y lines]

Overall:      [READY / NOT READY] for PR

Issues to Fix:
1. ...
2. ...
```

## Continuous Mode (長セッション向け)

長セッションでは:
- 関数 1 個完了ごと
- コンポーネント 1 個完了ごと
- 次タスクへ移る前

に適宜 verification-loop を打つ。

## Hook との関係

共有 `.claude/settings.json` には現状 Stop hook を **登録していない** (旧版にあった eslint --fix Stop hook は、Claude が触っていないファイルまで自動整形する副作用が共有設定としては大きいため除去した)。したがって本 skill が走る時点では未整形の差分が残っている可能性がある — Phase 3 (Lint) で検出されたものはその場で `pnpm exec eslint --fix <path>` を都度叩いて潰す。

### (個人) Stop hook で eslint --fix を自動実行するレシピ

セッション終了時に **HEAD 差分・未追跡を含む全変更 `*.ts` / `*.tsx` / `*.vue` / `*.js` / `*.cjs` / `*.mjs` に対して `pnpm exec eslint --fix` を無音実行** したい場合、以下を `.claude/settings.local.json` (gitignore 済み) に貼る:

```json
{
  "hooks": {
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "cd \"$CLAUDE_PROJECT_DIR\" && { for f in $({ git diff --name-only HEAD; git ls-files --others --exclude-standard; } 2>/dev/null); do case \"$f\" in *.ts|*.tsx|*.vue|*.js|*.cjs|*.mjs) echo \"$f\";; esac; done; } | xargs -r pnpm exec eslint --fix >/dev/null 2>&1 || true",
            "timeout": 120
          }
        ]
      }
    ]
  }
}
```

> 注意: このフックは Claude が編集していないファイルにも影響する。並行編集中のファイルが書き換えられるリスクを許容できる人だけ入れること。明示的に lint だけ走らせたい時は `/quality-gate` か `pnpm exec eslint --fix <path>` を都度叩く方が安全。
