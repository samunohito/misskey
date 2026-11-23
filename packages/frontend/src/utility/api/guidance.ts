/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { i18n } from '@/i18n.js';
import { apiErrorDefs } from '@/utility/api/error-defs.js';
import { reportApiCallbackError } from '@/utility/api/report-error.js';
import type { ApiErrorDefs } from '@/utility/api/error-defs.js';
import type { ApiErrorBody, ApiFailure } from '@/utility/api/request.js';

export type ApiGuidanceText = { title?: string; text: string };

/** `copyInfo` があれば、表示する側は「エラー情報をコピー」の操作を出す */
export type ApiGuidance = ApiGuidanceText & { copyInfo?: string };

/** 呼び元が宣言的に渡す、その操作でだけの案内の上書き。code をキーにする */
// TODO(api-error-types): そのエンドポイントに存在する code だけを受け付ける型にする
export type ApiErrorOverrides = Record<string, () => ApiGuidanceText>;

export type ResolveApiGuidanceOptions = {
	overrides?: ApiErrorOverrides;
	/** 省略時は `apiErrorDefs` */
	defs?: ApiErrorDefs;
};

function lookup(table: ApiErrorOverrides | undefined, code: string): (() => ApiGuidanceText) | undefined {
	if (table == null || !Object.hasOwn(table, code)) return undefined;
	return table[code];
}

/**
 * 上書きや定義表の案内を作る。作る関数が throw したら報告して `null` を返し、次の優先順の案内に任せる
 * (失敗の案内が丸ごと消えないようにするため)
 */
function invokeGuidance(fn: (() => ApiGuidanceText) | undefined): ApiGuidanceText | null {
	if (fn == null) return null;
	try {
		return fn();
	} catch (err) {
		reportApiCallbackError(err);
		return null;
	}
}

function messageOf(raw: unknown): string {
	if (typeof raw === 'object' && raw != null && 'message' in raw && typeof raw.message === 'string') {
		return raw.message;
	}
	return '';
}

/** 固定の共通の案内 (API エラーのうち、上書きや定義表より先に判定するもの) */
function resolveFixedApiErrorGuidance(endpoint: string, error: ApiErrorBody): ApiGuidance | null {
	switch (error.code) {
		case 'INTERNAL_ERROR':
			return {
				title: i18n.ts.internalServerError,
				text: i18n.ts.internalServerErrorDescription,
				copyInfo: `Endpoint: ${endpoint}\nInfo: ${JSON.stringify(error.info)}\nDate: ${new Date().toISOString()}`,
			};
		case 'RATE_LIMIT_EXCEEDED':
			return { title: i18n.ts.cannotPerformTemporary, text: i18n.ts.cannotPerformTemporaryDescription };
		case 'INVALID_PARAM':
			return { title: i18n.ts.invalidParamError, text: i18n.ts.invalidParamErrorDescription };
		case 'ROLE_PERMISSION_DENIED':
			return { title: i18n.ts.permissionDeniedError, text: i18n.ts.permissionDeniedErrorDescription };
		default:
			return null;
	}
}

/**
 * 失敗から案内を決める。表示はしない。中断 (`aborted`) は案内しないので `null` を返す。
 *
 * 優先順 (すべての入口で同じ):
 * 1. 固定の共通の案内 (API エラーでない失敗と、`INTERNAL_ERROR` / `RATE_LIMIT_EXCEEDED` / `INVALID_PARAM` / `ROLE_PERMISSION_DENIED`)
 * 2. 呼び元が渡した上書き (`overrides`)
 * 3. エラー定義表のエンドポイント別定義 (`defs`)
 * 4. `TOO_MANY` で始まる code の案内
 * 5. 汎用表示 (`message` と `id`)
 *
 * 2 と 3 の案内を作る関数が throw したら、`reportApiCallbackError` で報告して次の優先順へ進む。
 */
export function resolveApiGuidance(endpoint: string, failure: ApiFailure, opts?: ResolveApiGuidanceOptions): ApiGuidance | null {
	switch (failure.kind) {
		case 'aborted':
			return null;
		case 'network':
			return { title: i18n.ts.somethingHappened, text: i18n.ts.serverIsDead };
		case 'invalid-response':
			return { title: i18n.ts.gotInvalidResponseError, text: i18n.ts.gotInvalidResponseErrorDescription };
		case 'other':
			return { title: i18n.ts.somethingHappened, text: messageOf(failure.raw) };
		case 'api':
			break;
	}

	const error = failure.error;

	const fixed = resolveFixedApiErrorGuidance(endpoint, error);
	if (fixed != null) return fixed;

	const overridden = invokeGuidance(lookup(opts?.overrides, error.code));
	if (overridden != null) return overridden;

	const defs = opts?.defs ?? apiErrorDefs;
	const defined = invokeGuidance(lookup(Object.hasOwn(defs, endpoint) ? defs[endpoint] : undefined, error.code));
	if (defined != null) return defined;

	if (error.code.startsWith('TOO_MANY')) {
		return { title: i18n.ts.youCannotCreateAnymore, text: `${i18n.ts.error}: ${error.id}` };
	}

	return { text: `${error.message}\n${error.id}` };
}
