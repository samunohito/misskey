# General review guidelines

すべての変更をレビューする人 (人間・AI) 向け。

[Review guidelines](README.md)

ビジネスロジックの不備、セキュリティ、パフォーマンス、設計パターンの適切性を重点的に確認する。

## Security

- **[Critical]** マージによって脆弱性 (認可・権限チェックの漏れ、入力検証の漏れ、情報漏えいなど) が生じないか。

## Performance

- **[Major]** 想定外の性能劣化 (不要なクエリやループ内の重い処理など) を招かないか。より効率的な方法が無いか。

## Testing

- **[Major]** 機能追加・バグ修正に、可能な範囲でテストケースが追加されているか。 → [CONTRIBUTING.md](../../CONTRIBUTING.md#creating-a-pr)
- **[Major]** テストが期待する挙動を保証しているか。漏れや抜けが無いか、異常系も確認しているか。

## 静的解析で検出できる問題

- **[Minor]** フォーマット違反・型エラー・SPDX ヘッダーの記載漏れなど静的解析で検出できる問題は CI (別 Workflow) で確認される。指摘する場合も、CI の通過確認を促す程度の軽い指摘にとどめる。ほかの項目で重大度が付いているもの (例: API の `kind` の欠落) はその重大度に従う。

## 命名

- **[Minor]** Misskey のドメイン固有の概念に `Mi` を prefix しているか (文脈上 Misskey のものと明らかで衝突の恐れが無い、一時的なローカル変数に限り省略可)。 → [coding-guidelines.md](../contributing/coding-guidelines.md)
- **[Minor]** 通常ひとつの単語として使う略語を、略語として大文字で書いていないか (`ipAddress` / `userId` / `xmlHttpRequest` が正。`IPAddress` / `userID` / `XMLHttpRequest` は誤り)。 → [coding-guidelines.md](../contributing/coding-guidelines.md)
- **[Major]** `index` というファイル名を使っていないか (ESM ではディレクトリインポートが廃止されており、一部のライブラリでディレクトリインポートとみなされてエラーになる)。 → [coding-guidelines.md](../contributing/coding-guidelines.md)

## 実装方針

- **[Major]** 書き換えられては困る JSON を TypeScript の `import` で読み込んでいないか (tsc が JSON も dist に出力し、意図しない書き換えの原因になる。`fs.readFileSync` などで読む)。 → [coding-guidelines.md](../contributing/coding-guidelines.md)
- **[Minor]** 呼び出しが 1 か所しかない短い処理 (目安 10 行以下) を関数化していないか。関数化する場合も、呼び出しが特定のスコープに限られるならそのスコープ内に閉じ込めているか。 → [coding-guidelines.md](../contributing/coding-guidelines.md)
- **[Minor]** 誤った・不必要な共通化をしていないか (DRY に囚われず、自然であれば重複を許容する)。 → [coding-guidelines.md](../contributing/coding-guidelines.md)
- **[Minor]** 複雑な実装を加える場合、Misskey のドメイン知識から関心が分離されているか (分離されていれば Misskey のコードベースの複雑性を上げない)。 → [coding-guidelines.md](../contributing/coding-guidelines.md)
- **[Minor]** AI (LLM) が誤解・混乱しそうなコードを避けているか。避けられない場合はコメントを残しているか。 → [coding-guidelines.md](../contributing/coding-guidelines.md)

## AGENTS.md の禁止事項

絶対にやってはいけない事は [AGENTS.md](../../AGENTS.md#絶対にやってはいけない事) を参照。
