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

/** エラーの案内。`copyInfo` があれば「エラー情報をコピー」の操作に使う。 */
export type ApiGuidance = ApiGuidanceText & { copyInfo?: string };

/** エラーの `code` ごとに、その呼び出しだけで使う案内を作る関数。 */
// TODO(api-error-types): そのエンドポイントに存在する code だけを受け付ける型にする
export type ApiErrorOverrides = Record<string, () => ApiGuidanceText>;

export type ResolveApiGuidanceOptions = {
	/** 固定の共通案内に該当しない API エラーで、エンドポイント別の定義より優先する。 */
	overrides?: ApiErrorOverrides;
	/** API エラーのエンドポイント別の定義。省略時は `apiErrorDefs` を使う。 */
	defs?: ApiErrorDefs;
};

function lookup(table: ApiErrorOverrides | undefined, code: string): (() => ApiGuidanceText) | undefined {
	// code はサーバーから届くため、プロトタイプから継承した名前を案内として呼ばない。
	if (table == null || !Object.hasOwn(table, code)) return undefined;
	return table[code];
}

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
 * API 呼び出しの失敗から、表示に使う案内を同期的に組み立てる。
 * API エラーでは固定の共通案内、呼び元の上書き、エンドポイント別の定義、`TOO_MANY` 系、汎用表示の順に探す。
 * 上書きや定義の関数が throw したら報告し、案内が途切れないよう次の候補に進む。
 *
 * @returns 表示用の案内。中断は画面に出す必要がないため `null` を返す。
 * @throws `INTERNAL_ERROR` のコピー用情報を JSON に変換できない場合。
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

	// サーバー障害や権限不足などは、どの呼び出し元でも同じ案内を出すため先に解決する。
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
