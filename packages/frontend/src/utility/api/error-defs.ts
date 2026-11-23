/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { i18n } from '@/i18n.js';
import type { ApiErrorOverrides } from '@/utility/api/guidance.js';

/**
 * エンドポイントとエラーの `code` ごとに案内を定義する表。
 * 案内を関数にして、表示する時点の翻訳を参照する。エラーの網羅は不要。
 */
// TODO(api-error-types): misskey-js が生成するエラー型から、エンドポイント別に存在する code だけを受け付ける型にする
export type ApiErrorDefs = Partial<Record<string, ApiErrorOverrides>>;

/** 呼び出し元を問わず使える、エンドポイント別の標準の案内。 */
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
