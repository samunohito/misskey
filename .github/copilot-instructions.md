# Copilot 開発ガイド

## プロジェクト概要
- Misskey は ActivityPub を実装したオープンソースの分散型 SNS です。バックエンドとフロントエンドを同一リポジトリで管理する pnpm モノレポ構成になっています。
- パッケージの大半は TypeScript / ESM ベースです。Node.js は 22 以降が推奨され、依存関係の管理には必ず `pnpm` を利用します。

## ディレクトリ構成の目安
- `packages/backend`: NestJS + Fastify を軸にした API サーバー。DI モジュール構成 (`MainModule.ts` など) と TypeORM を用いたデータアクセスを中心に実装されています。新しいサービス・リポジトリは既存のモジュール構造に沿って配置し、`src` 配下で責務ごとに整理してください。
- `packages/frontend`: Vite ベースの Vue 3 ( `<script setup lang="ts">` ) による SPA。UI は `components` 配下の `Mk*` コンポーネント群や `ui/` 配下のレイアウトを再利用し、スタイルは SASS/モジュールクラスで管理します。
- `packages/frontend-shared` / `packages/shared`: フロント・バック共通の型定義やユーティリティを配置します。重複コードはここへ寄せます。
- `packages/misskey-js`: ActivityPub/REST クライアント SDK。外部利用を想定した API 自動生成に依存するため破壊的変更には注意します。
- `packages/sw`: サービスワーカー関連コード。通知やオフライン対応を担います。
- `packages/icons-subsetter` や `packages/frontend-builder`: ビルド補助ツール類。CLI スクリプトは `scripts/` 配下から呼び出されます。
- `locales/`: Crowdin 連携の翻訳ファイル (YAML)。基本的に `ja-JP.yml` のみを編集し、他言語は Crowdin に同期されます。UI 文字列を追加する際は直接ハードコードせず、キーを追加して参照します。

## 実装時の基本方針
- **ライセンス表記**: すべての新規ファイルには既存の SPDX コメントを付与します (例: `SPDX-License-Identifier: AGPL-3.0-only`)。
- **依存解決**: `pnpm` コマンドでワークスペースを操作し、`package.json` では `workspace:*` を活用して内部パッケージを参照します。他のパッケージマネージャは使わないでください。
- **バックエンド**:
  - NestJS の DI を利用します。基本的に `@Injectable()` で宣言します。
  - Fastify プラグイン (Cookie, CORS など) は `ServerModule` 経由で設定済みなので重複設定に注意します。
  - 非同期処理は `async/await` を基本とし、トランザクションやキュー処理は既存のユーティリティ (`queue/`, `postgres.ts`) を利用します。
- **フロントエンド**:
  - Vue コンポーネントは `<script setup lang="ts">` と Composition API を使用します。グローバル UI は `Mk*` コンポーネントを優先し、UI 状態は `store.ts` などの既存ストアユーティリティを通して管理します。
  - スタイルは SCSS (モジュール) を用い、テーマ対応 (`theme.ts`) やダークモードを崩さないよう配慮します。
  - 文字列は `i18n.ts` 経由で取得し、必要に応じて `locales/*.yml` にキーを追加します。
- **共通モジュール**: 型やロジックが複数パッケージで共有される場合は `packages/shared` または `packages/frontend-shared` にまとめます。重複実装を避けてください。

## テストとビルド
- ルートでは `pnpm build` / `pnpm dev` / `pnpm -r test` を利用します。個別パッケージでも `pnpm --filter <name> <command>` でビルド・テストが走ります。
- バックエンドのユニットテストは `pnpm --filter backend test`、E2E は `pnpm --filter backend test:e2e` を使用します。
- フロントエンドの単体テストは `pnpm --filter frontend test`、型チェックは `pnpm --filter frontend typecheck`、Storybook は `pnpm --filter frontend build-storybook` です。
- UI 変更時は Storybook またはスクリーンショットで確認し、必要なら Chromatic を活用します。

## ドキュメント・運用ルール
- 人間向けルールは `CONTRIBUTING.md` を参照し、PR の粒度・CHANGELOG 更新・テスト実行などのチェックリストを尊重します。
- ActivityPub のペイロード拡張や federation に影響する変更では、`packages/backend/src/core/activitypub` 配下の定義と misskey-hub ドキュメントの更新を忘れないでください。
- Crowdin 連携を考慮し、翻訳ファイルを直接編集する際はキーの重複やフォーマットに注意します。

## 推奨ワークフロー
1. `pnpm install` で依存を揃える。
2. `pnpm dev` もしくは `pnpm --filter backend dev` / `pnpm --filter frontend watch` でホットリロード環境を起動。
3. 実装後に関連テスト (`pnpm -r test`, `pnpm lint`) を通し、必要に応じて `pnpm build` で最終確認。
4. CHANGELOG や翻訳ファイルへの追記を確認し、PR テンプレートに沿って概要をまとめる。

このドキュメントの内容を Copilot に提示し、生成結果が Misskey の開発フローと整合するよう調整してください。
