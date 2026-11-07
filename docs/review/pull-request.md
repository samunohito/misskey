# Pull request review guidelines

PR 全体 (タイトル・説明文・変更範囲) をレビューする人 (人間・AI) 向け。差分だけを見るレビューでは、PR のタイトルや説明文が前提の項目は適用できない。

[Review guidelines](README.md)

## Scope

- **[Major]** PR の目的が明確か (タイトルと説明文から何をする PR か分かるか)。
- **[Major]** タイトル・説明文に照らして、目的の異なる変更やスコープ外の変更が含まれていないか。含まれていれば、その部分を別 PR に分けるよう求める。 → [CONTRIBUTING.md](../../CONTRIBUTING.md#creating-a-pr)
- **[Minor]** PR で変更していない部分に修正すべき点を見つけても、この PR では直させない (別 PR で扱えばよいと伝える)。ただし、この PR の行の追加・削除によって起こりうる問題は、この PR で直させる。

**指摘しないこと:**

- スコープ外かどうか判断に迷う変更。明らかにスコープ外と確信できるもの (全く関係ないファイルの編集など) だけを指摘する

## PR の作り方

- **[Minor]** この PR で解決する Issue があれば、本文で参照しているか。 → [CONTRIBUTING.md](../../CONTRIBUTING.md#creating-a-pr)
- **[Minor]** この変更に伴って作成・更新が必要なドキュメントが漏れていないか。 → [CONTRIBUTING.md](../../CONTRIBUTING.md#creating-a-pr)
- **[Minor]** UI の変更を含む場合、本文にスクリーンショットが添付されているか。 → [CONTRIBUTING.md](../../CONTRIBUTING.md#creating-a-pr)
