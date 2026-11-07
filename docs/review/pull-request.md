# Pull request review guidelines

PR 全体 (タイトル・説明文・変更範囲) をレビューする人 (人間・AI) 向け。差分だけを見るレビューでは、PR のタイトルや説明文が前提の項目は適用できない。

[Review guidelines](README.md)

## Scope

- Also, make sure that the granularity of this PR is appropriate. Please do not include more than one type of change or interest in a single PR. (出典: [CONTRIBUTING.md](../../CONTRIBUTING.md?plain=1#L61))
- Scope
  	- Are the goals of the PR clear?
  	- Is the granularity of the PR appropriate?

## スコープ外

- プルリクエストで変更されていない部分において、プルリクエストのタイトルや説明文に照らしてスコープ外であるが修正すべき点を見つけた場合は、このプルリクエストで修正させるのではなく、別のプルリクエストを開いてそれを修正するように指示してください。\
  なお、当該プルリクエストで行が追加/削除されたことによりスコープ外の問題が起こりうる場合は、例外的にこのプルリクエストで修正させてください。
- プルリクエストのタイトルや説明文に照らしてスコープ外の変更が含まれていないかをレビューしてください。なお、明らかにスコープ外であると確信できるもの（例: 全く関係ないファイルを編集している等）のみを対象とし、スコープ外かどうかの判断に困る場合は指摘しないでください。\
  スコープ外の変更が含まれていた場合は指摘し、その部分について、このプルリクエストに含めずに別のプルリクエストを開いて変更するように指示してください。

## PR の作り方

- If possible, prefix the title with a keyword that identifies the type of this PR, as shown below.
  	- `fix` / `refactor` / `feat` / `enhance` / `perf` / `chore` etc
  (出典: [CONTRIBUTING.md](../../CONTRIBUTING.md?plain=1#L59-L60))
- If there is an Issue which will be resolved by this PR, please include a reference to the Issue in the text. (出典: [CONTRIBUTING.md](../../CONTRIBUTING.md?plain=1#L62))
- Check if there are any documents that need to be created or updated due to this change. (出典: [CONTRIBUTING.md](../../CONTRIBUTING.md?plain=1#L64))
- Please make sure that tests and Lint are passed in advance. (出典: [CONTRIBUTING.md](../../CONTRIBUTING.md?plain=1#L66))
- If this PR includes UI changes, please attach a screenshot in the text. (出典: [CONTRIBUTING.md](../../CONTRIBUTING.md?plain=1#L68))
