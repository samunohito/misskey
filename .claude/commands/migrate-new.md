---
description: TypeORM migration の空雛形を生成する。スキーマ差分から自動生成したい時は create-migration skill を使うこと
argument-hint: <PascalCaseName>
allowed-tools: Bash(pnpm:*), Bash(ls:*), Bash(mv:*), Bash(test:*), Read, Edit
---

## 引数

引数: `$ARGUMENTS`

## タスク

1. **PascalCaseName の検証**
   `$ARGUMENTS` が `^[A-Z][A-Za-z0-9]+$` に一致するか確認する。一致しない場合はエラー終了し、`AddFooBar` / `BirthdayIndex` のような形式を案内する。

2. **既存ファイルの存在確認**

   ```bash
   ls packages/backend/migration/*$ARGUMENTS.{js,ts} 2>/dev/null
   ```

   既に同名 (タイムスタンプ違い) のファイルが存在する場合、上書きせずユーザーに別名を促す。

3. **TypeORM 公式 CLI で空雛形を生成**
   `create-migration` skill の方針に従い、`Date.now()` を手書きするのではなく TypeORM CLI を使う:

   ```bash
   pnpm --filter backend exec typeorm migration:create migration/$ARGUMENTS
   ```

   出力: `packages/backend/migration/<UnixMs>-<PascalCaseName>.ts`

4. **生成ファイルパスの取得 + 拡張子を `.ts` → `.js` に変換**
   `ls -t` の先頭 1 件をそのまま `mv` に渡し、拡張子だけ書き換える。`<ms>` を手書きせず変数で受ける:

   ```bash
   src=$(ls -t packages/backend/migration/*$ARGUMENTS.ts | head -1)
   mv "$src" "${src%.ts}.js"
   ```

   以降のステップでは `dst="${src%.ts}.js"` を編集対象として扱う。

5. **TS 固有構文の除去**
   `Read` で生成ファイルを開き、`Edit` ツールで以下を削除・書き換える:
   - `import { MigrationInterface, QueryRunner } from "typeorm";` 行を削除
   - クラス宣言から `implements MigrationInterface` を削除
   - `public async up(queryRunner: QueryRunner): Promise<void>` → `async up(queryRunner)`
   - `public async down(queryRunner: QueryRunner): Promise<void>` → `async down(queryRunner)`

   完成後の典型的な形は次のようになる (参考: [packages/backend/migration/1767169026317-birthday-index.js](../../packages/backend/migration/1767169026317-birthday-index.js)):

   ```js
   export class <PascalCaseName><ms> {
       name = '<PascalCaseName><ms>'

       async up(queryRunner) {
       }

       async down(queryRunner) {
       }
   }
   ```

6. **SPDX ヘッダーの追加**
   `Edit` ツールで、ファイル冒頭に以下を挿入する。CI の `spdx` ジョブが失敗するため必須:

   ```js
   /*
    * SPDX-FileCopyrightText: syuilo and misskey-project
    * SPDX-License-Identifier: AGPL-3.0-only
    */
   ```

7. **migration の pending DDL 検査**

   ```bash
   pnpm --filter backend check-migrations
   ```

   TypeORM schema builder で pending DDL を検出する検査 ([scripts/check_migrations_clean.js](../../packages/backend/scripts/check_migrations_clean.js))。空雛形を作っただけの段階ではエンティティ差分との不整合が残る場合があるため、`up`/`down` を埋めた後にも再実行して 0 件になるか確認する。

8. **結果報告**
   - 生成ファイルパスを示す。
   - `up()` / `down()` の中身が空であることを伝え、SQL を書く必要があると案内する。
   - `down()` を空のまま放置すると本番ロールバック時に詰むため、必ず `up` の完全な巻き戻しを実装するよう促す。
   - 詳細な手順 (`migration:generate` を使うべきケース、CONCURRENTLY などの注意点) は `create-migration` skill を参照するよう案内する。

## 注意

- このコマンドは **空雛形を素早く出して手書きする** 用途。エンティティ (`packages/backend/src/models/*.ts`) を変更した差分から SQL を自動生成したい場合は、このコマンドではなく `create-migration` skill 経由で `migration:generate` を使うこと。
- マージ済み migration ファイルは絶対に編集しない ([AGENTS.md §3](../../AGENTS.md#3-マージ済み-migration-を絶対に編集しない))。
