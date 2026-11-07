# Database review guidelines

migration・entity に加え、SQL / クエリ / スキーマに触れる変更をレビューする人 (人間・AI) 向け。

[Review guidelines](README.md)

## entity

- エンティティ側の `@Column` / `@Entity` / `@Index` 変更は migration の DDL と整合させる必要がある。`pnpm --filter backend check-migrations` がエンティティと migration の不一致を検出する ([scripts/check_migrations_clean.js](../../packages/backend/scripts/check_migrations_clean.js))。 (出典: [typeorm-patterns.md](../../.claude/skills/working-on-backend/references/knowledge/typeorm-patterns.md?plain=1#L10))

## insert

- INSERTするときにはsaveではなくinsertを使用する
  #6441
  (出典: [backend.md](../contributing/backend.md?plain=1#L115-L116))

## placeholder

- placeholder
  SQLをクエリビルダで組み立てる際、使用するプレースホルダは重複してはならない
  (出典: [backend.md](../contributing/backend.md?plain=1#L118-L119))

## NULL

- Not `null` in TypeORM
  ```ts
  const foo = await Foos.findOne({
  	bar: Not(null)
  });
  ```
  のようなクエリ(`bar`が`null`ではない)は期待通りに動作しない。
  次のようにします:
  ```ts
  const foo = await Foos.findOne({
  	bar: Not(IsNull())
  });
  ```
  (出典: [backend.md](../contributing/backend.md?plain=1#L139-L151))
- `null` in SQL
  SQLを発行する際、パラメータが`null`になる可能性のある場合はSQL文を出し分けなければならない
  (出典: [backend.md](../contributing/backend.md?plain=1#L153-L154))
- null IN
  nullが含まれる可能性のあるカラムにINするときは、そのままだとおかしくなるのでORなどでnullのハンドリングをしよう。
  (出典: [backend.md](../contributing/backend.md?plain=1#L189-L190))

## IN

- `[]` in SQL
  SQLを発行する際、`IN`のパラメータが`[]`(空の配列)になる可能性のある場合はSQL文を出し分けなければならない
  (出典: [backend.md](../contributing/backend.md?plain=1#L169-L170))

## 配列

- 配列のインデックス in SQL
  SQLでは配列のインデックスは**1始まり**。
  `[a, b, c]`の `a`にアクセスしたいなら`[0]`ではなく`[1]`と書く
  (出典: [backend.md](../contributing/backend.md?plain=1#L185-L187))

## JSONB/配列デフォルト

- 4. JSONB / 配列列のデフォルト

  **なぜ危険か**: 既定値リテラルの書式を誤ると `migration:generate` の出力とズレてスタイル不一致になる。実績ある書式に揃える。

  ```js
  await queryRunner.query(`ALTER TABLE "user_profile" ADD "room" jsonb NOT NULL DEFAULT '{}'`);          // オブジェクト
  await queryRunner.query(`ALTER TABLE "bubble_game_record" ADD "logs" jsonb NOT NULL DEFAULT '[]'`);     // 配列(JSON)
  await queryRunner.query(`ALTER TABLE "meta" ADD "pinnedUsers" character varying(256) array NOT NULL DEFAULT '{}'::varchar[]`); // PG 配列型
  ```
  (出典: [typeorm-patterns.md](../../.claude/skills/working-on-backend/references/knowledge/typeorm-patterns.md?plain=1#L135-L143))

## enum

- 2. enum 型の値の追加・変更

  **なぜ危険か**: PostgreSQL の enum は **値を削除できない** (`ALTER TYPE ... DROP VALUE` は存在しない) ため、`ADD VALUE` した変更を素直に巻き戻せない。さらに Misskey はデフォルトで migration 全体を 1 トランザクションにまとめる (`migrationsTransactionMode: 'all'`) ので、`ADD VALUE` で足した値を同一トランザクション内で使う処理もエラーになる。そこで TypeORM `migration:generate` は **「旧型を rename → 新型を CREATE → 列を新型へ ALTER (USING キャスト) → 旧型を DROP」** という巻き戻し可能な手順を出す。手書きでもこの形に従うこと。
  (出典: [typeorm-patterns.md](../../.claude/skills/working-on-backend/references/knowledge/typeorm-patterns.md?plain=1#L96-L98))
- 要点: ①列がデフォルトを持つ場合は ALTER 前に `DROP DEFAULT`、ALTER 後に `SET DEFAULT` を挟む。②配列列 (`mutingNotificationTypes` 等) は `TYPE "..."[] USING "col"::"text"::"..."[]` と配列キャストにする。 (出典: [typeorm-patterns.md](../../.claude/skills/working-on-backend/references/knowledge/typeorm-patterns.md?plain=1#L116))
- ③**`down` の落とし穴**: 削除する値を既存行が使っていると `USING` キャストが「該当 enum に存在しない」で失敗する。新値を追加しただけの直後の巻き戻しは安全だが、運用後に使われた値を消す巻き戻しは本質的に危うい — その場合は down で先に `UPDATE ... SET "type" = '<代替値>' WHERE "type" = '<消す値>'` で退避してからキャストする。 (出典: [typeorm-patterns.md](../../.claude/skills/working-on-backend/references/knowledge/typeorm-patterns.md?plain=1#L116))
- enumの削除は気をつける
  enumの列挙の内容の削除は、その値をもつレコードを全て削除しないといけない

  削除が重たかったり不可能だったりする場合は、削除しないでおく
  (出典: [backend.md](../contributing/backend.md?plain=1#L192-L195))

## 列変更

- 6. 列リネーム

  `migration:generate` はエンティティのプロパティ名変更を **「DROP 旧列 + ADD 新列」** と解釈しがちで、これだと **データが消える**。意図がリネームなら生成 SQL を捨て、手書きで `ALTER TABLE "t" RENAME COLUMN "old" TO "new"` (down は逆) に直す。生成結果を鵜呑みにしないこと。
  (出典: [typeorm-patterns.md](../../.claude/skills/working-on-backend/references/knowledge/typeorm-patterns.md?plain=1#L158-L160))

## NOT NULL列追加

- 1. NOT NULL 列の追加

  **なぜ危険か**: 既存行があるテーブルに `NOT NULL` 列を `DEFAULT` 無しで足すと、既存行を埋められず `ALTER TABLE` が失敗する。
  (出典: [typeorm-patterns.md](../../.claude/skills/working-on-backend/references/knowledge/typeorm-patterns.md?plain=1#L77-L79))
- **行ごとに計算した値で埋めたい / 既定値を後で外したい場合** — 3 段に分ける: ①nullable で追加 → ②`UPDATE` でバックフィル (ケース 3 参照) → ③`ALTER COLUMN ... SET NOT NULL`。`down` は `DROP COLUMN` で良い。巨大テーブルでは ② の `UPDATE` と ③ の `SET NOT NULL` (全行スキャン) が長時間ロックし得る点に注意 (出典: [typeorm-patterns.md](../../.claude/skills/working-on-backend/references/knowledge/typeorm-patterns.md?plain=1#L92))

## DROP

- **DROP の冪等性**: 状況により対象が無いことがある DROP は `IF EXISTS` を付ける (`DROP INDEX IF EXISTS "..."`)。ただし `migration:generate` は通常 `IF EXISTS` を付けない素の DDL を出すので、手で足すのは「条件付きで存在する」と分かっている時だけにする (無闇に付けると本来検出すべき不整合を隠す) (出典: [typeorm-patterns.md](../../.claude/skills/working-on-backend/references/knowledge/typeorm-patterns.md?plain=1#L149))

## COMMENT

- **COMMENT ON COLUMN**: Misskey は denormalize した列に `'[Denormalized]'` コメントを付ける慣習がある。エンティティの `@Column({ comment: '[Denormalized]' })` に対応して `migration:generate` が `COMMENT ON COLUMN` を出す。`up` で付与したら `down` でも対称に書く (出典: [typeorm-patterns.md](../../.claude/skills/working-on-backend/references/knowledge/typeorm-patterns.md?plain=1#L150))

## CONCURRENTLY

- 大規模テーブルへの `CREATE INDEX` は本番で長時間ロックする恐れがある。`CONCURRENTLY` で発行するときは migration class に **「この migration は transaction を張らない」と指示する** 必要がある。PostgreSQL は `CREATE INDEX CONCURRENTLY` を transaction 内で実行できないため。 (出典: [typeorm-patterns.md](../../.claude/skills/working-on-backend/references/knowledge/typeorm-patterns.md?plain=1#L39))
- **`transaction = isConcurrentIndexMigrationEnabled ? false : undefined;`** が必須。これがないと `CREATE INDEX CONCURRENTLY` が transaction 内で実行されて `ERROR: CREATE INDEX CONCURRENTLY cannot run inside a transaction block` で失敗 (出典: [typeorm-patterns.md](../../.claude/skills/working-on-backend/references/knowledge/typeorm-patterns.md?plain=1#L67))
- 環境変数 `MISSKEY_MIGRATION_CREATE_INDEX_CONCURRENTLY=1` がデフォルト OFF。OFF のときは普通の `CREATE INDEX` (transaction 内) で動く必要がある。`up`/`down` 双方を環境変数で分岐させる (出典: [typeorm-patterns.md](../../.claude/skills/working-on-backend/references/knowledge/typeorm-patterns.md?plain=1#L68))
- 大規模テーブルへの `CREATE INDEX` は本番で長時間ロックする恐れがある。`CONCURRENTLY` で発行するときは migration class に `transaction = false` 等の対応が必要。詳細は [knowledge/typeorm-patterns.md §CONCURRENTLY](../../.claude/skills/working-on-backend/references/knowledge/typeorm-patterns.md) を参照。 (出典: [creating-migration.md](../../.claude/skills/working-on-backend/references/tasks/creating-migration.md?plain=1#L123))

## データ移行

- 3. データ移行 (UPDATE バックフィル)

  **なぜ危険か**: migration 内の `UPDATE` は本番の全行を触る可能性がある。大量行では長時間ロック・トランザクション肥大を招く。
  (出典: [typeorm-patterns.md](../../.claude/skills/working-on-backend/references/knowledge/typeorm-patterns.md?plain=1#L120-L122))
- 既定値を入れるだけなら `UPDATE ... WHERE col IS NULL` で冪等に書く。複数回流れても安全な形にする (出典: [typeorm-patterns.md](../../.claude/skills/working-on-backend/references/knowledge/typeorm-patterns.md?plain=1#L124))
- 巨大テーブルの全行更新は避けるのが基本。どうしても必要なら CONCURRENTLY 同様にバッチ分割や別運用を検討し、PR で相談する (出典: [typeorm-patterns.md](../../.claude/skills/working-on-backend/references/knowledge/typeorm-patterns.md?plain=1#L125))

## migration生成

- 作成されたスクリプトは不必要な変更を含むため除去してください (出典: [backend.md](../contributing/backend.md?plain=1#L204))

## migration形式

- **`-o --esm` について**: `-o` (`--outputJs`) は「TS ではなく JS を出力する」オプション、`--esm` は「ESM 形式 (`export class ...`) で出力する」オプション。Misskey の既存 migration はすべて ESM JS であるため **両方が必須**。`--esm` を省略すると CommonJS 形式の JS が生成されスタイルが揃わない。 (出典: [creating-migration.md](../../.claude/skills/working-on-backend/references/tasks/creating-migration.md?plain=1#L62))
- **注意:** `-o --esm` を **必ず付ける**。これが無いと `<UnixMs>-<PascalName>.ts` (CommonJS / TS 出力) が生成されるが、Misskey の `ormconfig.js` は `migration/*.js` だけを読み、既存の他 migration も全て `export class ... { async up(queryRunner) {...} }` の ESM JS 形式なので、後で手作業で変換が必要になる。`-o --esm` を付ければそのまま `.js` ESM で出る。 (出典: [creating-migration.md](../../.claude/skills/working-on-backend/references/tasks/creating-migration.md?plain=1#L90))
- ただし `migration:create` の雛形は **`name = '...'` プロパティを出力しない**ので、後段の SPDX 付与に加えて `name = '<PascalName><ms>'` を手で足し、`up`/`down` を埋める必要がある。雛形冒頭の `@typedef` / `@implements MigrationInterface` JSDoc は既存ファイルに無いので消して house style に揃える。 (出典: [creating-migration.md](../../.claude/skills/working-on-backend/references/tasks/creating-migration.md?plain=1#L92))
- `-o` (`--outputJs`) で JS 形式、`--esm` で ESM 形式に生成する。Misskey の既存 migration はすべて ESM JS なので両方のオプションが必要 (出典: [backend.md](../contributing/backend.md?plain=1#L205))

## migration命名

- ファイル名のタイムスタンプ部分を後から書き換えない (順序が壊れる) (出典: [creating-migration.md](../../.claude/skills/working-on-backend/references/tasks/creating-migration.md?plain=1#L8))
- **クラス名は PascalCase + 13 桁タイムスタンプ** (例: `class BirthdayIndex1767169026317`)
  - **`name` プロパティもクラス名と同一文字列** にする (`name = 'BirthdayIndex1767169026317'`)
  (出典: [creating-migration.md](../../.claude/skills/working-on-backend/references/tasks/creating-migration.md?plain=1#L28-L29))
- [ ] `export class <PascalName><ms>` と `name = '<PascalName><ms>'` の **文字列が完全一致** している (PascalCase + 13 桁タイムスタンプ) (出典: [creating-migration.md](../../.claude/skills/working-on-backend/references/tasks/creating-migration.md?plain=1#L169))

## migration down

- 共通の鉄則: `down()` は `up()` の **完全な巻き戻し**。下記ケースは「単純な逆 SQL では戻らない」ものが多い。 (出典: [typeorm-patterns.md](../../.claude/skills/working-on-backend/references/knowledge/typeorm-patterns.md?plain=1#L75))
- `down` で元値に戻せないデータ移行 (情報が失われる変換) は、`down` に戻せない旨をコメントで明示し、最低限スキーマだけは巻き戻す (出典: [typeorm-patterns.md](../../.claude/skills/working-on-backend/references/knowledge/typeorm-patterns.md?plain=1#L126))
- `up()` の各ステートメントに対し、`down()` で完全に巻き戻せること
  - 列追加 (`ADD COLUMN`) ↔ 列削除 (`DROP COLUMN`)、テーブル作成 ↔ テーブル削除、FK 追加 ↔ FK 削除、インデックス作成 ↔ インデックス削除 を必ずペアで書く
  (出典: [creating-migration.md](../../.claude/skills/working-on-backend/references/tasks/creating-migration.md?plain=1#L115-L116))
- **単純な逆 SQL では戻らない難ケース** (enum 値の追加・変更 / NOT NULL 列追加 / データ移行 UPDATE / JSONB・配列デフォルト / 列リネーム / 安全な DROP・COMMENT) は [knowledge/typeorm-patterns.md §migration 難ケース](../../.claude/skills/working-on-backend/references/knowledge/typeorm-patterns.md) を必ず参照。特に **enum 変更** と **列リネーム** は `migration:generate` の出力をそのまま使うと巻き戻せない / データが消えるので要注意。 (出典: [creating-migration.md](../../.claude/skills/working-on-backend/references/tasks/creating-migration.md?plain=1#L119))
- [ ] `up()` の各文に対応する巻き戻しが `down()` にあり、**`down()` が空でない** (難ケースは [knowledge/typeorm-patterns.md](../../.claude/skills/working-on-backend/references/knowledge/typeorm-patterns.md) を確認済み) (出典: [creating-migration.md](../../.claude/skills/working-on-backend/references/tasks/creating-migration.md?plain=1#L170))
- [ ] (可能なら) `pnpm migrate` → `pnpm revert` → `pnpm migrate` が通る (出典: [creating-migration.md](../../.claude/skills/working-on-backend/references/tasks/creating-migration.md?plain=1#L172))

## その他

- 迷ったら **まずエンティティを変更 → `migration:generate`** が原則。既存 migration (`packages/backend/migration/*.js`) のほぼすべてが `queryRunner.query(\`SQL...\`)` の raw SQL なので、CLI 出力でも手書きでもスタイルは揃う。 (出典: [creating-migration.md](../../.claude/skills/working-on-backend/references/tasks/creating-migration.md?plain=1#L20))
- 新規ファイルを書くときは、変更パターンが近い既存ファイルを **必ずひとつ開いて並べて書く**。スタイルが激しくズレた PR は差し戻されやすい。 (出典: [creating-migration.md](../../.claude/skills/working-on-backend/references/tasks/creating-migration.md?plain=1#L153))
