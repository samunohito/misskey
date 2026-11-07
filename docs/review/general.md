# General review guidelines

すべての変更をレビューする人 (人間・AI) 向け。

[Review guidelines](README.md)

ビジネスロジックの不備、セキュリティ、パフォーマンス、設計パターンの適切性を重点的に確認する。

## Security

- **[Critical]** マージによって脆弱性 (認可・権限チェックの漏れ、入力検証の漏れ、情報漏えいなど) が生じないか。

## Performance

- **[Major]** 想定外の性能劣化 (不要なクエリやループ内の重い処理など) を招かないか。

## Testing

- **[Major]** 機能追加・バグ修正に、可能な範囲でテストケースが追加されているか。 → [CONTRIBUTING.md](../../CONTRIBUTING.md#creating-a-pr)
- **[Major]** テストが期待する挙動を保証しているか。漏れや抜けが無いか、異常系も確認しているか。

## 静的解析で検出できる問題

- **[Minor]** フォーマット違反・型エラー・SPDX ヘッダーの記載漏れなど静的解析で検出できる問題は、CI の Workflow が検出する。lint / typecheck の job は失敗しても PR を止めない (`continue-on-error`) ので、失敗していれば CI の結果を確認するよう軽く促す程度にとどめ、個々の違反を逐一指摘しない。ほかの項目で重大度が付いているものはその重大度に従う。

## 命名

- **[Minor]** Misskey のドメイン固有の概念に `Mi` を prefix しているか (文脈上 Misskey のものと明らかで衝突の恐れが無い、一時的なローカル変数に限り省略可)。 → [coding-guidelines.md](../contributing/coding-guidelines.md)
- **[Minor]** 通常ひとつの単語として使う略語を、略語として大文字で書いていないか (`ipAddress` / `userId` / `xmlHttpRequest` が正。`IPAddress` / `userID` / `XMLHttpRequest` は誤り)。 → [coding-guidelines.md](../contributing/coding-guidelines.md)
- **[Major]** 新規ファイルに `index` というファイル名を使っていないか (ESM ではディレクトリインポートが廃止されており、一部のライブラリでディレクトリインポートとみなされてエラーになる)。 → [coding-guidelines.md](../contributing/coding-guidelines.md)

**指摘しないこと:**

- パッケージの公開エントリ (`packages/*/src/index.ts`)、既存の barrel (`components/index.ts` / `directives/index.ts` / `widgets/index.ts`)、ページの `pages/**/index.vue` という名前

## 実装方針

- **[Major]** 書き換えられては困る JSON を TypeScript の `import` で読み込んでいないか (tsc が JSON も dist に出力し、意図しない書き換えの原因になる。`fs.readFileSync` などで読む)。 → [coding-guidelines.md](../contributing/coding-guidelines.md)
- **[Minor]** 共通化や抽象化が、具体的な保守上の支障 (無関係な処理どうしの結合、Misskey 固有の知識と汎用処理の混在による複雑化など) を生んでいないか。自然な重複は許容する。 → [coding-guidelines.md](../contributing/coding-guidelines.md)

## AGENTS.md の禁止事項

絶対にやってはいけない事は [AGENTS.md](../../AGENTS.md#絶対にやってはいけない事) を参照。
