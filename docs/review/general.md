# General review guidelines

すべての変更をレビューする人 (人間・AI) 向け。

[Review guidelines](README.md)

## Security

- Security
  	- Does merging this PR create a vulnerability?

## Performance

- Performance
  	- Will merging this PR cause unexpected performance degradation?
  	- Is there a more efficient way?

## Testing

- If you have added a feature or fixed a bug, please add a test case if possible. (出典: [CONTRIBUTING.md](../../CONTRIBUTING.md?plain=1#L65))
- Testing
  	- Does the test ensure the expected behavior?
  	- Are there any omissions or gaps?
  	- Does it check for anomalies?

## 静的解析で検出できる問題

- フォーマット違反、型エラー、SPDXヘッダーの記載漏れ等、静的解析で検出可能な問題は別Workflow（CI/CD）でチェックされます。指摘する場合も、CIの通過を確認するよう促す程度の軽い指摘（nitpick）にとどめてください。

## 命名

- Misskeyのドメイン固有の概念は`Mi`をprefixする
  例えばGoogleが自社サービスをMap、Earth、DriveではなくGoogle Map、Google Earth、Google Driveのように命名するのと同じ
  コード上でMisskeyのドメイン固有の概念には`Mi`をprefixすることで、他のドメインの同様の概念と区別できるほか、名前の衝突を防ぐ。
  ただし、文脈上Misskeyのものを指すことが明らかであり、名前の衝突の恐れがない場合は、一時的なローカル変数に限って`Mi`を省略してもよい。
  (出典: [coding-guidelines.md](../contributing/coding-guidelines.md?plain=1#L7-L10))
- 命名規則

  本来それが略称であっても、通常それでひとつのワードとして用いられるものは、略称として扱わない。

  ### 例: IP address

  Good: `ipAddress` / `IpAddress`

  Bad: `IPAddress`

  ### 例: User ID

  Good: `userId` / `UserId`

  Bad: `userID` / `UserID`

  ### 例: XMLなHTTPのRequest

  Good: `xmlHttpRequest` / `XmlHttpRequest`

  Bad: `XMLHttpRequest` / `XMLHTTPRequest`
  (出典: [coding-guidelines.md](../contributing/coding-guidelines.md?plain=1#L15-L35))
- indexというファイル名を使うな
  ESMではディレクトリインポートは廃止されているのと、ディレクトリインポートせずともファイル名が index だと何故か一部のライブラリ？でディレクトリインポートだと見做されてエラーになる
  (出典: [coding-guidelines.md](../contributing/coding-guidelines.md?plain=1#L99-L100))

## 実装方針

- ビジネスロジックの不備、セキュリティ、パフォーマンス、設計パターンの適切性などに焦点を当ててレビューしてください。
- JSONのimportに気を付けよう
  TypeScriptでjsonをimportすると、tscでコンパイルするときにそのjsonファイルも一緒にdistディレクトリに吐き出されてしまう。この挙動により、意図せずファイルの書き換えが発生することがあるので、jsonをimportするときは書き換えられても良いものかどうか確認すること。書き換えされて欲しくない場合は、importで読み込むのではなく、`fs.readFileSync`などの関数を使って読み込むようにすればよい。
  (出典: [coding-guidelines.md](../contributing/coding-guidelines.md?plain=1#L12-L13))
- 関数化の基準

  汎用性が低く(例えばそれを関数化したとしてもその呼び出しが元の場所一か所しか存在しない)、内容も短い処理(例えば10行以下)は、かえって読みにくくなるため、関数化しない。

  また、関数化する場合でも、呼び出しがある特定のスコープに限られる場合は、そのスコープ内に閉じ込めた方が分かりやすく簡潔になる場合がある(ただし本来その処理に不要であっても、構造上親のスコープにある関係のない変数や引数にもアクセスできるようになるため、必ずしもそうすれば設計上綺麗になるというわけでもない。状況に応じて判断すべし)。
  (出典: [coding-guidelines.md](../contributing/coding-guidelines.md?plain=1#L37-L41))
- DRYに囚われるな
  必要なのは一般化ではなく抽象化と考えます。
  盲信せず、誤った・不必要な共通化は避け、それが自然だと感じる場合は重複させる勇気を持ちましょう。
  (出典: [coding-guidelines.md](../contributing/coding-guidelines.md?plain=1#L103-L105))
- Misskeyを複雑にしない実装
  それがいくら複雑であっても、Misskey固有のコンテキストと関心が分離されている(もしくは事実上分離されていると見做すことができる)実装であれば、それはMisskeyのコードベースに対する複雑性に影響を与えないと考えます。

  例えるなら、VueやAiScriptといったMisskeyが使用しているライブラリの内部実装がいくら複雑だったとしても、「それを使用しているからMisskeyの実装は複雑である」ということにはならないのと同じです。

  Misskeyのドメイン知識から関心が分離されているということは、Misskeyの実装について考える時にそれらの内部実装を考慮する必要が無く、認知負荷を増やさないからです。

  また重要な点は、その実装が、Misskeyリポジトリの外部にあるか・内部にあるかということや、Misskeyがメンテナンスするものか・第三者がメンテナンスするものかといったことは複雑性を考える上ではほとんど無視できるという点です。

  もちろんその実装がMisskeyリポジトリにあり、Misskeyがメンテナンスしなければならないものは、保守のコストはかかります。
  しかし、Misskeyの本質的な設計・実装という観点で見たときは、その実装は実質的に外部ライブラリのように振る舞います。
  換言すれば「たまたまMisskeyの開発者と同じ人たちがメンテナンスしているし、たまたまMisskeyのリポジトリ内に置いてあるだけの外部ライブラリ」です。

  そのため、実装をなるべくMisskeyのドメイン知識から独立したものにすれば、Misskeyのコードベースの複雑性を上げることなく機能実装を行うことができ、お得であると言えます。
  もちろんそれにこだわって、些細な実装でもそのように分離してしまうとかえって認知負荷が増えたり、実装量が増えてメリットをデメリットが上回る場合もあるので、ケースバイケースではあります。
  (出典: [coding-guidelines.md](../contributing/coding-guidelines.md?plain=1#L107-L121))
- AIに誤解されにくいコードを書こう

  AI(LLM)によるレビューやコーディング補助時にハルシネーションのもとになるので、AIが誤解・混乱しそうなコードは避けるかコメントを残そう。

  AIにとって分かりやすいコードは、結果的に人間にとっても分かりやすいコードに繋がります。
  (出典: [coding-guidelines.md](../contributing/coding-guidelines.md?plain=1#L123-L127))

## AGENTS.md の禁止事項

絶対にやってはいけない事は [AGENTS.md](../../AGENTS.md#絶対にやってはいけない事) を参照。
