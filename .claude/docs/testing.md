# テスト構成

## Backend (Vitest 4, 3 設定)

| 種別 | 設定ファイル | 実行コマンド |
| --- | --- | --- |
| Unit | `packages/backend/vitest.config.unit.ts` | `pnpm --filter backend test` |
| E2E (HTTP / DB) | `packages/backend/vitest.config.e2e.ts` | `pnpm --filter backend test:e2e` |
| Federation | `packages/backend/vitest.config.fed.ts` | `pnpm --filter backend test:fed` |

- 配置: `packages/backend/test/`
- E2E は `.config/test.yml` から runtime config を生成して動かす。`pnpm --filter backend test:e2e` 自体は `.config/test.yml` をコピーしないため、**事前に `pnpm start:test`** で起動するか、手動で `ncp .github/misskey/test.yml .config/test.yml` を実行してから `cross-env NODE_ENV=test pnpm --filter backend compile-config` でテスト用 config を生成する必要がある (CI ジョブ・`pnpm start:test` はこの ncp コピーを自動でやる)。`compile_config.js` は `NODE_ENV === 'test'` のとき `.config/test.yml` を、それ以外は `.config/default.yml` を読み込む (`scripts/compile_config.js` 参照)。`pnpm --filter backend test:e2e` スクリプト内では `cross-env NODE_ENV=test pnpm compile-config` として呼ばれるため、ncp 済みであれば直接 `test:e2e` を実行するだけでよい。
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

`.config/test.yml` は `pnpm start:test` 等の実行時に、`.github/misskey/test.yml` から ncp で自動的にコピーされる。
