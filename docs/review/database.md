# Database review guidelines

migration・entity に加え、SQL / クエリ / スキーマに触れる変更をレビューする人 (人間・AI) 向け。

[Review guidelines](README.md)

## entity

- **[Critical]** エンティティの `@Entity` / `@Column` / `@Index` を変えたら、同じ PR に対応する DDL を持つ migration がある。不一致だと CI の `pnpm --filter backend check-migrations` (pending DDL 検出) が失敗する → [typeorm-patterns.md](../../.claude/skills/working-on-backend/references/knowledge/typeorm-patterns.md)
- **[Minor]** denormalize した列 (他テーブルの値を複製した列) は `@Column({ comment: '[Denormalized]' })` を付け、migration にも対応する `COMMENT ON COLUMN ... IS '[Denormalized]'` がある → [typeorm-patterns.md](../../.claude/skills/working-on-backend/references/knowledge/typeorm-patterns.md)

## SQL / TypeORM のクエリ

- **[Major]** 新しい行の追加に Repository の `save()` ではなく `insert()` を使っている (#6441) → [backend.md](../contributing/backend.md)
- **[Major]** クエリビルダで同じ名前のプレースホルダを複数回使っていない。ループ内で `orWhere(':type = ...', { type })` のように同名を使い回すと最後の値で上書きされ、結果がおかしくなる。`type${i}` のように添字で一意にする → [backend.md](../contributing/backend.md)
- **[Major]** 「NULL でない」の条件は `Not(null)` ではなく `Not(IsNull())` で書いている。`Not(null)` は期待どおりに動かない → [backend.md](../contributing/backend.md)
- **[Major]** `null` になり得るパラメータを `col = :param` に渡していない。`col = NULL` はどの行にも一致しないので、`null` のときは `col IS NULL` に SQL を出し分ける → [backend.md](../contributing/backend.md)
- **[Major]** raw SQL やクエリビルダの文字列条件で `IN (:...ids)` に空配列が渡り得る箇所では、空のときにクエリを発行しない (または SQL を出し分ける) 分岐がある。`IN ()` は不正な SQL になる (TypeORM の `In([])` は `0=1` に変換されるので対象外) → [backend.md](../contributing/backend.md)
- **[Major]** NULL の行も一致させる必要がある `IN` 条件では、`OR col IS NULL` などで NULL を明示的に扱っている。`IN` だけでは NULL の行が一致しない → [backend.md](../contributing/backend.md)
- **[Major]** SQL 内の配列要素アクセスは 1 始まりで書いている (先頭要素は `[1]`。`[0]` は先頭ではない) → [backend.md](../contributing/backend.md)

## スキーマ変更 (enum・列・制約)

- **[Critical]** 既存行のあるテーブルに `NOT NULL` 列を足すときは、`DEFAULT` を付けるか、「nullable で追加 → `UPDATE` でバックフィル → `SET NOT NULL`」の 3 段にしている。`DEFAULT` 無しで足すと既存行を埋められず `ALTER TABLE` が失敗する → [typeorm-patterns.md](../../.claude/skills/working-on-backend/references/knowledge/typeorm-patterns.md)
- **[Critical]** enum の値の追加・変更は `ALTER TYPE ... ADD VALUE` ではなく「旧型を `RENAME` → 新型を `CREATE TYPE` → 列を `ALTER COLUMN ... TYPE ... USING "col"::"text"::"新型"` → 旧型を `DROP`」で書いている。`ADD VALUE` は巻き戻せず (PostgreSQL に `DROP VALUE` は無い)、既定の 1 トランザクション実行 (`migrationsTransactionMode: 'all'`) では追加した値を同じトランザクション内で使えない → [typeorm-patterns.md](../../.claude/skills/working-on-backend/references/knowledge/typeorm-patterns.md)
- **[Critical]** enum 列の型を載せ替えるとき、列にデフォルトがあれば `ALTER` の前に `DROP DEFAULT`、後に `SET DEFAULT` を挟み、配列列は `TYPE "..."[] USING "col"::"text"::"..."[]` の配列キャストにしている。無いと型変更が失敗する → [typeorm-patterns.md](../../.claude/skills/working-on-backend/references/knowledge/typeorm-patterns.md)
- **[Critical]** enum から値を削除する変更では、その値を持つ既存行を先に削除または別の値へ `UPDATE` している。削除が重い・不可能なら値は残す。既存行が残ったままだと `USING` キャストが失敗する → [backend.md](../contributing/backend.md)
- **[Critical]** 列のリネームが `ALTER TABLE ... RENAME COLUMN "old" TO "new"` で書かれている (down は逆向き)。`migration:generate` はプロパティ名の変更を「旧列 DROP + 新列 ADD」として出し、そのまま使うとデータが消える → [typeorm-patterns.md](../../.claude/skills/working-on-backend/references/knowledge/typeorm-patterns.md)
- **[Major]** 大規模テーブルへの `CREATE INDEX` は `CONCURRENTLY` 対応を検討している。通常の `CREATE INDEX` は本番で長時間ロックし得る → [typeorm-patterns.md](../../.claude/skills/working-on-backend/references/knowledge/typeorm-patterns.md)

## migration の書き方

- **[Critical]** 新規 migration は `packages/backend/migration/` 直下の `.js` ファイルで、ESM 形式 (`export class ...`) で書かれている。`ormconfig.js` は `migration/*.js` だけを読み、backend は `"type": "module"` なので、`.ts` や CommonJS では読み込まれない (`migration:generate` / `migration:create` は `-o --esm` 付きで生成する) → [creating-migration.md](../../.claude/skills/working-on-backend/references/tasks/creating-migration.md)
- **[Critical]** `CREATE INDEX CONCURRENTLY` を使う migration は、環境変数 `MISSKEY_MIGRATION_CREATE_INDEX_CONCURRENTLY` で `CONCURRENTLY` の有無を切り替え、有効時は class の `transaction` を `false` にし、`up()` と `down()` の両方が未設定 (既定) のとき通常の `CREATE INDEX` / `DROP INDEX` で動く。transaction 内で実行すると `CREATE INDEX CONCURRENTLY cannot run inside a transaction block` で失敗する → [typeorm-patterns.md](../../.claude/skills/working-on-backend/references/knowledge/typeorm-patterns.md)
- **[Minor]** クラス名 (`name` プロパティがあればその値) の末尾 13 桁のタイムスタンプがファイル名先頭の 13 桁と一致し、既存の migration と重複していない (TypeORM は `name`、無ければクラス名で実行済みかを判定する) → [creating-migration.md](../../.claude/skills/working-on-backend/references/tasks/creating-migration.md)
- **[Major]** `migration:generate` の出力に、この PR の変更と無関係な DDL (ローカル DB との差分など) が残っていない → [backend.md](../contributing/backend.md)
- **[Major]** migration 内の `UPDATE` によるバックフィルは冪等に書かれている (既定値を入れるだけなら `UPDATE ... WHERE col IS NULL`)。複数回流れても結果が変わらない → [typeorm-patterns.md](../../.claude/skills/working-on-backend/references/knowledge/typeorm-patterns.md)
- **[Major]** 巨大テーブルの全行 `UPDATE` や、巨大テーブルへの `SET NOT NULL` (全行スキャン) を含む場合、長時間ロックへの対処 (バッチ分割・別運用など) が PR で説明・相談されている → [typeorm-patterns.md](../../.claude/skills/working-on-backend/references/knowledge/typeorm-patterns.md)
- **[Minor]** `DROP ... IF EXISTS` は、対象が条件付きでしか存在しないと分かっている場合だけに使っている。無闇に付けると本来検出すべき不整合を隠す → [typeorm-patterns.md](../../.claude/skills/working-on-backend/references/knowledge/typeorm-patterns.md)

**指摘しないこと:**

- `name` プロパティが無いこと、クラス名が PascalCase でないこと
- 対象が条件付きでしか存在しない DROP (例: `CONCURRENTLY` 対応の migration の `DROP INDEX IF EXISTS`) に `IF EXISTS` が付いていること

## migration の down()

- **[Critical]** `down()` が空でなく、`up()` のスキーマ変更を逆順に巻き戻している (列追加 ↔ 列削除、テーブル作成 ↔ 削除、FK 追加 ↔ 削除、インデックス作成 ↔ 削除、残る列に付けた `COMMENT ON COLUMN` の復元が対になっている)。`pnpm migrate` → `pnpm revert` → `pnpm migrate` が通る状態である → [creating-migration.md](../../.claude/skills/working-on-backend/references/tasks/creating-migration.md)
- **[Major]** enum から値を外す方向の `down()` は、その値を使う既存行を先に `UPDATE ... SET "type" = '<代替値>' WHERE "type" = '<消す値>'` で退避してから型を載せ替えている。退避しないと `USING` キャストが失敗し巻き戻せない → [typeorm-patterns.md](../../.claude/skills/working-on-backend/references/knowledge/typeorm-patterns.md)
- **[Major]** 元の値に戻せないデータ移行 (情報が失われる変換) では、`down()` に戻せない旨のコメントがあり、少なくともスキーマは巻き戻している → [typeorm-patterns.md](../../.claude/skills/working-on-backend/references/knowledge/typeorm-patterns.md)

**指摘しないこと:**

- 「nullable で追加 → バックフィル → `SET NOT NULL`」や JSONB / 配列列の追加の `down()` が `DROP COLUMN` だけであること
