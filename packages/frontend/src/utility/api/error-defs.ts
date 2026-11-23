/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { i18n } from '@/i18n.js';
import type { ApiErrorOverrides } from '@/utility/api/guidance.js';

/**
 * エンドポイント名をキーに、そのエンドポイントの code ごとの案内を返す関数を並べた表。
 * 値を関数にしているのは、呼ばれた時点の i18n を引くため (言語の読み込み順に依存しない)。
 */
// TODO(api-error-types): misskey-js が生成するエラー型から、エンドポイント別に存在する code だけを受け付ける型にする
export type ApiErrorDefs = Partial<Record<string, ApiErrorOverrides>>;

/**
 * そのエンドポイントのどの呼び出し元でも通用する案内を定める。
 * 網羅は強制しない。定義がなければ汎用表示にフォールバックする。
 */
// TODO(api-error-types): 生成された型に対する `satisfies` で、存在しないエンドポイント名と code を弾く
export const apiErrorDefs: ApiErrorDefs = {
	'pages/create': {
		NAME_ALREADY_EXISTS: () => ({
			title: i18n.ts.somethingHappened,
			text: i18n.ts._pages.nameAlreadyExists,
		}),
	},
	'pages/update': {
		NAME_ALREADY_EXISTS: () => ({
			title: i18n.ts.somethingHappened,
			text: i18n.ts._pages.nameAlreadyExists,
		}),
	},
};
