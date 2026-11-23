/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { ApiErrorOverrides } from '@/utility/api/guidance.js';
import { i18n } from '@/i18n.js';

/**
 * エンドポイントとエラーの `code` ごとに案内を定義する表。
 * 案内を関数にして、表示する時点の翻訳を参照する。エラーの網羅は不要。
 */
// TODO(api-error-types): misskey-js が生成するエラー型から、エンドポイント別に存在する code だけを受け付ける型にする
export type ApiErrorDefs = Partial<Record<string, ApiErrorOverrides>>;

/** エンドポイント別の標準の案内。 */
// TODO(api-error-types): 生成された型に対する `satisfies` で、存在しないエンドポイント名と code を弾く
export const apiErrorDefs: ApiErrorDefs = {
	'ap/show': {
		FEDERATION_NOT_ALLOWED: () => ({
			title: i18n.ts._remoteLookupErrors._federationNotAllowed.title,
			text: i18n.ts._remoteLookupErrors._federationNotAllowed.description,
		}),
		URI_INVALID: () => ({
			title: i18n.ts._remoteLookupErrors._uriInvalid.title,
			text: i18n.ts._remoteLookupErrors._uriInvalid.description,
		}),
		REQUEST_FAILED: () => ({
			title: i18n.ts._remoteLookupErrors._requestFailed.title,
			text: i18n.ts._remoteLookupErrors._requestFailed.description,
		}),
		RESPONSE_INVALID: () => ({
			title: i18n.ts._remoteLookupErrors._responseInvalid.title,
			text: i18n.ts._remoteLookupErrors._responseInvalid.description,
		}),
		NO_SUCH_OBJECT: () => ({
			title: i18n.ts._remoteLookupErrors._noSuchObject.title,
			text: i18n.ts._remoteLookupErrors._noSuchObject.description,
		}),
	},
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
