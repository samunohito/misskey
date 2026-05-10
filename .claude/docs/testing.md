# テスト構成

## Backend (Vitest 4, 3 設定)

| 種別 | 設定ファイル | 実行コマンド |
| --- | --- | --- |
| Unit | `packages/backend/vitest.config.unit.ts` | `pnpm --filter backend test` |
| E2E (HTTP / DB) | `packages/backend/vitest.config.e2e.ts` | `pnpm --filter backend test:e2e` |
| Federation | `packages/backend/vitest.config.fed.ts` | `pnpm --filter backend test:fed` |

- 配置: `packages/backend/test/`
- E2E は `.config/test.yml` から runtime config を生成して動かす。**事前に `.config/test.yml` が必要**なため、未作成の場合は `ncp .github/misskey/test.yml .config/test.yml` (または `cp .github/misskey/test.yml .config/test.yml`) を実行してからテストを走らせる。`pnpm --filter backend test:e2e` 自体はスクリプト内で `cross-env NODE_ENV=test pnpm compile-config` を呼ぶため、`.config/test.yml` さえあれば追加の compile-config 実行は不要。(`packages/backend/scripts/compile_config.js` は `NODE_ENV === 'test'` のとき `.config/test.yml` を、それ以外は `.config/default.yml` を読む。) なお `pnpm start:test` は Cypress 用にテストサーバーを起動したままにするコマンドであり、backend e2e テスト (`pnpm --filter backend test:e2e`) の前提としては不要かつポート競合を招く可能性があるため使わないこと。
- カバレッジ: `pnpm --filter backend test-and-coverage`

## Frontend (Vitest)

```bash
pnpm --filter frontend test                # 1 回実行
pnpm --filter frontend test-and-coverage   # カバレッジ付き
```

- 主な配置: `packages/frontend/test/*.test.ts` (例: `i18n.test.ts`, `theme.test.ts`, `is-birthday.test.ts`)。
- ビルドツール周りなど対象コードと隣接させた方が分かりやすいテストは、コードと同じディレクトリに `*.test.ts` として置く (例: [`packages/frontend/lib/rollup-plugin-unwind-css-module-class-name.test.ts`](../../packages/frontend/lib/rollup-plugin-unwind-css-module-class-name.test.ts))。
- 共有コンポーネント (`MkX.vue`) のユニットテストは現状少なく、`*.spec.ts` / `__tests__/` 形式は採用していない (Storybook + Cypress でカバー)。

## E2E (Cypress)

ルートから実行する:

```bash
pnpm e2e                # start:test サーバーを立てて Cypress run
pnpm cy:open            # 対話的に開く
```

- 設定: ルート `cypress.config.ts`。テスト本体は `cypress/` 配下。

## Storybook (frontend)

```bash
pnpm --filter frontend storybook-dev      # http://localhost:6006
pnpm --filter frontend build-storybook    # 静的ビルド
```

- 各コンポーネント横に `*.stories.impl.ts` を併設する慣習 (例: `MkButton.stories.impl.ts`)。
- Chromatic (`pnpm --filter frontend chromatic`) で視覚回帰チェック。

## ローカル DB / Redis (テスト・開発共通)

```bash
docker compose -f compose.local-db.yml up -d
```

`.config/test.yml` は `pnpm start:test` (Cypress 用サーバー起動コマンド) が実行時に `.github/misskey/test.yml` から ncp で自動的にコピーするが、backend e2e テストには不要。backend e2e テストを手動で実行する場合は上記の通り手動コピーで代替する。
