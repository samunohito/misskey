# Third-Party Licenses (`.claude/`)

`.claude/` 配下に取り込まれているサードパーティ由来コンポーネントのライセンス・出典情報をまとめる。Misskey 本体は AGPL-3.0-only だが、本ディレクトリ内には MIT ライセンスのファイルが含まれている。各ファイル冒頭にも `SPDX-License-Identifier` と出典コメントを併記している。

最終更新: 2026-05-10

---

## 1. everything-claude-code (ECC)

- 上流リポジトリ: <https://github.com/affaan-m/everything-claude-code>
- 取り込んだバージョン: v2.0.0-rc.1
- ライセンス: **MIT**
- Copyright: Copyright (c) 2026 Affaan Mustafa

### 取り込んだファイル

| `.claude/` 内のパス | 上流パス | 上流 frontmatter `origin` | Misskey での改変 |
|---|---|---|---|
| `skills/token-budget-advisor/SKILL.md` | `skills/token-budget-advisor/SKILL.md` | community (orig: [Xabilimon1/Token-Budget-Advisor-Claude-Code-](https://github.com/Xabilimon1/Token-Budget-Advisor-Claude-Code-)) | description を日本語化、本文は実質そのまま |
| `skills/context-budget/SKILL.md` | `skills/context-budget/SKILL.md` | ECC | description を日本語化、Misskey 固有メモを追記 |
| `skills/verification-loop/SKILL.md` | `skills/verification-loop/SKILL.md` | ECC | description を日本語化、検証コマンドを Misskey の `pnpm` スクリプトへ置換 |
| `skills/click-path-audit/SKILL.md` | `skills/click-path-audit/SKILL.md` | community | description を日本語化、React+Zustand 例を Vue 3 + Pizzax store / refs / EventEmitter 文脈に書き換え (Misskey は Pinia を使わない) |
| `commands/harness-audit.md` | `commands/harness-audit.md` | ECC | scripts 依存の自動採点を、Claude が `pnpm`/`git`/`grep` で手動採点する版に書き換え。Misskey 固有の評価軸 (SPDX / endpoint-list / migration / locales) を組み込み |
| `commands/quality-gate.md` | `commands/quality-gate.md` | ECC | 言語自動判定を排除し Misskey 固定 pipeline (`pnpm` + tsgo + ESLint + Vitest) に。Prettier/Biome フェーズを削除 |
| `commands/learn-eval.md` | `commands/learn-eval.md` | ECC | Misskey の skill 命名規則・SPDX 規約に関する補足を追加 |

### MIT License (full text)

```
MIT License

Copyright (c) 2026 Affaan Mustafa

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

### 上流 LICENSE ファイル

<https://github.com/affaan-m/everything-claude-code/blob/main/LICENSE>

---

## 2. AGPL コードベースとの互換性

Misskey 本体は **AGPL-3.0-only** で配布されているが、`.claude/` 配下の MIT ライセンスファイルはそのまま MIT として残している。

- MIT は permissive ライセンスで、AGPL を含む copyleft ライセンスのプロジェクトに **取り込み・再配布が許される**
- MIT が要求する条件 (copyright notice + license text の保持) を本ファイル + 各ファイル冒頭の SPDX/出典コメントで満たしている
- Misskey 全体の配布物としては AGPL-3.0-only で扱われるが、`.claude/` 配下の MIT ファイルは個別に MIT として識別可能

`.ts` / `.js` / `.vue` / `.scss` の SPDX 義務化 ([AGENTS.md §1](../AGENTS.md#1-spdx-ヘッダー必須)) は Misskey 本体コード向けで、`.claude/` 配下の `.md` / `.sh` には適用されない。

---

## 3. 新規追加時の手順

`.claude/` に新たにサードパーティ由来のファイルを取り込む際は:

1. ライセンスを確認 (互換性: MIT / Apache-2.0 / BSD は OK、GPL/AGPL は要相談)
2. 各ファイル冒頭に SPDX ヘッダ + 出典コメントを追加
3. 本ファイル §1 のテーブルに 1 行追記
4. 必要なら新しいセクションでライセンス全文を同梱
5. AGENTS.md からの参照を確認 (現状の [AGENTS.md §ツール固有の補助ファイル](../AGENTS.md) で `THIRD_PARTY_LICENSES.md` を案内済。CLAUDE.md は `@AGENTS.md` 経由で読み込むので個別の追記は不要)
