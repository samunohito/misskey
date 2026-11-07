# Pull request review guidelines

PR 全体 (タイトル・説明文・変更範囲) をレビューする人 (人間・AI) 向け。差分だけを見るレビューでは、PR のタイトルや説明文が前提の項目は適用できない。

[Review guidelines](README.md)

## Scope

- **[Major]** PR の目的が明確か (タイトルと説明文から何をする PR か分かるか)。
- **[Major]** PR の粒度が適切か。1 つの PR に複数の種類の変更や関心事を混ぜていないか。 → [CONTRIBUTING.md](../../CONTRIBUTING.md#creating-a-pr)

## スコープ外

- **[Major]** タイトル・説明文に照らしてスコープ外の変更が含まれていないか。含まれていれば、その部分を別 PR に分けるよう求める。
- **[Minor]** PR で変更していない部分に、スコープ外だが修正すべき点を見つけた場合は、この PR で直させず別 PR を開くよう求める。ただし、この PR の行の追加・削除によってスコープ外の問題が起こりうる場合は、この PR で直させる。

**指摘しないこと:**

- スコープ外かどうか判断に迷う変更 (明らかにスコープ外と確信できるもの、例えば全く関係ないファイルの編集だけを対象にする)

## PR の作り方

- **[Minor]** タイトルに種類を表す prefix (`fix` / `refactor` / `feat` / `enhance` / `perf` / `chore` など) が付いているか (可能な範囲で)。 → [CONTRIBUTING.md](../../CONTRIBUTING.md#creating-a-pr)
- **[Minor]** この PR で解決する Issue があれば、本文で参照しているか。 → [CONTRIBUTING.md](../../CONTRIBUTING.md#creating-a-pr)
- **[Minor]** この変更に伴って作成・更新が必要なドキュメントが漏れていないか。 → [CONTRIBUTING.md](../../CONTRIBUTING.md#creating-a-pr)
- **[Minor]** テストと Lint を事前に通しているか。 → [CONTRIBUTING.md](../../CONTRIBUTING.md#creating-a-pr)
- **[Minor]** UI の変更を含む場合、本文にスクリーンショットが添付されているか。 → [CONTRIBUTING.md](../../CONTRIBUTING.md#creating-a-pr)
