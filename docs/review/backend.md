# Backend review guidelines

バックエンド (`packages/backend/**`) の変更をレビューする人 (人間・AI) 向け。SQL / TypeORM / migration に触れる変更は [database.md](database.md) も読むこと。

[Review guidelines](README.md)

## API エンドポイント

### meta

- **[Major]** `tags` に機能領域を表す OpenAPI タグが設定されている (OpenAPI に反映されるのは `tags[0]` のみ)。 → [api-meta-paramdef.md](../../.claude/skills/working-on-backend/references/knowledge/api-meta-paramdef.md)
- **[Major]** 新規エンドポイントでは `requireCredential` が boolean で明示されている (省略時は `false` = 未ログインでも呼べる)。 → [api-meta-paramdef.md](../../.claude/skills/working-on-backend/references/knowledge/api-meta-paramdef.md)
- **[Major]** `requireCredential` / `requireModerator` / `requireAdmin` のいずれかが `true` なら、操作内容に合う OAuth scope (`read:*` / `write:*`、管理系は `read:admin:*` / `write:admin:*`) が `kind` に設定されている。書き込み操作に `read:*` を付けていない。 → [api-meta-paramdef.md](../../.claude/skills/working-on-backend/references/knowledge/api-meta-paramdef.md)
- **[Major]** 新しい OAuth scope を `kind` に使う場合、`packages/misskey-js/src/consts.ts` の `permissions` 配列にも追加されている (backend の `kind` 型はこの配列から作られる)。 → [api-meta-paramdef.md](../../.claude/skills/working-on-backend/references/knowledge/api-meta-paramdef.md)
- **[Major]** モデレーター / 管理者だけが使うべき操作に `requireModerator` / `requireAdmin` が付いている。 → [api-meta-paramdef.md](../../.claude/skills/working-on-backend/references/knowledge/api-meta-paramdef.md)
- **[Major]** `requiredRolePolicy` を使うエンドポイントで、匿名で使わせない API には `requireCredential: true` も付いている。未ログイン時は `ApiCallService` が既定ポリシー (`getUserPolicies(null)`) で判定し、許可されなければ `ROLE_PERMISSION_DENIED` を返す。 → [api-meta-paramdef.md](../../.claude/skills/working-on-backend/references/knowledge/api-meta-paramdef.md)
- **[Major]** 書き込み系エンドポイントでは、アカウント移行済みユーザーを拒否する `prohibitMoved` の要否が検討されている。 → [api-meta-paramdef.md](../../.claude/skills/working-on-backend/references/knowledge/api-meta-paramdef.md)
- **[Major]** 書き込み系・処理コストの高いエンドポイントに `limit` (レート制限) があり、`duration` と `max` がセットで指定されている。 → [api-meta-paramdef.md](../../.claude/skills/working-on-backend/references/knowledge/api-meta-paramdef.md)
- **[Major]** `allowGet` は冪等な読み取り系だけ、`secure` は Misskey 本体フロントエンド専用 (OAuth トークンで呼ばせない) の API だけに付いている。`cacheSec` / `description` / `requireFile` も用途に合っている。 → [api-meta-paramdef.md](../../.claude/skills/working-on-backend/references/knowledge/api-meta-paramdef.md)

**指摘しないこと:**

- `secure: true` のエンドポイントで `kind` が無いこと (`secure: true` は型上 `kind` を要求しない別 variant。例: `auth/accept.ts`)
- 既存エンドポイントで `requireCredential` が省略されていること (変更範囲外)

### errors

- **[Critical]** `meta.errors` の各 `id` が UUID v4 形式で、リポジトリ内の他エンドポイントの `id` と重複していない。重複するとクライアントがエラーを取り違え、misskey-js の error 型も混線する。 → [api-meta-paramdef.md](../../.claude/skills/working-on-backend/references/knowledge/api-meta-paramdef.md)
- **[Major]** `meta.errors` の各要素に `message` / `code` / `id` が揃っている。 → [api-meta-paramdef.md](../../.claude/skills/working-on-backend/references/knowledge/api-meta-paramdef.md)
- **[Major]** クライアントに返す業務エラーは `meta.errors` に登録したうえで `throw new ApiError(meta.errors.<key>)` で投げている。`throw new Error(...)` だと 500 になり、未登録の `ApiError` はステータスこそ `kind` / `httpStatusCode` どおり (既定 400) だが misskey-js の error 型に出ない。 → [adding-api-endpoint.md](../../.claude/skills/working-on-backend/references/tasks/adding-api-endpoint.md)
- **[Major]** `catch` で想定外の例外まで `ApiError` に変換していない。知らない例外は再 throw (`throw err;`) して 500 + ログに残す (包むと未知のバグがクライアントエラーとして隠れる)。 → [adding-api-endpoint.md](../../.claude/skills/working-on-backend/references/tasks/adding-api-endpoint.md)
- **[Major]** `message` は英語で書かれている (backend に i18n 機構は無く、フロントエンドは `id` / `code` をキーに翻訳する)。 → [api-meta-paramdef.md](../../.claude/skills/working-on-backend/references/knowledge/api-meta-paramdef.md)
- **[Minor]** キーは camelCase (`noSuchNote`)、`code` は SCREAMING_SNAKE_CASE で、既存の接頭辞 `NO_SUCH_*` / `CANNOT_*` / `ALREADY_*` / `TOO_MANY_*` / `INVALID_*` / `*_REQUIRED` に揃っている。 → [api-meta-paramdef.md](../../.claude/skills/working-on-backend/references/knowledge/api-meta-paramdef.md)

**指摘しないこと:**

- 防御的アサーション・「起きるはずがない」内部不整合・テスト用 ENV ガードなど想定外のフェイルファストを `throw new Error('...')` で投げていること (例: `admin/reset-password.ts`)。`meta.errors` に対応の無い `throw new Error` を一律に指摘しない

### paramDef

- **[Major]** `paramDef` が `type: 'object'` / `properties` / `required` を持つ JSON Schema で、必須プロパティが `required` 配列に列挙されている。 → [api-meta-paramdef.md](../../.claude/skills/working-on-backend/references/knowledge/api-meta-paramdef.md)
- **[Major]** ID を受け取る文字列プロパティに `format: 'misskey:id'` が付いている。 → [api-meta-paramdef.md](../../.claude/skills/working-on-backend/references/knowledge/api-meta-paramdef.md)
- **[Major]** `meta` と `paramDef` に `as const` (または `as const satisfies Schema`) が付いている。無いと `Endpoint<typeof meta, typeof paramDef>` の推論が壊れ、`ps` が `any` になる。 → [api-meta-paramdef.md](../../.claude/skills/working-on-backend/references/knowledge/api-meta-paramdef.md)
- **[Critical]** ロールポリシー (例: `gtlAvailable`) をクライアントから受け取るパラメータにしていない。ポリシーは `exec` 内で `RoleService.getUserPolicies(me ? me.id : null)` で取得して判定する (パラメータにするとクライアントが制限を回避できる)。 → [api-meta-paramdef.md](../../.claude/skills/working-on-backend/references/knowledge/api-meta-paramdef.md)

### res

- **[Major]** 値を返すエンドポイントに `res` があり、JSON Schema または `ref: '<EntityName>'` で応答の形が定義されている。 → [api-meta-paramdef.md](../../.claude/skills/working-on-backend/references/knowledge/api-meta-paramdef.md)
- **[Major]** `res` のルート・各プロパティ・配列の `items` に `optional` / `nullable` が明示され、値が実際の応答の契約に合っている (常に `false` とは限らない。例: `User.host` は nullable)。省略や不一致は misskey-js の型を誤らせる。 → [api-meta-paramdef.md](../../.claude/skills/working-on-backend/references/knowledge/api-meta-paramdef.md)

### 実装

- **[Major]** エンドポイントは `@Injectable()` 付きの `export default class` で `Endpoint<typeof meta, typeof paramDef>` を継承し、default export 行に `// eslint-disable-line import/no-default-export` がある。 → [nestjs-di.md](../../.claude/skills/working-on-backend/references/knowledge/nestjs-di.md)
- **[Major]** `requireCredential` が `true` でないエンドポイントでは `me` が `null` になりうるので、`me.id` などの参照前に null チェックしている (`me!` で潰していない)。怠ると未ログインのリクエストで TypeError になる。 → [adding-api-endpoint.md](../../.claude/skills/working-on-backend/references/tasks/adding-api-endpoint.md)
- **[Major]** `requireFile: true` のエンドポイントは処理全体を `try { ... } finally { cleanup!(); }` で囲み、一時ファイルを解放している。基底クラス (`endpoint-base.ts`) が `cleanup` を呼ぶのはパラメータ検証 (AJV) 失敗時だけ。 → [adding-api-endpoint.md](../../.claude/skills/working-on-backend/references/tasks/adding-api-endpoint.md)
- **[Major]** 非同期処理の Promise を `await` / `return` しており、例外が呼び出し元へ伝わる (投げっぱなしで握りつぶしや unhandled rejection になっていない)。 → [adding-api-endpoint.md](../../.claude/skills/working-on-backend/references/tasks/adding-api-endpoint.md)

**指摘しないこと:**

- `exec` 内で同期的に `throw` していること
- `requireFile: true` のエンドポイントで `file` の null チェックが無いこと (基底クラスが確認済み)

### endpoint-list

- **[Critical]** 新規エンドポイントのファイルごとに、`packages/backend/src/server/api/endpoint-list.ts` に `export * as '<category>/<name>' from './endpoints/<category>/<name>.js';` の行が追加されている。エンドポイントは自動収集されないため、無いと 404 になる。 → [endpoint-list.md](../../.claude/skills/working-on-backend/references/knowledge/endpoint-list.md)
- **[Minor]** 変更と無関係に `endpoint-list.ts` の既存行を並べ替えていない (レビューコストが増えるだけ)。 → [endpoint-list.md](../../.claude/skills/working-on-backend/references/knowledge/endpoint-list.md)

**指摘しないこと:**

- `endpoint-list.ts` 内での追加位置・並び順 (ファイル全体がアルファベット順ではなく、同カテゴリ内でも追加順。カテゴリ末尾でも関連エンドポイントの近くでもよい)。判定するのは行が存在するかだけ

### misskey-js 再生成

- **[Critical]** `meta` / `paramDef` / `res` を変えた PR では `pnpm build-misskey-js-with-types` の生成結果 (`packages/misskey-js/src/autogen/`) がコミットされている。CI `check-misskey-js-autogen` は現在のコードから生成した結果とコミット済みの autogen を比較し、差分があると失敗する。 → [regenerate-misskey-js.md](../../.claude/skills/shipping-misskey-change/references/tasks/regenerate-misskey-js.md)

**指摘しないこと:**

- 生成結果が変わらない変更 (例: `limit` だけの変更) で autogen の差分が無いこと

## Nest DI

- **[Major]** Repository など DI トークンを持つ依存は `@Inject(DI.xxx)` で注入し、Service (`RoleService`、`UserEntityService` など) はトークンを使わずコンストラクタ引数の型だけで注入している。 → [nestjs-di.md](../../.claude/skills/working-on-backend/references/knowledge/nestjs-di.md)
- **[Critical]** 新規 Service が該当 module (通常 `CoreModule`) の `providers` に登録され、他 module から使うなら `exports` にも入っている。未登録だと DI 解決に失敗して起動できない。 → [nestjs-di.md](../../.claude/skills/working-on-backend/references/knowledge/nestjs-di.md)
- **[Minor]** Service の循環参照は、まず `@Inject(forwardRef(() => XxxService))` で解消し、それで解けない場合だけ `OnModuleInit` + `ModuleRef` に切り替えている。 → [backend.md](../contributing/backend.md)
- **[Critical]** `OnModuleInit` 内で `moduleRef.get(XxxService.name)` を使う場合、同じ module の `providers` に `{ provide: XxxService.name, useExisting: XxxService }` の alias が登録されている (`CoreModule` の `$XxxService`)。無いと文字列トークンを解決できず初期化に失敗する。 → [backend.md](../contributing/backend.md)

**指摘しないこと:**

- 新規エンドポイントを module に登録していないこと (`EndpointsModule` が `endpoint-list.ts` から provider を自動生成する)

## ActivityPub

- **[Major]** ActivityPub に独自に追加する拡張プロパティの名前が `_misskey_` で始まっている (例: `_misskey_quote`)。 → [activitypub.md](../contributing/activitypub.md)
- **[Critical]** 拡張プロパティは `packages/backend/src/core/activitypub/type.ts` で optional として宣言され、受信側で欠けていても処理できる。古い Misskey や他実装のペイロードには含まれないため、必須扱いにすると受信処理が失敗する。 → [activitypub.md](../contributing/activitypub.md)
- **[Major]** 拡張プロパティが `packages/backend/src/core/activitypub/misc/contexts.ts` の context 定義に、キー = プロパティ名、値 = short IRI (通常 `misskey:<プロパティ名>`) で追加されている。 → [activitypub.md](../contributing/activitypub.md)
- **[Major]** 他実装が既に定義しているプロパティを独自に追加したり、よく知られたプロパティに独自の値のバリエーションを加えたりしていない。 → [activitypub.md](../contributing/activitypub.md)
- **[Minor]** ActivityPub ペイロードを変える PR では、misskey-hub の拡張仕様文書 (`misskey-hub-next` の `content/ns.md`) への反映 PR が用意されている、または予定が示されている。 → [activitypub.md](../contributing/activitypub.md)

## テスト

- **[Major]** 新規・変更したエンドポイントについて、`packages/backend/test/e2e/` 配下に `api('<category>/<name>', ...)` を呼ぶ `test(...)` があり、権限チェックやエラーケースなどの分岐も確かめている。 → [backend-testing.md](../../.claude/skills/working-on-backend/references/knowledge/backend-testing.md)
- **[Minor]** e2e テストは該当するカテゴリファイル (`note.ts`、`users.ts` など) に追加し、どれにも合わなければ `endpoints.ts` に置いている。新規ファイルにするのはケースが多く (目安 200 行超) 独立性が高い場合だけ。admin 系は `admin.ts` が無いので `api.ts` か `endpoints.ts` に置く。 → [backend-testing.md](../../.claude/skills/working-on-backend/references/knowledge/backend-testing.md)

**指摘しないこと:**

- `describe` のラベルが `<category>/<name>` 形式でないこと (既存テストは `describe('Note', ...)` や `describe('管理者操作', ...)` のような人間可読ラベル)
