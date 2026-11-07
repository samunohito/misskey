# Backend review guidelines

バックエンド (`packages/backend/**`) の変更をレビューする人 (人間・AI) 向け。SQL / TypeORM / migration に触れる変更は [database.md](database.md) も読むこと。

[Review guidelines](README.md)

## API エンドポイント

### meta

- [Major] 1. `meta` の必須・推奨フィールド (Major)

  [endpoints.ts の型定義](../../packages/backend/src/server/api/endpoints.ts) を真とする。

  - `tags`: OpenAPI タグ (機能領域)。
- [Major] `requireCredential`: 明示必須 (boolean)。
- [Major] `kind`: OAuth scope。`requireCredential: true` のとき必須 (`read:account` / `write:notes` 等)。
- [Major] `requireModerator` / `requireAdmin`: 権限制限が要るか。
- [Major] `prohibitMoved`: 移行済アカウントを拒否するか (write 系で要検討)。
- [Major] `limit`: レート制限 `{ duration, max, key?, minInterval? }`。書き込み系 / コスト高い処理で未指定なら指摘。
- [Major] `errors`: エラー定義。各要素に `message` / `code` / `id` (UUID v4) が揃っているか。
- [Major] `res`: JSON Schema または `ref: '<EntityName>'`。各プロパティに `optional` / `nullable` が **明示** されているか。
- [Major] `requireFile` / `secure` / `allowGet` / `cacheSec` / `description`: 該当するエンドポイントで使い分けているか。

### errors

- [Critical] 各 `errors[*].id` が:

  1. UUID v4 形式 (`xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx`) か
  2. 既存エンドポイントの `id` と重複していないか
- 	noSuchNote: {                                            // ← キーは camelCase
  		message: 'No such note.',                            // ← 英語ハードコード (バックエンドに i18n 機構なし)
  		code: 'NO_SUCH_NOTE',                                // ← code は SCREAMING_SNAKE_CASE
  		id: '17a0e0fa-3f3e-4f3e-9f3e-3f3e3f3e3f3e',          // ← UUID v4。リポジトリ内で一意
  (出典: [api-meta-paramdef.md](../../.claude/skills/working-on-backend/references/knowledge/api-meta-paramdef.md#L75-L78))
- 命名規則 (既存実装で一貫):

  - キー: `camelCase` (`noSuchNote`, `cannotReRenote`, `alreadyBlocking`, `youHaveBeenBlocked`)
  - `code`: `SCREAMING_SNAKE_CASE` (`'NO_SUCH_NOTE'`, `'CANNOT_RENOTE_TO_A_PURE_RENOTE'`)
  - 接頭辞パターン: `NO_SUCH_*` / `CANNOT_*` / `ALREADY_*` / `TOO_MANY_*` / `INVALID_*` / `*_REQUIRED`
  (出典: [api-meta-paramdef.md](../../.claude/skills/working-on-backend/references/knowledge/api-meta-paramdef.md#L87-L91))
- **修正**: 業務エラーは必ず `meta.errors` に登録してから `throw new ApiError(meta.errors.<key>)`
  - **逆方向の罠**: 「想定外バグまで全部 `ApiError` で包む」のもダメ。`endpoints/notes/create.ts` の `catch` 節末尾の `throw err;` が手本
  (出典: [api-meta-paramdef.md](../../.claude/skills/working-on-backend/references/knowledge/api-meta-paramdef.md#L307-L308))
- **症状**: `errors.id` を再利用してしまうと misskey-js 側で型が混線
  - **原因**: UUID をハードコードして再利用
  (出典: [api-meta-paramdef.md](../../.claude/skills/working-on-backend/references/knowledge/api-meta-paramdef.md#L318-L319))
- **修正**: `message` は英語ハードコードに統一。フロントエンドは `error.id` (UUID) または `error.code` をキーに自前で localize する (出典: [api-meta-paramdef.md](../../.claude/skills/working-on-backend/references/knowledge/api-meta-paramdef.md#L338))
- **`meta.errors` の各 `id` は UUID v4 で、リポジトリ内で一意**。`crypto.randomUUID()` で生成し、`grep -r "id: '<UUID>'" packages/backend/src/server/api/endpoints/` で衝突確認 (出典: [adding-api-endpoint.md](../../.claude/skills/working-on-backend/references/tasks/adding-api-endpoint.md#L9))
- 		noSuchNote: {                            // ← キーは camelCase
  			message: 'No such note.',            // ← 英語ハードコード (バックエンドに i18n 機構なし)
  			code: 'NO_SUCH_NOTE',                // ← code は SCREAMING_SNAKE_CASE
  			id: '17a0e0fa-3f3e-4f3e-9f3e-3f3e3f3e3f3e', // ← crypto.randomUUID() で生成し衝突確認
  (出典: [adding-api-endpoint.md](../../.claude/skills/working-on-backend/references/tasks/adding-api-endpoint.md#L114-L117))
- **クライアントに返すべき業務エラー** は必ず `meta.errors` に列挙して `throw new ApiError(meta.errors.<key>)` する。これを守らないと misskey-js 側の型に出ず、レスポンスも 500 になる。第 2 引数で追加情報を渡せる: (出典: [adding-api-endpoint.md](../../.claude/skills/working-on-backend/references/tasks/adding-api-endpoint.md#L179))
- 一方で **想定外の例外 (DB 不整合 / 下層 service の bug / 防御的アサーション)** は `throw new Error('...')` のままで構わない。すべての例外を `ApiError` で包むと、未知のバグが client error として隠蔽されてしまう。`endpoints/notes/create.ts` の `catch` 節末尾の `throw err;` がこの二段構えの典型。 (出典: [adding-api-endpoint.md](../../.claude/skills/working-on-backend/references/tasks/adding-api-endpoint.md#L185))
- **クライアントが 500 と error 型不在を受け取る** → `meta.errors` 列挙なしに `throw new ApiError(...)` した (出典: [adding-api-endpoint.md](../../.claude/skills/working-on-backend/references/tasks/adding-api-endpoint.md#L263))
- **UUID 重複** → 衝突確認グレップを忘れた (出典: [adding-api-endpoint.md](../../.claude/skills/working-on-backend/references/tasks/adding-api-endpoint.md#L265))

### paramDef

- [Major] JSON Schema 形式 (`type: 'object'`, `properties`, `required`)
- [Major] ID 文字列は `format: 'misskey:id'`
- [Major] `required` 配列で必須プロパティを明示
- [Major] `as const` または `as const satisfies Schema` で型推論を効かせる (既存実装は前者多数。`as const` 自体が無く `Schema` 型注釈もない場合のみ指摘)
- `as const` を必ず付ける。これで `SchemaType<typeof paramDef>` が型推論される。 (出典: [api-meta-paramdef.md](../../.claude/skills/working-on-backend/references/knowledge/api-meta-paramdef.md#L160))
- 7. `paramDef` に `policies` を書く

  - **症状**: 「`gtlAvailable: true` を payload で渡してください」のような不自然な API になっている / クライアントが指定したらバイパスできる
  - **原因**: ロールポリシーは **動的に取得するもの**
  - **修正**: paramDef からは外し、`exec` 内で `RoleService.getUserPolicies(me?.id)` を呼んで判定する
  (出典: [api-meta-paramdef.md](../../.claude/skills/working-on-backend/references/knowledge/api-meta-paramdef.md#L328-L332))
- **修正**: `export const meta = { ... } as const;` と `export const paramDef = { ... } as const;` を必ず付ける (出典: [api-meta-paramdef.md](../../.claude/skills/working-on-backend/references/knowledge/api-meta-paramdef.md#L343))

### 実装

- [Major] `Endpoint<typeof meta, typeof paramDef>` を継承しているか。
- [Major] `@Injectable()` デコレータ + `export default class` 形式か (`// eslint-disable-line import/no-default-export` が必要)。
- [Major] DI は `@Inject(DI.xxx)` 形式か。
- [Major] **クライアントに返すべき API エラーは `throw new ApiError(meta.errors.<key>)`** ([error.ts](../../packages/backend/src/server/api/error.ts) 参照)。`meta.errors` で定義したエラーケースを `throw new Error(...)` で投げているなら指摘する。
- [Major] 防御的アサーション・「起きるはずがない」内部不整合・テスト用 ENV ガード等の **想定外フェイルファスト** は `throw new Error('...')` で構わない。既存実装でも `admin/reset-password.ts` などが採用しているパターン (例: `cannot reset password of root`)。`meta.errors` に対応がない `throw new Error` を一律で指摘しない。
- [Major] 同期 `throw` は許容。非同期処理での例外伝搬を確認する。
- API endpoint は `Endpoint<typeof meta, typeof paramDef>` を extends するクラスとして書く。`@Injectable()` を付けてコンストラクタで Repository / Service を `@Inject(DI.xxx)` で注入する。 (出典: [nestjs-di.md](../../.claude/skills/working-on-backend/references/knowledge/nestjs-di.md#L13))
- `// eslint-disable-line import/no-default-export` は Endpoint のお約束 (NestJS が default export を要求する一方で、ESLint ルールでは制約されているため)。 (出典: [nestjs-di.md](../../.claude/skills/working-on-backend/references/knowledge/nestjs-di.md#L35))

### endpoint-list

- [Critical] 最も忘れやすい。**忘れると 404**。[endpoint-list.ts](../../packages/backend/src/server/api/endpoint-list.ts) に 1 行追加されているか:
- [Critical] **並び順の補足**: ファイル全体は厳密なアルファベット順では並んでおらず、同カテゴリ内 (`admin/queue/*` など) でも追加された経緯どおりの順になっている箇所が多い。**順序逸脱は指摘根拠にしない** (誤検知の元)。「行が存在するか」のみを Critical 観点として扱う。
- **原因**: [endpoint-list.ts](../../packages/backend/src/server/api/endpoint-list.ts) への登録漏れ。エンドポイントは glob 自動収集されない (出典: [api-meta-paramdef.md](../../.claude/skills/working-on-backend/references/knowledge/api-meta-paramdef.md#L288))
- 新規 API endpoint を追加する際の **最大の落とし穴**。エンドポイントは glob 自動収集されないため、ここへの 1 行追加を忘れると 404 になる。 (出典: [endpoint-list.md](../../.claude/skills/working-on-backend/references/knowledge/endpoint-list.md#L3))
- **並び順は厳密ではない**。同じディレクトリ (例: `admin/queue/*`) の中でも、アルファベット順ではなく追加された経緯どおりの順になっている箇所が多い。

  - **新規追加**: 同カテゴリ内の末尾に追加すれば OK
  - **既存近傍**: 同カテゴリ内の関連エンドポイントの近くに置く判断もあり
  - **過度に整理しない**: 既存の並びを全部 sort し直すような PR は不要 (review コストだけ増える)
  (出典: [endpoint-list.md](../../.claude/skills/working-on-backend/references/knowledge/endpoint-list.md#L27-L31))
- **エンドポイントは glob 自動収集されない**。[endpoint-list.ts](../../packages/backend/src/server/api/endpoint-list.ts) への 1 行追加が必須 → [knowledge/endpoint-list.md](../../.claude/skills/working-on-backend/references/knowledge/endpoint-list.md) (出典: [adding-api-endpoint.md](../../.claude/skills/working-on-backend/references/tasks/adding-api-endpoint.md#L7))
- 詳細・落とし穴は [knowledge/endpoint-list.md](../../.claude/skills/working-on-backend/references/knowledge/endpoint-list.md) を参照。**ここへの登録漏れ = 404**。 (出典: [adding-api-endpoint.md](../../.claude/skills/working-on-backend/references/tasks/adding-api-endpoint.md#L197))
- **404 になる** → `endpoint-list.ts` 登録漏れ (出典: [adding-api-endpoint.md](../../.claude/skills/working-on-backend/references/tasks/adding-api-endpoint.md#L260))
- `endpoint-list.ts` への登録方法 (★ 漏れると 404) → [references/knowledge/endpoint-list.md](../../.claude/skills/working-on-backend/references/knowledge/endpoint-list.md) (出典: [SKILL.md](../../.claude/skills/working-on-backend/SKILL.md#L28))

### misskey-js 再生成

- [Critical] `meta` / `paramDef` / `res` を変更したら、PR / ブランチに `packages/misskey-js/src/autogen/` 配下の差分が含まれているか確認する:
- [Critical] 差分ゼロなら `pnpm build-misskey-js-with-types` の実行漏れ。CI の `check-misskey-js-autogen` ワークフローで必ず落ちるため Critical 扱い。
- **原因**: `meta` / `paramDef` / `res` を変えたのに misskey-js の自動生成物を再生成していない (出典: [api-meta-paramdef.md](../../.claude/skills/working-on-backend/references/knowledge/api-meta-paramdef.md#L294))
- **`meta` / `paramDef` / `res` を変えたら misskey-js 再生成が必須**。`pnpm build-misskey-js-with-types` を忘れると CI の `check-misskey-js-autogen` で必ず落ちる (出典: [adding-api-endpoint.md](../../.claude/skills/working-on-backend/references/tasks/adding-api-endpoint.md#L8))
- PR に `packages/misskey-js/src/autogen/` 配下の差分が含まれていないと CI の `check-misskey-js-autogen` で必ず落ちる (最頻ミス)。詳細手順は [shipping-misskey-change/references/tasks/regenerate-misskey-js.md](../../.claude/skills/shipping-misskey-change/references/tasks/regenerate-misskey-js.md)。 (出典: [adding-api-endpoint.md](../../.claude/skills/working-on-backend/references/tasks/adding-api-endpoint.md#L252))
- **CI `check-misskey-js-autogen` で落ちる** → `pnpm build-misskey-js-with-types` 忘れ (出典: [adding-api-endpoint.md](../../.claude/skills/working-on-backend/references/tasks/adding-api-endpoint.md#L261))

### kind

- **`secure: true` の例外**: [endpoints.ts](../../packages/backend/src/server/api/endpoints.ts) の `secure: true` union variant は他の require* と独立しており、`kind` を要求しない。実例: [auth/accept.ts](../../packages/backend/src/server/api/endpoints/auth/accept.ts) (`secure: true + requireCredential: true` で `kind` なし)、[i/export-user-lists.ts](../../packages/backend/src/server/api/endpoints/i/export-user-lists.ts) も同様。サードパーティアプリから叩けないので OAuth scope の必要がない。 (出典: [api-meta-paramdef.md](../../.claude/skills/working-on-backend/references/knowledge/api-meta-paramdef.md#L51))
- 新しい操作領域を追加する場合は `consts.ts` の `permissions` 配列にも追加する必要がある。 (出典: [api-meta-paramdef.md](../../.claude/skills/working-on-backend/references/knowledge/api-meta-paramdef.md#L69))
- **原因**: [endpoints.ts](../../packages/backend/src/server/api/endpoints.ts) のユニオン制約で `kind` が型レベルで必須
  - **修正**: 適切な OAuth スコープを `kind` に設定する
  - **例外**: `secure: true` (Misskey 本体専用) のエンドポイントは [endpoints.ts](../../packages/backend/src/server/api/endpoints.ts) の別 union variant 扱いで `kind` 不要
  (出典: [api-meta-paramdef.md](../../.claude/skills/working-on-backend/references/knowledge/api-meta-paramdef.md#L348-L350))
- 	requireCredential: true,         // 認証必須 → kind 必須 (例外: secure: true な内部 API は kind 不要) (出典: [adding-api-endpoint.md](../../.claude/skills/working-on-backend/references/tasks/adding-api-endpoint.md#L106))

### requiredRolePolicy

- **`requiredRolePolicy: 'canCreateChannel'`** — 特定のロールポリシーが許可されているユーザーだけに絞る。**`requireCredential: true` 必須**: [ApiCallService.ts](../../packages/backend/src/server/api/ApiCallService.ts) が `requiredRolePolicy` 分岐で `user!.id` を非null前提アクセスするため、匿名許可と組み合わせると TypeError で 500 になる。匿名も許したいなら、`meta` ではなく実行時に `RoleService.getUserPolicies(me ? me.id : null)` で判定する ([endpoints/notes/global-timeline.ts](../../packages/backend/src/server/api/endpoints/notes/global-timeline.ts) のパターン)。ポリシーの一覧は [`RolePolicies`](../../packages/backend/src/core/RoleService.ts) を参照 (出典: [api-meta-paramdef.md](../../.claude/skills/working-on-backend/references/knowledge/api-meta-paramdef.md#L55))
- **原因**: [ApiCallService.ts](../../packages/backend/src/server/api/ApiCallService.ts) が `requiredRolePolicy` ありのエンドポイントで `user!.id` を非null前提でアクセス
  - **修正**: 静的に必須ポリシーを宣言するなら `requireCredential: true` と必ず併用する。匿名ユーザーにも違うポリシーセットを適用したいなら、実行時に `RoleService.getUserPolicies(me ? me.id : null)` で判定 ([notes/global-timeline.ts](../../packages/backend/src/server/api/endpoints/notes/global-timeline.ts) パターン)
  (出典: [api-meta-paramdef.md](../../.claude/skills/working-on-backend/references/knowledge/api-meta-paramdef.md#L361-L362))
- **`requiredRolePolicy` で匿名アクセスが 500 になる** → `ApiCallService` が `user!.id` を非null前提で参照するため `requireCredential: true` 必須 (出典: [adding-api-endpoint.md](../../.claude/skills/working-on-backend/references/tasks/adding-api-endpoint.md#L267))

### res

- 各プロパティに `optional: false, nullable: false` を **必ず明示する**。省略すると schema が緩くなり、生成される misskey-js 型も曖昧になる。 (出典: [api-meta-paramdef.md](../../.claude/skills/working-on-backend/references/knowledge/api-meta-paramdef.md#L128))

### me null チェック

- **原因**: `requireCredential: false` のとき `me` は `MiLocalUser | null` なのに null チェックなしで `me.id` を使った
  - **修正**: null チェックを入れるか、認証必須なら `requireCredential: true` に変更
  (出典: [api-meta-paramdef.md](../../.claude/skills/working-on-backend/references/knowledge/api-meta-paramdef.md#L313-L314))
- 			// 実装。me は MiLocalUser | null (requireCredential: false のため null チェック必須) (出典: [adding-api-endpoint.md](../../.claude/skills/working-on-backend/references/tasks/adding-api-endpoint.md#L89))
- | 引数 | 型 | 用途 |
  |---|---|---|
  | `ps` | `SchemaType<typeof paramDef>` | AJV 検証済の入力 |
  | `me` | `MiLocalUser` (requireCredential: true) / `MiLocalUser \| null` (false) | ローカルユーザー。`requireCredential: false` のとき必ず null チェック |
  | `token` | `MiAccessToken \| null` | OAuth トークン (アプリ識別が要るとき) |
  | `file` | `{ name, path } \| undefined` | `requireFile: true` のときのみ確実に渡る。エンドポイント基底クラスが既に null チェック済 |
  | `cleanup` | `() => any \| undefined` | アップロードされた一時ファイルを削除するコールバック。**基底クラスが自動で呼ぶのは AJV バリデーション失敗時だけ**。正常終了や endpoint 内例外時は **呼ばれない** ので、`try { ... } finally { cleanup!(); }` で必ず呼ぶ責務がある ([drive/files/create.ts](../../packages/backend/src/server/api/endpoints/drive/files/create.ts) の `finally { cleanup!(); }` が手本) |
  (出典: [adding-api-endpoint.md](../../.claude/skills/working-on-backend/references/tasks/adding-api-endpoint.md#L161-L167))
- **`me.id` で TypeError** → `requireCredential: false` で null チェックを忘れた (出典: [adding-api-endpoint.md](../../.claude/skills/working-on-backend/references/tasks/adding-api-endpoint.md#L264))

### requireFile cleanup

- **原因**: [endpoint-base.ts](../../packages/backend/src/server/api/endpoint-base.ts) が `cleanup` を自動で呼ぶのは **AJV バリデーション失敗時のみ**
  - **修正**: `try { ... } finally { cleanup!(); }` で囲む ([drive/files/create.ts](../../packages/backend/src/server/api/endpoints/drive/files/create.ts) の `finally { cleanup!(); }` が手本)
  (出典: [api-meta-paramdef.md](../../.claude/skills/working-on-backend/references/knowledge/api-meta-paramdef.md#L355-L356))
- **一時ファイルが残る** → `requireFile: true` で `cleanup!()` を `finally` で呼び忘れた (出典: [adding-api-endpoint.md](../../.claude/skills/working-on-backend/references/tasks/adding-api-endpoint.md#L266))

## Nest DI

- Service 系 (例: `NoteCreateService`, `RoleService`, `UserEntityService`) は **トークン経由ではなく型をそのまま inject** する: (出典: [nestjs-di.md](../../.claude/skills/working-on-backend/references/knowledge/nestjs-di.md#L50))
- 新規 Service を追加する場合は **module 側の `providers` 配列にも追加** する必要がある。既存 Service が `CoreModule` に登録されているか確認するのが手っ取り早い。 (出典: [nestjs-di.md](../../.claude/skills/working-on-backend/references/knowledge/nestjs-di.md#L80))
- 新規 endpoint 追加時に module への明示的な登録は不要 ([knowledge/endpoint-list.md](../../.claude/skills/working-on-backend/references/knowledge/endpoint-list.md) 参照)。新規 Service 追加時は CoreModule (または該当 module) に provider 登録が必要。 (出典: [nestjs-di.md](../../.claude/skills/working-on-backend/references/knowledge/nestjs-di.md#L91))
- Nest Service Circular dependency / Nestでサービスの循環参照でエラーが起きた場合

  #### forwardRef
  まずは簡単に`forwardRef`を試してみる
  (出典: [backend.md](../contributing/backend.md#L9-L12))

## ActivityPub

- If PR includes changes to ActivityPub payload, please reflect it in [misskey-hub's document](https://github.com/misskey-dev/misskey-hub-next/blob/master/content/ns.md) by sending PR. (出典: [activitypub.md](../contributing/activitypub.md#L10))
- The name of purporsed extension property (referred as "extended property" in later) to ActivityPub shall be prefixed by `_misskey_`. (i.e. `_misskey_quote`) (出典: [activitypub.md](../contributing/activitypub.md#L12))
- The extended property in `packages/backend/src/core/activitypub/type.ts` **must** be declared as optional because ActivityPub payloads that comes from older Misskey or other implementation may not contain it. (出典: [activitypub.md](../contributing/activitypub.md#L14))
- The extended property must be included in the context definition. Context is defined in `packages/backend/src/core/activitypub/misc/contexts.ts`.
  The key shall be same as the name of extended property, and the value shall be same as "short IRI".
  (出典: [activitypub.md](../contributing/activitypub.md#L16-L17))
- One should not add property that has defined before by other implementation, or add custom variant value to "well-known" property. (出典: [activitypub.md](../contributing/activitypub.md#L21))

## テスト

- [Major] [test/e2e/endpoints.ts](../../packages/backend/test/e2e/endpoints.ts) または `test/e2e/<area>.ts` (`note.ts`, `users.ts` 等) 配下に、対応する `api('<category>/<name>', ...)` 呼び出しを含む `test(...)` ケースが追加されているか確認する。複雑な分岐 (権限チェック・エラーケース) の網羅も確認する。
- [Major] **describe ラベルの形式は問わない**: 既存テストは `describe('Note', () => { test('投稿できる', ...) })` のように人間可読ラベルで構造化されており、`<category>/<name>` 形式の describe は使われていない。describe 名の規約違反としては指摘しない。
- 13. e2e テストが起動しない

  - **症状**: `pnpm --filter backend test:e2e` 実行直後にこける / DB 接続エラー
  - **原因**: `.config/test.yml` が無い
  (出典: [api-meta-paramdef.md](../../.claude/skills/working-on-backend/references/knowledge/api-meta-paramdef.md#L364-L367))
- **`admin.ts` は存在しない**。admin 系エンドポイントの e2e は `api.ts` (API レイヤ挙動として) または `endpoints.ts` (雑多枠) に置くのが現実的。 (出典: [backend-testing.md](../../.claude/skills/working-on-backend/references/knowledge/backend-testing.md#L62))
- 判断ルール

  1. 自分の追加するエンドポイントが既存カテゴリファイル (`note.ts`, `users.ts` 等) に所属するなら、そこに `describe('...', () => { test(...) })` を追加
  2. どのカテゴリにも収まらないなら `endpoints.ts` に追加
  3. テストケースが多くなり (>200 行)、独立性が高い場合のみ新ファイル化
  (出典: [backend-testing.md](../../.claude/skills/working-on-backend/references/knowledge/backend-testing.md#L64-L68))
- `describe` のラベル名は **人間可読** で OK (`describe('Note', ...)`, `describe('管理者操作', ...)` のような形式)。`<category>/<name>` 形式である必要はない。 (出典: [backend-testing.md](../../.claude/skills/working-on-backend/references/knowledge/backend-testing.md#L70))
- 既存のカテゴリファイルがあるなら、そこに `describe('<人間可読ラベル>', () => { test('正常系', ...) })` で追加
  - どのファイルにも合わないなら `test/e2e/endpoints.ts` に追加
  - `describe` 名は **人間可読 OK**
  (出典: [adding-api-endpoint.md](../../.claude/skills/working-on-backend/references/tasks/adding-api-endpoint.md#L207-L209))
