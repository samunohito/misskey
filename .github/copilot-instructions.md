This document defines the coding and generation rules for GitHub Copilot.  
Copilot should read and follow these instructions when suggesting code, refactoring, or adding comments.

# Copilot 開発ガイド

## プロジェクト概要

* **Misskey** は ActivityPub を実装したオープンソースの分散型 SNS です。
  バックエンドとフロントエンドを同一リポジトリで管理する **pnpm モノレポ構成**になっています。
* パッケージの大半は **TypeScript / ESM ベース**です。Node.js は **22 以降**が推奨され、依存関係の管理には必ず `pnpm` を利用します。

---

## ディレクトリ構成の目安

* `packages/backend`: NestJS + Fastify を軸にした API サーバー。
  DI モジュール構成 (`MainModule.ts` など) と TypeORM を用いたデータアクセスを中心に実装されています。
  新しいサービス・リポジトリは既存のモジュール構造に沿って配置し、`src` 配下で責務ごとに整理してください。
* `packages/frontend`: Vite ベースの Vue 3 ( `<script setup lang="ts">` ) による SPA。
  UI は `components` 配下の `Mk*` コンポーネント群や `ui/` 配下のレイアウトを再利用し、スタイルは SASS/モジュールクラスで管理します。
* `packages/frontend-shared` / `packages/shared`: フロント・バック共通の型定義やユーティリティを配置します。重複コードはここへ寄せます。
* `packages/misskey-js`: ActivityPub / REST クライアント SDK。
  外部利用を想定した API 自動生成に依存するため破壊的変更には注意します。
* `packages/sw`: サービスワーカー関連コード。通知やオフライン対応を担います。
* `packages/icons-subsetter` や `packages/frontend-builder`: ビルド補助ツール類。CLI スクリプトは `scripts/` 配下から呼び出されます。
* `locales/`: Crowdin 連携の翻訳ファイル (YAML)。
  基本的に `ja-JP.yml` のみを編集し、他言語は Crowdin に同期されます。UI 文字列を追加する際は直接ハードコードせず、キーを追加して参照します。

---

## 実装時の基本方針

* **ライセンス表記**: すべての新規ファイルには既存の SPDX コメントを付与します  
  例: 
```
/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */
```
* **依存解決**: `pnpm` コマンドでワークスペースを操作し、`package.json` では `workspace:*` を活用して内部パッケージを参照します。
  他のパッケージマネージャ (`npm`, `yarn`) は使用しないでください。
* **バックエンド**:

  * NestJS の DI (`@Injectable()`) を利用します。
  * Fastify プラグイン (Cookie, CORS など) は `ServerModule` 経由で設定済みなので重複設定に注意します。
  * 非同期処理は `async/await` を基本とし、トランザクションやキュー処理は既存のユーティリティ (`queue/`, `postgres.ts`) を利用します。
* **フロントエンド**:

  * Vue コンポーネントは `<script setup lang="ts">` と Composition API を使用します。
  * グローバル UI は `Mk*` コンポーネントを優先し、UI 状態は `store.ts` などの既存ストアユーティリティを通して管理します。
  * スタイルは SCSS モジュールを用い、テーマ対応 (`theme.ts`) やダークモードを崩さないよう配慮します。
  * 文字列は `i18n.ts` 経由で取得し、必要に応じて `locales/*.yml` にキーを追加します。
* **共通モジュール**: 型やロジックが複数パッケージで共有される場合は
  `packages/shared` または `packages/frontend-shared` にまとめます。重複実装を避けてください。

---

## TypeScript / import のルール

* すべての import は **ESM 形式 (`import ... from`)** を使用します。
* 絶対パス import は各パッケージに存在する `tsconfig.json` のパスエイリアスに準拠します。
  * Copilot は上記エイリアス以外（例: `../../../`）を生成しないでください。
* CommonJS (`require`, `module.exports`) の生成は禁止です。
* 型定義 (`*.d.ts`) の重複生成は避け、共通型は `shared` に寄せてください。

---

## コードスタイル

* **Lint** は ESLint 設定に従います。
* 可能な限り既存ファイルの記法（`async` 関数の形式、`const` 優先、命名規則）に合わせます。
* コメントは JSDoc / TSDoc 形式を優先します。
* 関数・クラスの説明には `/** ... */` コメントを付与します。

---

## テストとビルド

* ルートでは `pnpm build` / `pnpm dev` / `pnpm -r test` を利用します。
  個別パッケージでも `pnpm --filter <name> <command>` でビルド・テストが走ります。
* バックエンドのユニットテスト: `pnpm --filter backend test`
  E2E テスト: `pnpm --filter backend test:e2e`
* フロントエンドの単体テスト: `pnpm --filter frontend test`
  型チェック: `pnpm --filter frontend typecheck`
  Storybook: `pnpm --filter frontend build-storybook`
* UI 変更時は Storybook またはスクリーンショットで確認し、必要なら Chromatic を活用します。

---

## テスト生成に関する注意

* テストコードの生成時は、既存のフレームワーク (`jest` または `vitest`) に従います。
* 外部 API を操作するテストでは、既存のモック / ヘルパー (`test/utils/`) を使用します。
* 不要な外部接続や副作用を含むコードは生成しないでください。
* テストにおいても DB/Redis を直接使用します。
```bash
cp .github/misskey/test.yml .config/test.yml
docker compose -f packages/backend/test/compose.yml up -d
```

---

## フロントエンド UI の慣例

* 新規 UI 要素は `Mk*` プレフィクスの再利用を優先します。
* デザイン変更を伴う場合は `ui/` 下のテーマ変数を参照します。
* UIの文言（i18nキーと呼称）を追加する際は下記の事項を守ってください。
  - i18nキーは `locales/ja-JP.yml` に追加します。
  - 実装する機能に特化したi18nキーは、機能名（アンダースコア）＋文言の名前という構成で実装します（例: `_settings.description`）。複数の階層になっても問題ありません。
  - キャメルケースで命名します。
  - 「はい」「いいえ」のように、短く汎用的な文言は出来る限り既存定義を利用します。 
  - i18nキーを追加したら `pnpm run build-assets` を実行し、 `locales/index.js` および `locales/index.d.ts` を更新します。
  - `locales/index.d.ts` に追加された定義をUIに埋め込みます。

### フロントエンド コンポーネント構成

* 1ファイル1コンポーネント（`.vue`）
* 複雑なロジックは `.ts` に切り出し、`<script setup>` で import
* グローバル登録は極力避ける。`components/` 内で `Mk*` を優先

---

## Copilot 向け補足指針

### 禁止事項

* 外部パッケージを無断追加しない (`pnpm add` は人間の判断で行う)。
* `console.log` によるデバッグ出力やハードコードされたパスを生成しない。
* `.env` ファイルや秘密情報の生成・埋め込みを行わない。
* Misskey の既存構造（DI, Vue store, shared utils）を破壊する大幅なリファクタ提案を行わない。

### 推奨生成パターン

* 既存のモジュール構造（DI サービス・Vue コンポーネント・ユーティリティ）に沿った**最小限の差分**を提案する。
* コメント補完、型定義の整備、テストスケルトンやドキュメント化を優先する。
* 不明確な箇所では既存コードを参照して推定するが、推測による新規設計は行わない。

---

## ドキュメント・運用ルール

* 人間向けルールは `CONTRIBUTING.md` を参照し、PR の粒度・CHANGELOG 更新・テスト実行などのチェックリストを尊重します。
* Crowdin 連携を考慮し、翻訳ファイルを直接編集する際はキーの重複やフォーマットに注意します。

---

## 推奨ワークフロー

1. `pnpm install` で依存を揃える。
2. `pnpm dev` もしくは `pnpm --filter backend dev` / `pnpm --filter frontend watch` でホットリロード環境を起動。
3. 実装後に関連テスト (`pnpm -r test`, `pnpm lint`) を通し、必要に応じて `pnpm build` で最終確認。
4. CHANGELOG や翻訳ファイルへの追記を確認し、PR テンプレートに沿って概要をまとめる。

---

## Copilot の目的

Copilot はこのドキュメントの原則を前提として補完を行い、
Misskey の既存構造・規約・開発フローを壊さない範囲で提案を生成してください。
